# ゴルフ場マスタ一本化＋管理者ロール Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ゴルフ場マスタ（`MstGolfCourse`/`MstCourseLayout`/`MstHole`）をユーザー専有から全ユーザー共有の単一マスタに変更し、その更新（作成・編集）を管理者ロールを持つユーザーのみに制限する。一般ユーザーはラウンド記録時にマスタを閲覧・選択するのみとなる。

**Architecture:** 既存の `MstGolfCourse` から `userId` を削除し、代わりに名寄せ用の `prefecture`/`city` カラムを追加する。`MstUser` に `role`（`user`/`admin`）を追加し、`src/lib/auth/requireAdmin.ts` の新規ヘルパーで管理者判定を一元化する。既存のゴルフ場登録・編集画面（`/golf-courses` 配下）はそのまま「管理者用画面」として再利用し、アクセス制御のみ追加する。`TrnRound`/`TrnRoundHoleResult` のスキーマ変更は不要（単一マスタになるため既存FKがそのまま使える）。

**Tech Stack:** Next.js 16 (App Router) / Prisma 7 / PostgreSQL (Supabase) / Vitest

## Global Constraints

- コメント・UI文言・エラーメッセージは日本語で記述する
- 既存のコードパターン（Server Actions、Prismaの使い方、Tailwindのユーティリティクラス名）を踏襲し、新しい書き方を持ち込まない
- 一つの変更は目的に対して最小限にとどめ、無関係な整形・リファクタは混ぜない
- 既存テストがある場合、変更後は必ず実行して壊れていないことを確認する
- モックは本当に必要な境界（Supabase認証、Prismaクライアント）でのみ使う

---

## Task 1: `MstUser` に管理者ロールを追加する

**Files:**
- Modify: `prisma/schema.prisma:9-28`（`fairway_keep_result` enumの下に `user_role` enumを追加し、`MstUser` に `role` フィールドを追加）
- Modify: `src/lib/auth/getCurrentUser.ts`
- Modify: `src/lib/auth/__tests__/getCurrentUser.test.ts`

**Interfaces:**
- Produces: `CurrentUser` 型に `role: 'user' | 'admin'` フィールドを追加。以降のタスクはこの `role` を管理者判定に使う

- [x] **Step 1: 既存テストを更新（先に失敗させる）**

`src/lib/auth/__tests__/getCurrentUser.test.ts` の `mockFindUnique`/`mockCreate` の戻り値に `role` を含め、返り値の期待値にも `role` を追加する。

```ts
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
    mockFindUnique.mockResolvedValue({ id: 'auth-uid-1', email: 'a@example.com', role: 'admin' })

    const result = await getCurrentUser()

    expect(result).toEqual({ id: 'auth-uid-1', email: 'a@example.com', role: 'admin' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('ログイン済みだがMstUserが未作成なら、role: userで自動作成して返す', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'auth-uid-2', email: 'b@example.com' } },
    })
    mockFindUnique.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: 'auth-uid-2', email: 'b@example.com', role: 'user' })

    const result = await getCurrentUser()

    expect(mockCreate).toHaveBeenCalledWith({
      data: { id: 'auth-uid-2', email: 'b@example.com' },
    })
    expect(result).toEqual({ id: 'auth-uid-2', email: 'b@example.com', role: 'user' })
  })
})
```

- [x] **Step 2: テストを実行し、失敗を確認する**

Run: `npx vitest run src/lib/auth/__tests__/getCurrentUser.test.ts`
Expected: FAIL（`role` が返り値に含まれないため、期待値と不一致）

- [x] **Step 3: Prismaスキーマに `user_role` enumと `MstUser.role` を追加**

`prisma/schema.prisma` の `enum fairway_keep_result { ... }` の直後に追加：

```prisma
enum user_role {
  user
  admin
}
```

`model MstUser` を以下のように変更（`role` フィールドを追加）：

```prisma
model MstUser {
  id        String    @id @default(uuid())
  email     String?
  role      user_role @default(user)
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  golfCourses MstGolfCourse[]
  rounds      TrnRound[]

  @@map("mst_users")
}
```

（`golfCourses` リレーションは Task 2 で削除するため、この時点ではまだ残す）

- [x] **Step 4: マイグレーションを実行**

