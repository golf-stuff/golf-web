# 本番環境構築（中期フェーズ）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** golf-webをVercel + Supabase Hosted構成で本番稼働させ、Supabase Auth（メール+パスワード＋Google/X SSO）によるログイン保護と、ユーザーごとのデータ分離を実現する。

**Architecture:** ローカル開発をSupabase CLI（`supabase start`）に一本化し、PrismaはDirect/Pooler2種類のURLを使い分ける。認証はSupabase Auth + `@supabase/ssr`によるCookieベースセッション。`middleware.ts`で全ページをログイン必須にし、`getCurrentUser()`ヘルパーで取得したuser idを全Server Action・Prismaクエリに伝搬させる。デプロイはGitHub ActionsがPrismaマイグレーションを実行した後、Vercel Deploy Hookを叩く順序を保証する構成。

**Tech Stack:** Next.js 16 App Router、Prisma v7、`@supabase/supabase-js`、`@supabase/ssr`、Supabase CLI、GitHub Actions、Vercel

## Global Constraints

- 変数名はローカル・本番で共通、値のみ異なる（`.env.local`はGit管理外のまま）
- `DATABASE_URL`はSupabase Pooler接続（port 6543, Transaction mode）、`DIRECT_URL`はDirect接続（port 5432、マイグレーション専用）
- サインアップUIは実装しない（本specのスコープ外）。ユーザーはSupabaseダッシュボードから手動作成する
- 認可はアプリ層（Prismaクエリの`where userId`／所有権チェック）で担保する。DB層RLSは実装しない
- 既存ローカルデータは本番へ移行しない
- 既存の`npm run test`（Vitest）が引き続き全て通ること

---

## ファイル構成

| ファイル | 変更内容 |
|---------|---------|
| `golf-web/docker-compose.yml` | 削除（Supabase CLIに一本化するため） |
| `golf-web/supabase/config.toml` | 新規（`supabase init`で生成） |
| `golf-web/prisma/schema.prisma` | `directUrl`を追加 |
| `golf-web/src/lib/supabase/server.ts` | 新規：Server Component/Action用Supabaseクライアント |
| `golf-web/src/lib/supabase/client.ts` | 新規：ブラウザ用Supabaseクライアント |
| `golf-web/src/lib/auth/getCurrentUser.ts` | 新規：ログイン中ユーザー取得＋`MstUser`自動作成 |
| `golf-web/middleware.ts` | 新規：未ログイン時に`/login`へリダイレクト |
| `golf-web/app/login/page.tsx` | 新規：ログインフォーム（メール+パスワード、Google/X SSOボタン） |
| `golf-web/app/login/actions.ts` | 新規：ログイン・ログアウトServer Action |
| `golf-web/app/auth/callback/route.ts` | 新規：OAuthコールバック処理 |
| `golf-web/app/golf-courses/actions.ts` | `dummy-user`をログインユーザーIDに置換 |
| `golf-web/app/rounds/actions.ts` | 同上 |
| `golf-web/app/rounds/import/actions.ts` | 同上 |
| `golf-web/src/lib/dashboard/queries.ts` | `userId`引数を追加してフィルタ |
| `golf-web/app/page.tsx` | `fetchRoundSummaries(userId)`呼び出しに変更 |
| `golf-web/app/rounds/page.tsx` | `userId`でフィルタ |
| `golf-web/app/rounds/new/page.tsx` | `userId`でフィルタ |
| `golf-web/app/rounds/import/page.tsx` | `userId`でフィルタ |
| `golf-web/app/golf-courses/page.tsx` | `userId`でフィルタ |
| `golf-web/app/golf-courses/[golfCourseId]/edit/page.tsx` | 所有権チェック追加 |
| `golf-web/app/golf-courses/[golfCourseId]/layouts/page.tsx` | 所有権チェック追加 |
| `golf-web/app/golf-courses/[golfCourseId]/layouts/[layoutId]/holes/page.tsx` | 所有権チェック追加 |
| `golf-web/app/rounds/[roundId]/holes/page.tsx` | 所有権チェック追加 |
| `.github/workflows/deploy.yml` | 新規：migrate → Vercel Deploy Hook |

---

## Task 1: ローカル開発環境をSupabase CLIに一本化する

**Files:**
- Delete: `golf-web/docker-compose.yml`
- Create: `golf-web/supabase/config.toml`（`supabase init`で自動生成）
- Modify: `golf-web/.env.local`（値のみ、ファイル自体はコミットしない）
- Modify: `golf-web/CLAUDE.md`

**Interfaces:**
- Produces: `supabase start`で起動するローカルDB（`postgresql://postgres:postgres@127.0.0.1:54322/postgres`が既定値）

- [x] **Step 1: 既存コンテナ・ボリュームを止める**

```bash
cd golf-web
docker compose down -v
```

- [x] **Step 2: docker-compose.ymlを削除する**

```bash
git rm docker-compose.yml
```

- [x] **Step 3: supabase initを実行する**

```bash
supabase init
```

Expected: `supabase/config.toml`が生成される（既存の`supabase/.branches`, `supabase/.temp`, `supabase/snippets`はそのまま残る）

- [x] **Step 4: ローカルSupabaseを起動する**

```bash
supabase start
```

Expected: 起動完了後、以下のような出力が表示される
```
         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324
      JWT secret: ...
        anon key: ...
service_role key: ...
```

- [x] **Step 5: .env.localを新しい接続情報に更新する**

`golf-web/.env.local`（既存ファイルを編集。Git管理外なのでコミット不要）:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase start の出力の anon key>
SUPABASE_SERVICE_ROLE_KEY=<supabase start の出力の service_role key>

DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

