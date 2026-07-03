import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
vi.mock('@/src/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}))

const mockFindUnique = vi.fn()
const mockCreate = vi.fn()
vi.mock('@/src/lib/db/prisma', () => ({
  prisma: {
    mstUser: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}))

import { getCurrentUser } from '../getCurrentUser'

beforeEach(() => {
  mockGetUser.mockReset()
  mockFindUnique.mockReset()
  mockCreate.mockReset()
})

describe('getCurrentUser', () => {
  it('未ログインならnullを返す', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await getCurrentUser()
    expect(result).toBeNull()
  })

  it('ログイン済みでMstUserが既存なら、それを返す（新規作成しない）', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'auth-uid-1', email: 'a@example.com' } },
    })
    mockFindUnique.mockResolvedValue({ id: 'auth-uid-1', email: 'a@example.com' })

    const result = await getCurrentUser()

    expect(result).toEqual({ id: 'auth-uid-1', email: 'a@example.com' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('ログイン済みだがMstUserが未作成なら、自動作成して返す', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'auth-uid-2', email: 'b@example.com' } },
    })
    mockFindUnique.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: 'auth-uid-2', email: 'b@example.com' })

    const result = await getCurrentUser()

    expect(mockCreate).toHaveBeenCalledWith({
      data: { id: 'auth-uid-2', email: 'b@example.com' },
    })
    expect(result).toEqual({ id: 'auth-uid-2', email: 'b@example.com' })
  })
})
