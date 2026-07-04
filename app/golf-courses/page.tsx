import Link from 'next/link'
import { prisma } from "@/src/lib/db/prisma";

export default async function GolfCourseListPage() {
  const courses = await prisma.mstGolfCourse.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="p-6 max-w-2xl mx-auto flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="page-heading">ゴルフ場</h1>
        <Link href="/golf-courses/new" className="btn-primary">
          ＋ 新規作成
        </Link>
      </div>

      {courses.length === 0 ? (
        <div className="page-card text-sm text-gray-400 text-center py-8">
          ゴルフ場が登録されていません
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {courses.map((course: { id: string; name: string }) => (
            <div key={course.id} className="page-card flex justify-between items-center">
              <span className="text-sm text-gray-900">{course.name}</span>
              <div className="flex gap-3">
                <Link href={`/golf-courses/${course.id}/edit`} className="btn-ghost">
                  編集
                </Link>
                <Link href={`/golf-courses/${course.id}/layouts`} className="btn-ghost">
                  コース管理
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
