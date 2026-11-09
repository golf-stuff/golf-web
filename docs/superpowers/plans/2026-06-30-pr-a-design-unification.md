# PR-A デザイン統一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全ページのフォーム要素・ボタン・レイアウトをダッシュボードのデザイントークンに統一する

**Architecture:** `globals.css` に共通クラス（`.input-underline`, `.btn-primary`, `.btn-secondary`, `.page-card`）を定義し、各ページで Tailwind inline styles を廃してこれらのクラスを使う。ダッシュボード（`/`）が確立した `bg-white border border-gray-200 rounded-xl` カードを全ページで踏襲する。

**Tech Stack:** Next.js 16 App Router、Tailwind CSS v4、TypeScript

## Global Constraints

- Tailwind CSS v4 — `globals.css` の先頭は `@import "tailwindcss"` のまま維持
- `@apply` は使わず、プレーンな CSS プロパティで `.input-underline` 等を記述する（v4 互換のため）
- Server Components はそのまま、`'use client'` 指令は変えない
- DB アクセス・ビジネスロジックは一切変更しない（スタイルのみ）
- `npm run test` がすべて通ること（ロジック変更なしなのでテストは壊れないはず）

---

## ファイル構成

| ファイル | 変更内容 |
|---------|---------|
| `golf-web/app/globals.css` | 共通クラスを追加 |
| `golf-web/app/rounds/page.tsx` | Tailwind 化 |
| `golf-web/app/rounds/new/page.tsx` | Tailwind 化・underline input |
| `golf-web/app/rounds/[roundId]/holes/page.tsx` | ボタン・ヘッダー Tailwind 化（テーブル内部は最小変更） |
| `golf-web/app/golf-courses/page.tsx` | Tailwind 化 |
| `golf-web/app/golf-courses/new/page.tsx` | Tailwind 化・underline input |
| `golf-web/app/golf-courses/[golfCourseId]/edit/page.tsx` | Tailwind 化・underline input |
| `golf-web/app/golf-courses/[golfCourseId]/layouts/page.tsx` | Tailwind 化 |
| `golf-web/app/golf-courses/[golfCourseId]/layouts/[layoutId]/holes/page.tsx` | Tailwind 化 |
| `golf-web/app/golf-courses/[golfCourseId]/layouts/[layoutId]/holes/ui.tsx` | Tailwind 化・underline textarea |

---

## Task 1: globals.css に共通スタイルクラスを追加

**Files:**
- Modify: `golf-web/app/globals.css`

**Interfaces:**
- Produces: `.input-underline`, `.select-underline`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.page-card`, `.field-label`, `.page-heading`, `.page-subheading`, `.nav-back`

- [x] **Step 1: globals.css を開いて現在の内容を確認する**

現在の内容:
```css
@import "tailwindcss";
```

- [x] **Step 2: 共通クラスを追記する**

```css
@import "tailwindcss";

/* フォーム要素 — 下線スタイル（スコアカードの記入欄） */
.input-underline {
  border: none;
  border-bottom: 1px solid rgb(209 213 219); /* gray-300 */
  border-radius: 0;
  background: transparent;
  padding: 0.375rem 0;
  font-size: 0.875rem;
  line-height: 1.5;
  width: 100%;
  color: rgb(17 24 39); /* gray-900 */
}
.input-underline:focus {
  outline: none;
  border-bottom-color: rgb(17 24 39); /* gray-900 */
}
.input-underline::placeholder {
  color: rgb(156 163 175); /* gray-400 */
}

/* select の underline スタイル */
.select-underline {
  border: none;
  border-bottom: 1px solid rgb(209 213 219);
  border-radius: 0;
  background: transparent url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat right 2px center;
  padding: 0.375rem 1.25rem 0.375rem 0;
  font-size: 0.875rem;
  width: 100%;
  color: rgb(17 24 39);
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}
.select-underline:focus {
  outline: none;
  border-bottom-color: rgb(17 24 39);
}

/* ボタン */
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  background: rgb(17 24 39); /* gray-900 */
  color: white;
  font-size: 0.875rem;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-weight: 500;
}
.btn-primary:hover { background: rgb(31 41 55); } /* gray-800 */
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  background: transparent;
  color: rgb(55 65 81); /* gray-700 */
  font-size: 0.875rem;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid rgb(209 213 219); /* gray-300 */
  cursor: pointer;
  font-family: inherit;
}
.btn-secondary:hover { background: rgb(249 250 251); } /* gray-50 */
.btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: transparent;
  color: rgb(37 99 235); /* blue-600 */
  font-size: 0.75rem;
  padding: 0.25rem 0;
  border: none;
  cursor: pointer;
  font-family: inherit;
}
.btn-ghost:hover { text-decoration: underline; }