Run: `npx prisma migrate dev --name add_user_role`
Expected: `mst_users` テーブルに `role` カラム（デフォルト値 `user`）が追加され、マイグレーションが成功する

- [x] **Step 5: `getCurrentUser.ts` を更新**

```ts
import { prisma } from '@/src/lib/db/prisma'
import { createSupabaseServerClient } from '@/src/lib/supabase/server'

export type CurrentUser = {
  id: string
  email: string | null
  role: 'user' | 'admin'
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
    return { id: existing.id, email: existing.email, role: existing.role }
  }

  const created = await prisma.mstUser.create({
    data: { id: user.id, email: user.email ?? null },
  })

  return { id: created.id, email: created.email, role: created.role }
}
```

- [x] **Step 6: テストを実行し、成功を確認する**

Run: `npx vitest run src/lib/auth/__tests__/getCurrentUser.test.ts`
Expected: PASS（3件とも成功）

- [x] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/auth/getCurrentUser.ts src/lib/auth/__tests__/getCurrentUser.test.ts
git commit -m "feat: MstUserに管理者ロールを追加"
```

---

## Task 2: `requireAdmin` ヘルパーを追加する

**Files:**
- Create: `src/lib/auth/requireAdmin.ts`
- Create: `src/lib/auth/__tests__/requireAdmin.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser(): Promise<CurrentUser | null>`（Task 1で `role` を含むよう更新済み）
- Produces: `requireAdminForPage(): Promise<CurrentUser>`（ページコンポーネント用、非管理者は `redirect()`）、`requireAdminForAction(): Promise<CurrentUser>`（Server Action用、非管理者は `Error` をthrow）。以降のタスクはこの2関数を管理者ゲートとして使う

- [x] **Step 1: 失敗するテストを書く**

```ts
// src/lib/auth/__tests__/requireAdmin.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetCurrentUser = vi.fn()
vi.mock('../getCurrentUser', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}))

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`)
})
vi.mock('next/navigation', () => ({
  redirect: (path: string) => mockRedirect(path),
}))

import { requireAdminForPage, requireAdminForAction } from '../requireAdmin'

beforeEach(() => {
  mockGetCurrentUser.mockReset()
  mockRedirect.mockClear()
})

describe('requireAdminForPage', () => {
  it('未ログインなら/loginへリダイレクトする', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    await expect(requireAdminForPage()).rejects.toThrow('REDIRECT:/login')
  })

  it('管理者でなければ/roundsへリダイレクトする', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'u1', email: 'a@example.com', role: 'user' })
    await expect(requireAdminForPage()).rejects.toThrow('REDIRECT:/rounds')
  })

  it('管理者ならそのユーザーを返す', async () => {
    const admin = { id: 'u2', email: 'admin@example.com', role: 'admin' as const }
    mockGetCurrentUser.mockResolvedValue(admin)
    await expect(requireAdminForPage()).resolves.toEqual(admin)
  })
})

describe('requireAdminForAction', () => {
  it('未ログインならエラーをthrowする', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    await expect(requireAdminForAction()).rejects.toThrow('ログインが必要です')
  })

  it('管理者でなければエラーをthrowする', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'u1', email: 'a@example.com', role: 'user' })
    await expect(requireAdminForAction()).rejects.toThrow('管理者権限が必要です')
  })

  it('管理者ならそのユーザーを返す', async () => {
    const admin = { id: 'u2', email: 'admin@example.com', role: 'admin' as const }
    mockGetCurrentUser.mockResolvedValue(admin)
    await expect(requireAdminForAction()).resolves.toEqual(admin)
  })
})
```

- [x] **Step 2: テストを実行し、失敗を確認する**

Run: `npx vitest run src/lib/auth/__tests__/requireAdmin.test.ts`
Expected: FAIL（`../requireAdmin` が存在しない）

- [x] **Step 3: 実装**

```ts
// src/lib/auth/requireAdmin.ts
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./getCurrentUser";

/** ページ表示用：未ログインは/loginへ、非管理者は/roundsへリダイレクトする */
export async function requireAdminForPage(): Promise<CurrentUser> {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "admin") redirect("/rounds");
  return currentUser;
}

/** Server Action用：未ログイン・非管理者はエラーをthrowする */
export async function requireAdminForAction(): Promise<CurrentUser> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("ログインが必要です");
  if (currentUser.role !== "admin") throw new Error("管理者権限が必要です");
  return currentUser;
}
```

