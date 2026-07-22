# Multi-account Credential Renewal Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the credential-exposure, migration-retry, and unowned-task connection regressions introduced by multi-account support.

**Architecture:** Credentials remain entirely in the native backend: the WebView only receives metadata. Native migration treats an existing valid account credential and an already-removed legacy keyring item as an idempotent completed state. ACP startup becomes conditional on a task being explicitly owned by the selected account, and binding re-arms the automatic connection path.

**Tech Stack:** Rust/Tauri 2, React, TypeScript, Vitest, Cargo tests.

---

### Task 1: Remove raw credential IPC access

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src/lib/desktopBridge.ts`
- Modify: `apps/desktop/src/lib/accounts.ts`
- Modify: `apps/desktop/src/lib/accounts.test.ts`

- [ ] **Step 1: Write failing frontend regression tests**

Replace tests that retrieve imported tokens with assertions that `addAccount` persists only metadata and that import failures do not add an account. Mock `importAccountCredential` at the bridge boundary so the test does not invoke native IPC.

```ts
expect(JSON.stringify(loadAccounts())).not.toContain('token-secret-123')
await expect(addAccount({ name: 'x', token: 'bad' })).rejects.toThrow('invalid credential')
expect(loadAccounts().accounts).toEqual([])
```

- [ ] **Step 2: Run the account test file and verify the new assertions fail**

Run: `npm test -- src/lib/accounts.test.ts`

Expected: FAIL until tests and production code no longer use the raw token wrappers.

- [ ] **Step 3: Remove the raw-token bridge surface**

Delete `store_secure_token` and `get_secure_token` commands from `lib.rs` and `generate_handler!`, delete `storeSecureToken` / `getSecureToken` from `desktopBridge.ts`, and delete the compatibility exports from `accounts.ts`. Preserve `migrate_keyring_credential`, which returns only `CredentialImportResult`.

- [ ] **Step 4: Run the account test file and verify it passes**

Run: `npm test -- src/lib/accounts.test.ts`

Expected: PASS with no native `invoke` attempt in browser-mode tests.

### Task 2: Make legacy keyring migration safe and idempotent

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing Rust unit tests for migration-state classification**

Extract a pure helper that accepts `CredentialInspection` and returns whether an existing destination is safe to finalize. Add tests for valid credentials, missing credentials, and relogin-required/corrupt credentials.

```rust
assert!(can_finalize_keyring_migration(&CredentialInspection {
    exists: true, renewal: "refreshable", auth_status: "valid", expires_at: None, account_label: None,
}));
assert!(!can_finalize_keyring_migration(&CredentialInspection {
    exists: true, renewal: "unknown", auth_status: "relogin-required", expires_at: None, account_label: None,
}));
```

- [ ] **Step 2: Run the focused Rust tests and verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib can_finalize_keyring_migration`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement destination validation and idempotent cleanup**

When `auth.json` exists, call `inspect_auth_file` before deleting the source. Return an error and preserve the source unless the result reports both `exists: true` and `auth_status: "valid"`. On safe destination, delete the keyring item; treat a missing entry as completion while preserving real keyring errors. Keep the first-write order as parse -> atomic destination write -> source deletion.

- [ ] **Step 4: Fix the platform-independent Rust assertion**

Normalize the file-content comparison in `collects_local_git_from_temp_repo` with `replace("\r\n", "\n")`, so Git's Windows checkout conversion does not make the test fail.

- [ ] **Step 5: Run Tauri library tests and verify they pass**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib`

Expected: PASS.

### Task 3: Prevent unowned tasks from starting ACP and reconnect after binding

**Files:**
- Modify: `apps/desktop/src/components/ConversationPane.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/App.test.tsx`

- [ ] **Step 1: Write failing App regression tests**

Seed a current account and an unowned active task. Assert that automatic connection does not call `GrokAcpClient.connect`, then confirm binding the task to the current account causes the next auto-connect attempt.

```ts
expect(acpMocks.connect).not.toHaveBeenCalled()
await user.click(screen.getByRole('button', { name: '绑定到当前账号' }))
await waitFor(() => expect(acpMocks.connect).toHaveBeenCalled())
```

- [ ] **Step 2: Run the focused App test and verify failure**

Run: `npm test -- src/App.test.tsx -t "does not connect an unowned task until it is bound"`

Expected: FAIL because the current connection path passes `null` into the account-isolation check.

- [ ] **Step 3: Guard connection and re-arm it after binding**

In `ConversationPane`, stop before constructing `GrokAcpClient` unless `task.accountId === selectedAccountId`. Keep the auto-connect attempt armed while that guard blocks it. In `App`, after confirmed binding, dispatch the existing account-connect event after state update so the normal connection path runs with the new owner.

- [ ] **Step 4: Run the focused App test and verify it passes**

Run: `npm test -- src/App.test.tsx -t "does not connect an unowned task until it is bound"`

Expected: PASS.

### Task 4: Update account-aware fixtures and run the desktop regression suite

**Files:**
- Modify: `apps/desktop/src/lib/desktopBridge.test.ts`
- Modify: `apps/desktop/src/lib/grokAcpClient.test.ts`
- Modify: `apps/desktop/src/lib/tasks.test.ts`
- Modify: `apps/desktop/src/App.test.tsx`

- [ ] **Step 1: Update bridge and ACP test call sites to set matching account and task owners**

Use a shared valid account ID such as `acc-test-1234` and pass it to `startGrok`, `setAccountId`, and `setTaskAccountId`. Update expected invoke arguments to include `accountId` and `taskAccountId`.

- [ ] **Step 2: Update task fixtures to include an owner where ACP session IDs are asserted**

Set `accountId: 'acc-test-1234'` on fixture tasks that assert `acpSessionId`, session filtering, or replay export. Keep unowned-task tests explicit and expect ACP session IDs to be cleared.

- [ ] **Step 3: Update App test setup to seed an account for connection scenarios**

Seed `grok-forge-accounts` with `acc-test-1234` before render for tests expecting automatic ACP connection. Keep no-account scenarios explicit and assert the account-required message.

- [ ] **Step 4: Run all desktop tests**

Run: `npm test`

Expected: PASS with zero failed tests.

### Task 5: Build verification

**Files:**
- Verify only.

- [ ] **Step 1: Run the production desktop build**

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 2: Run the native type/build check**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: exit 0.
