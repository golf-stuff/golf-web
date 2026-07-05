import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/src/lib/db/prisma'
import { getCurrentUser } from '@/src/lib/auth/getCurrentUser'
import ImportForm from './ImportForm'

type Props = {
  searchParams: Promise<{ roundId?: string }>
}

export default async function ImportPage({ searchParams }: Props) {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const { roundId } = await searchParams

  const golfCourses = await prisma.mstGolfCourse.findMany({
    orderBy: { name: "asc" },
    include: {
      layouts: {
        orderBy: { displayOrder: "asc" },
        select: { id: true, name: true, holeCount: true },
      },
    },
  })

  // roundIdが指定されていても、currentUserの所有ラウンドでなければnull（新規作成モードにフォールバック）
  const existingRoundRow = roundId
    ? await prisma.trnRound.findUnique({
        where: { id: roundId },
        select: { id: true, golfCourseId: true, playedAt: true, userId: true },
      })
    : null
  const existingRound = existingRoundRow && existingRoundRow.userId === currentUser.id
    ? {
        id: existingRoundRow.id,
        golfCourseId: existingRoundRow.golfCourseId,
        playedAt: existingRoundRow.playedAt.toISOString().slice(0, 10),
      }
    : null

  return (
    <main className="p-6 max-w-lg mx-auto flex flex-col gap-4">
      <nav>
        <Link
          href={existingRound ? `/rounds/${existingRound.id}/holes` : '/rounds'}
          className="nav-back"
        >
          ← {existingRound ? 'ホール入力へ戻る' : 'ラウンド一覧'}
        </Link>
      </nav>

      <h1 className="page-heading">
        {existingRound ? 'GDOスコアで上書き' : 'GDOスコアインポート'}
      </h1>

      {golfCourses.length === 0 ? (
        <div className="page-card bg-yellow-50 border-yellow-200 text-sm text-yellow-800">
          <p className="font-medium mb-1">ゴルフ場が登録されていません</p>
          <p className="text-xs text-yellow-700">
            インポートするには、まずゴルフ場とコースレイアウト（OUT/IN）の登録が必要です。管理者にご依頼ください。
          </p>
        </div>
      ) : (
        <ImportForm golfCourses={golfCourses} existingRound={existingRound} />
      )}
    </main>
  )
}
