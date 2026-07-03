import { prisma } from '@/src/lib/db/prisma'

export type RoundSummary = {
  id: string
  playedAt: Date
  courseName: string
  totalStrokes: number
  layoutStrokes: { layoutId: string; layoutName: string; strokes: number }[]
}

export async function fetchRoundSummaries(userId: string): Promise<RoundSummary[]> {
  const rounds = await prisma.trnRound.findMany({
    where: { userId },
    orderBy: { playedAt: 'desc' },
    include: {
      golfCourse: true,
      holeResults: {
        include: {
          hole: {
            include: { courseLayout: true },
          },
        },
      },
    },
  })

  return rounds.map(round => {
    const totalStrokes = round.holeResults.reduce((sum, r) => sum + r.stroke, 0)

    const layoutMap = new Map<string, { name: string; strokes: number }>()
    for (const r of round.holeResults) {
      const layoutId = r.hole.courseLayoutId
      const layoutName = r.hole.courseLayout.name
      const current = layoutMap.get(layoutId) ?? { name: layoutName, strokes: 0 }
      layoutMap.set(layoutId, { name: current.name, strokes: current.strokes + r.stroke })
    }

    return {
      id: round.id,
      playedAt: round.playedAt,
      courseName: round.golfCourse.name,
      totalStrokes,
      layoutStrokes: Array.from(layoutMap.entries()).map(([layoutId, v]) => ({
        layoutId,
        layoutName: v.name,
        strokes: v.strokes,
      })),
    }
  })
}