/* レイアウト */
.page-card {
  background: white;
  border: 1px solid rgb(229 231 235); /* gray-200 */
  border-radius: 0.75rem; /* rounded-xl */
  padding: 1.25rem;
}

.field-label {
  display: block;
  font-size: 0.75rem;
  color: rgb(107 114 128); /* gray-500 */
  margin-bottom: 0.25rem;
}

.page-heading {
  font-size: 1.125rem;
  font-weight: 500;
  color: rgb(17 24 39);
}

.page-subheading {
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(17 24 39);
}

.nav-back {
  font-size: 0.75rem;
  color: rgb(37 99 235);
  text-decoration: none;
}
.nav-back:hover { text-decoration: underline; }
```

- [x] **Step 3: 開発サーバーを起動してスタイルが読み込まれることを確認する**

```bash
cd golf-web && node node_modules/.bin/next dev
```

ブラウザで `http://localhost:3000` を開き、ページが壊れていないことを確認する。

- [x] **Step 4: コミット**

```bash
git add golf-web/app/globals.css
git commit -m "style: 共通フォーム・ボタン・レイアウトクラスを globals.css に追加"
```

---

## Task 2: ゴルフ場関連ページを Tailwind 化

**Files:**
- Modify: `golf-web/app/golf-courses/page.tsx`
- Modify: `golf-web/app/golf-courses/new/page.tsx`
- Modify: `golf-web/app/golf-courses/[golfCourseId]/edit/page.tsx`
- Modify: `golf-web/app/golf-courses/[golfCourseId]/layouts/page.tsx`
- Modify: `golf-web/app/golf-courses/[golfCourseId]/layouts/[layoutId]/holes/page.tsx`
- Modify: `golf-web/app/golf-courses/[golfCourseId]/layouts/[layoutId]/holes/ui.tsx`

**Interfaces:**
- Consumes: Task 1 で定義した `.page-card`, `.input-underline`, `.btn-primary`, `.btn-secondary`, `.field-label`, `.page-heading`, `.nav-back`

- [x] **Step 1: ゴルフ場一覧ページを書き換える**

`golf-web/app/golf-courses/page.tsx`:
```tsx
import Link from 'next/link'
import { prisma } from "@/src/lib/db/prisma";

export default async function GolfCourseListPage() {
  const courses = await prisma.mstGolfCourse.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="p-6 max-w-2xl mx-auto flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="page-heading">ゴルフ場</h1>
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

- [x] **Step 2: ゴルフ場追加ページを書き換える**

`golf-web/app/golf-courses/new/page.tsx`:
```tsx
import Link from 'next/link'
import { createGolfCourse } from "../actions";

export default function NewGolfCoursePage() {
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
          <button type="submit" className="btn-primary">保存</button>
        </div>
      </form>
    </main>
  );
}
```

- [x] **Step 3: ゴルフ場編集ページを書き換える**

`golf-web/app/golf-courses/[golfCourseId]/edit/page.tsx` の `return` ブロック全体を以下に置き換える（DB取得ロジックはそのまま）:

```tsx
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
          <button type="submit" className="btn-primary">更新</button>
        </div>
      </form>
    </main>
  );
```

※ ファイル冒頭に `import Link from 'next/link'` を追加すること。

- [x] **Step 4: layouts/page.tsx を書き換える**

ファイル全体を確認してから、`return` ブロックを以下に置き換える（DB取得ロジックはそのまま）。

既存の `return (...)` ブロックを:
```tsx
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
```

※ 既存の `import` 行はそのまま維持する。

- [x] **Step 5: holes/page.tsx（ホール定義）を書き換える**

`golf-web/app/golf-courses/[golfCourseId]/layouts/[layoutId]/holes/page.tsx` の `return` ブロック:

```tsx
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
        initialHoles={existingHoles}
      />
    </main>
  );
