import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetCurrentUser = vi.fn()
vi.mock('../getCurrentUser', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}))

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`)
})
vi.mock('next/navigation', () => ({
  redirect: (path: string) => mockRedirect(path),
}))

import { requireAdminForPage, requireAdminForAction } from '../requireAdmin'

beforeEach(() => {
  mockGetCurrentUser.mockReset()
  mockRedirect.mockClear()
})

describe('requireAdminForPage', () => {
  it('未ログインなら/loginへリダイレクトする', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    await expect(requireAdminForPage()).rejects.toThrow('REDIRECT:/login')
  })

  it('管理者でなければ/roundsへリダイレクトする', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'u1', email: 'a@example.com', role: 'user' })
    await expect(requireAdminForPage()).rejects.toThrow('REDIRECT:/rounds')
  })

  it('管理者ならそのユーザーを返す', async () => {
    const admin = { id: 'u2', email: 'admin@example.com', role: 'admin' as const }
    mockGetCurrentUser.mockResolvedValue(admin)
    await expect(requireAdminForPage()).resolves.toEqual(admin)
  })
})

describe('requireAdminForAction', () => {
  it('未ログインならエラーをthrowする', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    await expect(requireAdminForAction()).rejects.toThrow('ログインが必要です')
  })

  it('管理者でなければエラーをthrowする', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'u1', email: 'a@example.com', role: 'user' })
    await expect(requireAdminForAction()).rejects.toThrow('管理者権限が必要です')
  })

  it('管理者ならそのユーザーを返す', async () => {
    const admin = { id: 'u2', email: 'admin@example.com', role: 'admin' as const }
    mockGetCurrentUser.mockResolvedValue(admin)
    await expect(requireAdminForAction()).resolves.toEqual(admin)
  })
})
