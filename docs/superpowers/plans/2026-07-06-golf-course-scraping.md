# ゴルフ場情報スクレイピング機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GDO・楽天GORA・じゃらんゴルフ・ShotNaviの4サイトからゴルフ場のコース情報（ゴルフ場名・都道府県/市区町村・コースレイアウト・ホールごとのPar/Yard）を実際にスクレイピングし、共有マスタ（`MstGolfCourse`/`MstCourseLayout`/`MstHole`）へUpsertされる状態まで動かす。

**Spec:** `docs/superpowers/specs/2026-07-05-golf-course-scraping-design.md`（2026-07-06追記の注記を正とする。Com/Usrマスタ分離・pg_duckdb/pg_lakeによるPostgres拡張経由参照は撤回済み）

**現状（本Plan作成時点で既に完了済み）:**
- ゴルフ場マスタは`2026-07-06-golf-course-master-consolidation.md`により単一化済み（`MstGolfCourse`に`userId`は無く、全ユーザー共有。書き込みは`requireAdminForAction()`経由でapp層のみに制限）
- spec冒頭の注記により、pg_duckdb/pg_lake拡張方式は撤回済み。Icebergステージング・BigQuery連携は本Planのスコープ外とする（後述）

**本Plan作成にあたっての調査結果（重要な制約）:**
- 本Planを作成した開発コンテナ（サンドボックス環境）は許可リスト方式のアウトバウンドネットワークポリシーになっており、GDO・楽天GORA・じゃらんゴルフ・ShotNaviの実サイトへは`curl`・`WebFetch`のいずれでも到達できない（プロキシの`CONNECT`段階で403）ことを確認済み。したがって、パーサーのHTML取得ロジック自体はこの環境内では実サイトに対して動作検証できない。実際の動作検証は、フルにインターネットへ出られるGitHub Actionsランナー上（Task 12）で行う
- 上記の制約があるため、本Planでは「ユーザーが実際に4サイトのページを開いてコピペしたテキスト」を固定フィクスチャとして`src/lib/scraping/parsers/__tests__/fixtures/`配下に保存済み（対象: 赤羽ゴルフ倶楽部、東京都北区）。各サイトのパーサーの**パースロジック**はこのフィクスチャに対して完全にテスト可能。**HTML取得→テキスト化**の部分（`fetchAndExtractText`）のみ、実サイトでの動作はTask 12のGitHub Actions実行時に初めて検証される

## スコープ

**含む:**
- 4サイト全てのコース詳細ページパーサー（フィクスチャに基づく実装、ユニットテストあり）
- 名寄せ正規化・優先順位マージロジック
- 対象コースを指定してスクレイピング→マージ→`MstGolfCourse`等へのUpsertを実行するバッチ
- 再開可能なジョブ進捗管理（`ScrapingJobProgress`）
- GitHub Actionsによる定期実行・手動実行

**含まない（フォローアップPlanで対応）:**
- 都道府県別の「コース一覧・検索」ページの自動探索（一覧ページのHTML構造の実サンプルが無いため）。本PlanのMVPでは、スクレイピング対象コースを`config/scraping-seed-courses.json`に人手で列挙する方式とする（既知のコースURL/IDを追加していく運用）。将来、一覧ページのサンプルが取得できた時点で自動探索に置き換える
- Iceberg（S3/GCP Cloud Storage）へのステージング、DuckDBによる読み取り、BigQuery（golf-db）との連携

**Architecture:** `src/lib/scraping/`配下に、HTML取得を担う`fetch.ts`（`cheerio`でテーブルをタブ区切りテキストへ変換する`fetchAndExtractText`）、サイト非依存の共通型（`ScrapedCourse`）、住所正規化（`normalize.ts`）、優先順位マージ（`merge.ts`）を置く。`parsers/`配下に4サイト分のテキストパーサー（`fetchAndExtractText`が返すテキストを入力とする純粋関数）を置き、フィクスチャで完全にユニットテストする。バッチ本体は`scripts/scrape-golf-courses.ts`とし、`.github/workflows/scrape-golf-courses.yml`から`tsx`で起動する。バッチはservice role相当の`DIRECT_URL`接続を使い、Server Action層を経由せず直接Prismaでマスタを更新する。進捗は`ScrapingJobProgress`テーブル（サイト・シードリストの処理済みインデックス・`lastRunAt`）で管理する。

