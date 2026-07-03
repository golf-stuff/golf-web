import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/db/prisma";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";

export default async function GolfCourseListPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const courses = await prisma.mstGolfCourse.findMany({
    where: { userId: currentUser.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main>
      <h1>ゴルフ場一覧</h1>

      <a href="/golf-courses/new">＋ 新規作成</a>

      <ul>
        {courses.map((course: { id: string; name: string }) => (
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
