# PR確認ポイント検証skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **実装完了後の注記:** Task 3のPR #2実地検証により、本プラン内のSKILL.md雛形（環境準備のポーリング処理、`gh pr edit`の呼び出し方など）は最終版から更新されています。最新の正は `golf-web/.claude/skills/verify-pr-checklist/SKILL.md` を参照してください。

**Goal:** GitHub PRの本文にある「確認ポイント」チェックリストを、Playwright MCPでブラウザ操作しながらAIとユーザーが対話的に消化していく汎用skill（`verify-pr-checklist`）と、golf-webの実態に即した開発ガイド（`CLAUDE.md`）を作成する。

**Architecture:** `golf-web/.claude/skills/verify-pr-checklist/SKILL.md` に技法（Technique）skillとして手順を記述する。skillはPR本文パース→環境準備→定型/主観のハイブリッド検証→結果集計→PR本文更新、の一連の流れを持つ。`golf-web/CLAUDE.md` は実プロジェクト構成に基づく開発ガイドで、このskillへの導線を含む。

**Tech Stack:** Next.js 16 / Prisma 7 / Supabase CLI（ローカル）/ Vitest / gh CLI / Playwright MCP（webapp-testing skill経由）

## Global Constraints

- CLAUDE.mdとSKILL.mdの記述はすべて日本語で書く（`/Users/rinda/.claude/CLAUDE.md` のユーザー設定に従う）
- golf-web固有の情報（PR #2の3項目など）はSKILL.md本体に書かず、CLAUDE.mdまたは実行時の対話に留める（spec「スコープ外」節）
- SKILL.mdのfrontmatterは `name` と `description` を必須とし、`description` は「Use when...」で始まるトリガー条件のみを書く（skill本体の手順を要約しない）
- 参照spec: `golf-web/docs/superpowers/specs/2026-07-02-pr-verify-checklist-skill-design.md`

---

### Task 1: golf-web/CLAUDE.md の作成

**Files:**
- Create: `golf-web/CLAUDE.md`

**Interfaces:**
- Consumes: なし（このタスクは独立して開始できる）
- Produces: golf-webの開発ガイド。Task 2以降のSKILL.mdから `golf-web/CLAUDE.md` への参照は行わない（SKILL.mdは汎用skillのためgolf-web固有ファイルへの依存を持たせない）。CLAUDE.md側からSKILL.mdへ一文の導線を張る

- [ ] **Step 1: 実際のプロジェクト構成・コマンドを確認する**

以下を実行し、CLAUDE.mdに書く内容の裏付けを取る（このリポジトリで既に確認済みの事実を再確認するステップ）。

```bash
cd /Users/rinda/development/golf-stuff/golf-web
cat package.json
find app src prisma -maxdepth 2 -type d
```

期待される内容（このリポジトリで確認済み）:
- `package.json` の `scripts` は `dev` (`next dev`), `build` (`next build`), `start` (`next start`), `lint` (`next lint`), `test` (`vitest run`) の5つのみ。`check` や `type-check` 等のスクリプトは存在しない
- `app/` は `golf-courses/`, `rounds/`, `_components/`, `api/` を持つNext.js App Router構成
- `src/lib/` に `parsers/`（GDOスコアカードパーサー等）, `metrics/`, `dashboard/`, `db/`, `ui/` がある
- `prisma/schema.prisma` にドメインモデル（`MstUser`, `MstGolfCourse` 等）が定義されている
- ローカルSupabaseは `supabase status` / `supabase start` コマンドで確認・起動できる（`golf-web/` ディレクトリで実行する）

- [ ] **Step 2: golf-web/CLAUDE.md を書く**

以下の内容で作成する。

