# ゴルフ場情報スクレイピング機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GDO・楽天GORA・じゃらんゴルフ・ShotNaviの4サイトからゴルフ場・コースレイアウト・ホール情報を定期スクレイピングし、既存の共有マスタ（`MstGolfCourse`/`MstCourseLayout`/`MstHole`）へ反映する。手動登録の手間を削減する。

**Spec:** `docs/superpowers/specs/2026-07-05-golf-course-scraping-design.md`（2026-07-06追記の注記を正とする。Com/Usrマスタ分離・pg_duckdb/pg_lakeによるPostgres拡張経由参照は撤回済み）

**現状（本Plan作成時点で既に完了済み）:**
- ゴルフ場マスタは`2026-07-06-golf-course-master-consolidation.md`により単一化済み（`MstGolfCourse`に`userId`は無く、全ユーザー共有。書き込みは`requireAdminForAction()`経由でapp層のみに制限）
- 上記により、spec本文の「データモデル」章にある`Com*`/`Usr*`プレフィックス分離は不要。スクレイピングバッチは既存の`MstGolfCourse`/`MstCourseLayout`/`MstHole`へ直接書き込む
- spec冒頭の注記により、pg_duckdb/pg_lakeをPostgres拡張として使う方式も撤回済み。Icebergはスクレイピング生データのステージング用途のみで、DuckDBは独立ツールとしてバッチ内で実行し、結果は通常のPostgresクライアント（Prisma）でUpsertする

**本Planのスコープ（MVP）:** 4サイト分のスクレイピング・Iceberg/BigQuery連携まで一度に実装するのはリスクが高いため、本Planでは以下に絞る。
- 名寄せ・優先順位マージロジック（サイトを横断する中核ロジック。純粋関数でテスト可能）
- パーサー共通インターフェースの確定 + GDO（優先順位最上位サイト）のみ実運用レベルで実装
- 楽天GORA/じゃらんゴルフ/ShotNaviはパーサーインターフェースに準拠したプレースホルダ実装（`Result.error`を返すのみ）とし、各サイトの実装は本Planのフォローアップとして別Planで行う（サイトごとに実際のHTML構造を調査するスパイクが必要なため）
- 再開可能なバッチ設計（`ScrapingJobProgress`）とGitHub Actionsワークフロー（cron + `workflow_dispatch`）の骨組み
- Iceberg/S3・GCP Cloud Storageへのステージング、DuckDBによる読み取りは**本Planのスコープ外**（バケット・カタログ選定など未決のインフラ判断が必要なため、別Planでフォローアップする）。本PlanではMVPとしてSupabase Postgresへの直接Upsertのみを実装する

**Architecture:** `src/lib/scraping/`配下に、サイト非依存の共通型（`ScrapedCourse`）・名寄せ正規化・優先順位マージ・パーサーレジストリを置く。バッチ本体は`scripts/scrape-golf-courses.ts`（Node実行スクリプト）とし、`.github/workflows/scrape-golf-courses.yml`から`tsx`で起動する。バッチはservice role相当の`DIRECT_URL`接続を使い、Server Action層を経由せず直接Prismaでマスタを更新する（appのadmin権限チェックはバイパスするが、書き込み経路はCIのみに限定されるため`requireAdminForAction`は不要）。進捗は`ScrapingJobProgress`テーブル（対象都道府県・サイト・カーソル位置・`lastScrapedAt`）で管理し、1回の実行では上限件数までを処理して中断・再開できるようにする。

**Tech Stack:** Next.js 16 / Prisma 7 / TypeScript / Vitest / GitHub Actions / tsx

## Global Constraints

- コメント・UI文言・エラーメッセージは日本語で記述する
- 既存のコードパターン（`src/lib/parsers/gdoScorecard.ts`のパーサー設計、`src/lib/db/prisma.ts`のPrismaクライアント）を踏襲する
- 共有マスタ（`MstGolfCourse`等）への書き込み経路はスクレイピングバッチ（`scripts/`配下）のみとし、`app/`配下のServer Actionから呼び出さない
- 名寄せは「ゴルフ場名＋都道府県＋市区町村」の正規化キーで行う。郵便番号・緯度経度による名寄せは行わない（spec通り）
- マージはサイト単位・コース単位で行う。優先順位（GDO→楽天GORA→じゃらんゴルフ→ShotNavi）が最も高いサイトに情報があれば丸ごと採用し、項目単位の混在は行わない
- `npm run test` と `tsc --noEmit` が通り続けること
- Iceberg/pg_duckdb関連の実装（本Planのスコープ外）を先取りして書かない。将来の拡張点として`ScrapedCourse`に生データを残せる形にしておく程度に留める

---

