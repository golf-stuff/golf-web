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
│   ├── _components/           # 共有UIコンポーネント（HeaderNav, ScoreGraph等）
│   └── api/                   # APIルート
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

本番デプロイ用のCI/CDワークフロー（`.github/workflows/deploy.yml`）は本タスク時点では未整備です。追加され次第、`main`へのpushを契機に`prisma migrate deploy`とVercel Deploy Hookを実行する構成になる予定です（詳細は「デプロイ」セクション参照）。

## 開発コマンド

```bash
npm run dev      # 開発サーバー起動（Next.js, http://localhost:3000）
npm run build    # プロダクションビルド
npm run start    # ビルド済みアプリの起動
npm run lint     # ESLint（next lint）
npm run test     # Vitestで単体テストを実行（vitest run）
```

`check` / `type-check` / `check:all` 等のスクリプトはまだ整備されていません。型チェックが必要な場合は `npx tsc --noEmit` を直接実行してください。

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
- ローカル開発でログインを試す場合は、Supabase Studio（`supabase start` 実行後にターミナルへ表示されるURL、デフォルトは `http://127.0.0.1:54323`）を開き、「Authentication」→「Users」からテストユーザーを作成してください。作成したメールアドレス／パスワードで `/login` からログインできます。
- サーバーサイドでログインユーザーを取得する場合は `src/lib/auth/getCurrentUser.ts` の `getCurrentUser()` を使用します。Supabase Authのユーザー情報を取得し、`MstUser` テーブルに未登録であれば自動的に作成（upsert相当）してから返します。未ログイン時は `null` を返します。
- Supabaseクライアントの生成は `src/lib/supabase/`（ブラウザ用・サーバー用）に集約されています。新規にSupabaseへアクセスするコードを書く場合はここのクライアントを再利用してください。

## デプロイ

- 本番へのデプロイは `.github/workflows/deploy.yml`（Task 10で追加予定、本タスク時点では未作成）による自動化を想定しています。
- 想定フロー: `main` ブランチへのpush → GitHub Actions上で `prisma migrate deploy` を実行しDBマイグレーションを本番反映 → Vercel Deploy Hookを叩いてデプロイをトリガー。
- 手動でマイグレーションを本番適用する場合も、`DIRECT_URL`（Pooler経由ではない直接接続）を使う必要がある点に注意してください。

## PRレビューの進め方

PR本文に「確認ポイント」チェックリストがある場合、`verify-pr-checklist` skill（`.claude/skills/verify-pr-checklist/SKILL.md`）を使うと、Playwrightでの動作確認をAIと対話しながら進められます。
