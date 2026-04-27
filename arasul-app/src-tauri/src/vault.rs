//! Passphrase-gated credential vault.
//!
//! Phase 0 step 0.10 — see `docs/vault-decision.md` for why this uses
//! pure-Rust primitives (argon2 + XChaCha20Poly1305) rather than
//! tauri-plugin-stronghold or age.
//!
//! File layout on disk (relative to the Arasul drive root):
//!     .boot/vault.enc   — 73-byte header + AEAD ciphertext
//!     .boot/kdf.salt    — mirror of the salt, plaintext (non-secret)
//!
//! Header format (see decision doc §6):
//!     magic "ARVL" (4) · version (1) · salt (32) · nonce (24) ·
//!     m_cost u32 LE (4) · t_cost u32 LE (4) · p_cost u8 (1) · reserved (3)
//!
//! The header is AAD in the AEAD call, so any tamper with header bytes
//! breaks authentication.
//!
//! Divergence from `docs/arasul-api-spec.md` §2: commands take `drive_root`
//! as an explicit argument for now. Phase 1 introduces drive-mount state
//! (`DriveWatcher`) at which point `drive_root` becomes implicit.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use parking_lot::Mutex;
use rand::rngs::OsRng;
use rand::RngCore;
use secrecy::{ExposeSecret, SecretBox};
use serde::Serialize;
use tauri::State;
use zeroize::Zeroizing;

const MAGIC: &[u8; 4] = b"ARVL";
const VERSION: u8 = 1;
const SALT_LEN: usize = 32;
const NONCE_LEN: usize = 24;
const KEY_LEN: usize = 32;
const HEADER_LEN: usize = 4 + 1 + SALT_LEN + NONCE_LEN + 4 + 4 + 1 + 3; // 73

/// OWASP 2025 Argon2id profile — m=19 MiB, t=2, p=1.
const DEFAULT_M_COST: u32 = 19 * 1024;
const DEFAULT_T_COST: u32 = 2;
const DEFAULT_P_COST: u8 = 1;

/// Errors surfaced to the frontend. Shape matches `arasul-api-spec.md` §1
/// where possible; `InvalidHandle` and `Corrupt` are vault-specific and
/// will be merged into the spec during IPC freeze (step 0.12).
#[derive(Debug, Serialize, thiserror::Error)]
#[serde(tag = "kind")]
pub enum VaultError {
    #[error("vault not found")]
    #[serde(rename = "vault_not_found")]
    NotFound,
    #[error("vault already exists")]
    #[serde(rename = "vault_already_exists")]
    AlreadyExists,
    #[error("vault locked")]
    #[serde(rename = "vault_locked")]
    Locked,
    #[error("wrong passphrase")]
    #[serde(rename = "vault_wrong_passphrase")]
    WrongPassphrase,
    #[error("fs error: {message}")]
    #[serde(rename = "fs_io")]
    FsIo { message: String },
    #[error("crypto error")]
    #[serde(rename = "crypto")]
    Crypto,
    #[error("invalid session handle")]
    #[serde(rename = "session_invalid")]
    InvalidHandle,
    #[error("invalid vault format: {message}")]
    #[serde(rename = "vault_corrupt")]
    Corrupt { message: String },
}

impl From<std::io::Error> for VaultError {
    fn from(e: std::io::Error) -> Self {
        VaultError::FsIo { message: e.to_string() }
    }
}

type Result<T> = std::result::Result<T, VaultError>;

#[derive(Clone, Copy)]
struct KdfParams {
    m_cost: u32,
    t_cost: u32,
    p_cost: u8,
}

impl KdfParams {
    fn owasp_2025() -> Self {
        Self { m_cost: DEFAULT_M_COST, t_cost: DEFAULT_T_COST, p_cost: DEFAULT_P_COST }
    }
}

fn derive_key(
    passphrase: &str,
    salt: &[u8],
    params: KdfParams,
) -> Result<Zeroizing<[u8; KEY_LEN]>> {
    let p = Params::new(params.m_cost, params.t_cost, params.p_cost as u32, Some(KEY_LEN))
        .map_err(|_| VaultError::Crypto)?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, p);
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    argon
        .hash_password_into(passphrase.as_bytes(), salt, &mut *key)
        .map_err(|_| VaultError::Crypto)?;
    Ok(key)
}

