# ゴルフ場スクレイピング：リポジトリ分離＋Iceberg連携 設計書

## 背景・目的

`docs/superpowers/plans/2026-07-06-golf-course-scraping.md`（実装計画）に基づきスクレイピングバッチ（golf-web内の`scripts/scrape-golf-courses.ts`としてPrisma経由で直接Postgresに書き込む設計）を進める前に、以下の懸念が生じた。

- GDO・楽天GORA・じゃらんゴルフはいずれもスクレイピング行為自体をグレー〜禁止としている可能性が高く、対象URL・頻度・パースロジックがpublicリポジトリのコード・Actionsログとして誰でも閲覧できる状態は、対象サイト運営者に見つかりやすくなるリスクがある
- golf-webリポジトリ自体は、Vercelとの連携上の制約によりprivate化できない

このため、スクレイピング処理を別のprivateリポジトリに分離し、golf-webとはIceberg形式のデータ（GCS上）を介して疎結合に連携する構成に変更する。本設計書はその新アーキテクチャを定義する。

## 対象読者・前提

- `docs/superpowers/specs/2026-07-05-golf-course-scraping-design.md`（2026-07-06追記分を含む）および`docs/superpowers/plans/2026-07-06-golf-course-scraping.md`を前提とする
- 名寄せキー・優先順位マージ（GDO→楽天GORA→じゃらんゴルフ）・対象サイト（ShotNavi除外）等の基本方針は変更しない。変更点は「実装言語」「リポジトリ配置」「golf-webとの連携方式」のみ

## 全体アーキテクチャ

```
[新規private repo: golf-course-scraper (Python)]
  GDO/楽天GORA/じゃらんゴルフをスクレイピング
    ↓ パース・正規化・名寄せマージ・validation
  GCS上にIceberg形式で書き込み（軽量カタログ、新規専用GCPプロジェクト）
    ├─ table: golf_courses_scraped（1ホール1行のフラットテーブル）
    └─ table: scraping_runs（実行ログ：run_id, started_at, finished_at, 対象サイト/都道府県, 件数, status）
  独立したGitHub Actions cronで定期実行

                    ↓ （直接連携なし。golf-webは自分のタイミングでIcebergを読みに行くだけ）

[golf-web (既存public repo, TypeScript)]
  独立したGitHub Actions cronで定期実行（スクレイピングの数時間後を想定）
    1. golf-web Postgres内の状態テーブル（ScrapingIngestState.lastIngestedRunId）を見る
    2. DuckDB（Iceberg拡張、read-only GCSサービスアカウント）でscraping_runsを読み、未取込のrun（status=success）があるか確認。無ければ終了
    3. あればgolf_courses_scrapedから該当run分を読み込み、match_keyでgroup化
    4. MstGolfCourse → MstCourseLayout → MstHoleの順にUpsert、lastScrapedAtを更新
    5. ScrapingIngestState.lastIngestedRunIdを更新
```

**責務分離の狙い:** スクレイピング対象URL・頻度・実装（＝対象サイト運営者に見つかりたくない部分）は完全にprivateリポジトリ内に閉じる。golf-web側はIcebergテーブルを読むだけで、スクレイピング先サイトの情報を一切含まない。

## コンポーネント1: `golf-course-scraper`（新規private repo, Python）

### ディレクトリ構成

```
golf-course-scraper/
├── src/
│   ├── parsers/{gdo,rakuten_gora,jalan_golf}.py   # 詳細ページ・一覧ページのパーサー
│   ├── normalize.py                                 # 住所パース・名寄せキー生成
│   ├── merge.py                                     # サイト優先順位マージ
│   ├── validate.py                                  # コース/レイアウト単位のvalidation
│   ├── iceberg_writer.py                            # pyicebergでのテーブル書き込み
│   └── run.py                                       # オーケストレーター本体
├── config/scraping-target-prefectures.json
├── tests/                                            # フィクスチャベースのユニットテスト
└── .github/workflows/scrape.yml                     # cron + workflow_dispatch
```

golf-webの旧`docs/superpowers/plans/2026-07-06-golf-course-scraping.md`のTask 2〜10相当のロジック（型定義・正規化・マージ・3サイト分のパーサー・一覧探索・対象都道府県設定）を、このリポジトリ内にPythonで再実装する。フィクスチャ（実データベースのテストケース）もこのリポジトリに移設する。

### 実装言語

Python（`pyiceberg`使用）。理由: Node/TypeScriptにはIceberg書き込みに耐える成熟したライブラリが実質的に存在しないため。スクレイピング・パース・マージ・validationも含め、このリポジトリ全体をPythonで統一する。

### Icebergテーブル定義

**`golf_courses_scraped`（1ホール1行のフラットテーブル、Append専用）:**