BQ_PROJECT_ID=（既存の値のまま）
BQ_DATASET=（既存の値のまま）
GOOGLE_APPLICATION_CREDENTIALS=（既存の値のまま）
```

- [x] **Step 6: PrismaマイグレーションをローカルSupabaseに適用する**

```bash
node node_modules/prisma/build/index.js migrate deploy
```

Expected: 既存のマイグレーション（`20260105080431_init_app_db`等）が全て適用される

- [x] **Step 7: 開発サーバーが起動することを確認する**

```bash
npm run dev
```

Expected: `http://localhost:3000` にアクセスし、ダッシュボードページが（データ0件のまま）表示される

- [x] **Step 8: CLAUDE.mdを更新する**

`golf-web/CLAUDE.md`の「ローカルSupabaseの起動」セクションに以下を追記する:

```markdown
## ローカルSupabaseの起動

```bash
cd golf-web
supabase status   # 起動状況を確認
supabase start    # 未起動なら起動（初回は時間がかかる）
```

`.env.local` に `NEXT_PUBLIC_SUPABASE_URL` / `DATABASE_URL` / `DIRECT_URL` 等のローカル接続情報が設定されています。
`docker-compose.yml`（素のPostgres）は廃止し、Supabase CLIのローカルエミュレータに統一しています。
```

- [x] **Step 9: コミット**

```bash
git add docker-compose.yml supabase/config.toml CLAUDE.md
git commit -m "chore: ローカル開発環境をSupabase CLIに一本化"
```

---

## Task 2: Prismaにdirect URL設定を追加し、Supabase関連パッケージを導入する

**Files:**
- Modify: `golf-web/prisma/schema.prisma`
- Modify: `golf-web/package.json`

**Interfaces:**
- Produces: `directUrl`設定済みの`datasource db`ブロック。`@supabase/supabase-js`, `@supabase/ssr`パッケージ

- [x] **Step 1: schema.prismaにdirectUrlを追加する**

`golf-web/prisma/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

- [x] **Step 2: Supabaseクライアントパッケージをインストールする**

```bash
cd golf-web
npm install @supabase/supabase-js @supabase/ssr
```

- [x] **Step 3: Prisma Clientを再生成する**

```bash
node node_modules/prisma/build/index.js generate
```

Expected: エラーなく完了する

- [x] **Step 4: 型チェックを実行する**

```bash
node node_modules/typescript/bin/tsc --noEmit
```

Expected: エラーなし

- [x] **Step 5: コミット**

```bash
git add prisma/schema.prisma package.json package-lock.json
git commit -m "feat: PrismaにdirectUrl設定を追加し、Supabaseクライアントパッケージを導入"
```

---

## Task 3: Supabaseクライアントヘルパーとログイン中ユーザー取得関数を作成する

**Files:**
- Create: `golf-web/src/lib/supabase/server.ts`
- Create: `golf-web/src/lib/supabase/client.ts`
- Create: `golf-web/src/lib/auth/getCurrentUser.ts`
- Test: `golf-web/src/lib/auth/__tests__/getCurrentUser.test.ts`

**Interfaces:**
- Consumes: `prisma`（`@/src/lib/db/prisma`）
- Produces:
  ```typescript
  // getCurrentUser.ts
  export type CurrentUser = { id: string; email: string | null }
  export async function getCurrentUser(): Promise<CurrentUser | null>
  ```
  以降のタスクは全てこの`getCurrentUser()`を使ってログインユーザーのIDを取得する。

- [x] **Step 1: Server Component/Action用Supabaseクライアントを作成する**

`golf-web/src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Componentから呼ばれた場合はsetできないため無視する
            // （middleware側でセッションをリフレッシュするため実害はない）
          }
        },
      },
    }
  )
}
```

- [x] **Step 2: ブラウザ用Supabaseクライアントを作成する**

`golf-web/src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [x] **Step 3: 失敗するテストを先に書く**

`golf-web/src/lib/auth/__tests__/getCurrentUser.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
vi.mock('@/src/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}))

const mockFindUnique = vi.fn()
const mockCreate = vi.fn()
vi.mock('@/src/lib/db/prisma', () => ({
  prisma: {
    mstUser: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}))

import { getCurrentUser } from '../getCurrentUser'

beforeEach(() => {
  mockGetUser.mockReset()
  mockFindUnique.mockReset()
  mockCreate.mockReset()
})

describe('getCurrentUser', () => {
  it('未ログインならnullを返す', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await getCurrentUser()
    expect(result).toBeNull()
  })

  it('ログイン済みでMstUserが既存なら、それを返す（新規作成しない）', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'auth-uid-1', email: 'a@example.com' } },
    })
    mockFindUnique.mockResolvedValue({ id: 'auth-uid-1', email: 'a@example.com' })

    const result = await getCurrentUser()

    expect(result).toEqual({ id: 'auth-uid-1', email: 'a@example.com' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('ログイン済みだがMstUserが未作成なら、自動作成して返す', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'auth-uid-2', email: 'b@example.com' } },
    })
    mockFindUnique.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: 'auth-uid-2', email: 'b@example.com' })

    const result = await getCurrentUser()

    expect(mockCreate).toHaveBeenCalledWith({
      data: { id: 'auth-uid-2', email: 'b@example.com' },
    })
    expect(result).toEqual({ id: 'auth-uid-2', email: 'b@example.com' })
  })
})
```

- [x] **Step 4: テストが失敗することを確認する**

```bash
cd golf-web && npx vitest run src/lib/auth/__tests__/getCurrentUser.test.ts
```

Expected: `Cannot find module '../getCurrentUser'` などでFAIL

- [x] **Step 5: getCurrentUserを実装する**

`golf-web/src/lib/auth/getCurrentUser.ts`:

```typescript
import { prisma } from '@/src/lib/db/prisma'
import { createSupabaseServerClient } from '@/src/lib/supabase/server'

export type CurrentUser = {
  id: string
  email: string | null
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const existing = await prisma.mstUser.findUnique({
    where: { id: user.id },
  })

  if (existing) {
    return { id: existing.id, email: existing.email }
  }

  const created = await prisma.mstUser.create({
    data: { id: user.id, email: user.email ?? null },
  })

  return { id: created.id, email: created.email }
}
```

