"use server";

import { prisma } from "@/src/lib/db/prisma";
import { redirect } from "next/navigation";

/**
 * 新しいラウンドを登録
 */
 export async function createRound(formData: FormData) {
  const playedAt = formData.get("playedAt") as string;
  const golfCourseId = formData.get("golfCourseId") as string;

  if (!playedAt || !golfCourseId) {
    throw new Error("入力が不足しています");
  }

  const round = await prisma.trnRound.create({
    data: {
      userId: "user-dev",
      golfCourseId,
      playedAt: new Date(playedAt),
    },
  });

  redirect(`/rounds/${round.id}/holes`);
}

/** 
 * ラウンドのホール結果を保存
 */
export async function saveRoundHoles(formData: FormData) {
  const roundId = formData.get("roundId") as string;

  if (!roundId) {
    throw new Error("Round IDが不正です");
  }

  // holeId -> 入力値を集約
  const holeMap = new Map<
    string,
    {
      stroke?: number;
      putt?: number;
      penalty?: number;
      shortgame?: number;
      secondShotOk?: boolean;
      fairwayKeep?: string;
      greenBunker?: number;
      fairwayBunker?: number;
    }
  >();

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("hole_")) continue;

    const [, holeId, field] = key.split("_");
    const current = holeMap.get(holeId) ?? {};

    switch (field) {
      case "score": {
        const v = Number(value);
        if (!Number.isNaN(v)) current.stroke = v;
        break;
      }
      case "putt": {
        const v = Number(value);
        if (!Number.isNaN(v)) current.putt = v;
        break;
      }
      case "penalty": {
        const v = Number(value);
        if (!Number.isNaN(v)) current.penalty = v;
        break;
      }
      case "shortgame": {
        const v = Number(value);
        if (!Number.isNaN(v)) current.shortgame = v;
        break;
      }
      case "greenBunker": {
        const v = Number(value);
        if (!Number.isNaN(v)) current.greenBunker = v;
        break;
      }
      case "fairwayBunker": {
        const v = Number(value);
        if (!Number.isNaN(v)) current.fairwayBunker = v;
        break;
      }
      case "secondShotOk": {
        if (value === "true") current.secondShotOk = true;
        if (value === "false") current.secondShotOk = false;
        break;
      }
      case "fairwayKeep": {
        if (value) current.fairwayKeep = value.toString();
        break;
      }
    }

    holeMap.set(holeId, current);
  }

  await prisma.$transaction(async tx => {
    // MVPなので一旦全削除
    await tx.trnRoundHoleResult.deleteMany({
      where: { roundId },
    });

    for (const [holeId, values] of holeMap.entries()) {
      if (values.stroke == null) {
        // スコア未入力の Hole は保存しない（or エラーにしてもOK）
        continue;
      }

      await tx.trnRoundHoleResult.create({
        data: {
          roundId,
          holeId,
          stroke: values.stroke,
          putt: values.putt ?? 0,
          penalty: values.penalty ?? 0,

          shortgame: values.shortgame ?? null,
          secondShotOk: values.secondShotOk ?? null,
          fairwayKeep: values.fairwayKeep ?? null,
          greenBunker: values.greenBunker ?? null,
          fairwayBunker: values.fairwayBunker ?? null,
        },
      });
    }
  });

  redirect(`/rounds/${roundId}/holes`);
}
