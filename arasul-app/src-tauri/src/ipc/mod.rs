//! # Frozen IPC surface (v1.0)
//!
//! This module is the compile-time mirror of `docs/arasul-api-spec.md`.
//! After Phase 1-4 implementations, most sections now have real code at
//! top-level modules — `ipc/` is reduced to:
//!
//! - `error::ArasulError` — the unified error type all commands return.
//! - Nothing else. The stubs (platform/fs/projects/claude/git/system/
//!   auto_launch/updates) that existed as Phase-0.12 placeholders have
//!   been replaced by real implementations.
//!
//! The only section still unimplemented is §7 Git — Phase 2 will move it
//! here as it's built.

pub mod error;
