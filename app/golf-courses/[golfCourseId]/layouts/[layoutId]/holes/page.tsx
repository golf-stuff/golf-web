import Link from "next/link";
import { prisma } from "@/src/lib/db/prisma";
import HoleDefinitionClient from "./ui";

type Props = {
  params: Promise<{
    golfCourseId: string;
    layoutId: string;
  }>;
};

export default async function HoleDefinitionPage({ params }: Props) {
  const { golfCourseId, layoutId } = await params;

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
    <main>
      <nav>
        <Link href={`/golf-courses/${golfCourseId}/layouts`}>
          ← コース管理へ戻る
        </Link>
        {" / "}
        <Link href="/golf-courses">
          ゴルフ場一覧
        </Link>
      </nav>

      <h1>
        {golfCourse.name} / {layout.name}（Hole定義）
      </h1>

      <HoleDefinitionClient
        golfCourseId={golfCourseId}
        layoutId={layoutId}
        holeCount={layout.holeCount}
        initialHoles={initialHoles}
      />
    </main>
  );
}