```markdown
# CLAUDE.md（golf-web）

このファイルは、Claude Code が `golf-web/` ディレクトリ配下で作業する際のガイダンスを提供します。ルートの `../CLAUDE.md` は別プロジェクト向けの記述のため、golf-web で作業する場合はこちらを優先してください。

## プロジェクト概要

golf-web は golf-stuff のWebフロントエンド／APIです。ゴルフラウンドのスコア記録、GDOスコアカードのコピペインポート、ゴルフ場・レイアウト管理を行います。Next.js 16 (App Router) + Prisma 7 + Supabase (PostgreSQL) で構築されています。

## ディレクトリ構成

\`\`\`
golf-web/
├── app/                      # Next.js App Router
│   ├── golf-courses/         # ゴルフ場・レイアウト管理ページ
│   ├── rounds/                # ラウンド記録・GDOインポートページ
│   ├── _components/           # 共有UIコンポーネント（HeaderNav, ScoreGraph等）
│   └── api/                   # APIルート
├── src/
│   └── lib/
│       ├── parsers/            # GDOスコアカードパーサー等
│       ├── metrics/             # スコア指標計算
│       ├── dashboard/           # ダッシュボード用クエリ・集計
│       ├── db/                  # Prismaクライアント
│       └── ui/                  # UI用ユーティリティ
├── prisma/
│   ├── schema.prisma           # DBスキーマ（MstUser, MstGolfCourse等）
│   └── migrations/
└── supabase/                  # ローカルSupabase CLI設定
\`\`\`

## 開発コマンド

\`\`\`bash
npm run dev      # 開発サーバー起動（Next.js, http://localhost:3000）
npm run build    # プロダクションビルド
npm run start    # ビルド済みアプリの起動
npm run lint     # ESLint（next lint）
npm run test     # Vitestで単体テストを実行（vitest run）
\`\`\`

`check` / `type-check` / `check:all` 等のスクリプトはまだ整備されていません。型チェックが必要な場合は `npx tsc --noEmit` を直接実行してください。

## ローカルSupabaseの起動

\`\`\`bash
cd golf-web
supabase status   # 起動状況を確認
supabase start    # 未起動なら起動（初回は時間がかかる）
\`\`\`

`.env.local` に `NEXT_PUBLIC_SUPABASE_URL` / `DATABASE_URL` 等のローカル接続情報が設定されています。

## PRレビューの進め方

PR本文に「確認ポイント」チェックリストがある場合、`verify-pr-checklist` skill（`.claude/skills/verify-pr-checklist/SKILL.md`）を使うと、Playwrightでの動作確認をAIと対話しながら進められます。
```

- [ ] **Step 3: 記述内容が実態と一致しているか確認する**

以下を実行し、Step 2で書いた内容（コマンド一覧・ディレクトリ構成）と差異がないか目視で突き合わせる。

```bash
cd /Users/rinda/development/golf-stuff/golf-web
cat package.json | grep -A 10 '"scripts"'
ls app src prisma
```

期待: Step 2に書いたスクリプト名・ディレクトリ名が全て実際に存在する。差異があればCLAUDE.mdを修正する。

- [ ] **Step 4: Commit**

```bash
cd /Users/rinda/development/golf-stuff
git add golf-web/CLAUDE.md
git commit -m "docs: golf-web用のCLAUDE.mdを追加"
```

---

### Task 2: verify-pr-checklist SKILL.md の初版作成

**Files:**
- Create: `golf-web/.claude/skills/verify-pr-checklist/SKILL.md`

**Interfaces:**
- Consumes: なし
- Produces: `verify-pr-checklist` skill。frontmatterの `name` は `verify-pr-checklist`。本文中で使うコマンド名・手順名（`gh pr view`, `gh pr edit`, Playwright MCPツール名）はTask 3の検証で実際に呼び出す

- [ ] **Step 1: skillディレクトリを作成する**

```bash
mkdir -p /Users/rinda/development/golf-stuff/golf-web/.claude/skills/verify-pr-checklist
```

- [ ] **Step 2: SKILL.md を書く**

`golf-web/.claude/skills/verify-pr-checklist/SKILL.md` を以下の内容で作成する。

```markdown
---
name: verify-pr-checklist
description: Use when a GitHub PR body contains a checkbox checklist of confirmation points (確認ポイント) that need manual verification against a running web app, and you want to walk through them interactively with the user using browser automation
---

# PR確認ポイント検証

## Overview

GitHub PRの本文にある「確認ポイント」チェックリスト（`- [ ]` 形式）を、Playwright MCPでブラウザを操作しながら1件ずつ検証し、ユーザーと対話的にチェックを消化していく。定型的な動作確認はAIが自動実行し、見た目・デザインなど主観的な判断が必要な項目はユーザーに委ねるハイブリッド方式を取る。

**REQUIRED SUB-SKILL:** ブラウザ操作には `webapp-testing` skill（Playwright MCP）を使う。

## When to Use

- PR本文に `## 確認ポイント` のようなチェックリスト見出しがあり、実際にアプリを動かして確認する必要がある
- レビュー前後に「このPRの変更が動くこと」をユーザーと一緒に確認したい

見出しが無い、あるいはチェックリスト形式でない場合はこのskillの対象外。ユーザーに確認項目を直接聞くところから始める。

## 手順

### 1. 確認ポイントの取得

\`\`\`bash
gh pr view <PR番号> --json body --jq .body
\`\`\`

本文から `## 確認ポイント`（表記ゆれ: `確認ポイント`, `Checklist`, `Review points` 等も許容）見出し配下の `- [ ]` 行を抽出する。見出しが見つからない場合は、ユーザーに「確認したいポイントを列挙してください」と聞く。

