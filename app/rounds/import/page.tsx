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

      <ImportForm golfCourses={golfCourses} />
    </main>
  )
}
