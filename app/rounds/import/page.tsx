import Link from 'next/link'
import { prisma } from '@/src/lib/db/prisma'
import ImportForm from './ImportForm'

export default async function ImportPage() {
  const golfCourses = await prisma.mstGolfCourse.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      layouts: {
        orderBy: { displayOrder: 'asc' },
        select: { id: true, name: true, holeCount: true },
      },
    },
  })

  return (
    <main className="p-6 max-w-lg mx-auto flex flex-col gap-4">
      <nav>
        <Link href="/rounds" className="text-xs text-blue-600 hover:underline">
          ← ラウンド一覧
        </Link>
      </nav>

      <h1 className="text-lg font-medium text-gray-900">GDOスコアインポート</h1>

      {golfCourses.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-sm text-yellow-800">
          <p className="font-medium mb-1">ゴルフ場が登録されていません</p>
          <p className="text-xs text-yellow-700 mb-3">
            インポートするには、まずゴルフ場とコースレイアウト（OUT/IN）を登録してください。
          </p>
          <Link href="/golf-courses" className="text-xs text-blue-600 hover:underline">
            ゴルフ場を登録する →
          </Link>
        </div>
      ) : (
        <ImportForm golfCourses={golfCourses} />
      )}
    </main>
  )
}
