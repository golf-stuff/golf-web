"use server";

import { prisma } from "@/src/lib/db/prisma";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";
import type { ParsedScore } from "@/src/lib/parsers/gdoScorecard";

// ---- 型定義 ----

export type ImportScoreInput = {
  roundId?: string; // 指定時は上書きモード
  golfCourseId: string;
  layoutId: string;
  playedAt: string; // YYYY-MM-DD（新規作成時のみ使用）
  scores: ParsedScore[];
};

export type ImportScore18HInput = {
  roundId?: string; // 指定時は上書きモード
  golfCourseId: string;
  firstLayoutId: string;
  secondLayoutId: string;
  playedAt: string; // 新規作成時のみ使用
  firstScores: ParsedScore[];
  secondScores: ParsedScore[];
};

// ---- ユーティリティ ----

async function buildHoleData(layoutId: string, scores: ParsedScore[]) {
  const layout = await prisma.mstCourseLayout.findUnique({
    where: { id: layoutId },
    include: { holes: true },
  });
  if (!layout) throw new Error(`レイアウトが見つかりません: ${layoutId}`);
  if (layout.holes.length === 0) {
    throw new Error(`レイアウト「${layout.name}」にホールが登録されていません`);
  }

  const holeMap = new Map(layout.holes.map(h => [h.holeNumber, h.id]));
  const holeData = scores.flatMap(s => {
    const holeId = holeMap.get(s.holeNumber);
    if (!holeId) return [];
    return [{
      holeId,
      stroke: s.stroke,
      putt: s.putt ?? 0,
      penalty: s.penalty,
    }];
  });

  if (holeData.length === 0) {
    const dbNums = Array.from(holeMap.keys()).sort((a, b) => a - b);
    const impNums = scores.map(s => s.holeNumber).sort((a, b) => a - b);
    throw new Error(
      `Hole番号がDBと一致しません。DB: [${dbNums}] / インポート: [${impNums}]`
    );
  }
  return holeData;
}

/**
 * roundIdが指定され、かつcurrentUser所有であれば上書きモード。それ以外はnull（新規作成にフォールバック）
 * トランザクション内でのみ呼び出すこと（TOCTOU脆弱性対策）
 */
async function resolveOverwriteRoundIdInTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  roundId: string | undefined,
  userId: string
) {
  if (!roundId) return null;
  const round = await tx.trnRound.findUnique({ where: { id: roundId } });
  if (!round || round.userId !== userId) return null;
  return round.id;
}

/** ホール結果をupsertで上書きする（stroke/putt/penaltyのみ更新。手動入力項目は温存） */
async function upsertHoleResults(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  roundId: string,
  holeData: { holeId: string; stroke: number; putt: number; penalty: number }[]
) {
  for (const h of holeData) {
    await tx.trnRoundHoleResult.upsert({
      where: { roundId_holeId: { roundId, holeId: h.holeId } },
      update: { stroke: h.stroke, putt: h.putt, penalty: h.penalty },
      create: { roundId, holeId: h.holeId, stroke: h.stroke, putt: h.putt, penalty: h.penalty },
    });
  }
}

// ---- アクション ----

/** 9H インポート（roundId指定時は既存ラウンドへの上書き） */
export async function importGdoScore(input: ImportScoreInput) {
  const { roundId, golfCourseId, layoutId, playedAt, scores } = input;

  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("ログインが必要です");

  const holeData = await buildHoleData(layoutId, scores);

  const resultRoundId = await prisma.$transaction(async (tx) => {
    const overwriteRoundId = await resolveOverwriteRoundIdInTx(tx, roundId, currentUser.id);

    if (overwriteRoundId) {
      await upsertHoleResults(tx, overwriteRoundId, holeData);
      return overwriteRoundId;
    }

    const created = await tx.trnRound.create({
      data: { userId: currentUser.id, golfCourseId, playedAt: new Date(playedAt) },
    });
    await tx.trnRoundHoleResult.createMany({
      data: holeData.map(h => ({ ...h, roundId: created.id })),
    });
    return created.id;
  });

  redirect(`/rounds/${resultRoundId}/holes`);
}

/** 18H インポート（roundId指定時は既存ラウンドへの上書き） */
export async function importGdoScore18H(input: ImportScore18HInput) {
  const { roundId, golfCourseId, firstLayoutId, secondLayoutId, playedAt, firstScores, secondScores } = input;

  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("ログインが必要です");

  const [firstHoleData, secondHoleData] = await Promise.all([
    buildHoleData(firstLayoutId, firstScores),
    buildHoleData(secondLayoutId, secondScores),
  ]);

  const resultRoundId = await prisma.$transaction(async (tx) => {
    const overwriteRoundId = await resolveOverwriteRoundIdInTx(tx, roundId, currentUser.id);

    if (overwriteRoundId) {
      await upsertHoleResults(tx, overwriteRoundId, [...firstHoleData, ...secondHoleData]);
      return overwriteRoundId;
    }

    const created = await tx.trnRound.create({
      data: { userId: currentUser.id, golfCourseId, playedAt: new Date(playedAt) },
    });
    await tx.trnRoundHoleResult.createMany({
      data: [
        ...firstHoleData.map(h => ({ ...h, roundId: created.id })),
        ...secondHoleData.map(h => ({ ...h, roundId: created.id })),
      ],
    });
    return created.id;
  });

  redirect(`/rounds/${resultRoundId}/holes`);
}