fn pack_header(
    salt: &[u8; SALT_LEN],
    nonce: &[u8; NONCE_LEN],
    params: KdfParams,
) -> [u8; HEADER_LEN] {
    let mut h = [0u8; HEADER_LEN];
    h[0..4].copy_from_slice(MAGIC);
    h[4] = VERSION;
    h[5..5 + SALT_LEN].copy_from_slice(salt);
    h[5 + SALT_LEN..5 + SALT_LEN + NONCE_LEN].copy_from_slice(nonce);
    let off = 5 + SALT_LEN + NONCE_LEN;
    h[off..off + 4].copy_from_slice(&params.m_cost.to_le_bytes());
    h[off + 4..off + 8].copy_from_slice(&params.t_cost.to_le_bytes());
    h[off + 8] = params.p_cost;
    h
}

fn unpack_header(bytes: &[u8]) -> Result<([u8; SALT_LEN], [u8; NONCE_LEN], KdfParams)> {
    if bytes.len() < HEADER_LEN {
        return Err(VaultError::Corrupt { message: "header too short".into() });
    }
    if &bytes[0..4] != MAGIC {
        return Err(VaultError::Corrupt { message: "bad magic".into() });
    }
    if bytes[4] != VERSION {
        return Err(VaultError::Corrupt { message: format!("unknown version {}", bytes[4]) });
    }
    let mut salt = [0u8; SALT_LEN];
    salt.copy_from_slice(&bytes[5..5 + SALT_LEN]);
    let mut nonce = [0u8; NONCE_LEN];
    nonce.copy_from_slice(&bytes[5 + SALT_LEN..5 + SALT_LEN + NONCE_LEN]);
    let off = 5 + SALT_LEN + NONCE_LEN;
    let m_cost = u32::from_le_bytes(bytes[off..off + 4].try_into().unwrap());
    let t_cost = u32::from_le_bytes(bytes[off + 4..off + 8].try_into().unwrap());
    let p_cost = bytes[off + 8];
    Ok((salt, nonce, KdfParams { m_cost, t_cost, p_cost }))
}

/// Atomic file replace: write to `.tmp`, then rename. Cross-OS safe by
/// removing any existing destination first (Windows `fs::rename` rejects
/// overwrite). Not fully crash-atomic on Windows — acceptable for v1;
/// revisit when DriveWatcher hardens persistence (Phase 1 step 1.8).
fn atomic_write(path: &Path, data: &[u8]) -> Result<()> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, data)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(&tmp, path)?;
    Ok(())
}

struct Paths {
    root: PathBuf,
}

impl Paths {
    fn new(root: impl Into<PathBuf>) -> Self { Self { root: root.into() } }
    fn boot(&self) -> PathBuf { self.root.join(".boot") }
    fn vault(&self) -> PathBuf { self.boot().join("vault.enc") }
    fn salt(&self) -> PathBuf { self.boot().join("kdf.salt") }
}

/// Pure-logic layer — testable without Tauri.
pub struct VaultDir {
    paths: Paths,
}

impl VaultDir {
    pub fn new(root: impl Into<PathBuf>) -> Self { Self { paths: Paths::new(root) } }

    pub fn exists(&self) -> bool { self.paths.vault().exists() }

    pub fn create(&self, passphrase: &str) -> Result<()> {
        if self.exists() {
            return Err(VaultError::AlreadyExists);
        }
        fs::create_dir_all(self.paths.boot())?;
        let mut salt = [0u8; SALT_LEN];
        let mut nonce = [0u8; NONCE_LEN];
        OsRng.fill_bytes(&mut salt);
        OsRng.fill_bytes(&mut nonce);
        let params = KdfParams::owasp_2025();
        let key = derive_key(passphrase, &salt, params)?;
        let blob = encrypt_blob(&key, &salt, &nonce, params, b"{}")?;
        atomic_write(&self.paths.vault(), &blob)?;
        atomic_write(&self.paths.salt(), &salt)?;
        Ok(())
    }

