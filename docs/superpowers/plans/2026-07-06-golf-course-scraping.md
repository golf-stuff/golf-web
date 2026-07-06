# ゴルフ場情報スクレイピング機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GDO・楽天GORA・じゃらんゴルフの3サイトから都道府県単位でゴルフ場のコース情報（ゴルフ場名・都道府県/市区町村・コースレイアウト・ホールごとのPar/Yard）を実際にスクレイピングし、共有マスタ（`MstGolfCourse`/`MstCourseLayout`/`MstHole`）へUpsertされる状態まで動かす。

**Spec:** `docs/superpowers/specs/2026-07-05-golf-course-scraping-design.md`（2026-07-06追記の注記を正とする。Com/Usrマスタ分離・pg_duckdb/pg_lakeによるPostgres拡張経由参照は撤回済み）

**現状（本Plan作成時点で既に完了済み）:**
- ゴルフ場マスタは`2026-07-06-golf-course-master-consolidation.md`により単一化済み（`MstGolfCourse`に`userId`は無く、全ユーザー共有。書き込みは`requireAdminForAction()`経由でapp層のみに制限）
- spec冒頭の注記により、pg_duckdb/pg_lake拡張方式は撤回済み。Icebergステージング・BigQuery連携は本Planのスコープ外とする（後述）

**対象サイトについて（2026-07-06方針修正）:** spec原文では対象サイトはGDO・楽天GORA・じゃらんゴルフ・ShotNaviの4サイトだったが、ShotNaviはコースデータが複数ページ（コース基本情報ページ＋ホール範囲ごとのデータページ、URLが規則的な連番でない）に分割されており、他3サイトに比べて取得実装のコストが明確に高いため、**本Planでは対象から除外する**。ShotNavi対応は必要になった時点で別Planとして追加する。

**本Planで判明している制約:**
- 本Planを作成した開発コンテナ（サンドボックス環境）は許可リスト方式のアウトバウンドネットワークポリシーになっており、GDO・楽天GORA・じゃらんゴルフの実サイトへは`curl`・`WebFetch`のいずれでも到達できない（プロキシの`CONNECT`段階で403）ことを確認済み。したがって、パーサーのHTML取得ロジック自体はこの環境内では実サイトに対して動作検証できない。実際の動作検証は、フルにインターネットへ出られるGitHub Actionsランナー上（Task 12）で行う
- コース詳細ページの構造は、ユーザーが実際に開いてコピペしたテキスト（赤羽ゴルフ倶楽部・東京都北区）をフィクスチャとして`src/lib/scraping/parsers/__tests__/fixtures/`配下に保存済みで、パースロジックはこれに対して完全にテスト可能
- 一覧ページ（都道府県ごとのコース一覧）について、東京都のページ内容をユーザーから提供してもらい、`src/lib/scraping/parsers/__tests__/fixtures/{gdo,rakuten-gora,jalan-golf}/area-tokyo.txt`としてフィクスチャ化済み。判明した内容は以下の通り:
  - **GDO**: `https://reserve.golfdigest.co.jp/course-guide/area/{都道府県コード}/`（東京都=`13`と確認済み。JIS都道府県コード2桁と推定）。ページ内に`<script type="application/ld+json">`でschema.orgの`ItemList`が埋め込まれており、`itemListElement`の各要素が`{"@type":"ListItem","url":"https://reserve.golfdigest.co.jp/golf-course/{id}/course-info/","name":"..."}`の形でコース詳細URLを持つ。`numberOfItems`（例: 24件）と一致する全件がこの1つのJSON-LDに含まれる想定で、ページネーションは無いものと仮定する（Task 12で要検証）
  - **楽天GORA**: `https://gora.golf.rakuten.co.jp/doc/area/{都道府県スラッグ}/`（東京都=`tokyo`と確認済み。`data-area-name="tokyo"`がページ内に出現）。コースごとに`<li class="gf-card js-area-list-item" data-course-id="{id}">`という要素があり、`data-course-id`からコース詳細ページURL`https://booking.gora.golf.rakuten.co.jp/guide/course_info/disp/c_id/{id}`を組み立てる（一覧ページ内の`<a href>`自体は`.../guide/disp/c_id/{id}/`という別パス＝コースのトップページで、ヤーデージ情報のある詳細ページとは異なるため、IDから直接組み立てる方式にする）。ページネーションの有無は未確認（Task 12で要検証）
  - **じゃらんゴルフ**: `https://golf-jalan.net/course/{地方}/{都道府県}/`（例: 東京都は関東地方配下と推定し`kanto/tokyo`。北海道のみ`https://golf-jalan.net/course/hokkaido/`と地方なし直下）。コースごとに`<p class="ranking-course_name ..."><a href="https://golf-jalan.net/gc{id}/" ...>`という要素があり、このURL末尾に`detail/`を付けた`https://golf-jalan.net/gc{id}/detail/`が実際のヤーデージ情報のある詳細ページ（既存フィクスチャのURLと一致）。ページネーションの有無は未確認（Task 12で要検証）

