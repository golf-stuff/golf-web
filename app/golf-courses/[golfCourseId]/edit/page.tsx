import Link from 'next/link'
import { prisma } from "@/src/lib/db/prisma";
import { updateGolfCourse } from "../../actions";

type Props = {
  params: Promise<{
    golfCourseId: string;
  }>;
};

export default async function EditGolfCoursePage({ params }: Props) {
  const { golfCourseId } = await params; // Next.js 16 仕様

  if (!golfCourseId) {
    return <div>不正なIDです</div>;
  }

  const course = await prisma.mstGolfCourse.findUnique({
    where: { id: golfCourseId },
  });

  if (!course) {
    return <div>ゴルフ場が見つかりません</div>;
  }

  return (
    <main className="p-6 max-w-lg mx-auto flex flex-col gap-4">
      <nav>
        <Link href="/golf-courses" className="nav-back">← ゴルフ場一覧</Link>
      </nav>
      <h1 className="page-heading">ゴルフ場を編集</h1>

      <form action={updateGolfCourse} className="page-card flex flex-col gap-5">
        <input type="hidden" name="id" value={course.id} />
        <div>
          <label className="field-label" htmlFor="name">ゴルフ場名</label>
          <input
            id="name"
            type="text"
            name="name"
            required
            defaultValue={course.name}
            className="input-underline"
          />
        </div>
        <div>
          <button type="submit" className="btn-primary">更新</button>
        </div>
      </form>
    </main>
  );
}
