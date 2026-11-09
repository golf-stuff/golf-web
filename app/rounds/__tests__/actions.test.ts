import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetCurrentUser = vi.fn()
vi.mock('@/src/lib/auth/getCurrentUser', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}))

const mockFindUniqueRound = vi.fn()
const mockDeleteMany = vi.fn()
const mockCreate = vi.fn()
const mockTransaction = vi.fn(async (callback: (tx: unknown) => unknown) => {
  const tx = {
    trnRoundHoleResult: {
      deleteMany: mockDeleteMany,
      create: mockCreate,
    },
  }
  return callback(tx)
})
vi.mock('@/src/lib/db/prisma', () => ({
  prisma: {
    trnRound: {
      findUnique: (...args: unknown[]) => mockFindUniqueRound(...args),
    },
    $transaction: (callback: (tx: unknown) => unknown) => mockTransaction(callback),
  },
}))

const mockRedirect = vi.fn((_path: string) => {
  throw new Error('NEXT_REDIRECT')
})
vi.mock('next/navigation', () => ({
  redirect: (path: string) => mockRedirect(path),
}))

import { saveRoundHoles } from '../actions'

beforeEach(() => {
  mockGetCurrentUser.mockReset()
  mockFindUniqueRound.mockReset()
  mockDeleteMany.mockReset()
  mockCreate.mockReset()
  mockTransaction.mockClear()
  mockRedirect.mockClear()
})

function buildFormData(roundId: string) {
  const formData = new FormData()
  formData.set('roundId', roundId)
  formData.set('hole_hole-1_score', '4')
  return formData
}

describe('saveRoundHoles', () => {
  it('他ユーザーが所有するroundIdを指定した場合、権限エラーになり更新処理が実行されない', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'attacker-user', email: 'attacker@example.com' })
    mockFindUniqueRound.mockResolvedValue({ id: 'victim-round', userId: 'victim-user' })

    await expect(saveRoundHoles(buildFormData('victim-round'))).rejects.toThrow(
      'このラウンドを編集する権限がありません'
    )

    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockDeleteMany).not.toHaveBeenCalled()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('未ログインの場合、権限エラーになり更新処理が実行されない', async () => {
    mockGetCurrentUser.mockResolvedValue(null)

    await expect(saveRoundHoles(buildFormData('some-round'))).rejects.toThrow('ログインが必要です')

    expect(mockFindUniqueRound).not.toHaveBeenCalled()
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('自分が所有するroundIdの場合は正常に更新され、リダイレクトされる', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'owner-user', email: 'owner@example.com' })
    mockFindUniqueRound.mockResolvedValue({ id: 'own-round', userId: 'owner-user' })

    await expect(saveRoundHoles(buildFormData('own-round'))).rejects.toThrow('NEXT_REDIRECT')

    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { roundId: 'own-round' } })
    expect(mockRedirect).toHaveBeenCalledWith('/rounds/own-round/holes')
  })
})