## スコープ

**含む:**
- GDO・楽天GORA・じゃらんゴルフの3サイトのコース詳細ページパーサー（フィクスチャに基づく実装、ユニットテストあり）
- 3サイトの都道府県別コース一覧ページからコース詳細URLを抽出する探索ロジック
- 名寄せ正規化・優先順位マージロジック（サイトをまたいだコースのグルーピング含む）
- 対象都道府県を指定してスクレイピング→一覧探索→詳細取得→マージ→`MstGolfCourse`等へのUpsertを実行するバッチ
- 再開可能なジョブ進捗管理（`ScrapingJobProgress`）
- GitHub Actionsによる定期実行・手動実行

**含まない（フォローアップPlanで対応）:**
- ShotNavi対応（前述の理由により対象外）
- Iceberg（S3/GCP Cloud Storage）へのステージング、DuckDBによる読み取り、BigQuery（golf-db）との連携

**Architecture:** `src/lib/scraping/`配下に、HTML取得を担う`fetch.ts`（`cheerio`でテーブルをタブ区切りテキストへ変換する`fetchAndExtractText`、および一覧ページからリンクを抽出する`extractLinks`）、サイト非依存の共通型（`ScrapedCourse`）、住所正規化（`normalize.ts`）、優先順位マージ（`merge.ts`）を置く。`parsers/`配下に3サイト分の詳細ページテキストパーサーと、一覧ページからコースURL一覧を返す`listCourseUrls(prefecture)`を置く。バッチ本体（`scripts/scrape-golf-courses.ts`）は、対象都道府県ごとに3サイト独立でコース一覧→詳細を取得し、**サイトをまたいで得られた全コースを名寄せキーでグルーピングしてからマージする**（同一サイト内で1コースずつ対応関係が分かっているわけではないため、Task 3のマージロジックは複数コース×複数サイトの配列を受け取る設計にする）。`.github/workflows/scrape-golf-courses.yml`から`tsx`で起動する。バッチはservice role相当の`DIRECT_URL`接続を使い、Server Action層を経由せず直接Prismaでマスタを更新する。進捗は`ScrapingJobProgress`テーブル（サイト・都道府県・一覧ページのカーソル位置・`lastRunAt`）で管理する。

**Tech Stack:** Next.js 16 / Prisma 7 / TypeScript / Vitest / GitHub Actions / tsx / cheerio

## Global Constraints

- コメント・UI文言・エラーメッセージは日本語で記述する
- 既存のコードパターン（`src/lib/parsers/gdoScorecard.ts`のテキストパーサー設計、`src/lib/db/prisma.ts`のPrismaクライアント）を踏襲する
- 共有マスタ（`MstGolfCourse`等）への書き込み経路はスクレイピングバッチ（`scripts/`配下）のみとし、`app/`配下のServer Actionから呼び出さない
- 名寄せは「ゴルフ場名＋都道府県＋市区町村」の正規化キーで行う。郵便番号・緯度経度による名寄せは行わない
- マージはコース単位で行う。優先順位（GDO→楽天GORA→じゃらんゴルフ）が最も高いサイトに情報があれば丸ごと採用し、項目単位の混在は行わない
- 各サイトで複数ティーの表記がある場合（例: GDOの`Reg.(A)`/`Reg.(B)`）は、先頭側（A系統）の数値を`MstHole.yardRegular`として採用する。実データの精度よりも実装の単純さを優先した割り切りとして明記する
- `npm run test` と `tsc --noEmit` が通り続けること
- Iceberg/pg_duckdb関連の実装を先取りして書かない
- ShotNavi関連のコード・設定は追加しない（対象外のため）

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

`cursor`は一覧ページのページネーション位置（例: 次ページのURLやページ番号）を表す。1都道府県のコース件数が多い場合に、途中で中断・再開できるようにする。

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
export type ScrapingSite = "gdo" | "rakuten_gora" | "jalan_golf";

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