- [x] **Step 4: テストを実行し、成功を確認する**

Run: `npx vitest run src/lib/auth/__tests__/requireAdmin.test.ts`
Expected: PASS（6件とも成功）

- [x] **Step 5: Commit**

```bash
git add src/lib/auth/requireAdmin.ts src/lib/auth/__tests__/requireAdmin.test.ts
git commit -m "feat: 管理者権限チェック用のrequireAdminヘルパーを追加"
```

---

## Task 3: `MstGolfCourse` をユーザー専有から共有マスタへ変更する

**Files:**
- Modify: `prisma/schema.prisma:18-43`（`MstUser.golfCourses` リレーション削除、`MstGolfCourse` から `userId`/`user` リレーション削除、`prefecture`/`city` 追加、unique制約変更）

**Interfaces:**
- Produces: `MstGolfCourse` が `{ id, name, prefecture: string | null, city: string | null, createdAt, updatedAt }` になる（`userId` は存在しなくなる）。以降のタスクはこの形を前提にする

- [x] **Step 1: スキーマを変更**

`model MstUser` から `golfCourses MstGolfCourse[]` の行を削除：

```prisma
model MstUser {
  id        String    @id @default(uuid())
  email     String?
  role      user_role @default(user)
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  rounds TrnRound[]

  @@map("mst_users")
}
```

`model MstGolfCourse` を以下に変更：

```prisma
model MstGolfCourse {
  id         String   @id @default(uuid())
  name       String
  prefecture String?
  city       String?
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  layouts MstCourseLayout[]
  rounds  TrnRound[]

  @@unique([name, prefecture, city])
  @@map("mst_golf_courses")
}
```

- [x] **Step 2: マイグレーションを実行**

Run: `npx prisma migrate dev --name make_golf_course_shared_master`
Expected: `mst_golf_courses` から `user_id` カラムが削除され、`prefecture`/`city` カラム（nullable）が追加され、`@@unique([userId, name])` が `@@unique([name, prefecture, city])` に置き換わる

> **注意**: 既存データの `user_id` は破棄される。既存のユーザー専有ゴルフ場は全ユーザー共有の1レコードとして扱われるようになる（設計上の意図通り）。同名ゴルフ場が複数ユーザーによって重複登録されていた場合、`prefecture`/`city` が両方NULLであれば一意制約には抵触しないが、見た目上の重複データとして残る。重複整理は本タスクのスコープ外とし、必要なら別途手動で対応する。

- [x] **Step 3: Prisma Clientの型が更新されたことを確認**

Run: `npx prisma generate`
Expected: 正常終了。`prisma.mstGolfCourse` の型に `userId` が含まれず、`prefecture`/`city` が含まれる

- [x] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: MstGolfCourseをユーザー専有から共有マスタに変更"
```

---

## Task 4: ゴルフ場管理用Server Actionsを管理者限定にする

**Files:**
- Modify: `app/golf-courses/actions.ts`

**Interfaces:**
- Consumes: `requireAdminForAction(): Promise<CurrentUser>`（Task 2）、`prisma.mstGolfCourse`（`userId` なし、`prefecture`/`city` あり。Task 3）
- Produces: `createGolfCourse`/`updateGolfCourse`/`createCourseLayout`/`updateCourseLayoutName`/`saveHoles` は全て管理者以外が呼ぶとエラーをthrowする

- [x] **Step 1: `app/golf-courses/actions.ts` を全面的に更新**

```ts
"use server";

import { prisma } from "@/src/lib/db/prisma";
import { redirect } from "next/navigation";
import { requireAdminForAction } from "@/src/lib/auth/requireAdmin";

/**
 * ゴルフ場を新規作成
 */
export async function createGolfCourse(formData: FormData) {
  await requireAdminForAction();

  const name = formData.get("name") as string;
  const prefecture = (formData.get("prefecture") as string) || null;
  const city = (formData.get("city") as string) || null;

  if (!name || name.trim() === "") {
    throw new Error("ゴルフ場名は必須です");
  }

  await prisma.mstGolfCourse.create({
    data: { name, prefecture, city },
  });

  redirect("/golf-courses");
}