- [x] **Step 6: テストが通ることを確認する**

```bash
cd golf-web && npx vitest run src/lib/auth/__tests__/getCurrentUser.test.ts
```

Expected: 3 tests passed

- [x] **Step 7: 型チェック**

```bash
node node_modules/typescript/bin/tsc --noEmit
```

Expected: エラーなし

- [x] **Step 8: コミット**

```bash
git add src/lib/supabase/ src/lib/auth/
git commit -m "feat: Supabaseクライアントとログイン中ユーザー取得ヘルパーを追加"
```

---

## Task 4: 未ログイン時に/loginへリダイレクトするmiddlewareを追加する

**Files:**
- Create: `golf-web/middleware.ts`

**Interfaces:**
- Consumes: `@supabase/ssr`の`createServerClient`（Task 3のパターンをmiddleware用に再実装）

- [x] **Step 1: middleware.tsを作成する**

`golf-web/middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/auth/callback']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isPublicPath = PUBLIC_PATHS.some(p => request.nextUrl.pathname.startsWith(p))

  if (!user && !isPublicPath) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [x] **Step 2: 型チェック**

```bash
cd golf-web && node node_modules/typescript/bin/tsc --noEmit
```

Expected: エラーなし（`/login`ページは次のTaskで作成するため、この時点でアプリを起動すると全ページがリダイレクトループになる点に注意。Task 5完了まではブラウザ確認をスキップしてよい）

- [x] **Step 3: コミット**

```bash
git add middleware.ts
git commit -m "feat: 未ログイン時に/loginへリダイレクトするmiddlewareを追加"
```

---

## Task 5: ログインページ（メール+パスワード）とログアウトを実装する

**Files:**
- Create: `golf-web/app/login/page.tsx`
- Create: `golf-web/app/login/actions.ts`
- Create: `golf-web/app/login/LoginForm.tsx`
- Modify: `golf-web/app/_components/HeaderNav.tsx`（ログアウトボタン追加）

**Interfaces:**
- Consumes: Task 3の`createSupabaseServerClient`
- Produces: `signInWithPassword(formData)`, `signOut()`（Server Action）

- [x] **Step 1: ログイン・ログアウトServer Actionを作成する**

`golf-web/app/login/actions.ts`:

```typescript
'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/src/lib/supabase/server'

export async function signInWithPassword(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    throw new Error('メールアドレスとパスワードを入力してください')
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    throw new Error('ログインに失敗しました。メールアドレスまたはパスワードが正しくありません')
  }

  redirect('/')
}

export async function signOut() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [x] **Step 2: ログインフォーム（クライアントコンポーネント）を作成する**

`golf-web/app/login/LoginForm.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { signInWithPassword } from './actions'
import { createSupabaseBrowserClient } from '@/src/lib/supabase/client'

export default function LoginForm() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await signInWithPassword(formData)
      } catch (e) {
        if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e
        setError(e instanceof Error ? e.message : 'ログインに失敗しました')
      }
    })
  }

  async function handleOAuth(provider: 'google' | 'twitter') {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="flex flex-col gap-4 max-w-sm mx-auto p-6">
      <h1 className="text-lg font-medium text-gray-900">ログイン</h1>

      <form action={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          name="email"
          placeholder="メールアドレス"
          required
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="password"
          name="password"
          placeholder="パスワード"
          required
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white disabled:opacity-40"
        >
          {isPending ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>

      <div className="flex flex-col gap-2">
        <button
          onClick={() => handleOAuth('google')}
          className="px-4 py-2 text-sm rounded-lg border border-gray-300"
        >
          Googleでログイン
        </button>
        <button
          onClick={() => handleOAuth('twitter')}
          className="px-4 py-2 text-sm rounded-lg border border-gray-300"
        >
          Xでログイン
        </button>
      </div>
    </div>
  )
}
```

- [x] **Step 3: ログインページ（Server Component）を作成する**

`golf-web/app/login/page.tsx`:

```tsx
import LoginForm from './LoginForm'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <LoginForm />
    </main>
  )
}
```

- [x] **Step 4: HeaderNavにログアウトボタンを追加する**

`golf-web/app/_components/HeaderNav.tsx`の既存コードを確認し、ナビゲーションリンクの末尾に以下を追加する:

```tsx
import { signOut } from '@/app/login/actions'

// ... 既存のnav要素の末尾に追加
<form action={signOut}>
  <button type="submit" className="text-xs text-gray-400 hover:text-gray-600">
    ログアウト
  </button>
</form>
```

- [x] **Step 5: 型チェック**

```bash
cd golf-web && node node_modules/typescript/bin/tsc --noEmit
```

Expected: エラーなし

- [x] **Step 6: ブラウザで動作確認する**

```bash
npm run dev
```

1. Supabase Studio（`http://127.0.0.1:54323`）の Authentication → Users から、テスト用ユーザー（メール+パスワード）を作成する
2. `http://localhost:3000` にアクセス → `/login` にリダイレクトされることを確認
3. 作成したテストユーザーでログイン → ダッシュボードに遷移することを確認
4. ヘッダーの「ログアウト」→ `/login` に戻ることを確認

- [x] **Step 7: コミット**

```bash
git add app/login/ app/_components/HeaderNav.tsx
git commit -m "feat: メール+パスワードによるログイン・ログアウトを実装"
```

---

## Task 6: Google/X SSO用のOAuthコールバックルートを実装する

**Files:**
- Create: `golf-web/app/auth/callback/route.ts`

**Interfaces:**
- Consumes: Task 3の`createSupabaseServerClient`。Task 5の`LoginForm.tsx`が`redirectTo: /auth/callback`を指定済み

- [x] **Step 1: コールバックルートハンドラを作成する**

