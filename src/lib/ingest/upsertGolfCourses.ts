import type { GroupedCourse } from "./types";

/** テストでモック注入できるよう、実際に使うPrismaメソッドのみを型で表す */
export interface PrismaClientLike {
  mstGolfCourse: {
    findFirst: (args: any) => Promise<{ id: string } | null>;
    create: (args: any) => Promise<{ id: string }>;
    update: (args: any) => Promise<{ id: string }>;
  };
  mstCourseLayout: {
    findFirst: (args: any) => Promise<{ id: string } | null>;
    create: (args: any) => Promise<{ id: string }>;
    update: (args: any) => Promise<{ id: string }>;
  };
  mstHole: {
    upsert: (args: any) => Promise<unknown>;
  };
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
      await upsertOneCourse(prisma, course);
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
  const existing = await prisma.mstGolfCourse.findFirst({
    where: { name: course.courseName, prefecture: course.prefecture, city: course.city },
  });

  const courseData = {
    name: course.courseName,
    prefecture: course.prefecture,
    city: course.city,
    lastScrapedAt: new Date(course.scrapedAt),
  };

  let golfCourse: { id: string };
  if (existing) {
    await prisma.mstGolfCourse.update({ where: { id: existing.id }, data: courseData });
    golfCourse = existing;
  } else {
    golfCourse = await prisma.mstGolfCourse.create({ data: courseData });
  }

  for (let i = 0; i < course.layouts.length; i++) {
    const layout = course.layouts[i];

    const existingLayout = await prisma.mstCourseLayout.findFirst({
      where: { golfCourseId: golfCourse.id, name: layout.name },
    });

    const mstLayout = existingLayout
      ? existingLayout
      : await prisma.mstCourseLayout.create({
          data: {
            golfCourseId: golfCourse.id,
            name: layout.name,
            holeCount: layout.holes.length,
            displayOrder: i + 1,
          },
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