/**
 * ゴルフ場を更新
 */
export async function updateGolfCourse(formData: FormData) {
  await requireAdminForAction();

  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const prefecture = (formData.get("prefecture") as string) || null;
  const city = (formData.get("city") as string) || null;

  if (!id) {
    throw new Error("IDが不正です");
  }

  if (!name || name.trim() === "") {
    throw new Error("ゴルフ場名は必須です");
  }

  await prisma.mstGolfCourse.update({
    where: { id },
    data: { name, prefecture, city },
  });

  redirect("/golf-courses");
}

/**
 * コース（OUT / IN など）を追加
 */
export async function createCourseLayout(formData: FormData) {
  await requireAdminForAction();

  const golfCourseId = formData.get("golfCourseId") as string;
  const name = formData.get("name") as string;

  if (!golfCourseId) {
    throw new Error("ゴルフ場IDが不正です");
  }

  if (!name || name.trim() === "") {
    throw new Error("コース名は必須です");
  }

  // 既存コースの最大 displayOrder を取得
  const lastLayout = await prisma.mstCourseLayout.findFirst({
    where: { golfCourseId },
    orderBy: { displayOrder: "desc" },
  });

  const nextDisplayOrder = lastLayout
    ? lastLayout.displayOrder + 1
    : 1;

  await prisma.mstCourseLayout.create({
    data: {
      golfCourseId,
      name,
      holeCount: 9,
      displayOrder: nextDisplayOrder,
    },
  });

  redirect(`/golf-courses/${golfCourseId}/layouts`);
}

/**
 * コース名を更新
 */
export async function updateCourseLayoutName(formData: FormData) {
  await requireAdminForAction();

  const layoutId = formData.get("layoutId") as string;
  const golfCourseId = formData.get("golfCourseId") as string;
  const name = formData.get("name") as string;

  if (!layoutId || !golfCourseId) {
    throw new Error("コースIDが不正です");
  }

  if (!name || name.trim() === "") {
    throw new Error("コース名は必須です");
  }

  await prisma.mstCourseLayout.update({
    where: { id: layoutId },
    data: { name },
  });

  // 同じ画面に戻す
  redirect(`/golf-courses/${golfCourseId}/layouts`);
}


/**
 * Hole情報
 */
type HoleInput = {
  holeNumber: number;
  par: number;
  yardRegular: number;
};

/**
 * 受け取ったデータのクレンジング
 */
function parseHoleInputsJson(json: string): HoleInput[] {
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Holeデータの形式が不正です");
  }

  return parsed.map((row, index) => {
    if (
      typeof row !== "object" ||
      row == null ||
      typeof (row as any).holeNumber !== "number" ||
      typeof (row as any).par !== "number" ||
      typeof (row as any).yardRegular !== "number"
    ) {
      throw new Error(`Holeデータの形式が不正です（${index + 1}行目）`);
    }
    return {
      holeNumber: (row as any).holeNumber,
      par: (row as any).par,
      yardRegular: (row as any).yardRegular,
    };
  });
}

/**
 * Hole定義を保存（既存削除→再作成）
 */