**Tech Stack:** Next.js 16 / Prisma 7 / TypeScript / Vitest / GitHub Actions / tsx / cheerio

## Global Constraints

- コメント・UI文言・エラーメッセージは日本語で記述する
- 既存のコードパターン（`src/lib/parsers/gdoScorecard.ts`のテキストパーサー設計、`src/lib/db/prisma.ts`のPrismaクライアント）を踏襲する
- 共有マスタ（`MstGolfCourse`等）への書き込み経路はスクレイピングバッチ（`scripts/`配下）のみとし、`app/`配下のServer Actionから呼び出さない
- 名寄せは「ゴルフ場名＋都道府県＋市区町村」の正規化キーで行う。郵便番号・緯度経度による名寄せは行わない
- マージはサイト単位・コース単位で行う。優先順位（GDO→楽天GORA→じゃらんゴルフ→ShotNavi）が最も高いサイトに情報があれば丸ごと採用し、項目単位の混在は行わない
- 各サイトで複数ティー/グリーンの表記がある場合（例: GDOの`Reg.(A)`/`Reg.(B)`、ShotNaviの`Aグリーン`/`Bグリーン`）は、先頭側（A系統）の数値を`MstHole.yardRegular`として採用する。これは実データの精度よりも実装の単純さを優先した割り切りであり、本Planの既知の制約として明記する
- `npm run test` と `tsc --noEmit` が通り続けること
- Iceberg/pg_duckdb関連の実装を先取りして書かない

---

## Task 1: Prisma schemaに`ScrapingJobProgress`と`lastScrapedAt`を追加する

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `ScrapingJobProgress`モデル、`MstGolfCourse.lastScrapedAt`

- [ ] **Step 1: schema.prismaに追記する**

`MstGolfCourse`に追加:

```prisma
  lastScrapedAt DateTime? @map("last_scraped_at")
```

新規モデル:

```prisma
enum scraping_site {
  gdo
  rakuten_gora
  jalan_golf
  shotnavi
}

model ScrapingJobProgress {
  id             String        @id @default(uuid())
  site           scraping_site
  processedIndex Int           @default(0) @map("processed_index")
  status         String        @default("pending")
  lastRunAt      DateTime?     @map("last_run_at")
  createdAt      DateTime      @default(now()) @map("created_at")
  updatedAt      DateTime      @updatedAt @map("updated_at")

  @@unique([site])
  @@map("scraping_job_progress")
}
```

`processedIndex`は`config/scraping-seed-courses.json`内の何件目まで処理済みかを表すシンプルなカーソル。

- [ ] **Step 2: マイグレーションを作成する**

Run: `cd golf-web && npx prisma migrate dev --name add_scraping_job_progress`

- [ ] **Step 3: `npx tsc --noEmit`で既存コードに影響がないことを確認する**

- [ ] **Step 4: Commit**

```bash
git add golf-web/prisma/schema.prisma golf-web/prisma/migrations
git commit -m "feat: スクレイピングジョブ進捗管理用のScrapingJobProgressを追加"
```

---

## Task 2: 共通型定義・住所正規化・ゴルフ場名正規化ロジックを実装する

**Files:**
- Create: `src/lib/scraping/types.ts`
- Create: `src/lib/scraping/normalize.ts`
- Create: `src/lib/scraping/__tests__/normalize.test.ts`

**Interfaces:**
- Produces: `ScrapedCourse`型、`normalizeCourseName(name: string): string`、`buildMatchKey(...)`、`parsePrefectureCity(addressLine: string): { prefecture: string | null; city: string | null }`

- [ ] **Step 1: `types.ts`に中間表現を定義する**

```ts
export type ScrapingSite = "gdo" | "rakuten_gora" | "jalan_golf" | "shotnavi";

export interface ScrapedHole {
  holeNumber: number;
  par: number;
  yardRegular: number;
}

export interface ScrapedLayout {
  name: string; // "OUT" | "IN"
  holes: ScrapedHole[];
}

export interface ScrapedCourse {
  site: ScrapingSite;
  sourceUrl: string;
  name: string;
  prefecture: string | null;
  city: string | null;
  layouts: ScrapedLayout[];
}

export type ScrapeResult =
  | { ok: true; course: ScrapedCourse }
  | { ok: false; error: string };
```

