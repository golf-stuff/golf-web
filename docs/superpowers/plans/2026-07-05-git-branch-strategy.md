# Gitブランチ戦略再設計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `develop` ブランチを導入し、`feature/* → develop → main` の運用フローをドキュメント（CLAUDE.md・verify-pr-checklist skill）に反映することで、本番デプロイ（`main`へのpush起点）の頻度を下げる。

**Architecture:** 本タスクはコード変更を伴わない。(1) リモートに `develop` ブランチを作成する git 操作、(2) `golf-web/CLAUDE.md` へのブランチ運用ルールの追記、(3) `.claude/skills/verify-pr-checklist/SKILL.md` への軽微な注意書き追加、の3つで構成される。

**Tech Stack:** Git, Markdown, GitHub CLI (`gh`)

## Global Constraints

- 本番へのデプロイトリガーは既存どおり `main` へのpushのみ（`.github/workflows/deploy.yml` は変更しない）
- `develop` 用のステージングDB・Vercel Preview環境は今回は構築しない（スコープ外）
- CI（lint/test自動実行ワークフロー）の新設は今回のスコープに含めない
- ドキュメントの更新内容は `docs/superpowers/specs/2026-07-05-git-branch-strategy-design.md` の記述と一致させること

---

### Task 1: `develop` ブランチの作成

**Files:**
- なし（gitのリモートブランチ操作のみ）

**Interfaces:**
- Consumes: なし
- Produces: リモートに存在する `develop` ブランチ（Task 2・3のドキュメント記述が参照する前提条件）

- [x] **Step 1: 最新の `main` を取得する**

```bash
git fetch origin main
```

Expected: エラーなく完了する

- [x] **Step 2: `origin/main` を起点に `develop` ブランチを作成しリモートにpushする**

```bash
git branch develop origin/main
git push -u origin develop
```

Expected: `remote: Create a pull request for 'develop' on GitHub by visiting:` のようなメッセージ、または単に `* [new branch] develop -> develop` が表示され、pushが成功する

**このステップはリモートリポジトリに新しいブランチを作成する操作です。実行前に必ずユーザーに実行してよいか確認してください。**

- [x] **Step 3: GitHubリポジトリのデフォルトブランチを確認する**

```bash
gh repo view --json defaultBranchRef --jq .defaultBranchRef.name
```

Expected: `main`（今回のスコープではデフォルトブランチは `main` のまま変更しない。`develop` はPRのマージ先を手動で選択する運用とする）

---

### Task 2: `CLAUDE.md`（golf-web）にブランチ戦略セクションを追加する

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Task 1で作成した `develop` ブランチの存在
- Produces: 「## ブランチ戦略」セクションを含む更新済み `CLAUDE.md`（Task 3の内容と整合させる）

現状の `CLAUDE.md` には「## デプロイ」セクション（71行目付近）はあるが、ブランチ運用に関するセクションは存在しない（`main`への直接push禁止等のルールはユーザーのグローバル `~/.claude/CLAUDE.md` にのみ記載されている）。プロジェクト固有のブランチ運用ルールとして、golf-web の `CLAUDE.md` に新規セクションを追加する。

- [x] **Step 1: `CLAUDE.md` の「## デプロイ」セクションの直後に「## ブランチ戦略」セクションを追加する**

`CLAUDE.md` の76行目（「詳細は commit `1a44f67` 参照）。」の行）の直後、かつ「## 計画（plans）に沿った作業」セクション（78行目）の直前に、以下の内容を挿入する。

```markdown

## ブランチ戦略

本番デプロイの頻度を抑えるため、以下のブランチフローで運用します。

```
main        ← 本番ブランチ（Vercelデプロイ・DBマイグレーションの起点）
  ↑ PR（手動・任意タイミング）
develop     ← 開発統合ブランチ（デプロイ・マイグレーションは発生しない）
  ↑ PR（レビューは任意）
