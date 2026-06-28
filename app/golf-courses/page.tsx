import { prisma } from "@/src/lib/db/prisma";

export default async function GolfCourseListPage() {
  const courses = await prisma.mstGolfCourse.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <main>
      <h1>ゴルフ場一覧</h1>

      <a href="/golf-courses/new">＋ 新規作成</a>

      <ul>
        {courses.map(course => (
            <li key={course.id}>
            {course.name}
            {" "}
            <a href={`/golf-courses/${course.id}/edit`}>
                編集
            </a>
            <a href={`/golf-courses/${course.id}/layouts`}>
            コース管理
</a>
            </li>
        ))}
      </ul>

    </main>
  );
}
