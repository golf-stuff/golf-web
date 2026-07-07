import type { GroupedCourse } from "./types";

/** テストでモック注入できるよう、実際に使うPrismaメソッドのみを型で表す */
export interface PrismaClientLike {
  mstGolfCourse: {
    upsert: (args: any) => Promise<{ id: string }>;
  };
  mstCourseLayout: {
    upsert: (args: any) => Promise<{ id: string }>;
  };
  mstHole: {
    upsert: (args: any) => Promise<unknown>;
  };
  $transaction: <T>(fn: (tx: PrismaClientLike) => Promise<T>) => Promise<T>;
}

export interface UpsertResult {
  succeeded: string[];
  failed: { matchKey: string; error: string }[];
}

export async function upsertGolfCourses(
  prisma: PrismaClientLike,
  courses: GroupedCourse[]
): Promise<UpsertResult> {
  const succeeded: string[] = [];
  const failed: { matchKey: string; error: string }[] = [];

  for (const course of courses) {
    try {
      await prisma.$transaction((tx) => upsertOneCourse(tx, course));
      succeeded.push(course.matchKey);
    } catch (e) {
      failed.push({
        matchKey: course.matchKey,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { succeeded, failed };
}

async function upsertOneCourse(prisma: PrismaClientLike, course: GroupedCourse) {
  const courseData = {
    name: course.courseName,
    prefecture: course.prefecture,
    city: course.city,
    lastScrapedAt: new Date(course.scrapedAt),
  };

  const golfCourse = await prisma.mstGolfCourse.upsert({
    where: {
      name_prefecture_city: { name: course.courseName, prefecture: course.prefecture, city: course.city },
    },
    create: courseData,
    update: courseData,
  });

  for (let i = 0; i < course.layouts.length; i++) {
    const layout = course.layouts[i];
    const layoutData = { holeCount: layout.holes.length, displayOrder: i + 1 };

    const mstLayout = await prisma.mstCourseLayout.upsert({
      where: { golfCourseId_name: { golfCourseId: golfCourse.id, name: layout.name } },
      create: { golfCourseId: golfCourse.id, name: layout.name, ...layoutData },
      update: layoutData,
    });

    for (const hole of layout.holes) {
      await prisma.mstHole.upsert({
        where: {
          courseLayoutId_holeNumber: { courseLayoutId: mstLayout.id, holeNumber: hole.holeNumber },
        },
        create: {
          courseLayoutId: mstLayout.id,
          holeNumber: hole.holeNumber,
          par: hole.par,
          yardRegular: hole.yardRegular,
        },
        update: { par: hole.par, yardRegular: hole.yardRegular },
      });
    }
  }
}
