/** golf_courses_scraped テーブルの1行（1ホール分）に対応する型 */
export interface ScrapedHoleRow {
  runId: string;
  matchKey: string;
  courseName: string;
  prefecture: string;
  city: string | null;
  sourceSite: "gdo" | "rakuten_gora" | "jalan_golf";
  layoutName: string;
  holeNumber: number;
  par: number;
  yardRegular: number;
  scrapedAt: string; // ISO8601文字列
}

export interface GroupedHole {
  holeNumber: number;
  par: number;
  yardRegular: number;
}

export interface GroupedLayout {
  name: string;
  holes: GroupedHole[];
}

export interface GroupedCourse {
  matchKey: string;
  courseName: string;
  prefecture: string;
  city: string | null;
  layouts: GroupedLayout[];
  scrapedAt: string;
}