    /// Decrypt the vault on disk. Returns (params, salt, key, plaintext_json).
    fn decrypt(
        &self,
        passphrase: &str,
    ) -> Result<(KdfParams, [u8; SALT_LEN], Zeroizing<[u8; KEY_LEN]>, Zeroizing<Vec<u8>>)> {
        let file = fs::read(&self.paths.vault()).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                VaultError::NotFound
            } else {
                e.into()
            }
        })?;
        let (salt, nonce, params) = unpack_header(&file)?;
        let header = &file[..HEADER_LEN];
        let ciphertext = &file[HEADER_LEN..];
        let key = derive_key(passphrase, &salt, params)?;
        let cipher = XChaCha20Poly1305::new_from_slice(&*key).map_err(|_| VaultError::Crypto)?;
        let pt = cipher
            .decrypt(XNonce::from_slice(&nonce), Payload { msg: ciphertext, aad: header })
            .map_err(|_| VaultError::WrongPassphrase)?;
        Ok((params, salt, key, Zeroizing::new(pt)))
    }

    /// Re-encrypt and persist with the given key/salt/params and a fresh nonce.
    fn persist(
        &self,
        key: &[u8; KEY_LEN],
        salt: &[u8; SALT_LEN],
        params: KdfParams,
        plaintext: &[u8],
    ) -> Result<()> {
        let mut nonce = [0u8; NONCE_LEN];
        OsRng.fill_bytes(&mut nonce);
        let blob = encrypt_blob(key, salt, &nonce, params, plaintext)?;
        atomic_write(&self.paths.vault(), &blob)?;
        Ok(())
    }
}

fn encrypt_blob(
    key: &[u8; KEY_LEN],
    salt: &[u8; SALT_LEN],
    nonce: &[u8; NONCE_LEN],
    params: KdfParams,
    plaintext: &[u8],
) -> Result<Vec<u8>> {
    let header = pack_header(salt, nonce, params);
    let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|_| VaultError::Crypto)?;
    let ct = cipher
        .encrypt(XNonce::from_slice(nonce), Payload { msg: plaintext, aad: &header })
        .map_err(|_| VaultError::Crypto)?;
    let mut out = Vec::with_capacity(HEADER_LEN + ct.len());
    out.extend_from_slice(&header);
    out.extend_from_slice(&ct);
    Ok(out)
}

/// In-memory unlocked session. Plaintext and key are zeroed on drop.
pub(crate) struct Session {
    handle: String,
    drive_root: PathBuf,
    params: KdfParams,
    salt: [u8; SALT_LEN],
    key: SecretBox<[u8; KEY_LEN]>,
    plaintext: SecretBox<Vec<u8>>,
}

/// Shared Tauri state — holds at most one unlocked session at a time.
pub struct VaultState {
    inner: Arc<Mutex<Option<Session>>>,
}

impl VaultState {
    pub fn new() -> Self { Self { inner: Arc::new(Mutex::new(None)) } }

    /// Clone the shared inner Arc so background threads (e.g. Claude token
    /// harvester) can hold their own reference without needing Tauri state.
    pub(crate) fn shared(&self) -> Arc<Mutex<Option<Session>>> { Arc::clone(&self.inner) }
}

impl Default for VaultState {
    fn default() -> Self { Self::new() }
}

/// Lock-aware helper used by background threads — takes the shared Arc,
/// verifies the session handle, and writes a key into the unlocked map.
/// Returns `Ok(())` on success; `Err` if the session is locked or the
/// handle is stale (in which case the caller should silently drop the
/// value, as the user has clearly logged out).
pub(crate) fn try_set_secret_by_handle(
    inner: &Arc<Mutex<Option<Session>>>,
    handle: &str,
    key: &str,
    value: &str,
) -> Result<()> {
    let mut guard = inner.lock();
    let session = guard.as_mut().ok_or(VaultError::Locked)?;
    if session.handle != handle {
        return Err(VaultError::InvalidHandle);
    }
    let mut map: BTreeMap<String, String> =
        serde_json::from_slice(session.plaintext.expose_secret())
            .map_err(|_| VaultError::Corrupt { message: "plaintext json".into() })?;
    map.insert(key.to_string(), value.to_string());
    let new_pt = serde_json::to_vec(&map).map_err(|_| VaultError::Crypto)?;
    let vd = VaultDir::new(&session.drive_root);
    vd.persist(session.key.expose_secret(), &session.salt, session.params, &new_pt)?;
    session.plaintext = SecretBox::new(Box::new(new_pt));
    Ok(())
}

