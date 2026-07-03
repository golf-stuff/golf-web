# 本番環境構築（中期フェーズ）Design Doc

## 背景・目的

現状、golf-webはローカルDocker（PostgreSQL）でのみ動作しており、本番/開発環境の分離ができていない。以下の3フェーズを見据え、まず中期フェーズ（自分のPC外・スマホからアクセス可能にする）の本番環境を設計する。

- **短期（済）**：自分だけが使えればよい。ローカル完結。
- **中期（〜9月、本specの対象）**：スマホ等、自分のPC外からアクセス可能に。コストは最小限。
- **長期（今年いっぱい）**：第三者へのサービス提供も視野に入れる。ユーザー管理・課金システムを追加。最大1万DAU程度を想定。コストはCloud Run+Cloud SQL相当まで許容。

## 採用スタック

| 領域 | 選定 | 理由 |
|---|---|---|
| ホスティング | Vercel（Hobby） | Next.jsとの親和性が最も高く、構築コストが最小。無料枠で開始可能 |
| DB / Auth | Supabase Hosted Project（無料枠） | 既存`.env.local`に接続情報の枠があり親和性が高い。Auth機能（SSO含む）も同一プロジェクトで完結する |
| ORM | Prisma v7（`@prisma/adapter-pg`）を継続使用 | 既存コードをそのまま活かせる。PostgreSQL準拠のため将来Cloud SQLへ移行する場合もスキーマ資産を再利用できる |
| マイグレーション実行 | GitHub Actions（`prisma migrate deploy`） | 開発中はスキーマ変更が頻繁にあるため、手動実行ではなく自動化する |

## 環境構成（2環境）

```
[開発環境]                          [本番環境]
ローカルSupabase CLI                Vercel (Next.js)
 (supabase start)                        │
  ├─ PostgreSQL (Docker内部)              │
  ├─ Auth (ローカルエミュレータ)           ▼
  └─ Studio UI                    Supabase Hosted Project
      │                            ├─ PostgreSQL
      ▼                            ├─ Auth（メール+パスワード / Google SSO / X SSO）
  npm run dev                      └─ Studio（ダッシュボード）
  (localhost:3000)                        ▲
                                    GitHub Actions
                                    (migrate → deploy hook)
```

- **開発環境**：`supabase start`によるローカルエミュレータ（DB + Auth + Studio）に一本化する。既存の`docker-compose.yml`（素のPostgres）は撤去する。
- **本番環境**：Supabase Hosted Project + Vercel。
- **データ移行**：既存のローカルDocker上のラウンドデータ（テストデータ）は本番へ引き継がない。本番はゼロから運用開始する。

## 環境変数の管理方針

変数名（`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`等）はローカル・本番で共通。値は環境ごとに異なり、以下のように**自動的に**（手動切り替えなしで）解決される。

| 実行場所 | 読み込み元 | 手動操作 |
|---|---|---|
| ローカル（`npm run dev`） | `.env.local`（Git管理外） | 不要（Next.jsが起動時に自動読み込み） |
| Vercel（本番アプリ） | Vercelダッシュボードに事前登録した値 | 初回のみダッシュボードで設定。以降は`git push`のたびに自動使用 |
| GitHub Actions（マイグレーション） | GitHub Actions Secrets | 初回のみSecretsに登録。以降は`push`のたびに自動注入 |

`.env.local`は`.gitignore`済みでVercelにアップロードされないため、本番アプリが誤ってローカル値を参照することはない。

### Prismaの接続方式（2種類のURLが必要）

- **`DATABASE_URL`**：Vercel実行時に使用。SupabaseのPooler接続（PgBouncer, port 6543, Transaction mode）。サーバーレス環境でのコネクション枯渇を防ぐ。
- **`DIRECT_URL`**：`prisma migrate deploy`実行時に使用。SupabaseのDirect接続（port 5432）。Poolerではマイグレーションできないため必須。
- `schema.prisma`の`datasource`ブロックに`directUrl`を追加する。

## マイグレーション自動化（GitHub Actions）

開発中はスキーマ変更が頻繁に発生するため、手動での`prisma migrate deploy`実行はコストが高いと判断し、GitHub Actionsで自動化する。

