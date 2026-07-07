# golf-web: スクレイピング結果Ingestジョブ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 別リポジトリ（`golf-course-scraper`、Python、private）がGCS上にIceberg形式で書き込んだスクレイピング結果を、golf-webがDuckDB経由で読み取り、共有マスタ（`MstGolfCourse`/`MstCourseLayout`/`MstHole`）へUpsertするバッチジョブを実装する。

**Spec:** `docs/superpowers/specs/2026-07-07-golf-course-scraper-repo-split-design.md`の「コンポーネント2: golf-web側 Ingestジョブ」章

**Architecture:** DuckDBのIceberg拡張でGCS上の`scraping_runs`/`golf_courses_scraped`テーブルを読み取る部分（`src/lib/ingest/duckdbReader.ts`）と、フラット行をコース/レイアウト/ホールにグルーピングする純粋関数（`src/lib/ingest/groupScrapedRows.ts`）、Prismaへのupsert処理（`src/lib/ingest/upsertGolfCourses.ts`）を分離する。グルーピング・Upsertロジックはユニットテスト可能にし、DuckDB/GCSへの実接続が必要な部分（`duckdbReader.ts`本体、GitHub Actions実行）は本Planの制約により実地検証できないため、Task 6でGitHub Actions上で初めて検証する。オーケストレーター本体は`scripts/ingest-scraped-courses.ts`に置き、`tsx`で実行する。

**Tech Stack:** Next.js 16 / Prisma 7 / TypeScript / Vitest / DuckDB (Node.js binding) / GitHub Actions / tsx

**本Planで判明している制約:**
- 本Planを作成した開発コンテナ（サンドボックス環境）は許可リスト方式のアウトバウンドネットワークポリシーになっており、GCS（`storage.googleapis.com`）へは到達できない可能性が高い。したがって`duckdbReader.ts`の実際のGCS読み取り動作はこの環境内では検証できず、Task 6（GitHub Actions実行）で初めて検証される
- 連携先の`golf_courses_scraped`/`scraping_runs`Icebergテーブルは、`golf-course-scraper`リポジトリ側の実装によって初めて実データが生成される。本Planの実装時点でテーブルが空、または未作成の場合は、Task 6の実地検証はテーブル作成後まで待つ必要がある

## Global Constraints

- コメント・UI文言・エラーメッセージは日本語で記述する
- 既存のコードパターン（`src/lib/auth/requireAdmin.ts`のモジュール分割、`src/lib/db/prisma.ts`のPrismaクライアント、`src/lib/auth/__tests__/*.test.ts`のモック手法）を踏襲する
- 共有マスタ（`MstGolfCourse`等）へのUpsert経路は、本ジョブ（`scripts/`配下）のみとする
- 名寄せは「ゴルフ場名＋都道府県＋市区町村」（`match_key`列、スクレイピング側で既に計算済みの値をそのまま使う。golf-web側での再計算は行わない）
- `npm run test` と `npx tsc --noEmit` が通り続けること
- GCS認証情報（HMACキー）・DB接続情報はGitHub Secretsから環境変数経由で受け取り、コードにハードコードしない

---

## Task 1: `ScrapingIngestState`をPrisma schemaに追加する

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `ScrapingIngestState`モデル（`id`固定値`"singleton"`の1行のみを想定）

- [ ] **Step 1: schema.prismaの末尾に追記する**

```prisma
model ScrapingIngestState {
  id                String   @id @default("singleton")
  lastIngestedRunId String?  @map("last_ingested_run_id")
  updatedAt         DateTime @updatedAt @map("updated_at")

  @@map("scraping_ingest_state")
}
```

- [ ] **Step 2: マイグレーションを作成する**

Run: `npx prisma migrate dev --name add_scraping_ingest_state`
Expected: `scraping_ingest_state`テーブルが作成される

- [ ] **Step 3: `npx tsc --noEmit`で既存コードに影響がないことを確認する**

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: スクレイピング結果Ingest用のScrapingIngestStateを追加"
```

---

## Task 2: スクレイピング結果の型定義とグルーピングロジックを実装する

**Files:**
- Create: `src/lib/ingest/types.ts`
- Create: `src/lib/ingest/groupScrapedRows.ts`
- Create: `src/lib/ingest/__tests__/groupScrapedRows.test.ts`

**Interfaces:**
- Produces: `ScrapedHoleRow`型、`GroupedCourse`型、`groupScrapedRows(rows: ScrapedHoleRow[]): GroupedCourse[]`

- [ ] **Step 1: `types.ts`に型を定義する**

```ts
// src/lib/ingest/types.ts

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
```

- [ ] **Step 2: 失敗するテストを書く**

```ts
// src/lib/ingest/__tests__/groupScrapedRows.test.ts
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
```

- [ ] **Step 3: テストを実行し、失敗を確認する**

Run: `npx vitest run src/lib/ingest/__tests__/groupScrapedRows.test.ts`
Expected: FAIL（`groupScrapedRows`が未実装のためモジュール解決エラー）

- [ ] **Step 4: `groupScrapedRows`を実装する**

```ts
// src/lib/ingest/groupScrapedRows.ts
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
```

- [ ] **Step 5: テストを実行し、成功を確認する**

Run: `npx vitest run src/lib/ingest/__tests__/groupScrapedRows.test.ts`
Expected: PASS（4件とも成功）

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/types.ts src/lib/ingest/groupScrapedRows.ts src/lib/ingest/__tests__/groupScrapedRows.test.ts
git commit -m "feat: スクレイピング結果の型定義とグルーピングロジックを追加"
```