以下の実データに基づくケースを含める:
- `"東京都北区浮間2-18-7"` → `{ prefecture: "東京都", city: "北区" }`（GDO/じゃらんゴルフ形式）
- `"東京都 北区浮間2-18-7"`（都道府県の後にスペース） → 同上（楽天GORA形式）
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
- Produces: `mergeScrapedCourses(courses: ScrapedCourse[]): ScrapedCourse[]`

- [ ] **Step 1: マージ関数を実装する**

複数サイト・複数コースが混在した`ScrapedCourse[]`を受け取り、`buildMatchKey`で同一コースをグルーピングする。各グループ内で、サイト優先順位 `["gdo", "rakuten_gora", "jalan_golf"]` の順に走査し、最初に見つかった`layouts`が空でない`ScrapedCourse`を**丸ごと**採用する。グループごとに1件の`ScrapedCourse`を返す配列にする。

- [ ] **Step 2: テストを書く（Task 5〜7で実装するフィクスチャの実データを使用）**

- GDO・楽天GORA・じゃらんゴルフの3サイト分の赤羽ゴルフ倶楽部のパース結果（別々の`ScrapedCourse`として）を1つの配列にまとめて渡した場合、1件にグルーピングされ、GDOの値が丸ごと採用されること
- GDOの結果が無い場合、楽天GORAが採用されること
- 表記ゆれ（「〇〇ゴルフ倶楽部」/「〇〇GC」）が同一コースとしてグルーピングされること
- 名寄せキーが異なる複数コースが混在する場合、それぞれ別グループとして扱われること

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
- Produces: `fetchAndExtractText(url: string): Promise<string>`、`extractLinks(html: string, hrefPattern: RegExp): string[]`

> **注記:** この関数のみ、本サンドボックス環境では実サイトに対する動作確認ができない（ネットワークポリシーにより対象3サイトへのアウトバウンド接続がブロックされているため）。Task 12（GitHub Actions実行）で初めて実地検証される。

- [ ] **Step 1: 依存関係を追加する**

Run: `cd golf-web && npm install cheerio && npm install -D tsx`

- [ ] **Step 2: `fetchAndExtractText`を実装する**

`fetch(url)`でHTMLを取得し、`cheerio`でDOMを構築する。ページ内の`<table>`要素ごとに、各`<tr>`の`<td>`/`<th>`の`textContent`を`\t`で結合し、行を`\n`で結合したテキストに変換する。テーブル外のテキストは`$('body').text()`相当で取得し、テーブル変換結果と連結して返す。

- [ ] **Step 3: `extractLinks`を実装する**

HTML文字列と正規表現（例: コース詳細ページのURLパターン）を受け取り、`<a href="...">`のうちマッチするものを重複排除して返す。一覧ページからのコースURL抽出（Task 9）で使う。

- [ ] **Step 4: `npx tsc --noEmit`を実行しビルドが壊れていないことを確認する**

- [ ] **Step 5: Commit**

```bash
git add golf-web/package.json golf-web/package-lock.json golf-web/src/lib/scraping/fetch.ts
git commit -m "feat: HTML取得・テーブルのテキスト変換・リンク抽出ユーティリティを追加"
```

---

## Task 5: GDOの詳細ページパーサーを実装する

**Files:**
- Create: `src/lib/scraping/parsers/types.ts`
- Create: `src/lib/scraping/parsers/gdo.ts`
- Create: `src/lib/scraping/parsers/__tests__/gdo.test.ts`
- (Already created) Fixture: `src/lib/scraping/parsers/__tests__/fixtures/gdo/akabane-golf-club.txt`

**Interfaces:**
- Produces: `CourseParser = { site: ScrapingSite; fetchCourse(url: string): Promise<ScrapeResult>; listCourseUrls(prefecture: string): Promise<string[]> }`（`listCourseUrls`の実装はTask 9）

- [ ] **Step 1: 共通パーサーインターフェースを定義する（`parsers/types.ts`）**

```ts
export interface CourseParser {
  site: ScrapingSite;
  fetchCourse(url: string): Promise<ScrapeResult>;
  listCourseUrls(prefecture: string): Promise<string[]>;
}
```

`fetchCourse`は内部で`fetchAndExtractText(url)`を呼び、結果を各サイト固有の`parseXxxText(text: string, sourceUrl: string): ScrapeResult`（純粋関数）に渡す構成にする。`parseXxxText`はexportし、フィクスチャに対して直接ユニットテストする。

- [ ] **Step 2: `parseGdoCourseText`を実装する**

