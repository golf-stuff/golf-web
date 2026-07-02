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
```

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

`.env.local` に `NEXT_PUBLIC_SUPABASE_URL` / `DATABASE_URL` 等のローカル接続情報が設定されています。

## PRレビューの進め方

PR本文に「確認ポイント」チェックリストがある場合、`verify-pr-checklist` skill（`.claude/skills/verify-pr-checklist/SKILL.md`）を使うと、Playwrightでの動作確認をAIと対話しながら進められます。