## Task 1: Prisma schemaに`ScrapingJobProgress`と`lastScrapedAt`を追加する

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_scraping_job_progress/migration.sql`（`prisma migrate dev`で自動生成）

**Interfaces:**
- Produces: `ScrapingJobProgress`モデル、`MstGolfCourse.lastScrapedAt`

- [ ] **Step 1: schema.prismaに追記する**

`MstGolfCourse`に以下を追加:

```prisma
  lastScrapedAt DateTime? @map("last_scraped_at")
```

新規モデルを追加:

```prisma
enum scraping_site {
  gdo
  rakuten_gora
  jalan_golf
  shotnavi
}

model ScrapingJobProgress {
  id            String        @id @default(uuid())
  site          scraping_site
  prefecture    String
  cursor        String?       @map("cursor")
  status        String        @default("pending")
  processedCount Int          @default(0) @map("processed_count")
  lastRunAt     DateTime?     @map("last_run_at")
  createdAt     DateTime      @default(now()) @map("created_at")
  updatedAt     DateTime      @updatedAt @map("updated_at")

  @@unique([site, prefecture])
  @@map("scraping_job_progress")
}
```

- [ ] **Step 2: マイグレーションを作成する**

Run: `cd golf-web && npx prisma migrate dev --name add_scraping_job_progress`
Expected: `prisma/migrations/`配下に新規マイグレーションファイルが生成され、ローカルSupabaseに適用される

- [ ] **Step 3: `npx tsc --noEmit`で既存コードに影響がないことを確認する**

- [ ] **Step 4: Commit**

```bash
git add golf-web/prisma/schema.prisma golf-web/prisma/migrations
git commit -m "feat: スクレイピングジョブ進捗管理用のScrapingJobProgressを追加"
```

---

## Task 2: 共通型定義とゴルフ場名の正規化ロジックを実装する

**Files:**
- Create: `src/lib/scraping/types.ts`
- Create: `src/lib/scraping/normalize.ts`
- Create: `src/lib/scraping/__tests__/normalize.test.ts`

**Interfaces:**
- Produces: `ScrapedCourse`型（サイト非依存の中間表現）、`normalizeCourseName(name: string): string`

- [ ] **Step 1: `types.ts`に中間表現を定義する**

```ts
export type ScrapingSite = "gdo" | "rakuten_gora" | "jalan_golf" | "shotnavi";

export interface ScrapedHole {
  holeNumber: number;
  par: number;
  yardRegular: number;
}

export interface ScrapedLayout {
  name: string; // 例: "OUT", "IN", "West"
  holes: ScrapedHole[];
}

export interface ScrapedCourse {
  site: ScrapingSite;
  name: string;
  prefecture: string | null;
  city: string | null;
  layouts: ScrapedLayout[];
}

export type ScrapeResult =
  | { ok: true; courses: ScrapedCourse[] }
  | { ok: false; error: string };