- [ ] **Step 2: `normalize.ts`に住所パースと表記ゆれ吸収ロジックを実装する**

`parsePrefectureCity`は、入力文字列から先頭の郵便番号（`〒115-0051`等）・ラベル（`住所`/`所在地`/`【住所】`等）を除去した上で、`(北海道|.+?[都道府県])`にマッチする都道府県部分と、それに続く`(市|区|町|村|郡)`までの市区町村部分を抽出する。マッチしない場合は`{ prefecture: null, city: null }`を返す。

`normalizeCourseName`は「ゴルフ倶楽部」「ゴルフクラブ」「GC」「カントリークラブ」「CC」等の表記ゆれを除去・統一し、全角/半角スペースを除去したキーを返す。`buildMatchKey`は`normalizeCourseName(name)` + `prefecture` + `city`を結合したキーを返す。

- [ ] **Step 3: テストを書く**

以下の実データに基づくケースを含める（`docs/superpowers/plans/2026-07-06-golf-course-scraping.md`のTask 4〜7フィクスチャと対応）:
- `"東京都北区浮間2-18-7"` → `{ prefecture: "東京都", city: "北区" }`（GDO/じゃらんゴルフ形式）
- `"東京都 北区浮間2-18-7"`（都道府県の後にスペース） → 同上（楽天GORA形式）
- `"〒115-0051 東京都 北区浮間2-18-7"`（郵便番号付き） → 同上（ShotNavi形式）
- `"住所	〒115-0051 東京都 北区浮間2-18-7 [地図]"`（ラベル・タブ・末尾リンク付き） → 同上
- 「〇〇ゴルフ倶楽部」「〇〇GC」「〇〇 ゴルフクラブ」が`normalizeCourseName`で同一キーになること

- [ ] **Step 4: `npm run test`を実行し全て通ることを確認する**

- [ ] **Step 5: Commit**

```bash
git add golf-web/src/lib/scraping/types.ts golf-web/src/lib/scraping/normalize.ts golf-web/src/lib/scraping/__tests__/normalize.test.ts
git commit -m "feat: スクレイピング用の共通型・住所パース・ゴルフ場名正規化ロジックを追加"
```

---

## Task 3: 優先順位マージロジックを実装する

**Files:**
- Create: `src/lib/scraping/merge.ts`
- Create: `src/lib/scraping/__tests__/merge.test.ts`

**Interfaces:**
- Consumes: `ScrapedCourse`、`buildMatchKey`（Task 2）
- Produces: `mergeScrapedCourses(bySite: Partial<Record<ScrapingSite, ScrapedCourse>>): ScrapedCourse | null`

- [ ] **Step 1: マージ関数を実装する**

サイト優先順位 `["gdo", "rakuten_gora", "jalan_golf", "shotnavi"]` の順に走査し、最初に見つかった`ScrapedCourse`のうち`layouts`が空でないものを**丸ごと**採用する。全サイト該当なしの場合は`null`を返す。

- [ ] **Step 2: テストを書く（Task 4〜7で実装するフィクスチャの実データを使用）**

- GDO・楽天GORA・じゃらんゴルフ・ShotNaviの4サイト分の赤羽ゴルフ倶楽部のパース結果を渡した場合、GDOの値が丸ごと採用されること
- GDOの結果が`{ ok: false }`（未取得）の場合、楽天GORAが採用されること
- 全サイトとも取得できなかった場合、`null`が返ること

- [ ] **Step 3: `npm run test`を実行し全て通ることを確認する**

- [ ] **Step 4: Commit**

```bash
git add golf-web/src/lib/scraping/merge.ts golf-web/src/lib/scraping/__tests__/merge.test.ts
git commit -m "feat: サイト優先順位に基づくゴルフ場情報マージロジックを追加"
```

---

## Task 4: HTML取得ユーティリティを実装する（cheerio導入）

**Files:**
- Modify: `package.json`（`cheerio`, `tsx`を追加）
- Create: `src/lib/scraping/fetch.ts`

**Interfaces:**
- Produces: `fetchAndExtractText(url: string): Promise<string>`

> **注記:** この関数のみ、本サンドボックス環境では実サイトに対する動作確認ができない（ネットワークポリシーにより対象4サイトへのアウトバウンド接続がブロックされているため）。Task 12（GitHub Actions実行）で初めて実地検証される。

