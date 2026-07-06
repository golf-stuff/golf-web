# CLAUDE.md（golf-web）

このファイルは、Claude Code が `golf-web/` ディレクトリ配下で作業する際のガイダンスを提供します。ルートの `../CLAUDE.md` は別プロジェクト向けの記述のため、golf-web で作業する場合はこちらを優先してください。

## プロジェクト概要

golf-web は golf-stuff のWebフロントエンド／APIです。ゴルフラウンドのスコア記録、GDOスコアカードのコピペインポート、ゴルフ場・レイアウト管理を行います。Next.js 16 (App Router) + Prisma 7 + Supabase (PostgreSQL) で構築されています。

## ディレクトリ構成

```
golf-web/
├── app/                      # Next.js App Router
│   ├── golf-courses/         # ゴルフ場・レイアウト管理ページ
│   ├── rounds/                # ラウンド記録・GDOインポートページ
│   ├── login/                  # ログインページ（未認証時のリダイレクト先）
│   ├── auth/callback/          # Supabase Authのコールバックルート
│   └── _components/           # 共有UIコンポーネント（HeaderNav, ScoreGraph等）
├── src/
│   └── lib/
│       ├── parsers/            # GDOスコアカードパーサー等
│       ├── metrics/             # スコア指標計算
│       ├── dashboard/           # ダッシュボード用クエリ・集計
│       ├── db/                  # Prismaクライアント
│       ├── supabase/            # Supabaseクライアント（ブラウザ/サーバー用）
│       ├── auth/                # 認証ヘルパー（getCurrentUser()等）
│       └── ui/                  # UI用ユーティリティ
├── middleware.ts              # 全ページのログイン必須化（/login, /auth/callbackを除く）
├── prisma/
│   ├── schema.prisma           # DBスキーマ（MstUser, MstGolfCourse等）
│   └── migrations/
└── supabase/                  # ローカルSupabase CLI設定（config.toml等）
```

本番デプロイ用のCI/CDワークフロー（`.github/workflows/deploy.yml`）は整備済みです。`main`へのpushを契機に`prisma migrate deploy`とVercel Deploy Hookを実行する構成になっています（詳細は「デプロイ」セクション参照）。

## 開発コマンド

```bash
npm run dev      # 開発サーバー起動（Next.js, http://localhost:3000）
npm run build    # プロダクションビルド
npm run start    # ビルド済みアプリの起動
npm run lint     # ESLint（next lint）
npm run test     # Vitestで単体テストを実行（vitest run）
```

`check` / `type-check` / `check:all` 等のスクリプトはまだ整備されていません。型チェックが必要な場合は `npx tsc --noEmit` を直接実行してください。

`postinstall`（`prisma generate`）が自動実行されるため、`npm install`後に手動で`prisma generate`を叩く必要はありません（Vercelビルド時のprisma clientの不整合を防ぐための設定）。

## ローカルSupabaseの起動

```bash
cd golf-web
supabase status   # 起動状況を確認
supabase start    # 未起動なら起動（初回は時間がかかる）
```

`.env.local` に `NEXT_PUBLIC_SUPABASE_URL` / `DATABASE_URL` / `DIRECT_URL` 等のローカル接続情報が設定されています。
`DATABASE_URL` はPooler経由の接続、`DIRECT_URL` はマイグレーション実行用のDirect接続です。用途によって使い分けてください（`prisma migrate` 系コマンドは `DIRECT_URL` を使用します）。

素のPostgresを起動する `docker-compose.yml` は廃止済みです。ローカルのDB／認証は必ず `supabase start` によるSupabase CLIエミュレータを使用してください。

## 認証

- `middleware.ts` により、`/login` と `/auth/callback` を除く全ページでログインが必須になっています。未ログインでアクセスすると `/login` にリダイレクトされます。
- ローカル開発・develop動作確認でログインを試す場合は、[`.claude/rules/test-users.md`](.claude/rules/test-users.md) に定義された一般ユーザー／管理者ユーザーの2パターンを使用してください。Supabase Studio（`supabase start` 実行後にターミナルへ表示されるURL、デフォルトは `http://127.0.0.1:54323`）の「Authentication」→「Users」またはAdmin APIで作成できます。これ以外のテスト用ユーザーを作成した場合は、確認後に削除し、常にこの2パターンのみが残る状態を保ってください。
- サーバーサイドでログインユーザーを取得する場合は `src/lib/auth/getCurrentUser.ts` の `getCurrentUser()` を使用します。Supabase Authのユーザー情報を取得し、`MstUser` テーブルに未登録であれば自動的に作成（upsert相当）してから返します。未ログイン時は `null` を返します。
- Supabaseクライアントの生成は `src/lib/supabase/`（ブラウザ用・サーバー用）に集約されています。新規にSupabaseへアクセスするコードを書く場合はここのクライアントを再利用してください。

## デプロイ

- 本番へのデプロイは `.github/workflows/deploy.yml` により自動化されています。
- フロー: `main` ブランチへのpush → GitHub Actions上で `prisma migrate deploy` を実行しDBマイグレーションを本番反映（`secrets.PROD_DIRECT_URL` を使用）→ `secrets.VERCEL_DEPLOY_HOOK_URL` にPOSTしてVercelデプロイをトリガー。
- `vercel.json` で `git.deploymentEnabled: false` を設定しています。これはVercelのGit連携による自動デプロイ（pushのたびに実行される標準の仕組み）を無効化するためのものです。無効化しないと、GitHub Actions経由のDeploy Hookによるデプロイと、Vercelの自動デプロイが競合してしまいます（詳細は commit `1a44f67` 参照）。
- 手動でマイグレーションを本番適用する場合も、`DIRECT_URL`（Pooler経由ではない直接接続）を使う必要がある点に注意してください。

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
  - `.env.local` は `.gitignore` 対象のため新規worktreeには存在しない。ローカルSupabaseは全worktreeで共有する単一インスタンスなので、コピーではなくシンボリックリンクでメインリポジトリの `.env.local` を参照させる：`ln -s <メインリポジトリ絶対パス>/.env.local .env.local`
- `develop` 上の動作確認は各自ローカルの `supabase start` によるSupabaseエミュレータで行う（`develop` 専用のステージングDB・Vercel Preview環境は現時点では用意していない）
- Claude Code（Web/CLI）が新規セッションで自動生成する作業ブランチも、`main` ではなく `develop` を起点に作成する。セッション開始時点で `main` ベースになっている場合は、作業前に `git fetch origin develop && git checkout -B <ブランチ名> origin/develop` でブランチを作り直してからpushする

## 計画（plans）に沿った作業

- `docs/superpowers/plans/` 配下の計画ファイルは `- [ ]` 形式のチェックボックスでステップを管理しています（`superpowers:executing-plans` または `superpowers:subagent-driven-development` skillを使う前提）。
- これらの計画に沿って作業する場合、各ステップを完了するたびに、計画ファイル自体を編集して該当のチェックボックスに `- [x]` を付けてください。作業ログとして計画ファイルが常に最新の進捗を反映するようにするためです。

## PRレビューの進め方

PR本文に「確認ポイント」チェックリストがある場合、`verify-pr-checklist` skill（`.claude/skills/verify-pr-checklist/SKILL.md`）を使うと、Playwrightでの動作確認をAIと対話しながら進められます。