固定サンプル（`fixtures/gdo/akabane-golf-club.txt`）の構造に基づき実装する:
- コース名: テキスト先頭の非空行（`赤羽ゴルフ倶楽部`）
- 住所: `parsePrefectureCity`にマッチする行を全行から走査して最初に見つかったもの
- OUT/IN各レイアウト: `HOLE`で始まる行の後続で、`Par`で始まる行（末尾の空白許容、`Par\t4\t4\t3 \t5...`）から9個のPar値を抽出し、`Reg.(A)`で始まる行から9個のYard値（カンマ除去）を抽出する

- [ ] **Step 3: フィクスチャに対するテストを書く**

期待値:
- コース名: `"赤羽ゴルフ倶楽部"`、prefecture: `"東京都"`、city: `"北区"`
- OUTレイアウト: `holeNumber=1..9`, `par=[4,4,3,5,4,4,5,5,3]`, `yardRegular=[375,380,160,477,326,309,495,498,174]`
- INレイアウト: `holeNumber=10..18`, `par=[4,3,5,4,4,4,4,3,4]`, `yardRegular=[349,144,484,309,376,317,356,123,389]`

- [ ] **Step 4: `npm run test`を実行し全て通ることを確認する**

- [ ] **Step 5: Commit**

```bash
git add golf-web/src/lib/scraping/parsers/types.ts golf-web/src/lib/scraping/parsers/gdo.ts golf-web/src/lib/scraping/parsers/__tests__/gdo.test.ts golf-web/src/lib/scraping/parsers/__tests__/fixtures/gdo
git commit -m "feat: GDOのコース詳細ページパーサーを追加"
```

---

## Task 6: 楽天GORAの詳細ページパーサーを実装する

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
git commit -m "feat: 楽天GORAのコース詳細ページパーサーを追加"
```

---

## Task 7: じゃらんゴルフの詳細ページパーサーを実装する

**Files:**
- Create: `src/lib/scraping/parsers/jalanGolf.ts`
- Create: `src/lib/scraping/parsers/__tests__/jalanGolf.test.ts`
- (Already created) Fixture: `src/lib/scraping/parsers/__tests__/fixtures/jalan-golf/akabane-golf-club.txt`

- [ ] **Step 1: `parseJalanGolfCourseText`を実装する**

Par行のラベルは`パー`、Yard行のラベルは`Reg`（先頭に`OUT\tBack`のような余分な列がある行もあるため、行末から9列 + 合計列を数える形でパースする）。住所は`【住所】 東京都北区浮間２丁目１８－７`のようにラベル＋全角数字。

- [ ] **Step 2: フィクスチャに対するテストを書く**

期待値:
- OUT: `par=[4,4,3,5,4,4,5,5,3]`, `yardRegular=[375,380,160,455,326,309,495,498,174]`
- IN: `par=[4,3,5,4,4,4,4,3,4]`, `yardRegular=[349,144,462,309,376,317,356,123,389]`

- [ ] **Step 3: `npm run test`を実行し全て通ることを確認する**

- [ ] **Step 4: Commit**

```bash
git add golf-web/src/lib/scraping/parsers/jalanGolf.ts golf-web/src/lib/scraping/parsers/__tests__/jalanGolf.test.ts golf-web/src/lib/scraping/parsers/__tests__/fixtures/jalan-golf
git commit -m "feat: じゃらんゴルフのコース詳細ページパーサーを追加"
```

---

## Task 8: パーサーレジストリを実装する

**Files:**
- Create: `src/lib/scraping/parsers/index.ts`

**Interfaces:**
- Consumes: Task 5〜7の各パーサー
- Produces: `getParser(site: ScrapingSite): CourseParser`

- [ ] **Step 1: レジストリを実装する**

- [ ] **Step 2: `npx tsc --noEmit`を実行する**

- [ ] **Step 3: Commit**

```bash
git add golf-web/src/lib/scraping/parsers/index.ts
git commit -m "feat: サイト別パーサーのレジストリを追加"
```

---

## Task 9: 一覧ページからのコースURL探索ロジックを実装する

**Files:**
- Modify: `src/lib/scraping/parsers/gdo.ts`（`listCourseUrls`実装）
- Modify: `src/lib/scraping/parsers/rakutenGora.ts`（同上）
- Modify: `src/lib/scraping/parsers/jalanGolf.ts`（同上）
- Create: `src/lib/scraping/prefectureSlug.ts`
- Create: `src/lib/scraping/__tests__/prefectureSlug.test.ts`
- (Already created) Fixtures: `src/lib/scraping/parsers/__tests__/fixtures/{gdo,rakuten-gora,jalan-golf}/area-tokyo.txt`

**Interfaces:**
- Produces: `CourseParser.listCourseUrls(prefecture: string): Promise<string[]>`

> **フィクスチャの精度について:** GDOの`area-tokyo.txt`は、ユーザーが提供したJSON-LDが途中で切れていたため、既に実在確認済みの1件（赤羽ゴルフ倶楽部 `.../golf-course/360101/course-info/`）のみを含む形に再構成している。全24件が本当に1ページのJSON-LDに収まっているか、また3サイトともページネーションが存在するかは未検証。Task 12で実サイトに対して実行した際に確認し、想定と異なればこのTaskのロジックを修正する

- [ ] **Step 1: 都道府県名 → サイトごとのURLパスセグメントの変換テーブルを実装する**

`prefectureSlug.ts`に、47都道府県について以下を持つテーブルを定義する:
- GDO用: JIS都道府県コード2桁（東京都→`13`は確認済み）
- 楽天GORA用: ローマ字スラッグ（東京都→`tokyo`は確認済み）
- じゃらんゴルフ用: 地方スラッグ + 都道府県スラッグのペア（東京都→`{ region: "kanto", prefecture: "tokyo" }`と推定。北海道など地方に属さない都道府県は`region: null`とし`https://golf-jalan.net/course/{prefecture}/`の形になる。東京都の実URLは未確認のため、Task 12で`kanto/tokyo`か`tokyo`単独かを確認し、誤っていれば修正する）