- [ ] **Step 1: 依存関係を追加する**

Run: `cd golf-web && npm install cheerio && npm install -D tsx`

- [ ] **Step 2: `fetch.ts`を実装する**

`fetch(url)`でHTMLを取得し、`cheerio`でDOMを構築する。ページ内の`<table>`要素ごとに、各`<tr>`の`<td>`/`<th>`の`textContent`を`\t`で結合し、行を`\n`で結合したテキストに変換する。テーブル外のテキストは`$('body').text()`相当で取得し、テーブル変換結果と連結して返す（フィクスチャで観測した「見出しテキスト＋タブ区切りテーブル」という形に近づける）。

- [ ] **Step 3: `npx tsc --noEmit`を実行しビルドが壊れていないことを確認する**

- [ ] **Step 4: Commit**

```bash
git add golf-web/package.json golf-web/package-lock.json golf-web/src/lib/scraping/fetch.ts
git commit -m "feat: HTMLテーブルをタブ区切りテキストへ変換するfetchAndExtractTextを追加"
```

---

## Task 5: GDOパーサーを実装する

**Files:**
- Create: `src/lib/scraping/parsers/types.ts`
- Create: `src/lib/scraping/parsers/gdo.ts`
- Create: `src/lib/scraping/parsers/__tests__/gdo.test.ts`
- (Already created) Fixture: `src/lib/scraping/parsers/__tests__/fixtures/gdo/akabane-golf-club.txt`

**Interfaces:**
- Produces: `CourseParser = { site: ScrapingSite; fetchCourse(url: string): Promise<ScrapeResult> }`

- [ ] **Step 1: 共通パーサーインターフェースを定義する（`parsers/types.ts`）**

```ts
export interface CourseParser {
  site: ScrapingSite;
  fetchCourse(url: string): Promise<ScrapeResult>;
}
```

`fetchCourse`は内部で`fetchAndExtractText(url)`を呼び、結果を各サイト固有の`parseXxxText(text: string, sourceUrl: string): ScrapeResult`（純粋関数）に渡す構成にする。`parseXxxText`はexportし、フィクスチャに対して直接ユニットテストする。

- [ ] **Step 2: `parseGdoCourseText`を実装する**

固定サンプル（`fixtures/gdo/akabane-golf-club.txt`）の構造に基づき実装する:
- コース名: テキスト先頭の非空行（`赤羽ゴルフ倶楽部`）
- 住所: `parsePrefectureCity`にマッチする行を全行から走査して最初に見つかったもの
- OUT/IN各レイアウト: `HOLE`で始まる行の後続で、`Par`で始まる行（末尾の空白許容、`Par\t4\t4\t3 \t5...`）から9個のPar値を抽出し、`Reg.(A)`で始まる行から9個のYard値（カンマ除去）を抽出する。`HOLE`行直後の数値列（`1..9`または`10..18`）でholeNumberを決定する

- [ ] **Step 3: フィクスチャに対するテストを書く**

期待値（本Plan作成時に実データから算出済み）:
- コース名: `"赤羽ゴルフ倶楽部"`、prefecture: `"東京都"`、city: `"北区"`
- OUTレイアウト: `holeNumber=1..9`, `par=[4,4,3,5,4,4,5,5,3]`, `yardRegular=[375,380,160,477,326,309,495,498,174]`
- INレイアウト: `holeNumber=10..18`, `par=[4,3,5,4,4,4,4,3,4]`, `yardRegular=[349,144,484,309,376,317,356,123,389]`

- [ ] **Step 4: `npm run test`を実行し全て通ることを確認する**

- [ ] **Step 5: Commit**

```bash
git add golf-web/src/lib/scraping/parsers/types.ts golf-web/src/lib/scraping/parsers/gdo.ts golf-web/src/lib/scraping/parsers/__tests__/gdo.test.ts golf-web/src/lib/scraping/parsers/__tests__/fixtures/gdo
git commit -m "feat: GDOのコース情報パーサーを追加"
```

---

## Task 6: 楽天GORAパーサーを実装する

**Files:**
- Create: `src/lib/scraping/parsers/rakutenGora.ts`
- Create: `src/lib/scraping/parsers/__tests__/rakutenGora.test.ts`
- (Already created) Fixture: `src/lib/scraping/parsers/__tests__/fixtures/rakuten-gora/akabane-golf-club.txt`