---

## Task 3: Upsertロジックを実装する

**Files:**
- Create: `src/lib/ingest/upsertGolfCourses.ts`
- Create: `src/lib/ingest/__tests__/upsertGolfCourses.test.ts`

**Interfaces:**
- Consumes: `GroupedCourse`（Task 2）
- Produces: `upsertGolfCourses(prisma: PrismaClientLike, courses: GroupedCourse[]): Promise<{ succeeded: string[]; failed: { matchKey: string; error: string }[] }>`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// src/lib/ingest/__tests__/upsertGolfCourses.test.ts
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
```

- [ ] **Step 2: テストを実行し、失敗を確認する**

Run: `npx vitest run src/lib/ingest/__tests__/upsertGolfCourses.test.ts`
Expected: FAIL（`upsertGolfCourses`が未実装）

- [ ] **Step 3: `upsertGolfCourses`を実装する**

```ts
// src/lib/ingest/upsertGolfCourses.ts
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

  const golfCourse = existing
    ? await prisma.mstGolfCourse.update({ where: { id: existing.id }, data: courseData })
    : await prisma.mstGolfCourse.create({ data: courseData });

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
```

- [ ] **Step 4: テストを実行し、成功を確認する**

Run: `npx vitest run src/lib/ingest/__tests__/upsertGolfCourses.test.ts`
Expected: PASS（3件とも成功）

- [ ] **Step 5: `npx tsc --noEmit`を実行する**

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/upsertGolfCourses.ts src/lib/ingest/__tests__/upsertGolfCourses.test.ts
git commit -m "feat: スクレイピング結果のUpsertロジックを追加"
```

---

## Task 4: `MstGolfCourse.lastScrapedAt`をPrisma schemaに追加する

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `MstGolfCourse.lastScrapedAt: DateTime | null`（Task 3の`upsertGolfCourses`が参照する）

- [ ] **Step 1: `MstGolfCourse`モデルに追記する**

`prisma/schema.prisma`の`model MstGolfCourse`内、`city`フィールドの直後に追加:

```prisma
  lastScrapedAt DateTime? @map("last_scraped_at")
```

- [ ] **Step 2: マイグレーションを作成する**

Run: `npx prisma migrate dev --name add_last_scraped_at`

- [ ] **Step 3: `npx tsc --noEmit`と`npx vitest run`を実行し、Task 2・3のテストを含めて全て通ることを確認する**

Expected: 型不一致があれば`upsertGolfCourses.ts`のモック型定義とテストのアサーションを実際のPrisma型に合わせて修正する

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: MstGolfCourseにlastScrapedAtを追加"
```

---

## Task 5: DuckDB読み取りラッパーを実装する

**Files:**
- Modify: `package.json`（`duckdb`, `tsx`を追加）
- Create: `src/lib/ingest/duckdbReader.ts`

**Interfaces:**
- Produces: `findLatestSuccessfulRun(config: DuckDbConfig, afterRunId: string | null): Promise<{ runId: string } | null>`、`fetchScrapedRows(config: DuckDbConfig, runId: string): Promise<ScrapedHoleRow[]>`

> **注記:** この関数のみ、本サンドボックス環境では実際のGCS/Icebergに対する動作確認ができない。Task 6（GitHub Actions実行）で初めて実地検証される。テーブルの列名・パスは`golf-course-scraper`リポジトリ側の実装（`docs/superpowers/specs/2026-07-07-golf-course-scraper-repo-split-design.md`のIcebergテーブル定義）と一致している前提とする。実装時に列名の齟齬があれば、この関数側で吸収する（他のTaskへの影響を避けるため）。

- [ ] **Step 1: 依存関係を追加する**

Run: `npm install duckdb && npm install -D tsx`

- [ ] **Step 2: `DuckDbConfig`型と接続セットアップ関数を実装する**

```ts
// src/lib/ingest/duckdbReader.ts
import duckdb from "duckdb";
import type { ScrapedHoleRow } from "./types";

