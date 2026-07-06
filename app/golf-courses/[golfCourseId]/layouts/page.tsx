import { prisma } from "@/src/lib/db/prisma";
import { requireAdminForPage } from "@/src/lib/auth/requireAdmin";
import { createCourseLayout } from "../../actions";
import { updateCourseLayoutName } from "../../actions";
import Link from "next/link";

type Props = {
  params: Promise<{
    golfCourseId: string;
  }>;
};

export default async function CourseLayoutPage({ params }: Props) {
  const { golfCourseId } = await params;
  await requireAdminForPage();

  const golfCourse = await prisma.mstGolfCourse.findUnique({
    where: { id: golfCourseId },
    include: {
      layouts: {
        orderBy: { displayOrder: "asc" },
        include: {
          holes: {
            orderBy: { holeNumber: "asc" },
          },
        },
      },
    },
  });

  if (!golfCourse) {
    return <div>ゴルフ場が見つかりません</div>;
  }

  return (
    <main className="p-6 max-w-2xl mx-auto flex flex-col gap-4">
      <nav>
        <Link href="/golf-courses" className="nav-back">← ゴルフ場一覧</Link>
      </nav>
      <h1 className="page-heading">{golfCourse.name} — コース管理</h1>

      {/* コース追加フォーム */}
      <div className="page-card flex flex-col gap-4">
        <span className="page-subheading">コースを追加</span>
        <form action={createCourseLayout} className="flex flex-col gap-4">
          <input type="hidden" name="golfCourseId" value={golfCourseId} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">コース名</label>
              <input type="text" name="name" required placeholder="例：OUT" className="input-underline" />
            </div>
            <div>
              <label className="field-label">ホール数</label>
              <input type="number" name="holeCount" required min={1} max={18} defaultValue={9} className="input-underline" />
            </div>
          </div>
          <div>
            <button type="submit" className="btn-primary">追加</button>
          </div>
        </form>
      </div>

      {/* コース一覧 */}
      {golfCourse.layouts.map((layout: { id: string; name: string; holeCount: number; holes: { holeNumber: number; par: number }[] }) => (
        <div key={layout.id} className="page-card flex flex-col gap-3">
          <div className="flex justify-between items-start">
            <div>
              <div className="page-subheading">{layout.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{layout.holeCount}H · {layout.holes.length}ホール登録済</div>
            </div>
            <Link href={`/golf-courses/${golfCourseId}/layouts/${layout.id}/holes`} className="btn-secondary text-xs px-3 py-1.5">
              ホール設定
            </Link>
          </div>

          {/* コース名変更フォーム */}
          <form action={updateCourseLayoutName} className="flex gap-2 items-end border-t border-gray-100 pt-3">
            <input type="hidden" name="layoutId" value={layout.id} />
            <div className="flex-1">
              <label className="field-label">コース名を変更</label>
              <input type="text" name="name" defaultValue={layout.name} className="input-underline" />
            </div>
            <button type="submit" className="btn-secondary text-xs px-3 py-1.5">変更</button>
          </form>
        </div>
      ))}
    </main>
  );
}