```

- [ ] **Step 2: `normalize.ts`に表記ゆれ吸収ロジックを実装する**

`ゴルフ倶楽部`/`ゴルフクラブ`/`GC`/`カントリークラブ`/`CC`等の表記ゆれを除去・統一し、全角/半角スペースを除去した比較用キーを返す`normalizeCourseName`と、`prefecture`/`city`を含めた突合キーを返す`buildMatchKey(course: Pick<ScrapedCourse, "name" | "prefecture" | "city">): string`を実装する。

- [ ] **Step 3: テストを書く**

「〇〇ゴルフ倶楽部」「〇〇GC」「〇〇 ゴルフクラブ」が同一キーに正規化されることを検証するテストケースを追加する。

- [ ] **Step 4: `npm run test`を実行し全て通ることを確認する**

- [ ] **Step 5: Commit**

```bash
git add golf-web/src/lib/scraping/types.ts golf-web/src/lib/scraping/normalize.ts golf-web/src/lib/scraping/__tests__/normalize.test.ts
git commit -m "feat: スクレイピング用の共通型とゴルフ場名正規化ロジックを追加"
```

---

## Task 3: 優先順位マージロジックを実装する

**Files:**
- Create: `src/lib/scraping/merge.ts`
- Create: `src/lib/scraping/__tests__/merge.test.ts`

**Interfaces:**
- Consumes: `ScrapedCourse`、`buildMatchKey`（Task 2）
- Produces: `mergeScrapedCourses(bySite: Record<ScrapingSite, ScrapedCourse[]>): ScrapedCourse[]`

- [ ] **Step 1: マージ関数を実装する**

サイト優先順位 `["gdo", "rakuten_gora", "jalan_golf", "shotnavi"]` の順に走査し、`buildMatchKey`で同一コースをグルーピングする。同一コースが複数サイトで見つかった場合、優先順位が最も高いサイトの`ScrapedCourse`を**丸ごと**採用する（レイアウト・ホールの項目単位でのマージは行わない）。最上位サイトにレイアウト情報が無い（`layouts`が空）場合のみ次点のサイトの値を採用する。

- [ ] **Step 2: テストを書く**

- 同一コースがGDOと楽天GORAの両方にある場合、GDOの値が採用されること
- GDOに存在せず楽天GORA・じゃらんゴルフに存在する場合、楽天GORAが採用されること
- GDOにコース名はあるが`layouts`が空の場合、次点サイトの値が採用されること
- 表記ゆれ（「〇〇ゴルフ倶楽部」/「〇〇GC」）が同一コースとして扱われること

- [ ] **Step 3: `npm run test`を実行し全て通ることを確認する**

- [ ] **Step 4: Commit**

```bash
git add golf-web/src/lib/scraping/merge.ts golf-web/src/lib/scraping/__tests__/merge.test.ts
git commit -m "feat: サイト優先順位に基づくゴルフ場情報マージロジックを追加"
```

---

## Task 4: パーサーレジストリとGDOパーサーを実装する

**Files:**
- Create: `src/lib/scraping/parsers/types.ts`
- Create: `src/lib/scraping/parsers/gdo.ts`
- Create: `src/lib/scraping/parsers/rakutenGora.ts`（プレースホルダ）
- Create: `src/lib/scraping/parsers/jalanGolf.ts`（プレースホルダ）
- Create: `src/lib/scraping/parsers/shotnavi.ts`（プレースホルダ）
- Create: `src/lib/scraping/parsers/index.ts`
- Create: `src/lib/scraping/parsers/__tests__/gdo.test.ts`

**Interfaces:**
- Produces: `CourseParser = { site: ScrapingSite; fetchCourseList(prefecture: string): Promise<ScrapeResult> }`、`getParser(site: ScrapingSite): CourseParser`

- [ ] **Step 1: 共通インターフェースを定義する**

```ts
export interface CourseParser {
  site: ScrapingSite;
  fetchCourseList(prefecture: string): Promise<ScrapeResult>;
}
```

- [ ] **Step 2: GDOパーサーを実装する**

> **注記（実装前に必須の調査）**: GDOのゴルフ場検索・詳細ページの実際のHTML構造は本Planでは未調査。実装前にGDOサイトの該当ページを人手で確認し、都道府県別ゴルフ場一覧・コースレイアウト・ホールPar/Yardの取得に必要なセレクタ/APIエンドポイントを特定するスパイクを行うこと。取得したサンプルHTMLは`src/lib/scraping/parsers/__tests__/fixtures/gdo/`配下に固定サンプルとして保存し、実サイトへのテスト時アクセスは行わない。

上記スパイクの結果を元に、固定サンプルHTMLをパースして`ScrapedCourse[]`を返す`fetchCourseList`を実装する（HTTP取得部分と純粋なパース部分を分離し、パース部分はテスト可能にする）。

- [ ] **Step 3: 楽天GORA/じゃらんゴルフ/ShotNaviはプレースホルダとして実装する**

各ファイルで`fetchCourseList`が`{ ok: false, error: "未実装" }`を返すのみの実装とする（インターフェースにだけ準拠させ、実サイト調査は別Planに切り出す）。

- [ ] **Step 4: `index.ts`にレジストリを実装する**

```ts
export function getParser(site: ScrapingSite): CourseParser { /* ... */ }
```

- [ ] **Step 5: GDOパーサーのテストを固定サンプルHTMLで書く**

- [ ] **Step 6: `npm run test`と`tsc --noEmit`を実行し全て通ることを確認する**

- [ ] **Step 7: Commit**

```bash
git add golf-web/src/lib/scraping/parsers
git commit -m "feat: スクレイピング用パーサーインターフェースとGDOパーサーを追加"
```

---

## Task 5: バッチオーケストレーターを実装する

**Files:**
- Create: `scripts/scrape-golf-courses.ts`
- Create: `config/scraping-target-prefectures.json`
- Create: `src/lib/scraping/__tests__/orchestrator.test.ts`（Prismaはテスト用インメモリ/モックではなく、対象関数を純粋ロジックとDB呼び出しに分離してユニットテスト可能にする）

**Interfaces:**
- Consumes: `getParser`（Task 4）、`mergeScrapedCourses`（Task 3）、`ScrapingJobProgress`（Task 1）
- Produces: なし（CLIエントリポイント）

- [ ] **Step 1: 対象都道府県の設定ファイルを作成する**

```json
{
  "prefectures": ["東京都", "神奈川県", "埼玉県", "千葉県"]
}
```

- [ ] **Step 2: 1回の実行の処理上限・再開ロジックを実装する**

`ScrapingJobProgress`から`(site, prefecture)`ごとの`status`/`cursor`を読み、`pending`または`in_progress`のものを優先して処理する。1回の実行では設定した上限件数（例: 環境変数`SCRAPE_MAX_COURSES_PER_RUN`、デフォルト50）まで処理したら中断し、`cursor`を保存して終了する。全件処理し終えたサイト×都道府県は`status: "done"`、`lastRunAt`を更新する。

- [ ] **Step 3: 取得→マージ→Upsertの一連の処理を実装する**

各サイトの`fetchCourseList`結果を`mergeScrapedCourses`でマージし、結果を`MstGolfCourse`/`MstCourseLayout`/`MstHole`へ`upsert`する（`buildMatchKey`による名寄せキーで既存レコードを検索し、無ければ`create`）。`MstGolfCourse.lastScrapedAt`を更新する。

- [ ] **Step 4: 再スクレイピング対象の抽出ロジックを実装する**

`lastScrapedAt`が3か月以上前（または`null`）の`MstGolfCourse`を優先的に再スクレイピング対象とするクエリを実装する。

- [ ] **Step 5: `npm run test`と`tsc --noEmit`を実行し全て通ることを確認する**

- [ ] **Step 6: ローカルで実際に1回実行してみる**

Run: `cd golf-web && npx tsx scripts/scrape-golf-courses.ts`
Expected: GDOパーサーのみ実データ取得を試み、他3サイトは「未実装」エラーがログに出るがバッチ全体は落ちない。ローカルSupabaseの`mst_golf_courses`等にレコードが反映される

- [ ] **Step 7: Commit**

```bash
git add golf-web/scripts golf-web/config
git commit -m "feat: ゴルフ場スクレイピングバッチのオーケストレーターを追加"
```

---

## Task 6: GitHub Actionsワークフローを追加する

**Files:**
- Create: `.github/workflows/scrape-golf-courses.yml`

**Interfaces:**
- Consumes: `scripts/scrape-golf-courses.ts`（Task 5）
- Produces: 定期実行・手動実行可能なCIワークフロー

- [ ] **Step 1: ワークフローを作成する**

`deploy.yml`と同様のNode.jsセットアップを踏襲し、`schedule`（例: 毎日1回）と`workflow_dispatch`をトリガーにする。DB接続には`secrets.PROD_DIRECT_URL`相当のシークレット（例: `secrets.SCRAPING_DIRECT_URL`。本番マスタを直接更新するため`deploy.yml`と同じ接続先を使うか、別途確認する）を使う。

- [ ] **Step 2: 実行コマンドを設定する**

```yaml
- run: npx tsx scripts/scrape-golf-courses.ts
  env:
    DIRECT_URL: ${{ secrets.SCRAPING_DIRECT_URL }}