`golf-web/app/auth/callback/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/src/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createSupabaseServerClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}/`)
}
```

- [x] **Step 2: 型チェック**

```bash
cd golf-web && node node_modules/typescript/bin/tsc --noEmit
```

Expected: エラーなし

- [x] **Step 3: コミット**

```bash
git add app/auth/callback/
git commit -m "feat: OAuth(Google/X)コールバックルートを追加"
```

**補足（本Taskでは実施しない・インフラ側の手動設定として後続で必要）:**
- Google Cloud ConsoleでOAuthクライアントを発行し、Supabaseダッシュボード（Authentication → Providers → Google）にClient ID/Secretを登録する
- X Developer PortalでOAuth 2.0アプリを登録し、同様にSupabaseダッシュボード（Providers → Twitter）に登録する
- これらはSupabase本番プロジェクト作成後（Task 9）に実施する

---

## Task 7: 全Server ActionのuserIdをログインユーザーに置き換える

**Files:**
- Modify: `golf-web/app/golf-courses/actions.ts:1-21`
- Modify: `golf-web/app/rounds/actions.ts:1-23`
- Modify: `golf-web/app/rounds/import/actions.ts:1-62`

**Interfaces:**
- Consumes: Task 3の`getCurrentUser()`

- [x] **Step 1: golf-courses/actions.tsを修正する**

`golf-web/app/golf-courses/actions.ts`の`createGolfCourse`関数を以下に置き換える:

```typescript
"use server";

import { prisma } from "@/src/lib/db/prisma";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";

/**
 * ゴルフ場を新規作成
 */
export async function createGolfCourse(formData: FormData) {
  const name = formData.get("name") as string;

  if (!name || name.trim() === "") {
    throw new Error("ゴルフ場名は必須です");
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("ログインが必要です");

  await prisma.mstGolfCourse.create({
    data: {
      userId: currentUser.id,
      name,
    },
  });

  redirect("/golf-courses");
}
```

同ファイルの他の関数（`updateGolfCourse`, `createCourseLayout`, `updateCourseLayoutName`, `saveHoles`）は`dummy-user`を参照していないため変更不要。

- [x] **Step 2: rounds/actions.tsを修正する**

`golf-web/app/rounds/actions.ts`の`createRound`関数冒頭を以下のように変更する:

```typescript
"use server";

import { prisma } from "@/src/lib/db/prisma";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";

/**
 * 新しいラウンドを登録
 */
export async function createRound(formData: FormData) {
  const playedAt = formData.get("playedAt") as string;
  const golfCourseId = formData.get("golfCourseId") as string;

  if (!playedAt || !golfCourseId) {
    throw new Error("入力が不足しています");
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("ログインが必要です");

  const round = await prisma.trnRound.create({
    data: {
      userId: currentUser.id,
      golfCourseId,
      playedAt: new Date(playedAt),
    },
  });

  redirect(`/rounds/${round.id}/holes`);
}
```

`saveRoundHoles`関数は`userId`を参照していないため変更不要。

- [x] **Step 3: rounds/import/actions.tsを修正する**

`golf-web/app/rounds/import/actions.ts`の`importGdoScore`関数を以下のように変更する（`import`文と`userId`の代入部分のみ変更、他は既存のまま）:

```typescript
"use server";

import { prisma } from "@/src/lib/db/prisma";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";

export type ImportScoreInput = {
  golfCourseId: string;
  layoutId: string;
  playedAt: string; // YYYY-MM-DD
  scores: { holeNumber: number; stroke: number; putt: number | null }[];
};

export async function importGdoScore(input: ImportScoreInput) {
  const { golfCourseId, layoutId, playedAt, scores } = input;

  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("ログインが必要です");

  const layout = await prisma.mstCourseLayout.findUnique({
    where: { id: layoutId },
    include: { holes: true },
  });

  if (!layout) throw new Error("レイアウトが見つかりません");

  if (layout.holes.length === 0) {
    throw new Error(`レイアウト「${layout.name}」にホールが登録されていません。先にホール情報を登録してください。`);
  }

  const holeMap = new Map(layout.holes.map(h => [h.holeNumber, h.id]));

  const holeData = scores.flatMap(s => {
    const holeId = holeMap.get(s.holeNumber);
    if (!holeId) return [];
    return [{
      holeId,
      stroke: s.stroke,
      putt: s.putt ?? 0,
      penalty: 0,
    }];
  });

  if (holeData.length === 0) {
    const dbHoleNumbers = Array.from(holeMap.keys()).sort((a, b) => a - b);
    const importHoleNumbers = scores.map(s => s.holeNumber).sort((a, b) => a - b);
    throw new Error(
      `スコアのHole番号がDBと一致しません。` +
      `DB: [${dbHoleNumbers.join(',')}] / インポート: [${importHoleNumbers.join(',')}]`
    );
  }

  const round = await prisma.$transaction(async (tx) => {
    const created = await tx.trnRound.create({
      data: {
        userId: currentUser.id,
        golfCourseId,
        playedAt: new Date(playedAt),
      },
    });

    await tx.trnRoundHoleResult.createMany({
      data: holeData.map(h => ({ ...h, roundId: created.id })),
    });

    return created;
  });

  redirect(`/rounds/${round.id}/holes`);
}
```

- [x] **Step 4: 型チェック**

```bash
cd golf-web && node node_modules/typescript/bin/tsc --noEmit
```

Expected: エラーなし

- [x] **Step 5: ブラウザで動作確認する**

ログイン状態で以下を確認する:
1. `/golf-courses/new` からゴルフ場を新規作成 → 作成できる
2. `/rounds/new` からラウンドを新規作成 → 作成できる
3. `/rounds/import` からGDOスコアをインポート → 作成できる
4. Supabase Studio（`http://127.0.0.1:54323`）のTable Editorで`mst_golf_courses`, `trn_rounds`の`user_id`列が、ログイン中ユーザーのUUID（`dummy-user`ではない）になっていることを確認する

- [x] **Step 6: コミット**

```bash
git add app/golf-courses/actions.ts app/rounds/actions.ts app/rounds/import/actions.ts
git commit -m "feat: 全Server ActionのuserIdをログインユーザーに置き換え"
```

---

## Task 8: 全Prisma読み取りクエリにユーザーごとのデータ分離を追加する

**Files:**
- Modify: `golf-web/src/lib/dashboard/queries.ts`
- Modify: `golf-web/app/page.tsx`
- Modify: `golf-web/app/rounds/page.tsx`
- Modify: `golf-web/app/rounds/new/page.tsx`
- Modify: `golf-web/app/rounds/import/page.tsx`
- Modify: `golf-web/app/golf-courses/page.tsx`
- Modify: `golf-web/app/golf-courses/[golfCourseId]/edit/page.tsx`
- Modify: `golf-web/app/golf-courses/[golfCourseId]/layouts/page.tsx`
- Modify: `golf-web/app/golf-courses/[golfCourseId]/layouts/[layoutId]/holes/page.tsx`
- Modify: `golf-web/app/rounds/[roundId]/holes/page.tsx`
- Test: `golf-web/src/lib/dashboard/__tests__/metrics.test.ts`（既存、変更なし。参考として`queries.ts`の変更が既存テストを壊さないことを確認する）

**Interfaces:**
- Consumes: Task 3の`getCurrentUser()`
- Produces: `fetchRoundSummaries(userId: string)`（既存の引数なし版から変更）

- [x] **Step 1: dashboard/queries.tsにuserId引数を追加する**

`golf-web/src/lib/dashboard/queries.ts`の`fetchRoundSummaries`のシグネチャと`findMany`の`where`句を変更する:

```typescript
export async function fetchRoundSummaries(userId: string): Promise<RoundSummary[]> {
  const rounds = await prisma.trnRound.findMany({
    where: { userId },
    orderBy: { playedAt: 'desc' },
    include: {
      golfCourse: true,
      holeResults: {
        include: {
          hole: {
            include: { courseLayout: true },
          },
        },
      },
    },
  })
  // 以降は変更なし
```

- [x] **Step 2: app/page.tsx（ダッシュボード）を修正する**

`golf-web/app/page.tsx`の冒頭を以下のように変更する:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { fetchRoundSummaries } from '@/src/lib/dashboard/queries'
import { computeDashboardData } from '@/src/lib/dashboard/metrics'
import { getCurrentUser } from '@/src/lib/auth/getCurrentUser'
import ScoreGraph from './_components/ScoreGraph'

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '/')
}