- [ ] **Step 2: GDOの`listCourseUrls`を実装する**

`https://reserve.golfdigest.co.jp/course-guide/area/{code}/`を取得し、`"url":"(https:\/\/reserve\.golfdigest\.co\.jp\/golf-course\/\d+\/course-info\/)"`にマッチする箇所をHTML全体から正規表現で抽出・重複排除する（JSON-LDの厳密なパースはせず、URLパターンの正規表現マッチのみで抽出する。DOM構造やJSON構造が変わっても壊れにくくするため）

- [ ] **Step 3: 楽天GORAの`listCourseUrls`を実装する**

`https://gora.golf.rakuten.co.jp/doc/area/{slug}/`を取得し、`data-course-id="(\d+)"`にマッチするIDを全て抽出し、それぞれ`https://booking.gora.golf.rakuten.co.jp/guide/course_info/disp/c_id/{id}`のURLを組み立てる

- [ ] **Step 4: じゃらんゴルフの`listCourseUrls`を実装する**

`https://golf-jalan.net/course/{region}/{prefecture}/`（または`region`が無い都道府県は`https://golf-jalan.net/course/{prefecture}/`）を取得し、`https:\/\/golf-jalan\.net\/(gc\d+)\/`にマッチするコースコードを重複排除して抽出し、それぞれ`https://golf-jalan.net/{code}/detail/`のURLを組み立てる

- [ ] **Step 5: フィクスチャに対するテストを書く**

3サイトとも、`area-tokyo.txt`フィクスチャから赤羽ゴルフ倶楽部の詳細ページURL（GDO: `.../golf-course/360101/course-info/`、楽天GORA: `.../c_id/130001`、じゃらんゴルフ: `.../gc00975/detail/`）が抽出できることを確認する

- [ ] **Step 6: `npm run test`と`tsc --noEmit`を実行し全て通ることを確認する**

- [ ] **Step 7: Commit**

```bash
git add golf-web/src/lib/scraping/prefectureSlug.ts golf-web/src/lib/scraping/parsers golf-web/src/lib/scraping/__tests__/prefectureSlug.test.ts
git commit -m "feat: 都道府県別コース一覧ページからのURL探索ロジックを追加"
```

---

## Task 10: 対象都道府県の設定ファイルを作成する

**Files:**
- Create: `config/scraping-target-prefectures.json`

- [ ] **Step 1: 中期スコープ（自分・知人が実際にプレーする範囲）の都道府県を設定する**

```json
{
  "prefectures": ["東京都", "神奈川県", "埼玉県", "千葉県"]
}
```

長期的に全国へ拡大する場合はこのリストを拡張するのみで対応できる設計にする（コード変更不要）。

- [ ] **Step 2: Commit**

```bash
git add golf-web/config/scraping-target-prefectures.json
git commit -m "feat: スクレイピング対象都道府県の設定ファイルを追加"
```

---

## Task 11: バッチオーケストレーターを実装する