export interface DuckDbConfig {
  gcsHmacKeyId: string;
  gcsHmacSecret: string;
  gcsBucket: string;
  /** golf-course-scraper側のIcebergテーブル配置ルート（例: "warehouse/golf_scraper"） */
  warehousePrefix: string;
}

function createConnection(config: DuckDbConfig): Promise<duckdb.Connection> {
  return new Promise((resolve, reject) => {
    const db = new duckdb.Database(":memory:");
    const conn = db.connect();
    conn.run("INSTALL httpfs; LOAD httpfs; INSTALL iceberg; LOAD iceberg;", (err) => {
      if (err) return reject(err);
      conn.run(
        `CREATE SECRET (
          TYPE S3,
          KEY_ID '${config.gcsHmacKeyId}',
          SECRET '${config.gcsHmacSecret}',
          ENDPOINT 'storage.googleapis.com',
          URL_STYLE 'path'
        );`,
        (secretErr) => {
          if (secretErr) return reject(secretErr);
          resolve(conn);
        }
      );
    });
  });
}

function tablePath(config: DuckDbConfig, tableName: string): string {
  return `gs://${config.gcsBucket}/${config.warehousePrefix}/${tableName}`;
}
```

- [ ] **Step 3: `findLatestSuccessfulRun`を実装する**

```ts
export async function findLatestSuccessfulRun(
  config: DuckDbConfig,
  afterRunId: string | null
): Promise<{ runId: string } | null> {
  const conn = await createConnection(config);
  const path = tablePath(config, "scraping_runs");

  return new Promise((resolve, reject) => {
    const sql = afterRunId
      ? `SELECT run_id FROM iceberg_scan('${path}') WHERE status = 'success' AND started_at > (SELECT started_at FROM iceberg_scan('${path}') WHERE run_id = '${afterRunId}') ORDER BY started_at DESC LIMIT 1;`
      : `SELECT run_id FROM iceberg_scan('${path}') WHERE status = 'success' ORDER BY started_at DESC LIMIT 1;`;

    conn.all(sql, (err, rows) => {
      if (err) return reject(err);
      if (rows.length === 0) return resolve(null);
      resolve({ runId: rows[0].run_id as string });
    });
  });
}
```

- [ ] **Step 4: `fetchScrapedRows`を実装する**

```ts
export async function fetchScrapedRows(
  config: DuckDbConfig,
  runId: string
): Promise<ScrapedHoleRow[]> {
  const conn = await createConnection(config);
  const path = tablePath(config, "golf_courses_scraped");

  return new Promise((resolve, reject) => {
    conn.all(
      `SELECT run_id, match_key, course_name, prefecture, city, source_site, layout_name, hole_number, par, yard_regular, scraped_at
       FROM iceberg_scan('${path}') WHERE run_id = '${runId}';`,
      (err, rows) => {
        if (err) return reject(err);
        resolve(
          rows.map((r) => ({
            runId: r.run_id as string,
            matchKey: r.match_key as string,
            courseName: r.course_name as string,
            prefecture: r.prefecture as string,
            city: (r.city as string | null) ?? null,
            sourceSite: r.source_site as ScrapedHoleRow["sourceSite"],
            layoutName: r.layout_name as string,
            holeNumber: r.hole_number as number,
            par: r.par as number,
            yardRegular: r.yard_regular as number,
            scrapedAt: (r.scraped_at as Date).toISOString(),
          }))
        );
      }
    );
  });
}
```

- [ ] **Step 5: `npx tsc --noEmit`を実行しビルドが壊れていないことを確認する**

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/ingest/duckdbReader.ts
git commit -m "feat: DuckDB経由でIcebergのスクレイピング結果を読み取るラッパーを追加"
```

---

## Task 6: オーケストレータースクリプトとGitHub Actionsワークフローを追加する

**Files:**
- Create: `scripts/ingest-scraped-courses.ts`
- Create: `.github/workflows/ingest-scraped-courses.yml`

**Interfaces:**
- Consumes: `findLatestSuccessfulRun`/`fetchScrapedRows`（Task 5）、`groupScrapedRows`（Task 2）、`upsertGolfCourses`（Task 3）

- [ ] **Step 1: オーケストレーターを実装する**

