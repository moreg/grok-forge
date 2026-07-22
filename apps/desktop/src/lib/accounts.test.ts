import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as accountsModule from './accounts'
import { importAccountCredential } from './desktopBridge'
import {
  addAccount,
  addAccountWithBrowserLogin,
  addAccountWithImport,
  deleteAccount,
  getCurrentAccount,
  loadAccounts,
  saveAccounts,
  switchAccount,
} from './accounts'

vi.mock('./desktopBridge', () => ({
  importAccountCredential: vi.fn(),
}))

describe('accounts lib', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.mocked(importAccountCredential).mockResolvedValue({
      renewal: 'non-refreshable',
      authStatus: 'valid',
    })
  })

  it('does not expose raw credential compatibility helpers', () => {
    expect(accountsModule).not.toHaveProperty('storeSecureToken')
    expect(accountsModule).not.toHaveProperty('getSecureToken')
  })

  it('loads empty state by default', () => {
    const state = loadAccounts()
    expect(state.accounts).toEqual([])
    expect(state.currentAccountId).toBeNull()
  })

  it('adds account and sets it as current', async () => {
    const acc = await addAccount({
      name: '测试账号 1',
      token: 'token-secret-123',
      type: 'import',
    })

    expect(acc.id).toMatch(/^acc-/)
    expect(acc.name).toBe('测试账号 1')
    expect(acc.source).toBe('import')
    expect(acc.secureTokenId).toMatch(/^sec-/)

    const state = loadAccounts()
    expect(state.accounts.length).toBe(1)
    expect(state.currentAccountId).toBe(acc.id)

    const current = getCurrentAccount(state)
    expect(current?.id).toBe(acc.id)

    expect(JSON.stringify(state)).not.toContain('token-secret-123')
    expect(importAccountCredential).toHaveBeenCalledWith(acc.id, JSON.stringify({ access_token: 'token-secret-123' }))
  })

  it('switches accounts correctly', async () => {
    const acc1 = await addAccount({ name: '账号 1', token: 'tok1', type: 'import' })
    const acc2 = await addAccount({ name: '账号 2', token: 'tok2', type: 'browser-login' })

    expect(loadAccounts().currentAccountId).toBe(acc2.id)

    const switched = switchAccount(acc1.id)
    expect(switched).toBe(true)

    const stateAfterSwitch = loadAccounts()
    expect(stateAfterSwitch.currentAccountId).toBe(acc1.id)
  })

  it('deletes account and updates current account fallback', async () => {
    const acc1 = await addAccount({ name: '账号 1', token: 'tok1', type: 'import' })
    const acc2 = await addAccount({ name: '账号 2', token: 'tok2', type: 'import' })

    deleteAccount(acc2.id)
    let state = loadAccounts()
    expect(state.accounts.length).toBe(1)
    expect(state.currentAccountId).toBe(acc1.id)

    deleteAccount(acc1.id)
    state = loadAccounts()
    expect(state.accounts.length).toBe(0)
    expect(state.currentAccountId).toBeNull()
  })

  it('supports addAccountWithBrowserLogin and addAccountWithImport helpers', async () => {
    const acc1 = await addAccountWithBrowserLogin('浏览器账号', 'browser-token-xyz')
    expect(acc1.source).toBe('browser-oidc')
    expect(acc1.name).toBe('浏览器账号')

    const acc2 = await addAccountWithImport('导入账号', 'import-token-123')
    expect(acc2.source).toBe('import')
    expect(acc2.name).toBe('导入账号')

    const state = loadAccounts()
    expect(state.accounts.length).toBe(2)
    expect(state.currentAccountId).toBe(acc2.id)
  })
})