### 2. 環境準備

以下を順に確認し、未起動なら起動する。

\`\`\`bash
# devサーバーが応答するか確認（例: Next.jsなら3000番）
curl -sf http://localhost:3000 > /dev/null || (npm run dev &)

# ローカルSupabaseの状態確認
supabase status || supabase start
\`\`\`

起動待ちはポーリングで確認し、固定sleepに頼らない。

### 3. 確認ポイントの分類

各確認ポイントの文言を読み、次のいずれかに分類する。迷ったら「主観・見た目系」に倒す。

| 分類 | 特徴・文言の例 | 対応 |
|---|---|---|
| 定型・機能系 | 「〜が動作する」「〜がある」「〜を押すと〜になる」 | AIがPlaywrightで操作・アサーションまで実行し、結果を提示して軽い最終確認のみ求める |
| 主観・見た目系 | 「デザインが統一されている」「レイアウトが崩れていない」 | AIは対象ページを巡回してスクリーンショットを撮るところまで行い、判断はユーザーに委ねる |

### 4. 各ポイントの検証

**定型・機能系の例:**
1. 対象ページにPlaywright MCPで遷移する
2. 確認ポイントが指す操作（フォーム入力・クリック・保存など）を実行する
3. DOM状態（要素の存在・テキスト）とコンソールエラーの有無を確認する
4. スクリーンショットを撮り、「◯◯の結果、△△を確認しました。問題なければ次へ進みます」とユーザーに一言確認する

**主観・見た目系の例:**
1. 対象ページ群にPlaywright MCPで遷移し、それぞれスクリーンショットを撮る
2. 撮影結果をユーザーに提示し、「これらのページのデザインを見て問題ないか判断してください」と依頼する
3. ユーザーの回答（OK/NG）を記録する

### 5. NG時の扱い

1件NGが出ても検証フローは中断せず、NGの詳細（理由・再現手順）をその場で記録し、残りの確認ポイントの検証を継続する。全項目が終わった時点でNG項目をまとめて報告する。

### 6. 結果の集計とPR更新

全項目の検証が終わったら、OKだった項目のみPR本文の `- [ ]` を `- [x]` に変更する。

\`\`\`bash
gh pr edit <PR番号> --body "<更新後の本文>"
\`\`\`

NG項目のチェックは付けない。

### 7. 最終レポート

以下の形式でチャットに報告する。

\`\`\`
## PR #<番号> 確認結果

✅ <確認ポイント1>
   - 操作: <実施した操作>
   - 結果: <確認できたこと>

⚠️ <確認ポイント2>（ユーザー確認）
   - スクリーンショット: <撮影したページ>
   - ユーザー確認: OK

❌ <確認ポイント3>
   - 詳細: <NGの理由・再現手順>
\`\`\`

## Common Mistakes

- 確認ポイントの分類を省略し、主観的な項目までAIだけで「OK」と判定してしまう → 必ずユーザーに判断してもらう
- 環境未起動のままPlaywrightを実行してタイムアウトする → 手順2の環境準備を必ず先に行う
- NG項目が出た時点でフロー全体を止めてしまう → 残りの項目の検証は続行する
```

- [ ] **Step 3: Commit**

```bash
cd /Users/rinda/development/golf-stuff
git add golf-web/.claude/skills/verify-pr-checklist/SKILL.md
git commit -m "feat: verify-pr-checklist skillの初版を追加"
```

---

### Task 3: PR #2に対する実適用テスト（Technique skillの検証）

このタスクは `superpowers:writing-skills` が定めるTechnique skillの検証（application scenario）にあたる。Task 2で書いたSKILL.mdの手順を、実際にPR #2に対して一度通しで実行し、手順の欠落やずれを見つけて修正する。

**Files:**
- Modify: `golf-web/.claude/skills/verify-pr-checklist/SKILL.md`（Step 3で見つかったギャップを反映）

**Interfaces:**
- Consumes: Task 1で作成した `golf-web/CLAUDE.md`（開発コマンドの参照元）、Task 2で作成した `SKILL.md` の手順
- Produces: 実際に動作確認済みのSKILL.md。PR #2の本文チェックボックスが更新された状態（該当する場合）

- [ ] **Step 1: SKILL.mdの手順1（確認ポイント取得）を実行する**

```bash
gh pr view 2 --json body --jq .body
```

期待: 本文中の「## 確認ポイント」見出し配下から次の3項目が抽出できること。
- `/rounds/import` でスコアインポートが動作する
- 全ページのデザインが統一されている
- `/rounds/[id]/holes` に「GDOで上書き」ボタンがある

