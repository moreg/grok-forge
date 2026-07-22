import {
  importAccountCredential,
  type AccountAuthStatus,
  type CredentialRenewal,
} from './desktopBridge'

export type AccountSource = 'browser-oidc' | 'import' | 'legacy-global'

export type Account = {
  id: string
  name: string
  source: AccountSource
  renewal: CredentialRenewal
  authStatus: AccountAuthStatus
  createdAt: number
  lastUsedAt: number
  /** One-shot reference used only to migrate a pre-renewal keyring entry. */
  legacySecureTokenId?: string
  /** Compatibility labels for old UI snapshots; never contains a credential. */
  secureTokenId: string
  type?: 'browser-login' | 'import' | 'static'
}

export type AccountsState = {
  accounts: Account[]
  currentAccountId: string | null
}

const ACCOUNTS_KEY = 'grok-forge-accounts'

function normalizeSource(value: unknown, legacyType: unknown): AccountSource {
  if (value === 'browser-oidc' || value === 'legacy-global') return value
  if (legacyType === 'browser-login') return 'browser-oidc'
  return 'import'
}

function normalizeRenewal(value: unknown): CredentialRenewal {
  return value === 'refreshable' || value === 'non-refreshable' ? value : 'unknown'
}

function normalizeStatus(value: unknown): AccountAuthStatus {
  return value === 'valid'
    || value === 'refreshing'
    || value === 'temporarily-unavailable'
    || value === 'relogin-required'
    ? value
    : 'unknown'
}

export function loadAccounts(): AccountsState {
  try {
    if (typeof localStorage === 'undefined') return { accounts: [], currentAccountId: null }
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    if (!raw) return { accounts: [], currentAccountId: null }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const rows = Array.isArray(parsed.accounts) ? parsed.accounts : []
    const accounts = rows.flatMap((value): Account[] => {
      if (!value || typeof value !== 'object') return []
      const row = value as Record<string, unknown>
      const id = typeof row.id === 'string' ? row.id : ''
      if (!id) return []
      const legacySecureTokenId = typeof row.legacySecureTokenId === 'string'
        ? row.legacySecureTokenId
        : typeof row.secureTokenId === 'string' && row.secureTokenId
          ? row.secureTokenId
          : undefined
      return [{
        id,
        name: typeof row.name === 'string' && row.name.trim() ? row.name : '未命名账号',
        source: normalizeSource(row.source, row.type),
        renewal: normalizeRenewal(row.renewal),
        authStatus: normalizeStatus(row.authStatus),
        createdAt: Number(row.createdAt) || Date.now(),
        lastUsedAt: Number(row.lastUsedAt) || Date.now(),
        legacySecureTokenId,
        secureTokenId: legacySecureTokenId ?? `sec-${id}`,
        type: row.type === 'browser-login' || row.type === 'static' ? row.type : 'import',
      }]
    })
    const requested = typeof parsed.currentAccountId === 'string' ? parsed.currentAccountId : null
    const currentAccountId = requested && accounts.some((account) => account.id === requested)
      ? requested
      : accounts[0]?.id ?? null
    return { accounts, currentAccountId }
  } catch {
    return { accounts: [], currentAccountId: null }
  }
}

export function saveAccounts(state: AccountsState) {
  if (typeof localStorage === 'undefined') return
  const accounts = state.accounts.map(({ secureTokenId: _ignored, type: _legacyType, ...account }) => account)
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify({ accounts, currentAccountId: state.currentAccountId }))
}

function newAccountId() {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().toLowerCase()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `acc-${suffix}`
}

export function createAccount(input: {
  name: string
  source: Exclude<AccountSource, 'legacy-global'>
  renewal?: CredentialRenewal
  authStatus?: AccountAuthStatus
}): Account {
  const now = Date.now()
  const id = newAccountId()
  return {
    id,
    name: input.name.trim() || '新账号',
    source: input.source,
    renewal: input.renewal ?? 'unknown',
    authStatus: input.authStatus ?? 'unknown',
    createdAt: now,
    lastUsedAt: now,
    secureTokenId: `sec-${id}`,
  }
}

export function upsertAccount(account: Account, makeCurrent = false): AccountsState {
  const state = loadAccounts()
  const index = state.accounts.findIndex((item) => item.id === account.id)
  if (index >= 0) state.accounts[index] = account
  else state.accounts.push(account)
  if (makeCurrent || !state.currentAccountId) state.currentAccountId = account.id
  saveAccounts(state)
  return state
}

export function updateAccount(accountId: string, patch: Partial<Pick<Account, 'name' | 'renewal' | 'authStatus' | 'lastUsedAt' | 'legacySecureTokenId'>>): AccountsState {
  const state = loadAccounts()
  state.accounts = state.accounts.map((account) => account.id === accountId ? { ...account, ...patch } : account)
  saveAccounts(state)
  return state
}

export function registerLegacyAccount(accountId: string): AccountsState {
  const state = loadAccounts()
  if (!state.accounts.some((account) => account.id === accountId)) {
    const now = Date.now()
    state.accounts.unshift({
      id: accountId,
      name: '默认旧账号',
      source: 'legacy-global',
      renewal: 'unknown',
      authStatus: 'unknown',
      createdAt: now,
      lastUsedAt: now,
      secureTokenId: `sec-${accountId}`,
    })
  }
  if (!state.currentAccountId) state.currentAccountId = accountId
  saveAccounts(state)
  return state
}

export async function addAccount(input: {
  name: string
  source?: 'browser-oidc' | 'import'
  renewal?: CredentialRenewal
  authStatus?: AccountAuthStatus
  type?: 'browser-login' | 'import' | 'static'
  token?: string
}): Promise<Account> {
  const source = input.source ?? (input.type === 'browser-login' ? 'browser-oidc' : 'import')
  let account = createAccount({ name: input.name, source, renewal: input.renewal, authStatus: input.authStatus })
  if (input.token) {
    const raw = input.token.trim().startsWith('{')
      ? input.token
      : JSON.stringify({ access_token: input.token })
    const result = await importAccountCredential(account.id, raw)
    account = { ...account, renewal: result.renewal, authStatus: result.authStatus }
  }
  upsertAccount(account, true)
  return account
}

export function switchAccount(accountId: string): boolean {
  const state = loadAccounts()
  const account = state.accounts.find((item) => item.id === accountId)
  if (!account) return false
  account.lastUsedAt = Date.now()
  state.currentAccountId = accountId
  saveAccounts(state)
  return true
}

export function deleteAccount(accountId: string): void {
  const state = loadAccounts()
  state.accounts = state.accounts.filter((account) => account.id !== accountId)
  if (state.currentAccountId === accountId) state.currentAccountId = state.accounts[0]?.id ?? null
  saveAccounts(state)
}

export function getCurrentAccount(state: AccountsState): Account | null {
  return state.accounts.find((account) => account.id === state.currentAccountId) ?? null
}

export function addAccountWithBrowserLogin(name: string, token: string) { return addAccount({ name, token, source: 'browser-oidc' }) }
export function addAccountWithImport(name: string, token: string) { return addAccount({ name, token, source: 'import' }) }
