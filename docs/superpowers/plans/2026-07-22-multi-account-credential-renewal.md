# Multi-account Credential Renewal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind every desktop account and task to an isolated Grok `auth.json`, support standard ACP OIDC login and safe credential import, and prevent cross-account ACP session reuse.

**Architecture:** The React account registry stores metadata only. Tauri resolves validated account IDs to fixed authentication files, imports and inspects credentials without exposing secrets, and starts exactly one Grok Agent with the selected file in `GROK_AUTH_PATH`. Tasks carry an optional account owner and the UI coordinates cancellation, process switching, rollback, deletion, and first-use binding.

**Tech Stack:** React, TypeScript, Tauri 2, Rust, ACP JSON-RPC, Gradle not applicable to this desktop-only change.

---

### Task 1: Secure account credential backend

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/Cargo.lock`

- [x] Add strict account-ID validation and resolve ordinary accounts under the Tauri app-data `accounts/{accountId}/auth.json` directory.
- [x] Add the backend-generated legacy account marker whose path is the existing global `~/.grok/auth.json`, without copying it.
- [x] Add credential inspection that returns only existence, renewal capability, expiry, identifier, and last-known status.
- [x] Add credential import that validates JSON fields, parses expiry, restricts HTTPS issuers to the xAI allowlist, converts input to the existing `AuthStore/GrokAuth` JSON shape, and atomically writes the target file.
- [x] Add credential deletion and legacy keyring migration commands; remove old secrets only after a successful account-file write.
- [x] Track the running Agent account, require `accountId` in `start_grok`, inject `GROK_AUTH_PATH`, and reject reuse of a process bound to another account.
- [x] Register all new commands and ensure close handling still terminates the Agent.

### Task 2: Desktop bridge and account registry

**Files:**
- Modify: `apps/desktop/src/lib/desktopBridge.ts`
- Modify: `apps/desktop/src/lib/accounts.ts`

- [x] Add typed bridge calls for legacy migration, credential inspection/import/deletion, and account-bound Agent startup.
- [x] Replace token-bearing account metadata with `source`, `renewal`, `authStatus`, timestamps, and an internal migration marker only.
- [x] Migrate legacy browser/import/static account rows without placing any token in React state, and expose immutable registry update helpers.
- [x] Generate account IDs locally in the allowed format while leaving all path resolution to Tauri.

### Task 3: Task ownership and import isolation

**Files:**
- Modify: `apps/desktop/src/lib/tasks.ts`

- [x] Add `accountId: string | null` to `Task`; normalize old tasks to `null` and create new tasks with an explicit owner supplied by the caller.
- [x] Persist and export ownership for local round trips.
- [x] Treat externally imported ownership as untrusted: retain it only when the caller supplies the set of locally known account IDs; otherwise clear ownership and ACP session IDs.
- [x] Clear ACP session bindings whenever ownership is missing or changed.

### Task 4: ACP authentication and account-bound transport

**Files:**
- Modify: `apps/desktop/src/lib/grokAcpClient.ts`
- Modify: `apps/desktop/src/components/ConversationPane.tsx`

- [x] Pass `accountId` through `GrokAcpClient`, transport startup, and the Tauri bridge.
- [x] Parse `authMethods` and `defaultAuthMethodId` from `initialize`, authenticate cached credentials before creating/loading a session, and expose the advertised OIDC method for interactive login.
- [x] Add a public OIDC authenticate operation and prevent session creation/loading until an authentication method succeeds.
- [x] Key or reset local ACP session maps by account and reject a task whose owner differs from the connected account.

### Task 5: Switching, task binding, and account UI

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/components/Overlay.tsx`
- Modify: `apps/desktop/src/components/ConversationPane.tsx`
- Modify: `apps/desktop/src/styles.css`

- [x] Initialize the current account, migrate the backend legacy account without duplicating credentials, and inspect the current credential on startup.
- [x] Serialize account switches; confirm running-task interruption, cancel/disconnect the old Agent, select the target, and reconnect with rollback on technical startup failure.
- [x] Keep the target selected for permanent authentication failure and update only its last-known status.
- [x] Bind new tasks to the current account; require confirmation and account switching before opening another account's task; prompt once to bind old unowned tasks.
- [x] Replace manual browser-token prompts with ACP standard OIDC authentication and a credential import dialog whose raw content is sent directly to Tauri and then cleared.
- [x] Show renewal and status metadata, related-task counts, and require credential deletion to succeed before removing account metadata; leave tasks but clear their account/session ownership.

### Task 6: Compile verification and design checklist

**Files:**
- Modify if generated: `apps/desktop/src-tauri/gen/schemas/*.json`

- [x] Run `npm run build` in `apps/desktop` and fix all TypeScript/build errors.
- [x] Run `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` and fix all Rust errors.
- [x] If Grok Shell was modified, run its crate-specific `cargo check`; otherwise record that it was reused unchanged.
- [x] Re-read the design acceptance criteria and verify path containment, account-bound environment injection, task/session isolation, migration-without-copy, credential error redaction, and process shutdown behavior from the final diff.
