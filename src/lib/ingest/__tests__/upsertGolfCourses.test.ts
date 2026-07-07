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
  return {
    mstGolfCourse: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    mstCourseLayout: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    mstHole: {
      upsert: vi.fn(),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upsertGolfCourses", () => {
  it("既存コースが無ければ新規作成し、レイアウト・ホールも作成する", async () => {
    const prisma = createMockPrisma();
    prisma.mstGolfCourse.findFirst.mockResolvedValue(null);
    prisma.mstGolfCourse.create.mockResolvedValue({ id: "course-1" });
    prisma.mstCourseLayout.findFirst.mockResolvedValue(null);
    prisma.mstCourseLayout.create.mockResolvedValue({ id: "layout-1" });

    const result = await upsertGolfCourses(prisma as any, [course()]);

    expect(prisma.mstGolfCourse.create).toHaveBeenCalledWith({
      data: { name: "赤羽ゴルフ倶楽部", prefecture: "東京都", city: "北区", lastScrapedAt: new Date("2026-07-07T00:00:00.000Z") },
    });
    expect(prisma.mstCourseLayout.create).toHaveBeenCalledWith({
      data: { golfCourseId: "course-1", name: "OUT", holeCount: 1, displayOrder: 1 },
    });
    expect(prisma.mstHole.upsert).toHaveBeenCalledWith({
      where: { courseLayoutId_holeNumber: { courseLayoutId: "layout-1", holeNumber: 1 } },
      create: { courseLayoutId: "layout-1", holeNumber: 1, par: 4, yardRegular: 375 },
      update: { par: 4, yardRegular: 375 },
    });
    expect(result.succeeded).toEqual(["akabanegolfclub|東京都|北区"]);
    expect(result.failed).toEqual([]);
  });

  it("既存コースがあれば更新し、lastScrapedAtを更新する", async () => {
    const prisma = createMockPrisma();
    prisma.mstGolfCourse.findFirst.mockResolvedValue({ id: "course-1" });
    prisma.mstCourseLayout.findFirst.mockResolvedValue({ id: "layout-1" });

    await upsertGolfCourses(prisma as any, [course()]);

    expect(prisma.mstGolfCourse.create).not.toHaveBeenCalled();
    expect(prisma.mstGolfCourse.update).toHaveBeenCalledWith({
      where: { id: "course-1" },
      data: { name: "赤羽ゴルフ倶楽部", prefecture: "東京都", city: "北区", lastScrapedAt: new Date("2026-07-07T00:00:00.000Z") },
    });
  });

  it("1コースのUpsert失敗が他コースの処理を止めない", async () => {
    const prisma = createMockPrisma();
    prisma.mstGolfCourse.findFirst
      .mockRejectedValueOnce(new Error("DB接続エラー"))
      .mockResolvedValueOnce({ id: "course-2" });
    prisma.mstCourseLayout.findFirst.mockResolvedValue({ id: "layout-2" });

    const result = await upsertGolfCourses(prisma as any, [
      course({ matchKey: "course-a" }),
      course({ matchKey: "course-b", courseName: "別のコース" }),
    ]);

    expect(result.failed).toEqual([{ matchKey: "course-a", error: "DB接続エラー" }]);
    expect(result.succeeded).toEqual(["course-b"]);
  });
});