/// Read a key from the unlocked session, if the handle matches. Returns
/// `Ok(None)` when the key is absent. Errors on locked / stale handle.
pub(crate) fn try_get_secret_by_handle(
    inner: &Arc<Mutex<Option<Session>>>,
    handle: &str,
    key: &str,
) -> Result<Option<String>> {
    let guard = inner.lock();
    let session = guard.as_ref().ok_or(VaultError::Locked)?;
    if session.handle != handle {
        return Err(VaultError::InvalidHandle);
    }
    let map: BTreeMap<String, String> =
        serde_json::from_slice(session.plaintext.expose_secret())
            .map_err(|_| VaultError::Corrupt { message: "plaintext json".into() })?;
    Ok(map.get(key).cloned())
}

// ---------- Tauri commands ----------

#[tauri::command]
pub fn vault_exists(drive_root: String) -> bool {
    VaultDir::new(drive_root).exists()
}

#[tauri::command]
pub fn vault_create(drive_root: String, passphrase: String) -> Result<()> {
    VaultDir::new(drive_root).create(&passphrase)
}

#[tauri::command]
pub fn vault_unlock(
    drive_root: String,
    passphrase: String,
    state: State<'_, VaultState>,
) -> Result<String> {
    let vd = VaultDir::new(&drive_root);
    let (params, salt, key, pt) = vd.decrypt(&passphrase)?;
    let handle = uuid::Uuid::new_v4().to_string();
    let session = Session {
        handle: handle.clone(),
        drive_root: PathBuf::from(drive_root),
        params,
        salt,
        key: SecretBox::new(Box::new(*key)),
        plaintext: SecretBox::new(Box::new(pt.to_vec())),
    };
    *state.inner.lock() = Some(session);
    Ok(handle)
}

#[tauri::command]
pub fn vault_lock(state: State<'_, VaultState>) {
    *state.inner.lock() = None;
}

#[tauri::command]
pub fn vault_set_secret(
    handle: String,
    key: String,
    value: String,
    state: State<'_, VaultState>,
) -> Result<()> {
    let mut guard = state.inner.lock();
    let session = guard.as_mut().ok_or(VaultError::Locked)?;
    if session.handle != handle {
        return Err(VaultError::InvalidHandle);
    }
    let mut map: BTreeMap<String, String> =
        serde_json::from_slice(session.plaintext.expose_secret())
            .map_err(|_| VaultError::Corrupt { message: "plaintext json".into() })?;
    map.insert(key, value);
    let new_pt = serde_json::to_vec(&map).map_err(|_| VaultError::Crypto)?;
    let vd = VaultDir::new(&session.drive_root);
    vd.persist(session.key.expose_secret(), &session.salt, session.params, &new_pt)?;
    session.plaintext = SecretBox::new(Box::new(new_pt));
    Ok(())
}

#[tauri::command]
pub fn vault_get_secret(
    handle: String,
    key: String,
    state: State<'_, VaultState>,
) -> Result<Option<String>> {
    let guard = state.inner.lock();
    let session = guard.as_ref().ok_or(VaultError::Locked)?;
    if session.handle != handle {
        return Err(VaultError::InvalidHandle);
    }
    let map: BTreeMap<String, String> =
        serde_json::from_slice(session.plaintext.expose_secret())
            .map_err(|_| VaultError::Corrupt { message: "plaintext json".into() })?;
    Ok(map.get(&key).cloned())
}

#[tauri::command]
pub fn vault_change_passphrase(
    drive_root: String,
    old: String,
    new: String,
    state: State<'_, VaultState>,
) -> Result<()> {
    let vd = VaultDir::new(&drive_root);
    let (_, _, _, pt) = vd.decrypt(&old)?;
    let mut salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);
    let params = KdfParams::owasp_2025();
    let key = derive_key(&new, &salt, params)?;
    vd.persist(&*key, &salt, params, &pt)?;
    atomic_write(&vd.paths.salt(), &salt)?;
    *state.inner.lock() = None;
    Ok(())
}

