import { describe, it, expect } from "vitest";
import { groupScrapedRows } from "../groupScrapedRows";
import type { ScrapedHoleRow } from "../types";

function row(overrides: Partial<ScrapedHoleRow>): ScrapedHoleRow {
  return {
    runId: "run-1",
    matchKey: "akabanegolfclub|東京都|北区",
    courseName: "赤羽ゴルフ倶楽部",
    prefecture: "東京都",
    city: "北区",
    sourceSite: "gdo",
    layoutName: "OUT",
    holeNumber: 1,
    par: 4,
    yardRegular: 375,
    scrapedAt: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}

describe("groupScrapedRows", () => {
  it("同一matchKey・同一layoutNameの行をholeNumber順のholes配列にまとめる", () => {
    const rows: ScrapedHoleRow[] = [
      row({ holeNumber: 2, par: 4, yardRegular: 380 }),
      row({ holeNumber: 1, par: 4, yardRegular: 375 }),
    ];

    const result = groupScrapedRows(rows);

    expect(result).toHaveLength(1);
    expect(result[0].matchKey).toBe("akabanegolfclub|東京都|北区");
    expect(result[0].layouts).toHaveLength(1);
    expect(result[0].layouts[0]).toEqual({
      name: "OUT",
      holes: [
        { holeNumber: 1, par: 4, yardRegular: 375 },
        { holeNumber: 2, par: 4, yardRegular: 380 },
      ],
    });
  });

  it("同一matchKeyでlayoutNameが異なる行は別レイアウトにまとめる", () => {
    const rows: ScrapedHoleRow[] = [
      row({ layoutName: "OUT", holeNumber: 1 }),
      row({ layoutName: "IN", holeNumber: 1, par: 5, yardRegular: 480 }),
    ];

    const result = groupScrapedRows(rows);

    expect(result).toHaveLength(1);
    expect(result[0].layouts.map(l => l.name)).toEqual(["OUT", "IN"]);
  });

  it("matchKeyが異なる行は別コースとして扱う", () => {
    const rows: ScrapedHoleRow[] = [
      row({ matchKey: "course-a|東京都|北区" }),
      row({ matchKey: "course-b|東京都|足立区", courseName: "別のコース" }),
    ];

    const result = groupScrapedRows(rows);

    expect(result).toHaveLength(2);
  });

  it("空配列を渡すと空配列を返す", () => {
    expect(groupScrapedRows([])).toEqual([]);
  });
});
