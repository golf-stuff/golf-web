import { describe, it, expect } from 'vitest'
import { computeDashboardData } from '../metrics'
import type { RoundSummary } from '../queries'

function makeRound(overrides: {
  id?: string
  playedAt?: Date
  courseName?: string
  totalStrokes: number
  layoutStrokes?: RoundSummary['layoutStrokes']
}): RoundSummary {
  return {
    id: overrides.id ?? 'r1',
    playedAt: overrides.playedAt ?? new Date('2025-01-01'),
    courseName: overrides.courseName ?? 'Test CC',
    totalStrokes: overrides.totalStrokes,
    layoutStrokes: overrides.layoutStrokes ?? [],
  }
}

describe('computeDashboardData', () => {
  describe('bestScore', () => {
    it('returns null when no rounds', () => {
      expect(computeDashboardData([]).bestScore).toBeNull()
    })

    it('returns null when all rounds have zero strokes', () => {
      expect(
        computeDashboardData([makeRound({ totalStrokes: 0 })]).bestScore
      ).toBeNull()
    })

    it('finds the round with minimum total strokes', () => {
      const rounds = [
        makeRound({ id: 'r1', totalStrokes: 90 }),
        makeRound({ id: 'r2', totalStrokes: 85, courseName: 'Best CC' }),
        makeRound({ id: 'r3', totalStrokes: 92 }),
      ]
      const result = computeDashboardData(rounds)
      expect(result.bestScore?.score).toBe(85)
      expect(result.bestScore?.courseName).toBe('Best CC')
    })
  })

  describe('bestHalf', () => {
    it('returns null when no layoutStrokes in any round', () => {
      expect(
        computeDashboardData([makeRound({ totalStrokes: 88 })]).bestHalf
      ).toBeNull()
    })

    it('finds the minimum single-layout stroke total across all rounds', () => {
      const rounds = [
        makeRound({
          totalStrokes: 88,
          layoutStrokes: [
            { layoutId: 'l1', layoutName: 'OUT', strokes: 44 },
            { layoutId: 'l2', layoutName: 'IN', strokes: 44 },
          ],
        }),
        makeRound({
          totalStrokes: 90,
          layoutStrokes: [
            { layoutId: 'l1', layoutName: 'OUT', strokes: 40 },
            { layoutId: 'l2', layoutName: 'IN', strokes: 50 },
          ],
        }),
      ]
      const result = computeDashboardData(rounds)
      expect(result.bestHalf?.score).toBe(40)
      expect(result.bestHalf?.layoutName).toBe('OUT')
    })
  })

  describe('thisYear', () => {
    const currentYear = new Date().getFullYear()

    it('counts only current-year rounds', () => {
      const rounds = [
        makeRound({ playedAt: new Date(`${currentYear}-03-01`), totalStrokes: 88 }),
        makeRound({ playedAt: new Date(`${currentYear - 1}-03-01`), totalStrokes: 85 }),
      ]
      expect(computeDashboardData(rounds).thisYear.roundCount).toBe(1)
    })

    it('computes average score to 1 decimal place', () => {
      const rounds = [
        makeRound({ playedAt: new Date(`${currentYear}-01-01`), totalStrokes: 90 }),
        makeRound({ playedAt: new Date(`${currentYear}-02-01`), totalStrokes: 80 }),
      ]
      expect(computeDashboardData(rounds).thisYear.avgScore).toBe(85)
    })

    it('returns null avgScore when no rounds this year', () => {
      const rounds = [makeRound({ playedAt: new Date('2020-01-01'), totalStrokes: 88 })]
      expect(computeDashboardData(rounds).thisYear.avgScore).toBeNull()
    })

    it('finds this year best score', () => {
      const rounds = [
        makeRound({ playedAt: new Date(`${currentYear}-01-01`), totalStrokes: 92 }),
        makeRound({ playedAt: new Date(`${currentYear}-06-01`), totalStrokes: 85 }),
      ]
      expect(computeDashboardData(rounds).thisYear.bestScore).toBe(85)
    })
  })

  describe('yearlyAverages', () => {
    it('groups rounds by year and computes average', () => {
      const rounds = [
        makeRound({ playedAt: new Date('2025-01-01'), totalStrokes: 90 }),
        makeRound({ playedAt: new Date('2025-06-01'), totalStrokes: 80 }),
        makeRound({ playedAt: new Date('2024-03-01'), totalStrokes: 95 }),
      ]
      const result = computeDashboardData(rounds)
      expect(result.yearlyAverages).toEqual([
        { year: 2024, avg: 95 },
        { year: 2025, avg: 85 },
      ])
    })

    it('sorts years in ascending order', () => {
      const rounds = [
        makeRound({ playedAt: new Date('2026-01-01'), totalStrokes: 88 }),
        makeRound({ playedAt: new Date('2024-01-01'), totalStrokes: 92 }),
      ]
      const years = computeDashboardData(rounds).yearlyAverages.map(y => y.year)
      expect(years).toEqual([2024, 2026])
    })

    it('excludes rounds with zero strokes', () => {
      const rounds = [
        makeRound({ playedAt: new Date('2025-01-01'), totalStrokes: 90 }),
        makeRound({ playedAt: new Date('2025-02-01'), totalStrokes: 0 }),
      ]
      expect(computeDashboardData(rounds).yearlyAverages).toEqual([{ year: 2025, avg: 90 }])
    })
  })

  describe('recent5 and recent20', () => {
    it('returns at most 5 rounds in recent5', () => {
      const rounds = Array.from({ length: 8 }, (_, i) =>
        makeRound({ id: `r${i}`, totalStrokes: 88 })
      )
      expect(computeDashboardData(rounds).recent5).toHaveLength(5)
    })

    it('returns at most 20 rounds in recent20', () => {
      const rounds = Array.from({ length: 25 }, (_, i) =>
        makeRound({ id: `r${i}`, totalStrokes: 88 })
      )
      expect(computeDashboardData(rounds).recent20).toHaveLength(20)
    })

    it('preserves the order of rounds (most recent first)', () => {
      const rounds = [
        makeRound({ id: 'newest', playedAt: new Date('2026-06-01'), totalStrokes: 88 }),
        makeRound({ id: 'oldest', playedAt: new Date('2026-01-01'), totalStrokes: 92 }),
      ]
      expect(computeDashboardData(rounds).recent5[0].id).toBe('newest')
    })
  })
})