- [ ] **Step 1: `parseRakutenGoraCourseText`を実装する**

Task 5と同様の構造だが、Yard行のラベルは`REGULAR`（`Reg.(A)`ではない）。住所行は`"東京都 北区浮間2-18-7"`のように都道府県の後にスペースが入る（`parsePrefectureCity`が吸収する想定）。Par行は`PAR`の次行以降に数値が1つずつ改行で並ぶ形（`PAR\n4\n4\n3\n...`）である点がGDOと異なるため、`PAR`〜次のラベル行までの数値トークンを順に9個集める実装にする。

- [ ] **Step 2: フィクスチャに対するテストを書く**

期待値:
- OUT: `par=[4,4,3,5,4,4,5,5,3]`, `yardRegular=[375,380,160,472,326,309,495,498,174]`
- IN: `par=[4,3,5,4,4,4,4,3,4]`, `yardRegular=[349,144,462,309,376,317,356,123,389]`

- [ ] **Step 3: `npm run test`を実行し全て通ることを確認する**

- [ ] **Step 4: Commit**

```bash
git add golf-web/src/lib/scraping/parsers/rakutenGora.ts golf-web/src/lib/scraping/parsers/__tests__/rakutenGora.test.ts golf-web/src/lib/scraping/parsers/__tests__/fixtures/rakuten-gora
git commit -m "feat: 楽天GORAのコース情報パーサーを追加"
```

---

## Task 7: じゃらんゴルフパーサーを実装する

**Files:**
- Create: `src/lib/scraping/parsers/jalanGolf.ts`
- Create: `src/lib/scraping/parsers/__tests__/jalanGolf.test.ts`
- (Already created) Fixture: `src/lib/scraping/parsers/__tests__/fixtures/jalan-golf/akabane-golf-club.txt`

- [ ] **Step 1: `parseJalanGolfCourseText`を実装する**

Par行のラベルは`パー`、Yard行のラベルは`Reg`（先頭に`OUT\tBack`のような余分な列がある行もあるため、行末から9列 + 合計列を数える形でパースする）。住所は`【住所】 東京都北区浮間２丁目１８－７`のようにラベル＋全角数字。`parsePrefectureCity`は全角数字を含む住所でも都道府県・市区町村部分（半角/全角どちらの文字でも`市区町村`表記自体は全角文字のため影響なし）を正しく抽出できることを確認する。

- [ ] **Step 2: フィクスチャに対するテストを書く**

期待値:
- OUT: `par=[4,4,3,5,4,4,5,5,3]`, `yardRegular=[375,380,160,455,326,309,495,498,174]`
- IN: `par=[4,3,5,4,4,4,4,3,4]`, `yardRegular=[349,144,462,309,376,317,356,123,389]`

- [ ] **Step 3: `npm run test`を実行し全て通ることを確認する**

- [ ] **Step 4: Commit**

```bash
git add golf-web/src/lib/scraping/parsers/jalanGolf.ts golf-web/src/lib/scraping/parsers/__tests__/jalanGolf.test.ts golf-web/src/lib/scraping/parsers/__tests__/fixtures/jalan-golf
git commit -m "feat: じゃらんゴルフのコース情報パーサーを追加"
```

---

## Task 8: ShotNaviパーサーを実装する

**Files:**
- Create: `src/lib/scraping/parsers/shotnavi.ts`
- Create: `src/lib/scraping/parsers/__tests__/shotnavi.test.ts`
- (Already created) Fixture: `src/lib/scraping/parsers/__tests__/fixtures/shotnavi/akabane-golf-club.txt`

> **注記（他3サイトとの違い）:** ShotNaviはテーブル構造が転置している（他サイトは「ティー種別ごとの行」だが、ShotNaviは「ホールごとの行」で列が`No/PAR/Aグリーン/Bグリーン`）。さらにコースデータが**複数ページに分割**されており（例: OUT用の`cdata_1606_0.htm`、IN用の`cdata_1606_3096.htm`）、2ページ目以降のURLは規則的な連番ではない。本Planのフィクスチャはこの3ページ分の実データを結合して保存済みだが、**2ページ目以降のURLをどう発見するか（1ページ目のHTML内の「次の9ホールへ」リンクのhrefを辿る想定）は実HTML未確認のため未解決**。`fetchCourse`実装時に、まず1ページ目のみで先に進め、追加ページの発見ロジックはTask 12の実地検証時に確定させる