export default async function DashboardPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const rounds = await fetchRoundSummaries(currentUser.id)
  const data = computeDashboardData(rounds)

  // 以降のJSXは変更なし
```

- [x] **Step 3: app/rounds/page.tsxを修正する**

`golf-web/app/rounds/page.tsx`冒頭を以下のように変更する:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/db/prisma";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";

export default async function RoundsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const rounds = await prisma.trnRound.findMany({
    where: { userId: currentUser.id },
    orderBy: { playedAt: "desc" },
    include: {
      golfCourse: true,
      holeResults: {
        include: {
          hole: true,
        },
      },
    },
  });

  // 以降のJSXは変更なし
```

- [x] **Step 4: app/rounds/new/page.tsxを修正する**

`golf-web/app/rounds/new/page.tsx`冒頭を以下のように変更する:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/db/prisma";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";
import { createRound } from "../actions";

export default async function NewRoundPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const golfCourses = await prisma.mstGolfCourse.findMany({
    where: { userId: currentUser.id },
    orderBy: { createdAt: "asc" },
  });

  // 以降のJSXは変更なし
```

- [x] **Step 5: app/rounds/import/page.tsxを修正する**

`golf-web/app/rounds/import/page.tsx`冒頭を以下のように変更する:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/src/lib/db/prisma'
import { getCurrentUser } from '@/src/lib/auth/getCurrentUser'
import ImportForm from './ImportForm'

export default async function ImportPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const golfCourses = await prisma.mstGolfCourse.findMany({
    where: { userId: currentUser.id },
    orderBy: { createdAt: 'asc' },
    include: {
      layouts: {
        orderBy: { displayOrder: 'asc' },
        select: { id: true, name: true, holeCount: true },
      },
    },
  })

  // 以降のJSXは変更なし
```

- [x] **Step 6: app/golf-courses/page.tsxを修正する**

`golf-web/app/golf-courses/page.tsx`を以下に置き換える:

```tsx
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/db/prisma";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";

export default async function GolfCourseListPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const courses = await prisma.mstGolfCourse.findMany({
    where: { userId: currentUser.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main>
      <h1>ゴルフ場一覧</h1>

      <a href="/golf-courses/new">＋ 新規作成</a>

      <ul>
        {courses.map((course: { id: string; name: string }) => (
            <li key={course.id}>
            {course.name}
            {" "}
            <a href={`/golf-courses/${course.id}/edit`}>
                編集
            </a>
            <a href={`/golf-courses/${course.id}/layouts`}>
            コース管理
</a>
            </li>
        ))}
      </ul>

    </main>
  );
}
```

- [x] **Step 7: 所有権チェックが必要な詳細ページを修正する**

以下4ファイルは「他人のゴルフ場IDを直接URLで指定してアクセスされた場合」に備え、`golfCourse.userId !== currentUser.id`なら404相当のメッセージを返すガード句を追加する。

`golf-web/app/golf-courses/[golfCourseId]/edit/page.tsx`の該当箇所:

```tsx
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/db/prisma";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";
import { updateGolfCourse } from "../../actions";

// ...

export default async function EditGolfCoursePage({ params }: Props) {
  const { golfCourseId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  if (!golfCourseId) {
    return <div>不正なIDです</div>;
  }

  const course = await prisma.mstGolfCourse.findUnique({
    where: { id: golfCourseId },
  });

  if (!course || course.userId !== currentUser.id) {
    return <div>ゴルフ場が見つかりません</div>;
  }

  // 以降のJSXは変更なし
```

`golf-web/app/golf-courses/[golfCourseId]/layouts/page.tsx`の該当箇所（`golfCourse`取得直後にガードを追加）:

```tsx
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/db/prisma";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";
import { createCourseLayout } from "../../actions";
import { updateCourseLayoutName } from "../../actions";
import Link from "next/link";

// ...

export default async function CourseLayoutPage({ params }: Props) {
  const { golfCourseId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const golfCourse = await prisma.mstGolfCourse.findUnique({
    where: { id: golfCourseId },
    include: {
      layouts: {
        orderBy: { displayOrder: "asc" },
        include: {
          holes: {
            orderBy: { holeNumber: "asc" },
          },
        },
      },
    },
  });

  if (!golfCourse || golfCourse.userId !== currentUser.id) {
    return <div>ゴルフ場が見つかりません</div>;
  }

  // 以降のJSXは変更なし
```

`golf-web/app/golf-courses/[golfCourseId]/layouts/[layoutId]/holes/page.tsx`の冒頭（`golfCourse`取得部分にガードを追加。既存コードの`golfCourse`変数名・取得ロジックを確認した上で以下のパターンを適用する）:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";
// ...既存のimportは維持

export default async function HolesPage({ params }: Props) {
  // ...既存のparams取得は維持
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const golfCourse = await prisma.mstGolfCourse.findUnique({
    where: { id: golfCourseId },
  });

  if (!golfCourse || golfCourse.userId !== currentUser.id) {
    return <div>ゴルフ場が見つかりません</div>;
  }

  // 以降、既存のlayout/holes取得ロジックは変更なし
```

`golf-web/app/rounds/[roundId]/holes/page.tsx`の`round`取得部分にガードを追加する:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";
// ...既存のimportは維持

export default async function RoundHolesPage({ params }: Props) {
  const { roundId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const round = await prisma.trnRound.findUnique({
    where: { id: roundId },
    include: {
      holeResults: true,
      golfCourse: {
        include: {
          layouts: {
            orderBy: { displayOrder: "asc" },
            include: {
              holes: {
                orderBy: { holeNumber: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!round || round.userId !== currentUser.id) {
    return <div>ラウンドが見つかりません</div>;
  }

  // 以降のJSXは変更なし
```

- [x] **Step 8: 既存テストが壊れていないことを確認する**

```bash
cd golf-web && npx vitest run
```

Expected: 全テストpassed（`metrics.test.ts`は`fetchRoundSummaries`を直接呼んでいないため影響なし）

- [x] **Step 9: 型チェック**

```bash
node node_modules/typescript/bin/tsc --noEmit
```

Expected: エラーなし

- [x] **Step 10: ブラウザで動作確認する**

1. Supabase Studioでテストユーザーをもう1人作成する
2. ユーザーAでログイン→ゴルフ場・ラウンドを作成
3. ログアウト→ユーザーBでログイン→ダッシュボード・ラウンド一覧・ゴルフ場一覧が空であることを確認（ユーザーAのデータが見えない）
4. ユーザーBの状態で、ユーザーAが作成したゴルフ場のURL（`/golf-courses/<ユーザーAのID>/edit`）に直接アクセス→「ゴルフ場が見つかりません」と表示されることを確認

- [x] **Step 11: コミット**

```bash
git add src/lib/dashboard/queries.ts app/page.tsx app/rounds/ app/golf-courses/
git commit -m "feat: 全Prisma読み取りクエリにユーザーごとのデータ分離を追加"
```

---

## Task 9: Supabase本番プロジェクトとVercelプロジェクトを作成する（手動セットアップ）

**Files:**
- Modify: `package.json`（`postinstall`スクリプト追加）

（2026-07-04追記：Vercelでの初回ビルドが`Parameter 'tx' implicitly has an 'any' type.`で失敗した。原因はVercelの`npm install`後にPrisma Clientが生成されておらず、`$transaction`のコールバック引数等の型が解決できなかったため。`package.json`の`scripts`に`"postinstall": "prisma generate"`を追加し、`npm install`のたびに自動でPrisma Clientが再生成されるように修正した）

**Interfaces:**
- Produces: 本番用`DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`（Task 10・11で使用）

- [x] **Step 1: Supabase本番プロジェクトを作成する**

1. https://supabase.com/dashboard でプロジェクトを新規作成する（リージョンは`Northeast Asia (Tokyo)`を推奨）
2. Project Settings → Database → Connection string から以下2つを控える
   - **Transaction pooler**（port 6543）→ `DATABASE_URL`として使用
   - **Session pooler**（port 5432, `aws-0-xxxxx.pooler.supabase.com`）→ `DIRECT_URL`として使用

   （2026-07-04追記：本来の「Direct connection」（`db.xxxxx.supabase.co:5432`）はIPv6専用のため、IPv6非対応ネットワークからは接続できないことが判明した。Session PoolerはIPv4対応かつPrepared Statementにも対応しており、マイグレーション用途としてDirect connectionの代替として公式に案内されている。以降、本番の`DIRECT_URL`は常にSession Poolerの接続文字列を使う）
3. Project Settings → API から `Project URL`（`NEXT_PUBLIC_SUPABASE_URL`）、`anon public`キー（`NEXT_PUBLIC_SUPABASE_ANON_KEY`）、`service_role`キー（`SUPABASE_SERVICE_ROLE_KEY`）を控える

- [x] **Step 2: 本番プロジェクトにマイグレーションを1回だけ手動適用する（初回のみ）**

Task 10でGitHub Actions自動化を構築するが、初回動作確認のため一度だけローカルから手動実行する:

```bash
cd golf-web
DIRECT_URL="<Step1で控えたSession pooler接続文字列>" node node_modules/prisma/build/index.js migrate deploy
```

Expected: 全マイグレーションが本番プロジェクトに適用される（`.env.local`は変更しない）

- [x] **Step 3: Google/X OAuthプロバイダーを本番プロジェクトに設定する**

1. Google Cloud Consoleで新規プロジェクト（または既存プロジェクト）を作り、OAuth 2.0クライアントIDを発行する
   - 承認済みリダイレクトURIに `https://<本番SupabaseプロジェクトID>.supabase.co/auth/v1/callback` を追加
2. SupabaseダッシュボードのAuthentication → Providers → Googleを有効化し、Client ID/Secretを登録する
3. X Developer PortalでOAuth 2.0アプリを作成し、同様にコールバックURLを登録した上で、Providers → Twitterに登録する

- [x] **Step 4: Vercelプロジェクトを作成する**

（2026-07-04追記：golf-webは`golf-stuff`から独立したリポジトリ`golf-stuff/golf-web`としてpublic化された。Root Directory設定は不要）

1. https://vercel.com でGitHubの`golf-stuff/golf-web`リポジトリをImportする
2. Project Settings → Git → Production Branch を`main`に設定する
3. **Project Settings → Git → 「Deploy Hooks」機能を使うため、この時点ではまだ何もpushしない**（Task 10で無効化するため）

- [x] **Step 5: Vercel環境変数を設定する**

Project Settings → Environment Variables に、Step 1で控えた値を`Production`環境向けに登録する:

```
DATABASE_URL=<Transaction pooler接続文字列>
NEXT_PUBLIC_SUPABASE_URL=<Project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

`DIRECT_URL`はVercel実行時には使わない（マイグレーション専用のためGitHub Actions Secretsにのみ登録する。Task 10参照）ので、ここでは登録しない。

- [x] **Step 6: Vercel Deploy Hookを発行する**

1. Project Settings → Git → Deploy Hooks で、Hook Nameを`github-actions-deploy`、Branchを`main`として新規作成する
2. 発行されたURLを控える（Task 10のGitHub Secretsに登録する）

- [x] **Step 7: このタスクの完了確認**

以下が全て準備できていることを確認する（コードの変更はないためコミット不要）:
- [x] Supabase本番プロジェクトが作成されている
- [x] 本番DBにマイグレーションが適用済み
- [x] Google/X OAuthプロバイダーが有効化されている
- [x] Vercelプロジェクトが作成され、Root Directoryが`golf-web`に設定されている
- [x] Vercel環境変数（`DATABASE_URL`等）が登録されている
- [x] Vercel Deploy HookのURLを控えている

---

## Task 10: GitHub ActionsによるマイグレーションとVercelデプロイの自動化

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: Task 9で発行したVercel Deploy Hook URL、本番`DIRECT_URL`

- [x] **Step 1: GitHub Secretsを登録する**

リポジトリの Settings → Secrets and variables → Actions で以下を登録する:

```
PROD_DIRECT_URL       = <Task 9 Step1で控えたSession pooler接続文字列>
VERCEL_DEPLOY_HOOK_URL = <Task 9 Step6で発行したDeploy Hook URL>
```

- [x] **Step 2: Vercelの自動デプロイ（Git連携）を無効化する**

（2026-07-04訂正：当初「Ignored Build Step」に`exit 0`を設定する方法を想定していたが、これは**Deploy Hook経由のビルドにも適用されてしまい**、Deploy Hookを叩いてもデプロイが起動しないという不具合が発生した。正しくは`vercel.json`の`git.deploymentEnabled`を使う）

1. Vercel Project Settings → General → **Ignored Build Step は Automatic（デフォルト）のまま**にする（`exit 0`は設定しない）
2. リポジトリルートに`vercel.json`を作成する:

```json
{
  "git": {
    "deploymentEnabled": false
  }
}
```

`git.deploymentEnabled: false`は「Gitへのpushをトリガーとした自動デプロイ」だけを無効化する設定で、Deploy Hook（API経由の明示的なトリガー）には一切影響しない。これにより、通常の`git push`ではビルドが走らず、Deploy Hookを叩いた時だけデプロイが実行される。

- [x] **Step 3: GitHub Actionsワークフローを作成する**

`.github/workflows/deploy.yml`:

```yaml
name: Deploy golf-web

on:
  push:
    branches: [main]
    paths:
      - 'golf-web/**'
      - '.github/workflows/deploy.yml'

jobs:
  migrate-and-deploy:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: golf-web
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run Prisma migrations against production
        run: node node_modules/prisma/build/index.js migrate deploy
        env:
          DIRECT_URL: ${{ secrets.PROD_DIRECT_URL }}

      - name: Trigger Vercel deployment
        run: curl -X POST "${{ secrets.VERCEL_DEPLOY_HOOK_URL }}"
```

- [x] **Step 4: mainブランチにマージして動作確認する**

このタスク自体をmainにマージし、GitHub Actionsの実行ログで以下を確認する:
- `Run Prisma migrations against production`ステップが成功する
- `Trigger Vercel deployment`ステップが成功する（HTTP 200が返る）
- Vercelダッシュボードで新しいデプロイが開始されることを確認する
- デプロイ完了後、本番URLにアクセスし、`/login`にリダイレクトされることを確認する
- Supabaseダッシュボードで作成した本番用アカウントでログインできることを確認する

- [x] **Step 5: コミット**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat: GitHub ActionsによるPrismaマイグレーション+Vercelデプロイの自動化"
```

---

## Task 11: golf-web/CLAUDE.mdを新しい環境構成に合わせて更新する

**Files:**
- Modify: `golf-web/CLAUDE.md`

**Interfaces:**
- Consumes: Task 1〜10で確定した実際の変更内容（`docker-compose.yml`削除、`supabase/config.toml`追加、`middleware.ts`によるログイン必須化、`src/lib/supabase/`・`src/lib/auth/`の新設、`.github/workflows/deploy.yml`によるCI/CD）

- [x] **Step 1: `/claude-md-management` skillを呼び出す**

このタスクは`/claude-md-management` skillを使って進める。呼び出し時に以下をコンテキストとして渡す:

- 対象ファイル: `golf-web/CLAUDE.md`
- Task 1〜10で実施した変更点：
  - `docker-compose.yml`（素のPostgres）を廃止し、`supabase start`によるローカルSupabase CLIエミュレータに一本化した
  - `prisma/schema.prisma`に`directUrl`を追加した（`DATABASE_URL`=Pooler接続、`DIRECT_URL`=Direct接続の使い分けが発生した）
  - `middleware.ts`により全ページがログイン必須になった（`/login`, `/auth/callback`を除く）
  - `src/lib/supabase/`（Supabaseクライアント）、`src/lib/auth/`（`getCurrentUser()`）を新設した
  - 本番は`.github/workflows/deploy.yml`が`main`へのpushで自動的に`prisma migrate deploy`→Vercel Deploy Hookを実行する構成になった
  - 開発時にログインが必要になったため、動作確認手順（Supabase Studioでのテストユーザー作成方法）をローカル開発フローに追記する必要がある

- [x] **Step 2: skillの出力を確認し、`golf-web/CLAUDE.md`に反映する**

既存セクション（プロジェクト概要、ディレクトリ構成、開発コマンド、PRレビューの進め方）は残しつつ、以下を反映する:

- 「ローカルSupabaseの起動」セクションを、Task 1 Step 8で追記した内容（`docker-compose.yml`廃止・`DIRECT_URL`追加）を踏まえて更新する
- 新規セクション「認証」を追加し、`middleware.ts`によるログイン必須化、ローカルでのテストユーザー作成方法（Supabase Studio → Authentication → Users）、`getCurrentUser()`の使い方を記載する
- 新規セクション「デプロイ」を追加し、`.github/workflows/deploy.yml`によるマイグレーション・デプロイの自動化フローを記載する
- ディレクトリ構成図に`src/lib/supabase/`, `src/lib/auth/`, `middleware.ts`, `app/login/`, `app/auth/callback/`, `.github/workflows/`を追加する

- [x] **Step 3: 更新後の内容をレビューする**

以下を満たしているか確認する:
- Task 1〜10で新設・削除したファイル/ディレクトリが全てディレクトリ構成図に反映されている
- 「ローカルSupabaseの起動」に`docker-compose.yml`への言及が残っていない（廃止済みのため）
- ログインが必要になったことで、他のセクション（PRレビューの進め方等）の前提が崩れていないか確認する（崩れている場合はTask 12で`verify-pr-checklist`側を修正するため、ここでは`golf-web/CLAUDE.md`側の記述のみ整合させる）

- [x] **Step 4: コミット**

```bash
cd golf-web
git add CLAUDE.md
git commit -m "docs: CLAUDE.mdを本番環境構築後の構成に合わせて更新"
```

---

## Task 12: verify-pr-checklist SKILL.mdをログイン必須環境に対応させる

**Files:**
- Modify: `golf-web/.claude/skills/verify-pr-checklist/SKILL.md`

**Interfaces:**
- Consumes: Task 4のmiddleware仕様（`/login`, `/auth/callback`以外は未ログイン時にリダイレクトされる）、Task 5のログイン手段（メール+パスワード、テストユーザーはSupabase Studioから作成）

**背景**：現在の`SKILL.md`手順2「環境準備」は、devサーバーとローカルSupabaseの起動確認のみを行っている。Task 4でmiddlewareを追加した結果、Playwrightでどのページに遷移してもログイン前提となるため、既存の検証フローが自動化できたつもりで全項目リダイレクト待ちになり失敗する。ログイン手順を検証フローに組み込む必要がある。

- [x] **Step 1: `/skill-creator` skillを呼び出す**

このタスクは`/skill-creator`（既存skillの編集モード）を使って進める。呼び出し時に以下をコンテキストとして渡す:

- 編集対象: `golf-web/.claude/skills/verify-pr-checklist/SKILL.md`
- 追加要件: 手順2「環境準備」の直後に、Playwright操作を始める前に固定のテストユーザー（例: `qa@example.com` / 事前に決めたパスワード）でログインするステップを追加する。テストユーザーが未作成の場合は、Supabase Studio（`http://127.0.0.1:54323`）のAuthentication → UsersからCLIまたはダッシュボード経由で作成する手順を明記する
- 追加要件: 「Common Mistakes」セクションに、「middlewareによりログインしていないと全ページが`/login`にリダイレクトされる。検証前に必ずログイン済みセッションを確立すること」という項目を追加する
- 制約: 既存の手順1（確認ポイント取得）・手順3〜7（分類・検証・報告）の構成は変更しない。手順2の直後にログインステップを追加する形で最小限の変更に留める

- [x] **Step 2: skillの出力をレビューする**

以下を満たしているか確認する:
- 既存のfrontmatter（`name`, `description`）が変更されていない
- 手順2にログインステップが追加され、それ以降の手順番号がずれていない、またはずれた場合は全体が一貫している
- `Common Mistakes`セクションにログイン関連の注意点が追加されている

- [x] **Step 3: コミット**

```bash
cd golf-web
git add .claude/skills/verify-pr-checklist/SKILL.md
git commit -m "docs: verify-pr-checklist skillをログイン必須環境に対応させる"
```

---

## 完了確認

全タスク完了後に以下を確認する:

```bash
cd golf-web && npx vitest run && node node_modules/typescript/bin/tsc --noEmit
```

Expected:
- Tests: 全てpassed
- TypeScript: エラーなし

**本番動作確認チェックリスト:**

- [x] 本番URL（Vercel）にアクセスすると`/login`にリダイレクトされる
- [x] Supabaseダッシュボードで作成したアカウントでメール+パスワードログインができる
- [x] Google/Xでのログインができる
- [x] ログイン後、ダッシュボード・ラウンド一覧・ゴルフ場一覧が表示される（初回は空データ）
- [x] ゴルフ場・レイアウト・ホール登録ができる
- [x] GDOスコアインポートができる
- [x] ログアウトすると`/login`に戻る
- [x] スキーマ変更を含むPRをmainにマージすると、GitHub Actions経由で自動的に本番DBへマイグレーションが適用され、Vercelへデプロイされる
