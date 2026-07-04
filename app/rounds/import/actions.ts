"use server";

import { prisma } from "@/src/lib/db/prisma";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";

export type ImportScoreInput = {
  golfCourseId: string;
  layoutId: string;
  playedAt: string; // YYYY-MM-DD
  scores: { holeNumber: number; stroke: number; putt: number | null }[];
};

export async function importGdoScore(input: ImportScoreInput) {
  const { golfCourseId, layoutId, playedAt, scores } = input;

  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("ログインが必要です");

  // layoutId のホール一覧を取得してholeNumber→holeIdのマップを作る
  const layout = await prisma.mstCourseLayout.findUnique({
    where: { id: layoutId },
    include: { holes: true },
  });

  if (!layout) throw new Error("レイアウトが見つかりません");

  if (layout.holes.length === 0) {
    throw new Error(`レイアウト「${layout.name}」にホールが登録されていません。先にホール情報を登録してください。`);
  }

  const holeMap = new Map(layout.holes.map(h => [h.holeNumber, h.id]));

  const holeData = scores.flatMap(s => {
    const holeId = holeMap.get(s.holeNumber);
    if (!holeId) return [];
    return [{
      holeId,
      stroke: s.stroke,
      putt: s.putt ?? 0,
      penalty: 0,
    }];
  });

  if (holeData.length === 0) {
    const dbHoleNumbers = Array.from(holeMap.keys()).sort((a, b) => a - b);
    const importHoleNumbers = scores.map(s => s.holeNumber).sort((a, b) => a - b);
    throw new Error(
      `スコアのHole番号がDBと一致しません。` +
      `DB: [${dbHoleNumbers.join(',')}] / インポート: [${importHoleNumbers.join(',')}]`
    );
  }

  const round = await prisma.$transaction(async (tx) => {
    const created = await tx.trnRound.create({
      data: {
        userId: currentUser.id,
        golfCourseId,
        playedAt: new Date(playedAt),
      },
    });

    await tx.trnRoundHoleResult.createMany({
      data: holeData.map(h => ({ ...h, roundId: created.id })),
    });

    return created;
  });

  redirect(`/rounds/${round.id}/holes`);
}
