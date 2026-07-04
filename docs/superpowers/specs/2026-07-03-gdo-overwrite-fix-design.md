# 「GDOで上書き」機能修正 Design Doc

**対象:** `golf-web/app/rounds/import/page.tsx`, `golf-web/app/rounds/import/ImportForm.tsx`, `golf-web/app/rounds/import/actions.ts`

**背景:** PR #2のレビューで発見した不具合。`/rounds/[roundId]/holes` の「GDOで上書き」ボタンは `/rounds/import?roundId=xxx` に遷移するが、`roundId` が実装側で一切参照されておらず、常に新規ラウンドが作成されてしまう（既存ラウンドは変更されないまま、重複ラウンドが増える）。

## 現状の問題箇所

- `page.tsx` が `searchParams` を受け取っていない
- `actions.ts` の `importGdoScore` が常に `prisma.trnRound.create` を実行し、既存ラウンドを更新する経路が無い

## 修正方針

### 1. `page.tsx` — 上書きモードの判定

`searchParams.roundId` を受け取り、指定があれば該当ラウンドを以下を含めて取得する:

- `golfCourse`（`name`）
- `golfCourse.layouts`（`id`, `name`, `holeCount`）— そのゴルフ場の**全レイアウト**（既存結果の有無に関わらず全件。まだ結果が無いレイアウトもこのボタンから追加インポートできるようにする）
- `playedAt`

ラウンドが見つかった場合、`ImportForm` に `existingRound={{ id, golfCourseId, golfCourseName, playedAt }}` のような固定情報を渡す。見つからない場合（不正な `roundId` 等）は通常の新規作成モードにフォールバックする。

### 2. `ImportForm.tsx` — 上書きモードのUI

`existingRound` prop の有無で分岐する:

- **上書きモード（`existingRound` あり）:**
  - ゴルフ場名・プレー日はテキスト表示のみ（`courseId` / `playedAt` の state は `existingRound` の値で初期化し、以後変更不可＝input/selectを描画しない）
  - コース（OUT/IN）選択は表示する。選択肢は `existingRound.golfCourseId` に紐づく全レイアウト
  - 「2. GDOスコアカードを貼り付け」以降は現状と同じ
  - 「インポート」ボタンのラベルは「上書き保存」に変更する
- **新規作成モード（`existingRound` なし）:** 現状の挙動を維持（ゴルフ場・コース・日付をすべて選択）

### 3. `actions.ts` — upsertによる更新

`importGdoScore` の入力に `roundId?: string` を追加する。

```ts
export type ImportScoreInput = {
  roundId?: string        // 追加：指定時は上書きモード
  golfCourseId: string
  layoutId: string
  playedAt: string
  scores: { holeNumber: number; stroke: number; putt: number | null }[]
}
```

処理分岐:

- **`roundId` が無い場合（新規作成）:** 現状通り `trnRound.create` → `trnRoundHoleResult.createMany`
- **`roundId` がある場合（上書き）:**
  - `trnRound.create` はスキップし、既存の `roundId` をそのまま使う（`page.tsx` が事前にラウンドの存在を確認済みのため、action側での追加検証は行わない）
  - 各ホールについて `trnRoundHoleResult.upsert`（`where: { roundId_holeId: { roundId, holeId } }`）を実行:
    - `update: { stroke, putt }` — **`stroke` と `putt` のみ更新**。`shortGame` / `fairwayKeep` / `secondShotOk` / `greenBunker` / `fairwayBunker` / `penalty` など、GDOインポートに含まれない手動入力項目は更新句に含めず温存する
    - `create: { roundId, holeId, stroke, putt, penalty: 0 }` — 新規作成時（そのホールがまだ無い場合）は現状の新規作成ロジックと同じデフォルト
  - `redirect` 先は `/rounds/${roundId}/holes`（新規ラウンドを作らないため、遷移先IDは入力の `roundId` そのもの）

## データフロー図（上書き時）

```
[ホール入力ページ] --GDOで上書きボタン--> [/rounds/import?roundId=xxx]
  → page.tsx: roundId から既存ラウンド取得（ゴルフ場名・日付・全レイアウト）
  → ImportForm: ゴルフ場名/日付は固定表示、レイアウトのみ選択
  → GDOスコア貼り付け・パース（既存ロジックのまま）
  → 「上書き保存」→ importGdoScore({ roundId, golfCourseId, layoutId, playedAt, scores })
  → 各ホールを upsert（stroke/puttのみ更新、他項目は温存）
  → /rounds/xxx/holes にリダイレクト（同じラウンド）
```

## エラーハンドリング

- `roundId` が指定されているが該当ラウンドが存在しない場合: 新規作成モードにフォールバックする（エラー画面は出さない）
- レイアウトにホールが未登録の場合のエラーメッセージ（`「先にホール情報を登録してください」`）は現状のまま維持

## ファイル変更

| ファイル | 変更内容 |
|---------|---------|
| `golf-web/app/rounds/import/page.tsx` | `searchParams.roundId` 読み取り、既存ラウンド取得、`ImportForm` に渡す |
| `golf-web/app/rounds/import/ImportForm.tsx` | `existingRound` prop 追加、上書きモードのUI分岐、ボタンラベル変更 |
| `golf-web/app/rounds/import/actions.ts` | `roundId` 受け取り、upsertによる分岐処理 |

## テスト

`actions.ts` はDBアクセスを伴うサーバーアクションであり、既存コードでも同種の関数に自動テストは無い（`parsers/` 等の純粋関数のみテスト対象）。本修正も同様の方針とし、`verify` skillを用いた実機確認（上書き前後でラウンド件数・手動入力項目が維持されることをDBで確認）で検証する。