// ---------- Tests ----------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn header_packs_and_unpacks() {
        let salt = [0x11u8; SALT_LEN];
        let nonce = [0x22u8; NONCE_LEN];
        let params = KdfParams { m_cost: 1024, t_cost: 3, p_cost: 2 };
        let h = pack_header(&salt, &nonce, params);
        assert_eq!(&h[0..4], MAGIC);
        assert_eq!(h[4], VERSION);
        let (s2, n2, p2) = unpack_header(&h).unwrap();
        assert_eq!(s2, salt);
        assert_eq!(n2, nonce);
        assert_eq!(p2.m_cost, 1024);
        assert_eq!(p2.t_cost, 3);
        assert_eq!(p2.p_cost, 2);
    }

    #[test]
    fn create_writes_vault_and_salt() {
        let dir = tempfile::tempdir().unwrap();
        let vd = VaultDir::new(dir.path());
        assert!(!vd.exists());
        vd.create("hunter2").unwrap();
        assert!(vd.exists());
        assert!(dir.path().join(".boot/kdf.salt").exists());
    }

    #[test]
    fn create_rejects_if_exists() {
        let dir = tempfile::tempdir().unwrap();
        let vd = VaultDir::new(dir.path());
        vd.create("pw").unwrap();
        assert!(matches!(vd.create("other"), Err(VaultError::AlreadyExists)));
    }

    #[test]
    fn wrong_passphrase_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let vd = VaultDir::new(dir.path());
        vd.create("right").unwrap();
        assert!(matches!(vd.decrypt("wrong"), Err(VaultError::WrongPassphrase)));
    }

    /// The Phase 0 Step 0.10 exit criterion: create → set → lock → unlock → get.
    /// The command layer requires a Tauri `State` container, so we exercise the
    /// same sequence against `VaultDir` + an in-process session substitute.
    #[test]
    fn round_trip_create_set_lock_unlock_get() {
        let dir = tempfile::tempdir().unwrap();
        let vd = VaultDir::new(dir.path());
        let pass = "correct horse battery staple";

        vd.create(pass).unwrap();

        // set_secret equivalent.
        let (params, salt, key, pt) = vd.decrypt(pass).unwrap();
        let mut map: BTreeMap<String, String> = serde_json::from_slice(&pt).unwrap();
        map.insert("anthropic_token".into(), "sk-ant-xxx".into());
        let new_pt = serde_json::to_vec(&map).unwrap();
        vd.persist(&*key, &salt, params, &new_pt).unwrap();

        // lock = drop session (params/key/pt go out of scope → zeroize).
        drop(key);
        drop(pt);

        // unlock.
        let (_, _, _, pt2) = vd.decrypt(pass).unwrap();
        let map2: BTreeMap<String, String> = serde_json::from_slice(&pt2).unwrap();
        assert_eq!(map2.get("anthropic_token").map(|s| s.as_str()), Some("sk-ant-xxx"));
    }

    #[test]
    fn change_passphrase_rekeys_file() {
        let dir = tempfile::tempdir().unwrap();
        let vd = VaultDir::new(dir.path());
        vd.create("old").unwrap();

        // seed some plaintext.
        let (params, salt, key, _) = vd.decrypt("old").unwrap();
        let map = BTreeMap::from([("k".to_string(), "v".to_string())]);
        vd.persist(&*key, &salt, params, &serde_json::to_vec(&map).unwrap()).unwrap();

        // rekey.
        let (_, _, _, pt) = vd.decrypt("old").unwrap();
        let mut new_salt = [0u8; SALT_LEN];
        OsRng.fill_bytes(&mut new_salt);
        let new_params = KdfParams::owasp_2025();
        let new_key = derive_key("new", &new_salt, new_params).unwrap();
        vd.persist(&*new_key, &new_salt, new_params, &pt).unwrap();

        assert!(matches!(vd.decrypt("old"), Err(VaultError::WrongPassphrase)));
        let (_, _, _, pt2) = vd.decrypt("new").unwrap();
        let map2: BTreeMap<String, String> = serde_json::from_slice(&pt2).unwrap();
        assert_eq!(map2.get("k").map(|s| s.as_str()), Some("v"));
    }

    #[test]
    fn tampered_header_fails_auth() {
        let dir = tempfile::tempdir().unwrap();
        let vd = VaultDir::new(dir.path());
        vd.create("pw").unwrap();

        // Flip one bit in the header's m_cost field.
        let mut bytes = fs::read(vd.paths.vault()).unwrap();
        let off = 5 + SALT_LEN + NONCE_LEN;
        bytes[off] ^= 0x01;
        fs::write(vd.paths.vault(), &bytes).unwrap();

        // decrypt() will try to derive with the tampered m_cost, produce a wrong
        // key, and the AEAD tag check will fail → WrongPassphrase. Either way,
        // we must not get plaintext.
        assert!(vd.decrypt("pw").is_err());
    }
}