export async function saveHoles(formData: FormData) {
  await requireAdminForAction();

  const golfCourseId = formData.get("golfCourseId") as string;
  const layoutId = formData.get("layoutId") as string;
  const holesJson = formData.get("holesJson") as string;
  const now = new Date();

  if (!golfCourseId) throw new Error("ゴルフ場IDが不正です");
  if (!layoutId) throw new Error("コースIDが不正です");
  if (!holesJson) throw new Error("Holeデータが空です");

  const layout = await prisma.mstCourseLayout.findUnique({
    where: { id: layoutId },
  });

  if (!layout) throw new Error("コースが見つかりません");

  const holes = parseHoleInputsJson(holesJson);

  if (holes.length !== layout.holeCount) {
    throw new Error(`Hole数が不一致です（期待: ${layout.holeCount} / 入力: ${holes.length}）`);
  }

  // 1..N の連番チェック
  for (let i = 0; i < holes.length; i++) {
    const expected = i + 1;
    if (holes[i].holeNumber !== expected) {
      throw new Error(`Hole番号が不正です（${expected}番が ${holes[i].holeNumber} になっています）`);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.mstHole.deleteMany({
      where: { courseLayoutId: layoutId },
    });

    for (const h of holes) {
      await tx.mstHole.create({
        data: {
          courseLayoutId: layoutId,
          holeNumber: h.holeNumber,
          par: h.par,
          yardRegular: h.yardRegular,
          updatedAt: now,
        },
      });
    }
  });

  redirect(`/golf-courses/${golfCourseId}/layouts/${layoutId}/holes`);
}
```

- [x] **Step 2: 型チェックを実行**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [x] **Step 3: Commit**

```bash
git add app/golf-courses/actions.ts
git commit -m "feat: ゴルフ場管理Server Actionsを管理者限定にする"
```

---

## Task 5: ゴルフ場管理画面を管理者限定＋共有マスタ表示に更新する

**Files:**
- Modify: `app/golf-courses/page.tsx`
- Modify: `app/golf-courses/new/page.tsx`
- Modify: `app/golf-courses/[golfCourseId]/edit/page.tsx`
- Modify: `app/golf-courses/[golfCourseId]/layouts/page.tsx`
- Modify: `app/golf-courses/[golfCourseId]/layouts/[layoutId]/holes/page.tsx`

**Interfaces:**
- Consumes: `requireAdminForPage(): Promise<CurrentUser>`（Task 2）、`prisma.mstGolfCourse`（`userId` なし。Task 3）、`createGolfCourse`/`updateGolfCourse`（Task 4、`prefecture`/`city` フィールドを受け取る）

- [x] **Step 1: 一覧画面を更新**

```tsx
// app/golf-courses/page.tsx
import Link from 'next/link'
import { prisma } from "@/src/lib/db/prisma";
import { requireAdminForPage } from "@/src/lib/auth/requireAdmin";

