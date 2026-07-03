import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/db/prisma";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";
import { updateGolfCourse } from "../../actions";

type Props = {
  params: Promise<{
    golfCourseId: string;
  }>;
};

export default async function EditGolfCoursePage({ params }: Props) {
  const { golfCourseId } = await params; // Next.js 16 仕様
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  if (!golfCourseId) {
    return <div>不正なIDです</div>;
  }

  const course = await prisma.mstGolfCourse.findUnique({
    where: { id: golfCourseId },
  });

  if (!course || course.userId !== currentUser.id) {
    return <div>ゴルフ場が見つかりません</div>;
  }

  return (
    <main>
      <h1>ゴルフ場を編集</h1>

      <form action={updateGolfCourse}>
        {/* 更新対象のID */}
        <input type="hidden" name="id" value={course.id} />

        <div>
          <label>
            ゴルフ場名
            <input
              type="text"
              name="name"
              defaultValue={course.name}
              required
            />
          </label>
        </div>

        <button type="submit">保存</button>
      </form>
    </main>
  );
}