feature/*   ← 個々の作業ブランチ（developから作成）
```

- 新規作業は `develop` から `feature/*` を切って開発し、`develop` へPRを作成してマージする（レビュー必須ではない）
- `develop` → `main` のマージは、変更が溜まった段階で開発者が任意のタイミングで判断し、PRを作成する
- `main` への直接pushは行わない
- ブランチ作成後、並列作業を行う場合はスキル `/using-git-worktrees` を使ってworktree分離を行う
- `develop` 上の動作確認は各自ローカルの `supabase start` によるSupabaseエミュレータで行う（`develop` 専用のステージングDB・Vercel Preview環境は現時点では用意していない）
```

- [x] **Step 2: 追記した内容が既存の記述と重複・矛盾していないか確認する**

```bash
grep -n "^## " CLAUDE.md
```

Expected: 出力に「## ブランチ戦略」が「## デプロイ」の直後、「## 計画（plans）に沿った作業」の直前に1回だけ現れる。他の見出しは既存のまま変化しない。

- [x] **Step 3: 挿入したMarkdownのコードブロックがGitHub上で正しくレンダリングされる構造になっているか確認する**

```bash
sed -n '/^## ブランチ戦略/,/^## 計画/p' CLAUDE.md
```

Expected: 開始のトリプルバッククォート（```` ``` ````）と終了のトリプルバッククォートが1対1で対応しており、コードブロックが正しく閉じている（出力を目視で確認する）

- [x] **Step 4: コミットする**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.mdにブランチ戦略セクションを追加"
```

---

### Task 3: `verify-pr-checklist` skillにブランチ差異の注意書きを追加する

**Files:**
- Modify: `.claude/skills/verify-pr-checklist/SKILL.md`

**Interfaces:**
- Consumes: Task 2で追加したブランチ戦略（`develop`/`main` の役割の違い）
- Produces: マージ先ブランチによる本番影響の違いを踏まえた `verify-pr-checklist` skill

現状の `SKILL.md` の「### 1. 確認ポイントの取得」セクションは、PRの本文からチェックリストを取得する手順のみを説明しており、マージ先ブランチが `develop` か `main` かによる違いには触れていない。今回の変更は、この違いを明記する軽微な追記のみで、既存の検証フロー（手順2〜8）は変更しない。

- [x] **Step 1: 「### 1. 確認ポイントの取得」セクションの末尾に、マージ先ブランチに関する注意書きを追加する**

`.claude/skills/verify-pr-checklist/SKILL.md` の以下の段落：

```markdown
本文から `## 確認ポイント`（表記ゆれ: `確認ポイント`, `Checklist`, `Review points` 等も許容）見出し配下の `- [ ]` 行を抽出する。見出しが見つからない場合は、ユーザーに「確認したいポイントを列挙してください」と聞く。
```

を、以下に置き換える：

```markdown
本文から `## 確認ポイント`（表記ゆれ: `確認ポイント`, `Checklist`, `Review points` 等も許容）見出し配下の `- [ ]` 行を抽出する。見出しが見つからない場合は、ユーザーに「確認したいポイントを列挙してください」と聞く。

このPRのマージ先ブランチを確認する（`gh pr view <PR番号> --json baseRefName --jq .baseRefName`）。マージ先が `main` の場合は本番デプロイ・本番DBマイグレーションが発生するため、確認ポイントの検証はより慎重に行う。マージ先が `develop` の場合は本番への影響がない検証用ブランチへのマージであるため、通常通りの検証で進めてよい。
```

- [x] **Step 2: 追記内容が既存のMarkdown構造（見出しレベル・箇条書き）を壊していないか確認する**

```bash
grep -n "^#\|^###" .claude/skills/verify-pr-checklist/SKILL.md
```

Expected: 見出し構造（`# PR確認ポイント検証`, `## Overview`, `## When to Use`, `## 手順`, `### 1. 確認ポイントの取得` 〜 `### 8. 最終レポート`, `## Common Mistakes`）が追記前と同じ順序・個数のまま維持されている

- [x] **Step 3: コミットする**

```bash
git add .claude/skills/verify-pr-checklist/SKILL.md
git commit -m "docs: verify-pr-checklist skillにマージ先ブランチの注意書きを追加"
```

---

## Self-Review Notes

- **Spec coverage:** 設計書の「ブランチモデル」「デプロイ・CI」「ドキュメント・skill更新」の各セクションは Task 1〜3 でそれぞれ対応済み。「対象外」セクション（ステージングDB構築・CI追加・deploy.yml変更）はどのタスクにも含めていない。「成功基準」の4項目は Task 1（develop作成）・Task 2（CLAUDE.md明記）・Task 3（skill整合）でカバーしている。
- **Placeholder scan:** 「TBD」「適切に」等の曖昧な表現は使用していない。各Stepに実際のコマンド・Markdown差分を記載済み。
- **Type consistency:** 本計画はコードの型・関数シグネチャを持たないため対象外。ドキュメント間の用語（`develop`, `feature/*`, `main`, ブランチフロー図）は設計書・CLAUDE.md追記・skill追記の3箇所で表記を統一している。