```ts
// scripts/ingest-scraped-courses.ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { findLatestSuccessfulRun, fetchScrapedRows, type DuckDbConfig } from "../src/lib/ingest/duckdbReader";
import { groupScrapedRows } from "../src/lib/ingest/groupScrapedRows";
import { upsertGolfCourses } from "../src/lib/ingest/upsertGolfCourses";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
  return value;
}

async function main() {
  const pool = new Pool({ connectionString: requireEnv("DIRECT_URL") });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const duckDbConfig: DuckDbConfig = {
    gcsHmacKeyId: requireEnv("SCRAPING_GCS_HMAC_KEY_ID"),
    gcsHmacSecret: requireEnv("SCRAPING_GCS_HMAC_SECRET"),
    gcsBucket: requireEnv("SCRAPING_GCS_BUCKET"),
    warehousePrefix: process.env.SCRAPING_GCS_WAREHOUSE_PREFIX ?? "warehouse/golf_scraper",
  };

  const state = await prisma.scrapingIngestState.findUnique({ where: { id: "singleton" } });
  const lastIngestedRunId = state?.lastIngestedRunId ?? null;

  const latestRun = await findLatestSuccessfulRun(duckDbConfig, lastIngestedRunId);
  if (!latestRun) {
    console.log("取り込み対象の新規runはありません。終了します。");
    return;
  }

  console.log(`run_id=${latestRun.runId} を取り込みます`);

  const rows = await fetchScrapedRows(duckDbConfig, latestRun.runId);
  const groupedCourses = groupScrapedRows(rows);

  const result = await upsertGolfCourses(prisma, groupedCourses);

  console.log(`成功: ${result.succeeded.length}件, 失敗: ${result.failed.length}件`);
  for (const failure of result.failed) {
    console.error(`失敗: matchKey=${failure.matchKey} error=${failure.error}`);
  }

  await prisma.scrapingIngestState.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", lastIngestedRunId: latestRun.runId },
    update: { lastIngestedRunId: latestRun.runId },
  });

  await prisma.$disconnect();

  if (result.failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
```

- [ ] **Step 2: GitHub Actionsワークフローを作成する**

```yaml
# .github/workflows/ingest-scraped-courses.yml
name: Ingest scraped golf courses

on:
  schedule:
    - cron: "0 20 * * *" # UTC 20:00 = JST 5:00（スクレイピング側の実行時刻より後を想定）
  workflow_dispatch:

jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm ci

      - name: Run ingest script
        run: npx tsx scripts/ingest-scraped-courses.ts
        env:
          DIRECT_URL: ${{ secrets.PROD_DIRECT_URL }}
          SCRAPING_GCS_HMAC_KEY_ID: ${{ secrets.SCRAPING_GCS_HMAC_KEY_ID }}
          SCRAPING_GCS_HMAC_SECRET: ${{ secrets.SCRAPING_GCS_HMAC_SECRET }}
          SCRAPING_GCS_BUCKET: ${{ secrets.SCRAPING_GCS_BUCKET }}
```

- [ ] **Step 3: `npx tsc --noEmit`を実行する**

- [ ] **Step 4: ローカルで実行し、想定されるエラーを確認する**

Run: `npx tsx scripts/ingest-scraped-courses.ts`
Expected: `SCRAPING_GCS_HMAC_KEY_ID`等の環境変数未設定によりエラー終了する（本番相当のGCS認証情報はローカルに無いため）。この時点では「環境変数不足を検知してエラーメッセージを出す」ことが確認できれば十分とする。実際にGCSへ到達してデータを取得できることの確認はTask 5の実地検証と合わせてGitHub Actions上（`workflow_dispatch`手動実行）で行う

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest-scraped-courses.ts .github/workflows/ingest-scraped-courses.yml
git commit -m "feat: スクレイピング結果Ingestジョブのオーケストレーターとワークフローを追加"
```

---

## Task 7: 実地検証（GitHub Actions・GCS認証情報準備後）

**Files:** なし（手動検証・GitHub Secrets設定のみ）

**前提:** `golf-course-scraper`リポジトリ側の実装が完了し、GCS上に`golf_courses_scraped`/`scraping_runs`テーブルへの実データ書き込みが最低1回成功していること。read-only GCSサービスアカウントのHMACキーが発行済みであること。

- [ ] **Step 1: GitHub Secretsを設定する**

golf-webリポジトリのSettings > Secrets and variablesに以下を追加する:
- `SCRAPING_GCS_HMAC_KEY_ID`
- `SCRAPING_GCS_HMAC_SECRET`
- `SCRAPING_GCS_BUCKET`

- [ ] **Step 2: `workflow_dispatch`で手動実行し、実際にGCS上のIcebergテーブルから読み取れることを確認する**

Expected: `findLatestSuccessfulRun`が実データのrun_idを返し、`fetchScrapedRows`が行を取得できる。列名やパスが本Planの想定と異なっていた場合は、`duckdbReader.ts`を実データに合わせて修正する

- [ ] **Step 3: 実行後、`MstGolfCourse`/`MstCourseLayout`/`MstHole`にデータが反映され、`ScrapingIngestState.lastIngestedRunId`が更新されていることをDBで確認する**

- [ ] **Step 4: 同じrunに対して再実行しても、`findLatestSuccessfulRun`が`null`を返し、重複してUpsertされないことを確認する**

- [ ] **Step 5: Commit（Secrets設定内容のドキュメント化が必要な場合のみ）**

設定手順に変更があれば、本Planの本Taskの内容を更新してコミットする。
