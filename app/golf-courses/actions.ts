"use server";

import { prisma } from "@/src/lib/db/prisma";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";

/**
 * ゴルフ場を新規作成
 */
export async function createGolfCourse(formData: FormData) {
  const name = formData.get("name") as string;

  if (!name || name.trim() === "") {
    throw new Error("ゴルフ場名は必須です");
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("ログインが必要です");

  await prisma.mstGolfCourse.create({
    data: {
      userId: currentUser.id,
      name,
    },
  });

  redirect("/golf-courses");
}

/**
 * ゴルフ場を更新
 */
export async function updateGolfCourse(formData: FormData) {
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;

  if (!id) {
    throw new Error("IDが不正です");
  }

  if (!name || name.trim() === "") {
    throw new Error("ゴルフ場名は必須です");
  }

  await prisma.mstGolfCourse.update({
    where: { id },
    data: { name },
  });

  redirect("/golf-courses");
}

/**
 * コース（OUT / IN など）を追加
 */
export async function createCourseLayout(formData: FormData) {
  const golfCourseId = formData.get("golfCourseId") as string;
  const name = formData.get("name") as string;

  if (!golfCourseId) {
    throw new Error("ゴルフ場IDが不正です");
  }

  if (!name || name.trim() === "") {
    throw new Error("コース名は必須です");
  }

  // 既存コースの最大 displayOrder を取得
  const lastLayout = await prisma.mstCourseLayout.findFirst({
    where: { golfCourseId },
    orderBy: { displayOrder: "desc" },
  });

  const nextDisplayOrder = lastLayout
    ? lastLayout.displayOrder + 1
    : 1;

  await prisma.mstCourseLayout.create({
    data: {
      golfCourseId,
      name,
      holeCount: 9,
      displayOrder: nextDisplayOrder,
    },
  });

  redirect(`/golf-courses/${golfCourseId}/layouts`);
}

/**
 * コース名を更新
 */
export async function updateCourseLayoutName(formData: FormData) {
  const layoutId = formData.get("layoutId") as string;
  const golfCourseId = formData.get("golfCourseId") as string;
  const name = formData.get("name") as string;

  if (!layoutId || !golfCourseId) {
    throw new Error("コースIDが不正です");
  }

  if (!name || name.trim() === "") {
    throw new Error("コース名は必須です");
  }

  await prisma.mstCourseLayout.update({
    where: { id: layoutId },
    data: { name },
  });

  // 同じ画面に戻す
  redirect(`/golf-courses/${golfCourseId}/layouts`);
}


/**
 * Hole情報
 */
type HoleInput = {
  holeNumber: number;
  par: number;
  yardRegular: number;
};

/**
 * 受け取ったデータのクレンジング
 */
function parseHoleInputsJson(json: string): HoleInput[] {
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Holeデータの形式が不正です");
  }

  return parsed.map((row, index) => {
    if (
      typeof row !== "object" ||
      row == null ||
      typeof (row as any).holeNumber !== "number" ||
      typeof (row as any).par !== "number" ||
      typeof (row as any).yardRegular !== "number"
    ) {
      throw new Error(`Holeデータの形式が不正です（${index + 1}行目）`);
    }
    return {
      holeNumber: (row as any).holeNumber,
      par: (row as any).par,
      yardRegular: (row as any).yardRegular,
    };
  });
}

/**
 * Hole定義を保存（既存削除→再作成）
 */
export async function saveHoles(formData: FormData) {
  const golfCourseId = formData.get("golfCourseId") as string;
  const layoutId = formData.get("layoutId") as string;
  const holesJson = formData.get("holesJson") as string;
  const now = new Date();

  if (!golfCourseId) throw new Error("ゴルフ場IDが不正です");
  if (!layoutId) throw new Error("コースIDが不正です");
  if (!holesJson) throw new Error("Holeデータが空です");

  const layout = await prisma.mstCourseLayout.findUnique({
    where: { id: layoutId },
  });

  if (!layout) throw new Error("コースが見つかりません");

  const holes = parseHoleInputsJson(holesJson);

  if (holes.length !== layout.holeCount) {
    throw new Error(`Hole数が不一致です（期待: ${layout.holeCount} / 入力: ${holes.length}）`);
  }

  // 1..N の連番チェック
  for (let i = 0; i < holes.length; i++) {
    const expected = i + 1;
    if (holes[i].holeNumber !== expected) {
      throw new Error(`Hole番号が不正です（${expected}番が ${holes[i].holeNumber} になっています）`);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.mstHole.deleteMany({
      where: { courseLayoutId: layoutId },
    });

    for (const h of holes) {
      await tx.mstHole.create({
        data: {
          courseLayoutId: layoutId,
          holeNumber: h.holeNumber,
          par: h.par,
          yardRegular: h.yardRegular,
          updatedAt: now,
        },
      });
    }
  });

  redirect(`/golf-courses/${golfCourseId}/layouts/${layoutId}/holes`);
}