**Files:**
- Create: `scripts/scrape-golf-courses.ts`

**Interfaces:**
- Consumes: `getParser`（Task 8）、`mergeScrapedCourses`（Task 3）、`ScrapingJobProgress`（Task 1）、`scraping-target-prefectures.json`（Task 10）

- [ ] **Step 1: 都道府県ごとに3サイト独立でコース一覧→詳細取得を行う**

対象都道府県ごとに、3サイトそれぞれで`listCourseUrls(prefecture)`→各URLに対し`fetchCourse`を実行し、`ScrapedCourse[]`（サイト・コース混在）を集める。1回の実行で処理する上限件数（環境変数`SCRAPE_MAX_COURSES_PER_RUN`、デフォルト値を設ける）を超えたら中断し、`ScrapingJobProgress.cursor`に一覧ページの途中位置を保存する

- [ ] **Step 2: マージ＋Upsertを実装する**

集めた`ScrapedCourse[]`を`mergeScrapedCourses`に渡し、コースごとに1件へマージされた結果を`buildMatchKey`で既存の`MstGolfCourse`と突き合わせ、無ければ`create`・あれば`update`する。`MstCourseLayout`/`MstHole`も同様に`upsert`する。`MstGolfCourse.lastScrapedAt`を更新する

- [ ] **Step 3: 再スクレイピング対象の抽出ロジックを実装する**

`lastScrapedAt`が3か月以上前（または`null`）の`MstGolfCourse`を優先的に再スクレイピング対象とするクエリを実装する

- [ ] **Step 4: `npm run test`と`tsc --noEmit`を実行し全て通ることを確認する**

- [ ] **Step 5: ローカルで実際に1回実行してみる**

Run: `cd golf-web && npx tsx scripts/scrape-golf-courses.ts`
Expected: ローカル環境からは3サイトいずれにも到達できずエラーになる可能性が高い（本Planの制約セクション参照）。この時点では「1サイト失敗しても他サイト・全体が落ちない」ことを確認できれば十分とする。実際に取得できてPostgresへ反映されることの確認はTask 12で行う

- [ ] **Step 6: Commit**

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

`deploy.yml`と同様のNode.jsセットアップを踏襲し、`schedule`（例: 毎日1回）と`workflow_dispatch`をトリガーにする。DB接続はマイグレーション用と同じ`DIRECT_URL`系のシークレットを使う

- [ ] **Step 2: `workflow_dispatch`で手動実行し、実際にGDO・楽天GORA・じゃらんゴルフから東京都のコース一覧・詳細が取得できることを確認する**

Expected: 3サイトとも一覧取得・詳細取得が成功する。サイト側のHTML構造が本Planの想定と異なっていた場合は、このステップでパーサーを実データに合わせて修正する

- [ ] **Step 3: 実行後、`MstGolfCourse`にコースが登録され、`MstCourseLayout`（OUT/IN）・`MstHole`（Par/Yard）が保存されていることをDBで確認する**

- [ ] **Step 4: Commit**

```bash
git add golf-web/.github/workflows/scrape-golf-courses.yml
git commit -m "feat: ゴルフ場スクレイピングバッチの定期実行ワークフローを追加"
```

---

## 本Planのスコープ外（フォローアップが必要な項目）

- ShotNavi対応（コース詳細データが複数ページに分割され、URLが規則的でないため取得コストが高く、今回は対象外とした）
- Iceberg（S3/GCP Cloud Storage）へのステージング、DuckDBによる読み取り、BigQuery（golf-db）との連携

## Self-Review Notes

- Spec本文の「データモデル」章（Com/Usrプレフィックス分離）・「保存方式」章のpg_duckdb/pg_lake拡張は撤回済みのため本Planには含めていない
- 当初4サイト対象だったが、ShotNaviはページ分割・URL不規則という固有の実装コストがあるため、費用対効果を鑑みて本Planのスコープから除外した
- 一覧ページの探索（Task 9）は、ユーザーから東京都の実ページ内容を提供してもらいフィクスチャ化した。ただしGDOのJSON-LDは途中で切れた状態で提供されたため、実在確認済みの1件のみを含む形に再構成しており、全件が1ページに収まるか・ページネーションが存在するかはTask 12での実地検証が必要
- じゃらんゴルフの地方/都道府県ネスト構造の不整合（北海道は`/course/hokkaido/`、栃木は`/course/kanto/tochigi/`）は都道府県別マッピングテーブル（Task 9 Step 1）で吸収する設計にした