export default async function GolfCourseListPage() {
  await requireAdminForPage();

  const courses = await prisma.mstGolfCourse.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="p-6 max-w-2xl mx-auto flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="page-heading">ゴルフ場（管理者用）</h1>
        <Link href="/golf-courses/new" className="btn-primary">
          ＋ 新規作成
        </Link>
      </div>

      {courses.length === 0 ? (
        <div className="page-card text-sm text-gray-400 text-center py-8">
          ゴルフ場が登録されていません
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {courses.map((course: { id: string; name: string }) => (
            <div key={course.id} className="page-card flex justify-between items-center">
              <span className="text-sm text-gray-900">{course.name}</span>
              <div className="flex gap-3">
                <Link href={`/golf-courses/${course.id}/edit`} className="btn-ghost">
                  編集
                </Link>
                <Link href={`/golf-courses/${course.id}/layouts`} className="btn-ghost">
                  コース管理
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
```

- [x] **Step 2: 新規作成画面に都道府県・市区町村フィールドを追加**

```tsx
// app/golf-courses/new/page.tsx
import Link from 'next/link'
import { requireAdminForPage } from "@/src/lib/auth/requireAdmin";
import { createGolfCourse } from "../actions";

export default async function NewGolfCoursePage() {
  await requireAdminForPage();

  return (
    <main className="p-6 max-w-lg mx-auto flex flex-col gap-4">
      <nav>
        <Link href="/golf-courses" className="nav-back">← ゴルフ場一覧</Link>
      </nav>
      <h1 className="page-heading">ゴルフ場を追加</h1>

      <form action={createGolfCourse} className="page-card flex flex-col gap-5">
        <div>
          <label className="field-label" htmlFor="name">ゴルフ場名</label>
          <input
            id="name"
            type="text"
            name="name"
            required
            placeholder="例：筑波ゴルフクラブ"
            className="input-underline"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="prefecture">都道府県</label>
          <input
            id="prefecture"
            type="text"
            name="prefecture"
            placeholder="例：茨城県"
            className="input-underline"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="city">市区町村</label>
          <input
            id="city"
            type="text"
            name="city"
            placeholder="例：土浦市"
            className="input-underline"
          />
        </div>
        <div>
          <button type="submit" className="btn-primary">保存</button>
        </div>
      </form>
    </main>
  );
}
```

- [x] **Step 3: 編集画面から所有者チェックを削除し、都道府県・市区町村フィールドを追加**

```tsx
// app/golf-courses/[golfCourseId]/edit/page.tsx
import Link from 'next/link'
import { prisma } from "@/src/lib/db/prisma";
import { requireAdminForPage } from "@/src/lib/auth/requireAdmin";
import { updateGolfCourse } from "../../actions";

type Props = {
  params: Promise<{
    golfCourseId: string;
  }>;
};

export default async function EditGolfCoursePage({ params }: Props) {
  const { golfCourseId } = await params; // Next.js 16 仕様
  await requireAdminForPage();

  if (!golfCourseId) {
    return <div>不正なIDです</div>;
  }

  const course = await prisma.mstGolfCourse.findUnique({
    where: { id: golfCourseId },
  });

  if (!course) {
    return <div>ゴルフ場が見つかりません</div>;
  }

  return (
    <main className="p-6 max-w-lg mx-auto flex flex-col gap-4">
      <nav>
        <Link href="/golf-courses" className="nav-back">← ゴルフ場一覧</Link>
      </nav>
      <h1 className="page-heading">ゴルフ場を編集</h1>

      <form action={updateGolfCourse} className="page-card flex flex-col gap-5">
        <input type="hidden" name="id" value={course.id} />
        <div>
          <label className="field-label" htmlFor="name">ゴルフ場名</label>
          <input
            id="name"
            type="text"
            name="name"
            required
            defaultValue={course.name}
            className="input-underline"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="prefecture">都道府県</label>
          <input
            id="prefecture"
            type="text"
            name="prefecture"
            defaultValue={course.prefecture ?? ""}
            className="input-underline"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="city">市区町村</label>
          <input
            id="city"
            type="text"
            name="city"
            defaultValue={course.city ?? ""}
            className="input-underline"
          />
        </div>
        <div>
          <button type="submit" className="btn-primary">更新</button>
        </div>
      </form>
    </main>
  );
}
```

- [x] **Step 4: コース管理画面から所有者チェックを削除**

```tsx
// app/golf-courses/[golfCourseId]/layouts/page.tsx
import { prisma } from "@/src/lib/db/prisma";
import { requireAdminForPage } from "@/src/lib/auth/requireAdmin";
import { createCourseLayout } from "../../actions";
import { updateCourseLayoutName } from "../../actions";
import Link from "next/link";

type Props = {
  params: Promise<{
    golfCourseId: string;
  }>;
};

export default async function CourseLayoutPage({ params }: Props) {
  const { golfCourseId } = await params;
  await requireAdminForPage();

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

  if (!golfCourse) {
    return <div>ゴルフ場が見つかりません</div>;
  }

  return (
    <main className="p-6 max-w-2xl mx-auto flex flex-col gap-4">
      <nav>
        <Link href="/golf-courses" className="nav-back">← ゴルフ場一覧</Link>
      </nav>
      <h1 className="page-heading">{golfCourse.name} — コース管理</h1>

      {/* コース追加フォーム */}
      <div className="page-card flex flex-col gap-4">
        <span className="page-subheading">コースを追加</span>
        <form action={createCourseLayout} className="flex flex-col gap-4">
          <input type="hidden" name="golfCourseId" value={golfCourseId} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">コース名</label>
              <input type="text" name="name" required placeholder="例：OUT" className="input-underline" />
            </div>
            <div>
              <label className="field-label">ホール数</label>
              <input type="number" name="holeCount" required min={1} max={18} defaultValue={9} className="input-underline" />
            </div>
          </div>
          <div>
            <button type="submit" className="btn-primary">追加</button>
          </div>
        </form>
      </div>

      {/* コース一覧 */}
      {golfCourse.layouts.map((layout: { id: string; name: string; holeCount: number; holes: { holeNumber: number; par: number }[] }) => (
        <div key={layout.id} className="page-card flex flex-col gap-3">
          <div className="flex justify-between items-start">
            <div>
              <div className="page-subheading">{layout.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{layout.holeCount}H · {layout.holes.length}ホール登録済</div>
            </div>
            <Link href={`/golf-courses/${golfCourseId}/layouts/${layout.id}/holes`} className="btn-secondary text-xs px-3 py-1.5">
              ホール設定
            </Link>
          </div>

          {/* コース名変更フォーム */}
          <form action={updateCourseLayoutName} className="flex gap-2 items-end border-t border-gray-100 pt-3">
            <input type="hidden" name="layoutId" value={layout.id} />
            <div className="flex-1">
              <label className="field-label">コース名を変更</label>
              <input type="text" name="name" defaultValue={layout.name} className="input-underline" />
            </div>
            <button type="submit" className="btn-secondary text-xs px-3 py-1.5">変更</button>
          </form>
        </div>
      ))}
    </main>
  );
}
```

- [x] **Step 5: ホール設定画面から所有者チェックを削除**

```tsx
// app/golf-courses/[golfCourseId]/layouts/[layoutId]/holes/page.tsx
import Link from "next/link";
import { prisma } from "@/src/lib/db/prisma";
import { requireAdminForPage } from "@/src/lib/auth/requireAdmin";
import HoleDefinitionClient from "./ui";

type Props = {
  params: Promise<{
    golfCourseId: string;
    layoutId: string;
  }>;
};

export default async function HoleDefinitionPage({ params }: Props) {
  const { golfCourseId, layoutId } = await params;
  await requireAdminForPage();

  const golfCourse = await prisma.mstGolfCourse.findUnique({
    where: { id: golfCourseId },
  });

  const layout = await prisma.mstCourseLayout.findUnique({
    where: { id: layoutId },
  });

  if (!golfCourse || !layout) {
    return <div>ゴルフ場またはコースが見つかりません</div>;
  }

  const existingHoles = await prisma.mstHole.findMany({
    where: { courseLayoutId: layoutId },
    orderBy: { holeNumber: "asc" },
  });

  const initialHoles = existingHoles.length
    ? existingHoles.map((h: { holeNumber: number; par: number; yardRegular: number }) => ({
        holeNumber: h.holeNumber,
        par: h.par,
        yardRegular: h.yardRegular,
      }))
    : Array.from({ length: layout.holeCount }, (_, i) => ({
        holeNumber: i + 1,
        par: 4,
        yardRegular: 0,
      }));

  return (
    <main className="p-6 max-w-2xl mx-auto flex flex-col gap-4">
      <nav>
        <Link href={`/golf-courses/${golfCourseId}/layouts`} className="nav-back">
          ← {golfCourse.name} コース管理
        </Link>
      </nav>
      <h1 className="page-heading">{layout.name} — ホール設定</h1>

      <HoleDefinitionClient
        golfCourseId={golfCourseId}
        layoutId={layoutId}
        holeCount={layout.holeCount}
        initialHoles={initialHoles}
      />
    </main>
  );
}
```

- [x] **Step 6: 型チェックを実行**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [x] **Step 7: Commit**

```bash
git add app/golf-courses
git commit -m "feat: ゴルフ場管理画面を管理者限定・共有マスタ表示に更新"
```

---

## Task 6: ラウンド記録画面でユーザー専有フィルタを外す

**Files:**
- Modify: `app/rounds/new/page.tsx`
- Modify: `app/rounds/import/page.tsx`

**Interfaces:**
- Consumes: `prisma.mstGolfCourse`（`userId` なし。Task 3）

- [x] **Step 1: `/rounds/new` のゴルフ場一覧取得からuserIdフィルタを削除**

```tsx
// app/rounds/new/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/db/prisma";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";
import { createRound } from "../actions";

export default async function NewRoundPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const golfCourses = await prisma.mstGolfCourse.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <main className="p-6 max-w-lg mx-auto flex flex-col gap-4">
      <nav>
        <Link href="/rounds" className="nav-back">← ラウンド履歴</Link>
      </nav>
      <h1 className="page-heading">ラウンドを作成</h1>

      <form action={createRound} className="page-card flex flex-col gap-5">
        <div>
          <label className="field-label" htmlFor="playedAt">プレー日</label>
          <input
            id="playedAt"
            type="date"
            name="playedAt"
            required
            className="input-underline"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="golfCourseId">ゴルフ場</label>
          <select id="golfCourseId" name="golfCourseId" required className="select-underline">
            <option value="">選択してください</option>
            {golfCourses.map((gc: { id: string; name: string }) => (
              <option key={gc.id} value={gc.id}>{gc.name}</option>
            ))}
          </select>
        </div>
        <div>
          <button type="submit" className="btn-primary">次へ</button>
        </div>
      </form>
    </main>
  );
}
```

- [x] **Step 2: `/rounds/import` のゴルフ場一覧取得からuserIdフィルタを削除し、空データ時の案内文言を更新**

`app/rounds/import/page.tsx` の `golfCourses` 取得部分を変更：

```tsx
  const golfCourses = await prisma.mstGolfCourse.findMany({
    orderBy: { name: "asc" },
    include: {
      layouts: {
        orderBy: { displayOrder: "asc" },
        select: { id: true, name: true, holeCount: true },
      },
    },
  })
```

空データ時の案内（自己登録の導線を削除し、管理者への依頼文言に変更）：

```tsx
      {golfCourses.length === 0 ? (
        <div className="page-card bg-yellow-50 border-yellow-200 text-sm text-yellow-800">
          <p className="font-medium mb-1">ゴルフ場が登録されていません</p>
          <p className="text-xs text-yellow-700">
            インポートするには、まずゴルフ場とコースレイアウト（OUT/IN）の登録が必要です。管理者にご依頼ください。
          </p>
        </div>
      ) : (
        <ImportForm golfCourses={golfCourses} existingRound={existingRound} />
      )}
```

- [x] **Step 3: 型チェックを実行**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [x] **Step 4: Commit**

```bash
git add app/rounds/new/page.tsx app/rounds/import/page.tsx
git commit -m "feat: ラウンド記録画面のゴルフ場一覧を共有マスタベースに変更"
```

---

## Task 7: 動作確認

**Files:** なし（手動検証のみ）

- [x] **Step 1: 既存テストスイート全体を実行**

Run: `npx vitest run`
Expected: 全テストPASS

- [x] **Step 2: ローカルSupabaseを起動し、動作確認用の管理者ユーザーを用意**

Run: `supabase status`（未起動なら `supabase start`）

Supabase Studio（`http://127.0.0.1:54323`）の「Authentication」→「Users」でテストユーザーを作成し、`/login` からログインして一度アプリにアクセスし `mst_users` レコードを自動作成させた後、以下のSQLでそのユーザーを管理者にする：

```sql
UPDATE mst_users SET role = 'admin' WHERE email = '<作成したテストユーザーのメールアドレス>';
```

- [x] **Step 3: 開発サーバーを起動し、管理者として動作確認**

Run: `npm run dev`

ブラウザで以下を確認する：
- `/golf-courses` にアクセスでき、ゴルフ場の新規作成（都道府県・市区町村含む）・編集ができる
- 作成したゴルフ場に対して `/golf-courses/{id}/layouts` からコース追加、`/golf-courses/{id}/layouts/{layoutId}/holes` からホール設定ができる

Playwright（`webapp-testing` skill）で `admin-user@example.com` としてログインし、ヘッダーナビの「ゴルフ場」リンク表示、ゴルフ場新規作成（都道府県・市区町村含む）、編集、レイアウト（OUT・9H）追加、ホール設定（Par/Yard保存）までフルCRUDで確認済み。

- [x] **Step 4: 一般ユーザー（role: user）として動作確認**

Supabase Studioで別のテストユーザーを作成し（roleは自動的に `user` になる）、そのユーザーでログインして以下を確認する：
- `/golf-courses` にアクセスすると `/rounds` にリダイレクトされる
- `/rounds/new` でゴルフ場選択に、管理者が作成したゴルフ場が一覧表示される
- そのゴルフ場を選んでラウンドを作成でき、ホール結果を記録できる

Playwrightで `test-user@example.com` としてログインし、ヘッダーナビに「ゴルフ場」リンクが表示されないこと、`/golf-courses`直接アクセス時に`/rounds`へリダイレクトされること、`/rounds/new`で管理者作成のゴルフ場が選択肢に表示されラウンド作成・ホール結果記録（Bogey等の判定含む）ができることを確認済み。

- [x] **Step 5: 既存のGDOインポート機能を回帰確認**

`/rounds/import` にアクセスし、管理者が登録済みのゴルフ場・コースが選択肢に表示され、GDOスコアのインポートが従来通り動作することを確認する

Playwrightで9Hモードのサンプルスコアカード（`src/lib/parsers/__tests__/gdoScorecard.test.ts`の`SAMPLE_9H`相当）を貼り付けてパース・インポートし、共有マスタのゴルフ場・レイアウトに紐づく形でホール結果（合計スコア45・パット17）が正しく保存されることを確認済み。
