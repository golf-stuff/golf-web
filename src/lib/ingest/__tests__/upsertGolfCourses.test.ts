import { describe, it, expect, vi, beforeEach } from "vitest";
import { upsertGolfCourses } from "../upsertGolfCourses";
import type { GroupedCourse } from "../types";

function course(overrides: Partial<GroupedCourse> = {}): GroupedCourse {
  return {
    matchKey: "akabanegolfclub|東京都|北区",
    courseName: "赤羽ゴルフ倶楽部",
    prefecture: "東京都",
    city: "北区",
    layouts: [
      {
        name: "OUT",
        holes: [{ holeNumber: 1, par: 4, yardRegular: 375 }],
      },
    ],
    scrapedAt: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}

function createMockPrisma() {
  const mock = {
    mstGolfCourse: {
      upsert: vi.fn(),
    },
    mstCourseLayout: {
      upsert: vi.fn(),
    },
    mstHole: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mock)),
  };
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upsertGolfCourses", () => {
  it("mstGolfCourse/mstCourseLayoutをnative upsertで作成・更新する", async () => {
    const prisma = createMockPrisma();
    prisma.mstGolfCourse.upsert.mockResolvedValue({ id: "course-1" });
    prisma.mstCourseLayout.upsert.mockResolvedValue({ id: "layout-1" });

    const result = await upsertGolfCourses(prisma as any, [course()]);

    expect(prisma.mstGolfCourse.upsert).toHaveBeenCalledWith({
      where: { name_prefecture_city: { name: "赤羽ゴルフ倶楽部", prefecture: "東京都", city: "北区" } },
      create: { name: "赤羽ゴルフ倶楽部", prefecture: "東京都", city: "北区", lastScrapedAt: new Date("2026-07-07T00:00:00.000Z") },
      update: { name: "赤羽ゴルフ倶楽部", prefecture: "東京都", city: "北区", lastScrapedAt: new Date("2026-07-07T00:00:00.000Z") },
    });
    expect(prisma.mstCourseLayout.upsert).toHaveBeenCalledWith({
      where: { golfCourseId_name: { golfCourseId: "course-1", name: "OUT" } },
      create: { golfCourseId: "course-1", name: "OUT", holeCount: 1, displayOrder: 1 },
      update: { holeCount: 1, displayOrder: 1 },
    });
    expect(prisma.mstHole.upsert).toHaveBeenCalledWith({
      where: { courseLayoutId_holeNumber: { courseLayoutId: "layout-1", holeNumber: 1 } },
      create: { courseLayoutId: "layout-1", holeNumber: 1, par: 4, yardRegular: 375 },
      update: { par: 4, yardRegular: 375 },
    });
    expect(result.succeeded).toEqual(["akabanegolfclub|東京都|北区"]);
    expect(result.failed).toEqual([]);
  });

  it("1コースの処理を$transactionでラップする", async () => {
    const prisma = createMockPrisma();
    prisma.mstGolfCourse.upsert.mockResolvedValue({ id: "course-1" });
    prisma.mstCourseLayout.upsert.mockResolvedValue({ id: "layout-1" });

    await upsertGolfCourses(prisma as any, [course()]);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("1コースのUpsert失敗が他コースの処理を止めず、失敗したコースはロールバックされる", async () => {
    const prisma = createMockPrisma();
    prisma.mstGolfCourse.upsert
      .mockRejectedValueOnce(new Error("DB接続エラー"))
      .mockResolvedValueOnce({ id: "course-2" });
    prisma.mstCourseLayout.upsert.mockResolvedValue({ id: "layout-2" });

    const result = await upsertGolfCourses(prisma as any, [
      course({ matchKey: "course-a" }),
      course({ matchKey: "course-b", courseName: "別のコース" }),
    ]);

    expect(result.failed).toEqual([{ matchKey: "course-a", error: "DB接続エラー" }]);
    expect(result.succeeded).toEqual(["course-b"]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