- [ ] **Step 1: `parseShotnaviCourseText`を実装する**

入力テキスト中の`=== <URL> ===`区切り（フィクスチャの形式）ごとにセクションを分割する想定で実装する（実際のバッチでは、1ページ目からゴルフ場名・住所を、2・3ページ目のテーブルからPar/Yardを取得し、`fetch.ts`側で結合してから渡す）。テーブル行は`No\tPAR\tAグリーン\tBグリーン`のヘッダーの後、`No`が数値の行をホール、`TOTAL`行は無視する。`No`が1〜9ならOUT、10〜18ならINに割り当てる。Yardは`Aグリーン`列を採用する。

- [ ] **Step 2: フィクスチャに対するテストを書く**

期待値:
- コース名: `"赤羽ゴルフ倶楽部"`、prefecture: `"東京都"`、city: `"北区"`
- OUT: `par=[4,4,3,5,4,4,5,5,3]`, `yardRegular=[375,410,160,491,340,325,504,509,182]`
- IN: `par=[4,3,5,4,4,4,4,3,4]`, `yardRegular=[350,151,484,317,382,326,367,126,400]`

- [ ] **Step 3: `npm run test`を実行し全て通ることを確認する**

- [ ] **Step 4: Commit**

```bash
git add golf-web/src/lib/scraping/parsers/shotnavi.ts golf-web/src/lib/scraping/parsers/__tests__/shotnavi.test.ts golf-web/src/lib/scraping/parsers/__tests__/fixtures/shotnavi
git commit -m "feat: ShotNaviのコース情報パーサーを追加"
```

---

## Task 9: パーサーレジストリを実装する

**Files:**
- Create: `src/lib/scraping/parsers/index.ts`

**Interfaces:**
- Consumes: Task 5〜8の各パーサー
- Produces: `getParser(site: ScrapingSite): CourseParser`

- [ ] **Step 1: レジストリを実装する**

- [ ] **Step 2: `npx tsc --noEmit`を実行する**

- [ ] **Step 3: Commit**

```bash
git add golf-web/src/lib/scraping/parsers/index.ts
git commit -m "feat: サイト別パーサーのレジストリを追加"
```

---

## Task 10: スクレイピング対象コースのシードリストを作成する

**Files:**
- Create: `config/scraping-seed-courses.json`

**Interfaces:**
- Produces: バッチが読み込む対象コースの一覧

- [ ] **Step 1: シードリストを作成する**

本Planで実データを取得済みの赤羽ゴルフ倶楽部を1件目として登録する:

```json
[
  {
    "courseName": "赤羽ゴルフ倶楽部",
    "urls": {
      "gdo": "https://reserve.golfdigest.co.jp/golf-course/360101/course-info/",
      "rakuten_gora": "https://booking.gora.golf.rakuten.co.jp/guide/course_info/disp/c_id/130001",
      "jalan_golf": "https://golf-jalan.net/gc00975/detail/",
      "shotnavi": "https://shotnavi.jp/gcguide/gcinfo_1606.htm"
    }
  }
]
```

- [ ] **Step 2: Commit**

```bash
git add golf-web/config/scraping-seed-courses.json
git commit -m "feat: スクレイピング対象コースのシードリストを追加"
```

---

## Task 11: バッチオーケストレーターを実装する

**Files:**
- Create: `scripts/scrape-golf-courses.ts`

**Interfaces:**
- Consumes: `getParser`（Task 9）、`mergeScrapedCourses`（Task 3）、`ScrapingJobProgress`（Task 1）、`scraping-seed-courses.json`（Task 10）

- [ ] **Step 1: シードリストを1件ずつ処理するロジックを実装する**

各シードエントリについて、4サイト分のURLに対し`getParser(site).fetchCourse(url)`を呼び、結果を`mergeScrapedCourses`でマージし、`buildMatchKey`で既存の`MstGolfCourse`を検索、無ければ`create`・あれば`update`する。`MstCourseLayout`/`MstHole`も同様に`upsert`する。`MstGolfCourse.lastScrapedAt`を更新する

