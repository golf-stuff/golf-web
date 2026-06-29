import type { RoundSummary } from './queries'

export type DashboardData = {
  bestScore: { score: number; courseName: string; playedAt: Date } | null
  bestHalf: { score: number; courseName: string; layoutName: string; playedAt: Date } | null
  thisYear: { roundCount: number; bestScore: number | null; avgScore: number | null }
  yearlyAverages: { year: number; avg: number }[]
  recent5: { id: string; playedAt: Date; courseName: string; score: number }[]
  recent20: { id: string; score: number }[]
}

export function computeDashboardData(rounds: RoundSummary[]): DashboardData {
  const currentYear = new Date().getFullYear()
  const scored = rounds.filter(r => r.totalStrokes > 0)

  const bestScoreRound = scored.reduce<RoundSummary | null>(
    (best, r) => (best === null || r.totalStrokes < best.totalStrokes ? r : best),
    null
  )

  let bestHalf: DashboardData['bestHalf'] = null
  for (const r of rounds) {
    for (const ls of r.layoutStrokes) {
      if (ls.strokes > 0 && (bestHalf === null || ls.strokes < bestHalf.score)) {
        bestHalf = {
          score: ls.strokes,
          courseName: r.courseName,
          layoutName: ls.layoutName,
          playedAt: r.playedAt,
        }
      }
    }
  }

  const thisYearRounds = scored.filter(r => r.playedAt.getFullYear() === currentYear)
  const thisYearBest =
    thisYearRounds.length > 0 ? Math.min(...thisYearRounds.map(r => r.totalStrokes)) : null
  const thisYearAvg =
    thisYearRounds.length > 0
      ? Math.round(
          (thisYearRounds.reduce((s, r) => s + r.totalStrokes, 0) / thisYearRounds.length) * 10
        ) / 10
      : null

  const yearMap = new Map<number, number[]>()
  for (const r of scored) {
    const year = r.playedAt.getFullYear()
    const arr = yearMap.get(year) ?? []
    arr.push(r.totalStrokes)
    yearMap.set(year, arr)
  }
  const yearlyAverages = Array.from(yearMap.entries())
    .map(([year, scores]) => ({
      year,
      avg: Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10,
    }))
    .sort((a, b) => a.year - b.year)

  return {
    bestScore: bestScoreRound
      ? {
          score: bestScoreRound.totalStrokes,
          courseName: bestScoreRound.courseName,
          playedAt: bestScoreRound.playedAt,
        }
      : null,
    bestHalf,
    thisYear: {
      roundCount: thisYearRounds.length,
      bestScore: thisYearBest,
      avgScore: thisYearAvg,
    },
    yearlyAverages,
    recent5: rounds.slice(0, 5).map(r => ({
      id: r.id,
      playedAt: r.playedAt,
      courseName: r.courseName,
      score: r.totalStrokes,
    })),
    recent20: rounds.slice(0, 20).map(r => ({ id: r.id, score: r.totalStrokes })),
  }
}
