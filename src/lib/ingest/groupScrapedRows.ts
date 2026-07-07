import type { GroupedCourse, GroupedLayout, ScrapedHoleRow } from "./types";

export function groupScrapedRows(rows: ScrapedHoleRow[]): GroupedCourse[] {
  const courseMap = new Map<string, GroupedCourse>();

  for (const row of rows) {
    let course = courseMap.get(row.matchKey);
    if (!course) {
      course = {
        matchKey: row.matchKey,
        courseName: row.courseName,
        prefecture: row.prefecture,
        city: row.city,
        layouts: [],
        scrapedAt: row.scrapedAt,
      };
      courseMap.set(row.matchKey, course);
    }

    let layout = course.layouts.find(l => l.name === row.layoutName);
    if (!layout) {
      layout = { name: row.layoutName, holes: [] };
      course.layouts.push(layout);
    }

    layout.holes.push({
      holeNumber: row.holeNumber,
      par: row.par,
      yardRegular: row.yardRegular,
    });
  }

  for (const course of courseMap.values()) {
    for (const layout of course.layouts) {
      layout.holes.sort((a, b) => a.holeNumber - b.holeNumber);
    }
  }

  return Array.from(courseMap.values());
}