```

- [ ] **Step 3: YAML構文が正しいことを確認する**

Run: `cd golf-web && npx yaml-lint .github/workflows/scrape-golf-courses.yml` （もしくはGitHub上のActionsタブで構文エラーが出ないことを確認する）

- [ ] **Step 4: Commit**

```bash
git add golf-web/.github/workflows/scrape-golf-courses.yml
git commit -m "feat: ゴルフ場スクレイピングバッチの定期実行ワークフローを追加"
```

---

## 本Planのスコープ外（フォローアップが必要な項目）

- 楽天GORA・じゃらんゴルフ・ShotNaviの実パーサー実装（各サイトのHTML構造調査スパイクが前提）
- Iceberg（S3/GCP Cloud Storage）へのステージング、DuckDBによる読み取り、BigQuery（golf-db）との連携
- 長期スコープ（全国のゴルフ場への拡大）：`config/scraping-target-prefectures.json`のリスト拡張のみで対応可能な設計にしてあるため、コード変更は不要な想定だが、実際のジョブ量増加に伴うGitHub Actionsの実行時間制限（デフォルト6時間）への抵触有無は別途確認する

## Self-Review Notes

- Spec本文の「データモデル」章（Com/Usrプレフィックス分離）は撤回済みのため本Planには含めていない。「保存方式」章のpg_duckdb/pg_lake拡張も撤回済みのため含めていない
- 「未決事項・リスク」章にあった pg_duckdb 調査スパイクは、撤回の注記により不要になったため本Planのタスクから除外した
- 4サイト全てのパーサーを一度に実装すると、実サイトのHTML構造という現時点で未調査の外部要因に強く依存し計画の信頼性が下がるため、GDO（優先順位最上位）のみ実装しほかはプレースホルダとするMVPスコープにした
