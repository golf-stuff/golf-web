"use server";

import { prisma } from "@/src/lib/db/prisma";
import { redirect } from "next/navigation";

export type ImportScoreInput = {
  golfCourseId: string;
  layoutId: string;
  playedAt: string; // YYYY-MM-DD
  scores: { holeNumber: number; stroke: number; putt: number | null }[];
};

export async function importGdoScore(input: ImportScoreInput) {
  const { golfCourseId, layoutId, playedAt, scores } = input;

  // layoutId のホール一覧を取得してholeNumber→holeIdのマップを作る
  const layout = await prisma.mstCourseLayout.findUnique({
    where: { id: layoutId },
    include: { holes: true },
  });

  if (!layout) throw new Error("レイアウトが見つかりません");

  const holeMap = new Map(layout.holes.map(h => [h.holeNumber, h.id]));

  const round = await prisma.trnRound.create({
    data: {
      userId: "user-dev",
      golfCourseId,
      playedAt: new Date(playedAt),
    },
  });

  await prisma.trnRoundHoleResult.createMany({
    data: scores.flatMap(s => {
      const holeId = holeMap.get(s.holeNumber);
      if (!holeId) return [];
      return [{
        roundId: round.id,
        holeId,
        stroke: s.stroke,
        putt: s.putt ?? 0,
        penalty: 0,
      }];
    }),
  });

  redirect(`/rounds/${round.id}/holes`);
}