- [ ] **Step 2: `ScrapingJobProgress`による中断・再開を実装する**

1回の実行で処理する上限件数（環境変数`SCRAPE_MAX_COURSES_PER_RUN`、デフォルト全件）を超えたら中断し、サイトごとの`processedIndex`を保存する

- [ ] **Step 3: `npm run test`と`tsc --noEmit`を実行し全て通ることを確認する**

- [ ] **Step 4: ローカルで実際に1回実行してみる**

Run: `cd golf-web && npx tsx scripts/scrape-golf-courses.ts`
Expected: ローカル環境からは4サイトいずれにも到達できずエラーになる可能性が高い（本Planの制約セクション参照）。この時点では「エラーハンドリングが正しく機能し、1サイト失敗しても他サイト・全体が落ちない」ことを確認できれば十分とする。実際に取得できてPostgresへ反映されることの確認はTask 12で行う

- [ ] **Step 5: Commit**

```bash
git add golf-web/scripts
git commit -m "feat: ゴルフ場スクレイピングバッチのオーケストレーターを追加"
```

---

## Task 12: GitHub Actionsワークフローを追加し、実サイトに対して実行して確認する

**Files:**
- Create: `.github/workflows/scrape-golf-courses.yml`

**Interfaces:**
- Consumes: `scripts/scrape-golf-courses.ts`（Task 11）
- Produces: 定期実行・手動実行可能なCIワークフロー

- [ ] **Step 1: ワークフローを作成する**

`deploy.yml`と同様のNode.jsセットアップを踏襲し、`schedule`（例: 毎日1回）と`workflow_dispatch`をトリガーにする。DB接続はマイグレーション用と同じ`DIRECT_URL`系のシークレットを使う（本番マスタを直接更新するため、どのSupabaseプロジェクトに対して実行するか＝ローカル検証用か本番かは実装時に確認する）

- [ ] **Step 2: `workflow_dispatch`で手動実行し、実際にGDO・楽天GORA・じゃらんゴルフ・ShotNaviから赤羽ゴルフ倶楽部のデータが取得できることを確認する**

Expected: 4サイトとも`fetchCourse`が成功し、パース結果がTask 5〜8で定義した期待値と概ね一致する。ここで初めて`fetch.ts`（Task 4）の実サイトに対する動作が検証される。サイト側のHTML構造が本Planの想定と異なっていた場合は、このステップでパーサーを実データに合わせて修正する

- [ ] **Step 3: 実行後、`MstGolfCourse`に赤羽ゴルフ倶楽部が登録され、`MstCourseLayout`（OUT/IN）・`MstHole`（18ホール分のPar/Yard）が保存されていることをDBで確認する**

Run: Supabase Studioまたは`psql`で`select * from mst_golf_courses where name = '赤羽ゴルフ倶楽部';`等を確認する

- [ ] **Step 4: Commit**

```bash
git add golf-web/.github/workflows/scrape-golf-courses.yml
git commit -m "feat: ゴルフ場スクレイピングバッチの定期実行ワークフローを追加"
```

---

## 本Planのスコープ外（フォローアップが必要な項目）

- 都道府県別のコース一覧・検索ページの自動探索（現状は`config/scraping-seed-courses.json`への手動追加で対応。件数が増えてきたら別Planで自動探索を検討する）
- ShotNaviの2ページ目以降のURL発見ロジックの一般化（Task 8の注記参照）
- Iceberg（S3/GCP Cloud Storage）へのステージング、DuckDBによる読み取り、BigQuery（golf-db）との連携

## Self-Review Notes

- Spec本文の「データモデル」章（Com/Usrプレフィックス分離）・「保存方式」章のpg_duckdb/pg_lake拡張は撤回済みのため本Planには含めていない
- 4サイト全てのコース詳細パーサーを、ユーザーから提供された実データ（赤羽ゴルフ倶楽部）に基づいて実装するタスクとして分解した。都道府県一覧の自動探索は実サンプル未取得のため意図的にスコープ外とし、シードリスト方式のMVPとした
- 本Planを作成したサンドボックス環境ではGDO等4サイトへの通信がネットワークポリシーでブロックされているため、HTML取得部分（Task 4）の実地検証はTask 12（GitHub Actions実行）まで持ち越される。これは本Plan固有の制約であり、実装者は再現するはず