```

- [x] **Step 6: holes/ui.tsx（クライアントコンポーネント）のスタイルを更新する**

`golf-web/app/golf-courses/[golfCourseId]/layouts/[layoutId]/holes/ui.tsx` のスタイル部分を Tailwind に置き換える。

具体的には `return (...)` 内の `style={{...}}` を削除し、Tailwind クラスに変換する。キーとなる部分:

```tsx
  return (
    <div className="flex flex-col gap-6">
      {/* GDO コピペ入力エリア */}
      <div className="page-card flex flex-col gap-4">
        <span className="page-subheading">GDOスコアカードから一括入力</span>
        <p className="text-xs text-gray-400">
          GDOサイトのスコアカード（Hole / Par / Yard 行）をコピーして貼り付けてください。
        </p>
        <textarea
          className="border border-gray-200 rounded-lg p-3 text-xs font-mono h-32 resize-none w-full"
          placeholder={'Hole\t1\t2\t...\nPar\t4\t3\t...\nYard\t350\t150\t...'}
          value={rawText}
          onChange={e => setRawText(e.target.value)}
        />
        {message && (
          <p className={`text-xs ${message.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
            {message}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={handleParse} className="btn-primary text-xs px-3 py-1.5">
            パースして反映
          </button>
          <button type="button" onClick={handleReset} className="btn-secondary text-xs px-3 py-1.5">
            リセット
          </button>
        </div>
      </div>

      {/* ホール入力テーブル */}
      <div className="page-card overflow-x-auto">
        <form action={saveHoles}>
          <input type="hidden" name="golfCourseId" value={golfCourseId} />
          <input type="hidden" name="layoutId" value={layoutId} />
          <input type="hidden" name="holes" value={holesJson} />
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 px-3 text-left text-xs text-gray-400 font-medium">Hole</th>
                <th className="py-2 px-3 text-right text-xs text-gray-400 font-medium">Par</th>
                <th className="py-2 px-3 text-right text-xs text-gray-400 font-medium">Yard</th>
              </tr>
            </thead>
            <tbody>
              {holes.map((hole, i) => (
                <tr key={hole.holeNumber} className={i < holes.length - 1 ? 'border-b border-gray-100' : ''}>
                  <td className="py-2 px-3 text-gray-500 text-xs">{hole.holeNumber}</td>
                  <td className="py-2 px-3 text-right">
                    <input
                      type="number"
                      className="input-underline text-right w-16"
                      value={hole.par}
                      onChange={e => handleHoleChange(i, 'par', Number(e.target.value))}
                      min={3} max={5}
                    />
                  </td>
                  <td className="py-2 px-3 text-right">
                    <input
                      type="number"
                      className="input-underline text-right w-20"
                      value={hole.yardRegular}
                      onChange={e => handleHoleChange(i, 'yardRegular', Number(e.target.value))}
                      min={0}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <button type="submit" className="btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>
  );
```

※ `handleParse`, `handleReset`, `handleHoleChange` などの関数ロジックはそのまま維持する。

- [x] **Step 7: ブラウザで確認する**

`http://localhost:3000/golf-courses` にアクセスし、下線 input・ボタン・カードのスタイルが適用されていることを確認する。

- [x] **Step 8: コミット**

```bash
git add golf-web/app/golf-courses/
git commit -m "style: ゴルフ場ページを Tailwind 統一デザインに変更"
```

---

## Task 3: ラウンド関連ページを Tailwind 化

**Files:**
- Modify: `golf-web/app/rounds/page.tsx`
- Modify: `golf-web/app/rounds/new/page.tsx`
- Modify: `golf-web/app/rounds/[roundId]/holes/page.tsx`

**Interfaces:**
- Consumes: Task 1 で定義した共通クラス

- [x] **Step 1: ラウンド一覧ページを書き換える**

`golf-web/app/rounds/page.tsx`:
```tsx
import Link from "next/link";
import { prisma } from "@/src/lib/db/prisma";

export default async function RoundsPage() {
  const rounds = await prisma.trnRound.findMany({
    orderBy: { playedAt: "desc" },
    include: {
      golfCourse: true,
      holeResults: true,
    },
  });

  return (
    <main className="p-6 max-w-2xl mx-auto flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="page-heading">ラウンド履歴</h1>
        <div className="flex gap-2">
          <Link href="/rounds/import" className="btn-secondary text-xs px-3 py-1.5">
            GDOインポート
          </Link>
          <Link href="/rounds/new" className="btn-primary text-xs px-3 py-1.5">
            ＋ 新規
          </Link>
        </div>
      </div>

      {rounds.length === 0 ? (
        <div className="page-card text-sm text-gray-400 text-center py-8">
          ラウンド履歴はまだありません
        </div>
      ) : (
        <div className="page-card flex flex-col">
          {rounds.map((round: { id: string; playedAt: Date; golfCourse: { name: string }; holeResults: { stroke: number }[] }, index: number) => {
            const totalScore = round.holeResults.reduce((sum, r) => sum + r.stroke, 0);
            return (
              <div
                key={round.id}
                className={`flex items-center py-2.5 ${index < rounds.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <div className="text-xs text-gray-400 w-24 flex-shrink-0">
                  {round.playedAt.toISOString().slice(0, 10).replace(/-/g, '/')}
                </div>
                <div className="flex-1 text-sm text-gray-900">{round.golfCourse.name}</div>
                <div className="text-xl font-medium tabular-nums text-gray-900 mr-4">{totalScore || '—'}</div>
                <Link href={`/rounds/${round.id}/holes`} className="btn-ghost text-xs">
                  編集
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
```

- [x] **Step 2: ラウンド作成ページを書き換える**

`golf-web/app/rounds/new/page.tsx`:
```tsx
import Link from "next/link";
import { prisma } from "@/src/lib/db/prisma";
import { createRound } from "../actions";

export default async function NewRoundPage() {
  const golfCourses = await prisma.mstGolfCourse.findMany({
    orderBy: { createdAt: "asc" },
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

- [x] **Step 3: ホール入力ページのヘッダー・ボタン部分を Tailwind 化する**

`golf-web/app/rounds/[roundId]/holes/page.tsx` は複雑なテーブルを持つため、テーブル内部の `baseTh` / `baseTd` 等の inline styles はそのまま維持し、以下の構造的な部分のみを変更する。

ファイルの先頭にある style 定数（`baseTh`, `baseTd` 等）はそのまま残す。

`return (...)` ブロックの `<main>` 以下を書き換える:
```tsx
  return (
    <main className="p-4 flex flex-col gap-4">
      <nav>
        <Link href="/rounds" className="nav-back">← ラウンド履歴</Link>
      </nav>

      <div className="flex justify-between items-start">
        <div>
          <h1 className="page-heading">{round.golfCourse.name}</h1>
          <div className="text-xs text-gray-400 mt-0.5">
            {round.playedAt.toISOString().slice(0, 10).replace(/-/g, '/')}
          </div>
        </div>
        <Link
          href={`/rounds/import?roundId=${round.id}`}
          className="btn-secondary text-xs px-3 py-1.5"
        >
          GDOで上書き
        </Link>
      </div>

      {/* 合計サマリー */}
      <div className="page-card">
        <div className="flex gap-6">
          <div>
            <div className="text-xs text-gray-400">合計スコア</div>
            <div className="text-2xl font-medium tabular-nums">{totalScore}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">合計パット</div>
            <div className="text-2xl font-medium tabular-nums">{totalPutt}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">ペナルティ</div>
            <div className="text-2xl font-medium tabular-nums">{totalPenalty}</div>
          </div>
        </div>
      </div>

      <form action={saveRoundHoles}>
        <input type="hidden" name="roundId" value={round.id} />

        {/* コース別テーブル（内部スタイルはそのまま） */}
        {round.golfCourse.layouts.map((layout: ...) => {
          /* 既存の layout レンダリングコードをそのまま維持 */
        })}

        <div className="mt-4">
          <button type="submit" className="btn-primary">保存</button>
        </div>
      </form>
    </main>
  );
```

※ `round.golfCourse.layouts.map(...)` の中身（テーブル部分）は既存コードをそのまま維持する。型アノテーション、`holeResultMap` の計算等もそのまま。

- [x] **Step 4: ブラウザで確認する**

以下のページをすべて確認:
- `http://localhost:3000/rounds` — カード・ボタンのスタイル
- `http://localhost:3000/rounds/new` — 下線 input・select
- `http://localhost:3000/golf-courses` — カード・ボタン
- `http://localhost:3000/golf-courses/new` — 下線 input

- [x] **Step 5: 型チェックを実行する**

```bash
cd golf-web && node node_modules/typescript/bin/tsc --noEmit
```

Expected: エラーなし

- [x] **Step 6: テストを実行する**

```bash
cd golf-web && npx vitest run
```

Expected: 23 tests passed（スタイル変更のみなのでロジックテストは壊れない）

- [x] **Step 7: コミット**

```bash
git add golf-web/app/rounds/
git commit -m "style: ラウンドページを Tailwind 統一デザインに変更"
```

---

## 完了確認

全タスク完了後:

```bash
cd golf-web && npx vitest run && node node_modules/typescript/bin/tsc --noEmit
```

Expected:
- Tests: 23 passed
- TypeScript: エラーなし

ブラウザで全ページを順に開き、以下を確認:
- [x] 下線スタイルの input / select が表示される
- [x] `btn-primary`（黒背景）と `btn-secondary`（白背景・枠）が視覚的に区別できる
- [x] ダッシュボード（`/`）のカードと各ページのカードが同じ見た目（`rounded-xl border-gray-200`）になっている
- [x] モバイルサイズ（幅375px）でも崩れない