| カラム | 型 | 説明 |
|---|---|---|
| `run_id` | string | このレコードを生成した実行のID（`scraping_runs.run_id`と対応） |
| `match_key` | string | `buildMatchKey`の結果（正規化済みコース名＋prefecture＋city） |
| `course_name` | string | 採用されたサイトでのコース名（マージ後の値） |
| `prefecture` | string | |
| `city` | string \| null | |
| `source_site` | string | マージで採用されたサイト（`gdo` \| `rakuten_gora` \| `jalan_golf`） |
| `layout_name` | string | `OUT` / `IN` |
| `hole_number` | int | レイアウト内の通し番号（1始まり） |
| `par` | int | |
| `yard_regular` | int | |
| `scraped_at` | timestamp | |

**`scraping_runs`（実行ログ、Append専用）:**

| カラム | 型 | 説明 |
|---|---|---|
| `run_id` | string | UUID |
| `started_at` | timestamp | |
| `finished_at` | timestamp | |
| `status` | string | `success` \| `failed` |
| `target_prefectures` | list<string> | |
| `course_count` | int | マージ後、`golf_courses_scraped`に書き込まれたコース数 |
| `validation_failure_count` | int | レイアウト単位のvalidation失敗件数（後述） |

### 保存先・カタログ

- 新規専用GCPプロジェクトを作成し、GCSバケットにIceberg形式（Parquet + Icebergメタデータ）で書き込む
- カタログは軽量カタログ（GCS上のファイルベース、BigLake Metastore等の常時稼働サービスは使わない）。ストレージ費用のみでほぼ無料
- 将来BigQuery（golf-db）から参照したくなった場合は、`CREATE EXTERNAL TABLE ... OPTIONS (format='ICEBERG', uris=[...metadata.json])`で当時の最新metadata.jsonを指す外部テーブルを作成すれば足り、データの書き直しは不要（本設計のスコープ外）

### 名寄せ・マージ・validationのフロー

1. 都道府県ごとに3サイト独立で一覧→詳細を取得し、サイトごとの`ScrapedCourse`データクラスを生成する
2. 各`ScrapedCourse`に対し**マージ前にvalidationを適用する**（詳細は「Validation仕様」章）。validation失敗（コース単位）はそのサイトのその候補を除外する
3. 残った候補群を`buildMatchKey`でグルーピングし、優先順位（GDO→楽天GORA→じゃらんゴルフ）マージを行う
4. マージ結果を`golf_courses_scraped`にAppendする

### 再開可能なジョブ進捗管理

このリポジトリ内で完結させる（golf-webのPostgresには置かない）。1回の実行での上限件数・失敗時のサイト単位スキップという既存方針を踏襲し、進捗（都道府県・サイトごとの一覧ページカーソル位置）はGCS上の状態ファイル、またはIcebergの別テーブル（`scraping_progress`）として持つ。実装時にどちらが簡潔か判断してよい。

### 認証

GCS書き込み用のwrite-onlyサービスアカウントキーを、このリポジトリのGitHub Secretsにのみ保存する（golf-web側とは別のサービスアカウント）。

### 通知・ログ・dev環境

- **通知:** 新規の連携先（Slack等）は追加しない。GitHub Actions標準の失敗時メール通知のみを使う。成功時はワークフローのJob Summaryに、サイト別取得件数・マージ後コース数・validationスキップ件数を出力する
- **デバッグログ:** GitHub Actionsのartifactとして保存する（デフォルト90日保持）。内容は「サイト・ページ単位の取得成功/失敗一覧」＋「パース失敗時の生HTML」
- **dev環境:** 追加インフラは用意しない。開発者がローカルで`run.py`相当のスクリプトを直接実行し、本番Icebergテーブルには書き込まず、標準出力またはローカルファイルで取得結果を確認する運用とする（サイト仕様変更時の調査・パーサー修正に使う想定）

### Validation仕様

**適用タイミング:** 各サイトのパース結果（`ScrapedCourse`）に対して、名寄せマージの**前**に実施する。validation失敗は「そのサイトにはデータが無かった」として扱い、既存のマージのフォールバック機構（優先サイトに情報が無ければ次点サイトを採用）にそのまま乗せる。

**コース単位のチェック:**

| 項目 | ルール | 失敗時の扱い |
|---|---|---|
| `name` | 非空文字列 | コース全体をそのサイトの候補から除外 |
| `prefecture` | 非null | コース全体をそのサイトの候補から除外 |
| `city` | 非nullを推奨するが必須にはしない | nullの場合は警告ログのみ（除外しない） |
| `layouts` | 最低1件以上 | 0件ならコース全体をそのサイトの候補から除外 |

**レイアウト単位のチェック（1つでも失敗したらコース全体をそのサイトの候補から除外）:**

| 項目 | ルール |
|---|---|
| ホール番号 | `1..holeCount`が重複・欠番なく揃っている |
| `par` | 各ホール 3〜9の範囲内（整数） |
| `yard_regular` | 各ホール 100〜999の範囲内（整数） |

（例: 皐月ゴルフ倶楽部 佐野コースにPar 7・914yardのホールが実在するため、一般的な3〜5・数百yard程度の範囲より広めに設定している）