```
git push (main)
   │
   ├─→ GitHub Actions
   │     ├─ npx prisma migrate deploy
   │     │   （DIRECT_URLはGitHub Secretsから注入）
   │     └─ 成功後、Vercel Deploy Hookを叩く
   │
   └─→ Vercel（Deploy Hook経由でビルド・デプロイ）
```

- Vercel側の「Git連携による自動デプロイ」はOFFにし、代わりに「Deploy Hook」（URLを叩くとデプロイされる仕組み）を発行してGitHub Actionsから呼び出す。
- これにより「マイグレーション成功後にのみデプロイが走る」順序を保証する。
- 秘匿情報（`DIRECT_URL`等）はGitHub Actions Secretsに保存し、平文でファイルに残さない。ログにも自動でマスクされる。

## 認証・認可の設計

### 認証方式

Supabase Authを採用する（DBと同一プロジェクトで完結し、追加ベンダー不要）。以下を組み合わせる。

- メールアドレス＋パスワード
- Google SSO（OAuth）
- X（Twitter）SSO（OAuth）

SSOプロバイダーの有効化はSupabaseダッシュボードでの設定＋各プロバイダー側（Google Cloud Console / X Developer Portal）でのOAuthクライアント登録が必要。アプリ側は`supabase.auth.signInWithOAuth({ provider: 'google' })`等の呼び出しを追加するのみで、スクラッチ実装は発生しない。

### サインアップ制御（中期フェーズ）

自分専用の利用だが、Vercelで一般公開されるため、サインアップUIは実装しない。自分のアカウントはSupabaseダッシュボードから手動作成する。長期フェーズで第三者提供する際に、正式なサインアップUIを実装する。

### ログインフロー

```
未ログイン → /login にリダイレクト（Next.js Middleware）
  → メール+パスワード or Google/X SSOでログイン
  → セッションCookie発行 → 以降のページ・Server Actionで検証
```

### userIdの扱い

現状、以下の箇所で`userId: "dummy-user"`がハードコードされている。

- `app/golf-courses/actions.ts`
- `app/rounds/actions.ts`
- `app/rounds/import/actions.ts`

これらをログイン中ユーザーのSupabase Auth UIDに置き換える。`MstUser.id`としてSupabase Auth UIDをそのまま利用し、初回ログイン時に対応する`MstUser`レコードが無ければ自動作成する。

また、`src/lib/dashboard/queries.ts`の`fetchRoundSummaries()`には現状`userId`によるフィルタが一切存在せず、認可漏れとなっている。ログイン中ユーザーのデータのみに絞り込む修正が必要。

### 認可の担保方法

Prismaクエリの`where`句に必ず`userId: currentUser.id`を付与する運用とする（アプリ層制御）。共通ヘルパー`getCurrentUser()`を`src/lib/auth/`に新設し、Server Component/Server Actionで使い回す。

Supabase RLS（Row Level Security）はPrismaが直接DB接続するため自動適用されない。中期フェーズではアプリ層制御のみとし、DB層のRLSは長期フェーズでの多層防御として検討する（本specでは実装しない）。

## 長期フェーズを見据えた備考（本specでは実装しない）

| 項目 | 中期での状態 | 長期での対応方針 |
|---|---|---|
| マルチユーザー化 | Supabase Authでログイン1人分のみ運用（サインアップ不可） | サインアップUI追加＋招待制/課金プラン紐付け |
| データ分離 | アプリ層（Prismaクエリの`where userId`）で担保 | Supabase RLSをDB層に追加し、多層防御にする |
| 秘匿情報管理 | GitHub Actions Secrets | ローカルはmacOS Keychain、リモートはGCP Secret Manager等へ移行検討 |
| インフラ | Vercel + Supabase Hosted | 規模次第でCloud Run + Cloud SQLへの載せ替えも選択肢（Prisma+PostgreSQL統一のため移行コストは低い） |
| 課金 | 未対応 | Stripe等の決済導入、プラン管理テーブルの追加 |

## スコープ外（本specで扱わないこと）

- 既存ローカルデータの本番への移行
- Supabase RLSポリシーの実装
- 課金・プラン管理機能
- BigQuery連携の本番運用（現状の日次バッチ構想は別spec）
- サインアップUIの実装