抽出できない場合はSKILL.mdの正規表現・見出し表記の許容範囲の記述を見直す。

- [ ] **Step 2: SKILL.mdの手順2（環境準備）を実行する**

```bash
cd /Users/rinda/development/golf-stuff/golf-web
curl -sf http://localhost:3000 > /dev/null || npm run dev &
supabase status
```

期待: devサーバーとSupabaseが起動していることを確認できる。応答がない場合は起動し、`curl -sf http://localhost:3000` が成功するまで待つ。

- [ ] **Step 3: 3項目を分類する**

SKILL.mdの分類表に従い、以下のように分類されることを確認する。
- 「`/rounds/import` でスコアインポートが動作する」→ 定型・機能系
- 「全ページのデザインが統一されている」→ 主観・見た目系
- 「`/rounds/[id]/holes` に「GDOで上書き」ボタンがある」→ 定型・機能系（存在確認は機械的に判定可能）

分類結果が直感と異なる場合、SKILL.mdの分類基準の文言を調整する。

- [ ] **Step 4: 定型・機能系の1項目をPlaywright MCPで実際に検証する**

`webapp-testing` skillを使い、`/rounds/import` に遷移してゴルフ場・レイアウトを選択し、GDOテキストを貼り付けてパース、インポートを実行する。`golf-web/app/rounds/import/ImportForm.tsx` のUI（本文で確認済み: コース選択→レイアウト選択→プレー日→GDOテキスト貼付→パース→プレビュー→インポート）に沿って操作する。

期待: パースが成功しプレビューが表示され、インポート実行後にエラーなく遷移すること。もし手順が足りず操作に迷う箇所があれば、SKILL.mdの「4. 各ポイントの検証」に具体的なヒント（例: テキストエリアのplaceholder形式に合わせたサンプルデータの用意）を追記する。

- [ ] **Step 5: 主観・見た目系の1項目をSKILL.mdの手順で検証する**

`golf-web/app/rounds/page.tsx`, `golf-web/app/golf-courses/page.tsx` など主要ページを巡回してスクリーンショットを撮り、ユーザーに「デザインが統一されているか」を確認してもらう。

期待: ユーザーからOK/NGの回答が得られる。回答が得られるまでの提示の仕方（スクリーンショットの並べ方など）で改善点があればSKILL.mdに反映する。

- [ ] **Step 6: NG項目が出た場合の記録フォーマットを試す**

「`/rounds/[id]/holes` に「GDOで上書き」ボタンがある」の検証中、意図的に失敗ケース（例: ボタン押下後のページ）も一度確認し、NGだった場合の記録（理由・再現手順）をSKILL.mdのフォーマット通りに書けるか確認する。実際にNGが出なければ、この確認は省略可（3項目とも既存実装で正しく動作する想定のため）。

- [ ] **Step 7: 結果集計・PR本文更新を実行する**

全項目がOKだった場合、SKILL.mdの手順6に従いPR本文を更新する。

```bash
gh pr edit 2 --body "<更新後の本文（OK項目のみ- [x]に変更）>"
```

- [ ] **Step 8: 最終レポートを手順7のフォーマットで出力する**

このタスクの実行結果を、SKILL.mdの「7. 最終レポート」フォーマットに従ってユーザーに提示する。

- [ ] **Step 9: Step 1〜8で見つかったギャップをSKILL.mdに反映する**

実行中に手順が曖昧だった箇所、コマンドが実態と違った箇所（例: devサーバーのポート番号、Playwright MCPの具体的なツール呼び出し方）があれば `golf-web/.claude/skills/verify-pr-checklist/SKILL.md` を修正する。

- [ ] **Step 10: Commit**

```bash
cd /Users/rinda/development/golf-stuff
git add golf-web/.claude/skills/verify-pr-checklist/SKILL.md
git commit -m "fix: PR #2での実行結果を踏まえてverify-pr-checklist skillを調整"
```

---

## Self-Review Notes

- **Spec coverage:** spec記載の全ステップ（PR本文パース、環境準備、ハイブリッド分類、Playwright検証、NG時継続、PR本文更新、最終レポート）はSKILL.mdの手順1〜7に対応。CLAUDE.mdの内容（プロジェクト概要・コマンド・Supabase起動・skill導線）はTask 1でカバー。
- **Placeholder scan:** `<PR番号>`, `<更新後の本文>` 等はテンプレート内のプレースホルダーであり、実行時に実値へ置き換わる想定のため許容（SKILL.md自体が汎用テンプレートとして機能する設計）。具体的な実行例はTask 3でPR #2の実値を使って検証する。
- **Type consistency:** 本プランはコードのインターフェースを持たないドキュメント作成タスクのため、型定義の整合性チェックは対象外。
