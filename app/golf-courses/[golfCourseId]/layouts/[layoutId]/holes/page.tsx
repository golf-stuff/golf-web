import Link from "next/link";
import { prisma } from "@/src/lib/db/prisma";
import { requireAdminForPage } from "@/src/lib/auth/requireAdmin";
import HoleDefinitionClient from "./ui";

type Props = {
  params: Promise<{
    golfCourseId: string;
    layoutId: string;
  }>;
};

export default async function HoleDefinitionPage({ params }: Props) {
  const { golfCourseId, layoutId } = await params;
  await requireAdminForPage();

  const golfCourse = await prisma.mstGolfCourse.findUnique({
    where: { id: golfCourseId },
  });

  const layout = await prisma.mstCourseLayout.findUnique({
    where: { id: layoutId },
  });

  if (!golfCourse || !layout) {
    return <div>ゴルフ場またはコースが見つかりません</div>;
  }

  const existingHoles = await prisma.mstHole.findMany({
    where: { courseLayoutId: layoutId },
    orderBy: { holeNumber: "asc" },
  });

  const initialHoles = existingHoles.length
    ? existingHoles.map((h: { holeNumber: number; par: number; yardRegular: number }) => ({
        holeNumber: h.holeNumber,
        par: h.par,
        yardRegular: h.yardRegular,
      }))
    : Array.from({ length: layout.holeCount }, (_, i) => ({
        holeNumber: i + 1,
        par: 4,
        yardRegular: 0,
      }));

  return (
    <main className="p-6 max-w-2xl mx-auto flex flex-col gap-4">
      <nav>
        <Link href={`/golf-courses/${golfCourseId}/layouts`} className="nav-back">
          ← {golfCourse.name} コース管理
        </Link>
      </nav>
      <h1 className="page-heading">{layout.name} — ホール設定</h1>

      <HoleDefinitionClient
        golfCourseId={golfCourseId}
        layoutId={layoutId}
        holeCount={layout.holeCount}
        initialHoles={initialHoles}
      />
    </main>
  );
}