**失敗の扱いの区別:**

- **コース単位のチェック失敗**（名前・住所が取得できない等）: そのサイト・コースの候補を通常通り除外するのみ。run自体は成功として扱う（サイト側の一覧ページに稀に不完全なエントリがあることは想定内のため）
- **レイアウト単位のチェック失敗**（コース名・住所は取得できたが、ホールのpar/yard等に異常値がある）: パーサーがサイトの仕様変更に追従できていない可能性が高いシグナルとして扱う。該当コースは通常通りマージ候補から除外して処理は継続するが、**run全体の終了時に、レイアウト単位の失敗が1件でもあればスクリプトを非ゼロ終了させ、GitHub Actionsのワークフロー自体を失敗させる**。これにより新規の通知先を増やさずに、既存のGitHub Actions失敗時メール通知の仕組みで検知できるようにする。Job Summary/artifactログには「サイト名・コース名・失敗理由」の一覧を出力し、原因調査を容易にする

**ログ記録:** 失敗したコースごとに「サイト名・コース名/URL・失敗理由（例: `yard_regular=1200 (out of range) at hole 5`）」をdebugログ（Actions artifact）に記録する。

## コンポーネント2: golf-web側 Ingestジョブ

### 新規ファイル

```
scripts/ingest-scraped-courses.ts   # DuckDBでIceberg読み取り→Prisma Upsert
.github/workflows/ingest-scraped-courses.yml   # cron（スクレイピングの数時間後）+ workflow_dispatch
```

### Prismaスキーマへの追加

```prisma
model ScrapingIngestState {
  id                String   @id @default("singleton")
  lastIngestedRunId String?
  updatedAt         DateTime @updatedAt

  @@map("scraping_ingest_state")
}
```

`MstGolfCourse.lastScrapedAt`（`docs/superpowers/plans/2026-07-06-golf-course-scraping.md`のTask 1案）はそのまま踏襲する。旧planのTask 1で予定していた`ScrapingJobProgress`モデルは、進捗管理の責務がスクレイピング側リポジトリに移ったため**golf-web側には作成しない**。

### 処理フロー

1. `ScrapingIngestState`から`lastIngestedRunId`を取得する
2. DuckDB（Iceberg拡張、read-only GCSサービスアカウント）で`scraping_runs`テーブルを読み、`lastIngestedRunId`より新しい`status=success`のrunがあるか確認する。無ければ即終了する（ログのみ）
3. あれば最新runの`golf_courses_scraped`該当行（`run_id`で絞り込み）を読み込み、`match_key`でgroup化する
4. 各グループについて、`MstGolfCourse`を`name`/`prefecture`/`city`で既存突合（無ければ`create`・あれば`update`）→`MstCourseLayout`（`name`で突合）→`MstHole`（`holeNumber`で突合）の順にUpsertし、`MstGolfCourse.lastScrapedAt`を更新する
5. `ScrapingIngestState.lastIngestedRunId`を今回処理したrunのIDに更新する

### 認証

read-onlyのGCSサービスアカウントキーをgolf-webのGitHub Secretsに保存する（スクレイピング側のwrite-onlyキーとは別のサービスアカウント。最小権限の原則）。

### エラーハンドリング

1コースのUpsert失敗が他コースの処理を止めないよう、コース単位でtry/catchしログに記録する（既存のGDOインポート等のバッチ処理パターンを踏襲）。

## 本設計のスコープ外（フォローアップが必要な項目）

- BigQuery（golf-db）からのIcebergテーブル参照（将来必要になった場合、外部テーブル定義を追加するのみで対応可能）
- ShotNavi対応（`docs/superpowers/plans/2026-07-06-golf-course-scraping.md`と同様、対象外のまま）
- スクレイピング側の再開可能なジョブ進捗管理の具体的な実装形式（GCS状態ファイル vs 追加Icebergテーブル）は実装時に判断する

## `docs/superpowers/plans/2026-07-06-golf-course-scraping.md`との差分まとめ

| 旧plan | 新設計 |
|---|---|
| golf-web内`scripts/scrape-golf-courses.ts`（TypeScript） | 新規private repo `golf-course-scraper`（Python） |
| golf-web Postgresへ`Prisma`で直接Upsert | GCS上にIceberg形式で書き込み、golf-web側が別途Ingestジョブで読み取ってUpsert |
| `ScrapingJobProgress`（golf-web Postgres） | スクレイピング側リポジトリ内で進捗管理（形式は実装時に決定） |
| GitHub Actionsは1つ（golf-web内） | GitHub Actionsは2つ（`golf-course-scraper`のscrape.yml、golf-webのingest-scraped-courses.yml）、独立スケジュールで疎結合に連携 |
| 名寄せ・マージロジック（TypeScript） | 同ロジックをPythonで実装（`golf-course-scraper`内） |
| validationの明示的な定義なし | par/yard範囲・ホール番号連番等のvalidationを新規定義。レイアウト単位の失敗はワークフロー失敗として通知 |
