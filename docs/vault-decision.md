# Arasul — Vault Crypto Decision

> Phase 0 Step 0.10 spike outcome. Companion to `docs/arasul-api-spec.md` §2 (Credential vault) and `docs/arasul-plan.md`.
>
> **Decision:** Pure-Rust primitives — `argon2` + `chacha20poly1305` + `serde_json` + `secrecy`.
>
> **Decided:** 2026-04-24 · **Decider:** Kolja · **Author:** Claude

---

## 1. Why this decision is a one-way door

The vault file format is migratable but painful: every existing drive has to re-encrypt on first unlock of the new binary. That inertia pushes us to pick something we can live with for 3+ years, not the convenient option.

## 2. Spec requirements (from `arasul-api-spec.md` §2)

- Argon2id KDF with **OWASP 2025 parameters** (configurable m, t, p)
- Authenticated encryption of a key/value secret map
- Salt on disk at `.boot/kdf.salt`, ciphertext at `.boot/vault.enc`
- Plaintext held in `secrecy::SecretBox` after unlock
- `change_passphrase` re-keys without plaintext ever touching disk
- Cross-platform (macOS, Linux, Windows) — exFAT-hosted

## 3. Candidates

### 3.1 `tauri-plugin-stronghold` 2.3.1

- **Maturity:** Plugin published 2025-10-27. Underlying engine `iotaledger/stronghold.rs` has no substantive commits since June 2023 — effectively parked by IOTA.
- **Argon2id fit:** ⚠️ Not native. Plugin takes either a user-supplied `|pw| -> Vec<u8>` hasher, or opts into the `kdf` feature which hardwires the legacy `rust-argon2` crate with **non-configurable m/t/p**. We cannot tune to OWASP 2025 without reimplementing the hasher ourselves — at which point stronghold's value collapses.
- **K/V fit:** ✅ Native `Store` and `Client` abstractions.
- **Binary cost:** ~500 KB–1 MB; drags scrypt + libp2p-adjacent deps.
- **File-format lock-in:** ❌ Snapshot format is proprietary to Stronghold. Migrating away later = write a one-shot exporter.
- **Known friction:** README still ships a `[profile.dev.package.scrypt] opt-level = 3` workaround for open bug #2048 (scrypt debug-build 10-min compile times).

### 3.2 `age` 0.11.3

- **Maturity:** Active (str4d/rage), released 2026-04-22. Still self-described BETA.
- **Argon2id fit:** ❌ Uses scrypt for passphrase recipients with no KDF hook. Any Argon2id has to be bolted on manually, at which point we're feeding age an x25519 identity and age stops being the thing doing the work.
- **K/V fit:** ❌ Streaming file encryptor — we'd serialize the whole JSON map and re-encrypt the blob on every `set_secret`. Doable, not what it's for.
- **Binary cost:** Largest of the three (~1.5 MB source crate alone once ssh/plugin features creep in).
- **2026 risk signal:** RUSTSEC-2024-0433 (malicious plugin names → arbitrary binary exec, Jan 2025). Fixed in 0.11.x but signals a non-trivial plugin attack surface we don't need.

### 3.3 Pure-Rust primitives

Stack: `argon2 = "0.5"` + `chacha20poly1305 = "0.10"` (XChaCha20Poly1305) + `serde_json` + `rand = "0.8"` + `secrecy = "0.10"` + `zeroize = "1"`.

- **Maturity:** All RustCrypto, 22 M / 52 M / 103 M downloads respectively. No open RUSTSEC advisories against current versions.
- **Argon2id fit:** ✅ Native. `Params::new(m_cost, t_cost, p_cost, Some(32))` accepts any OWASP profile.
- **K/V fit:** ✅ Trivially — encrypt `serde_json::to_vec(&map)?`.
- **Binary cost:** ~100–200 KB — smallest by a wide margin.
- **File-format ownership:** ✅ We own the header; versioning is a single byte we control. Any future migration is local business.
- **Code weight:** ~250–400 LOC for the 7 commands + round-trip unit test.
- **Downside:** We own nonce discipline and file-format versioning. A bug here is ours, not upstream's. Mitigated by: small surface, AEAD primitive, RustCrypto trait review, unit + integration tests.

## 4. Decision matrix

| Criterion                  | stronghold | age        | pure-Rust     |
|----------------------------|------------|------------|---------------|
| Argon2id with OWASP params | ⚠️ (hardcoded) | ❌        | ✅            |
| K/V semantics native       | ✅         | ❌         | ✅            |
| Upstream actively alive    | ⚠️          | ✅         | ✅            |
| Binary size                | ~1 MB       | ~1.5 MB    | ~150 KB       |
| No open RUSTSEC in 2026    | ✅          | ⚠️          | ✅            |
| File-format portability    | ❌          | ✅         | ✅ (we own)   |
| LOC we write               | 150-200     | 200-250    | 250-400       |

The only axis where we lose against stronghold is "LOC we write" — and only by ~100 lines. Every other axis favours pure-Rust.

## 5. Out-of-scope for v1 (revisit per `arasul-api-spec.md` §17)

- Biometric unlock (Touch ID / Windows Hello / fprintd)
- Hardware-backed KDF (Secure Enclave wrap-key)
- Multi-device sync of vault state

All three are layered additions on top of the file-format we're choosing — none of them prefer stronghold or age over pure-Rust.

## 6. File format v1

```
 offset  size  field
 ------  ----  --------------------------------------------------
 0       4     magic        "ARVL"  (Arasul Vault)
 4       1     version      0x01
 5       32    salt         random, for argon2id (also at .boot/kdf.salt)
 37      24    nonce        random XChaCha20Poly1305 nonce
 61      4     m_cost       u32 LE
 65      4     t_cost       u32 LE
 69      1     p_cost       u8
 70      3     reserved     zero
 73      …     ciphertext   XChaCha20Poly1305(JSON({key: value, …}))
```

Header is AAD in the AEAD call — mutating any header byte breaks authentication.

OWASP 2025 Argon2id parameters (default profile): `m_cost = 19 * 1024` (19 MiB), `t_cost = 2`, `p_cost = 1`, `tag_length = 32`.

## 7. Unit test (minimum exit for Phase 0 Step 0.10)

```rust
#[test]
fn round_trip_create_set_lock_unlock_get() {
    let dir = tempfile::tempdir().unwrap();
    let vault = VaultDir::new(dir.path());
    vault.create("correct horse battery staple").unwrap();
    let handle = vault.unlock("correct horse battery staple").unwrap();
    vault.set_secret(&handle, "anthropic_token", "sk-ant-xxx").unwrap();
    vault.lock(handle);
    let handle = vault.unlock("correct horse battery staple").unwrap();
    assert_eq!(vault.get_secret(&handle, "anthropic_token").unwrap(), "sk-ant-xxx");
}
```

## 8. What we are *not* deciding here

- Whether to eventually add hardware-key wrapping (Secure Enclave / TPM). When we add it, it wraps the Argon2id-derived key, the file format gains a byte in the header.
- Whether to support keyfile-or-passphrase. Deferred to post-v1.
