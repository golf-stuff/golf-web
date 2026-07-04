# スコア表デザイン統一 Design Doc

**対象:** `golf-web/app/rounds/[roundId]/holes/page.tsx`

**背景:** PR-A（デザイン統一）では「テーブル内部は最小変更」として意図的にスコープ外にされていた（`docs/superpowers/plans/2026-06-30-pr-a-design-unification.md` 参照）。PR #2のレビューで「ホール入力ページのスコア表だけデザインが浮いている」との指摘を受け、追加対応する。

## 方針（採用案: B）

ブラウザモックアップでA案（`page-card`で各コースセクションを囲む）とB案（カード化せず素のテーブルに枠線のみ）を比較した結果、**B案**を採用する。列数が多い実データ入力表であり、カードの余白よりも情報密度を優先する。

## 変更内容

### 1. グループ背景色の廃止

現状、5グループ（コース情報=グレー / スコア=緑 / スコア分解=黄 / ティーショット=青 / ハザード=赤）に背景色が付いているが、これを廃止する。グループの区切りは太めの縦罫線のみで表現する（現状の `borderRightStrong` の考え方は流用可）。

Result列のスコア別文字色（Bogey=オレンジ、Par=緑、Birdie=青等、`scoreLabel.color` 由来）は変更しない。行全体をスコアに応じて色分けする案は将来検討として保留し、本対応のスコープ外とする。

### 2. テーブルのコンテナ

`page-card` では囲まず、テーブル自体に `border border-gray-200`（Tailwindクラス）を付ける。レイアウト名見出し（「筑波」「IN」等）は `page-subheading` クラスを使う。コース別サマリー行（`スコア X / パット Y / ペナルティ Z`）は `text-xs text-gray-400` 相当のスタイルにする。

### 3. テーブル専用の入力欄スタイル

`globals.css` に以下のクラスを新規追加する（他ページの `.input-underline` は下線スタイルでテーブルの狭いセルには不向きなため、テーブル専用のコンパクトな四角い入力欄スタイルを別途定義する）:

- `.table-input` — 数値入力欄（スコア・ShortGame・Putt・Penalty・GreenBunker・FairwayBunker）。幅を狭く（`width: 100%` かつ親セル側で `max-width` 制御）、`border border-gray-300 rounded`、フォーカス時に `border-gray-900` に変化
- `.table-select` — FW/2nd の `<select>` 用。`.table-input` と揃った見た目（同じ枠線・角丸・パディング）

### 4. 変更しない箇所

- ページ上部の合計サマリー（`page-card`）
- 保存ボタン（`btn-primary`）
- ナビゲーション（`nav-back`）、見出し（`page-heading`）、「GDOで上書き」ボタン（`btn-secondary`）
- テーブルの列構成・データ取得ロジック・`calcHoleMetrics` 等の計算ロジック

## ファイル変更

| ファイル | 変更内容 |
|---------|---------|
| `golf-web/app/globals.css` | `.table-input`, `.table-select` を追加 |
| `golf-web/app/rounds/[roundId]/holes/page.tsx` | インラインスタイル（`baseTh`, `baseTd`, `bgCourse`〜`bgHazard`, `borderRightStrong`）を削除し、Tailwindクラス + 新規テーブル専用クラスに置き換え |

## テスト

スタイルのみの変更でロジックは変わらないため、既存の `npm run test` は影響を受けない想定。目視確認（`/rounds/[roundId]/holes` を実際に開いて表示確認）で検証する。
