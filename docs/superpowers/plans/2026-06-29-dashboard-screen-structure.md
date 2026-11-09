# Dashboard & Screen Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy `plays/` system, add a shared header nav, and implement a data-driven dashboard at `/` with lifetime stats, yearly stats, score trend graph, and recent rounds list.

**Architecture:** Server Components fetch all round data from Prisma and pass it to a pure `computeDashboardData()` function for calculation. The graph toggle is the only Client Component (`ScoreGraph`). Query logic and metric computation are separated into distinct files so metrics can be unit-tested without a database.

**Tech Stack:** Next.js 14 App Router, Prisma (PostgreSQL), Tailwind CSS, Recharts, Vitest

## Global Constraints

- All paths in this document are relative to `golf-web/` unless stated otherwise
- `@/*` path alias maps to the `golf-web/` root (per `tsconfig.json`)
- PC-first layout — no mobile/responsive requirements
- No authentication changes — `userId` remains `"user-dev"` (hardcoded)
- All UI text in Japanese
- Tailwind CSS for all styling — no inline styles, no CSS modules
- TypeScript strict mode — no `any` types
- Sentence case for all UI copy

---

### Task 1: Install and configure Tailwind CSS

**Files:**
- Modify: `package.json`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `app/globals.css`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: Tailwind utility classes available in all `app/` and `src/` files

- [x] **Step 1: Install Tailwind and PostCSS**

```bash
cd golf-web
npm install -D tailwindcss postcss autoprefixer
```

Expected: `tailwindcss`, `postcss`, `autoprefixer` appear in `devDependencies`.

- [x] **Step 2: Create `tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

export default config
```

- [x] **Step 3: Create `postcss.config.js`**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [x] **Step 4: Create `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [x] **Step 5: Update `app/layout.tsx` to import globals.css**

Replace the entire file with:

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Golf Stuff',
  description: 'ゴルフスコア管理・分析',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900">{children}</body>
    </html>
  )
}
```

- [x] **Step 6: Verify Tailwind works**

```bash
npm run build
```

Expected: build succeeds with no errors. If you see `Cannot find module 'tailwindcss'`, run `npm install` again.

- [x] **Step 7: Commit**

```bash
git add tailwind.config.ts postcss.config.js app/globals.css app/layout.tsx package.json package-lock.json
git commit -m "chore: install and configure Tailwind CSS"
```

---

### Task 2: Install and configure Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `npm run test` runs Vitest for files matching `**/__tests__/**/*.test.ts`

- [x] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

Expected: `vitest` appears in `devDependencies`.

- [x] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
})
```

- [x] **Step 3: Add test script to `package.json`**

Open `package.json` and add `"test": "vitest run"` to the `scripts` section:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run"
  }
}
```

- [x] **Step 4: Verify Vitest runs**

```bash
npm run test
```

Expected: `No test files found` — this is correct at this stage.

- [x] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: install and configure Vitest"
```

---

### Task 3: Remove legacy plays/ system

**Files:**
- Delete: `app/plays/` (entire directory)
- Delete: `src/lib/apiClient.ts`
- Delete: `src/lib/types.ts`

**Interfaces:**
- Consumes: nothing
- Produces: nothing (cleanup only)

- [x] **Step 1: Delete the plays directory and dead library files**

```bash
rm -rf app/plays
rm src/lib/apiClient.ts src/lib/types.ts
```

- [x] **Step 2: Check for remaining imports**

```bash
grep -r "apiClient\|from.*src/lib/types" app/ src/ --include="*.ts" --include="*.tsx"
```

Expected: no output. If any files appear, open them and remove the relevant import lines.

- [x] **Step 3: Verify the build still passes**

```bash
npm run build
```

Expected: build succeeds.

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove legacy plays/ system and dead apiClient/types files"
```

---

### Task 4: Common header nav

**Files:**
- Create: `app/_components/HeaderNav.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: nothing from other tasks
- Produces: `<HeaderNav />` — client component, no props, renders a `<header>` with 3 nav links

- [x] **Step 1: Create `app/_components/HeaderNav.tsx`**

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_LINKS = [
  { href: '/', label: 'ダッシュボード' },
  { href: '/rounds', label: 'ラウンド' },
  { href: '/golf-courses', label: 'ゴルフ場' },
]

export default function HeaderNav() {
  const pathname = usePathname()

  return (
    <header className="flex items-stretch h-[50px] pl-6 bg-white border-b border-gray-200">
      <div className="flex items-center text-sm font-medium text-gray-900 pr-6 border-r border-gray-200 mr-2">
        Golf Stuff
      </div>
      <nav className="flex items-stretch">
        {NAV_LINKS.map(({ href, label }) => {
          const isActive =
            href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex items-center px-4 text-sm',
                isActive
                  ? 'text-blue-600 font-medium shadow-[inset_0_-2px_0_#3b82f6]'
                  : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
```

- [x] **Step 2: Update `app/layout.tsx` to include HeaderNav**

Replace the entire file with:

```tsx
import type { Metadata } from 'next'
import './globals.css'
import HeaderNav from './_components/HeaderNav'

export const metadata: Metadata = {
  title: 'Golf Stuff',
  description: 'ゴルフスコア管理・分析',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900">
        <HeaderNav />
        {children}
      </body>
    </html>
  )
}
```

- [x] **Step 3: Type-check**

```bash
npm run build
```

Expected: build succeeds.

- [x] **Step 4: Commit**

```bash
git add app/_components/HeaderNav.tsx app/layout.tsx
git commit -m "feat: add common header nav"
```

---

### Task 5: Dashboard data layer

**Files:**
- Create: `src/lib/dashboard/queries.ts`
- Create: `src/lib/dashboard/metrics.ts`
- Create: `src/lib/dashboard/__tests__/metrics.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/src/lib/db/prisma`
- Produces:
  - `fetchRoundSummaries(): Promise<RoundSummary[]>` — exported from `queries.ts`
  - `computeDashboardData(rounds: RoundSummary[]): DashboardData` — exported from `metrics.ts`
  - Types `RoundSummary` and `DashboardData` exported from their respective files

- [x] **Step 1: Create `src/lib/dashboard/queries.ts`**

```typescript
import { prisma } from '@/src/lib/db/prisma'

export type RoundSummary = {
  id: string
  playedAt: Date
  courseName: string
  totalStrokes: number
  layoutStrokes: { layoutId: string; layoutName: string; strokes: number }[]
}

export async function fetchRoundSummaries(): Promise<RoundSummary[]> {
  const rounds = await prisma.trnRound.findMany({
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

  return rounds.map(round => {
    const totalStrokes = round.holeResults.reduce((sum, r) => sum + r.stroke, 0)

    const layoutMap = new Map<string, { name: string; strokes: number }>()
    for (const r of round.holeResults) {
      const layoutId = r.hole.courseLayoutId
      const layoutName = r.hole.courseLayout.name
      const current = layoutMap.get(layoutId) ?? { name: layoutName, strokes: 0 }
      layoutMap.set(layoutId, { name: current.name, strokes: current.strokes + r.stroke })
    }

    return {
      id: round.id,
      playedAt: round.playedAt,
      courseName: round.golfCourse.name,
      totalStrokes,
      layoutStrokes: Array.from(layoutMap.entries()).map(([layoutId, v]) => ({
        layoutId,
        layoutName: v.name,
        strokes: v.strokes,
      })),
    }
  })
}
```

- [x] **Step 2: Write failing tests in `src/lib/dashboard/__tests__/metrics.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { computeDashboardData } from '../metrics'
import type { RoundSummary } from '../queries'

function makeRound(overrides: {
  id?: string
  playedAt?: Date
  courseName?: string
  totalStrokes: number
  layoutStrokes?: RoundSummary['layoutStrokes']
}): RoundSummary {
  return {
    id: overrides.id ?? 'r1',
    playedAt: overrides.playedAt ?? new Date('2025-01-01'),
    courseName: overrides.courseName ?? 'Test CC',
    totalStrokes: overrides.totalStrokes,
    layoutStrokes: overrides.layoutStrokes ?? [],
  }
}

describe('computeDashboardData', () => {
  describe('bestScore', () => {
    it('returns null when no rounds', () => {
      expect(computeDashboardData([]).bestScore).toBeNull()
    })

    it('returns null when all rounds have zero strokes', () => {
      expect(
        computeDashboardData([makeRound({ totalStrokes: 0 })]).bestScore
      ).toBeNull()
    })

    it('finds the round with minimum total strokes', () => {
      const rounds = [
        makeRound({ id: 'r1', totalStrokes: 90 }),
        makeRound({ id: 'r2', totalStrokes: 85, courseName: 'Best CC' }),
        makeRound({ id: 'r3', totalStrokes: 92 }),
      ]
      const result = computeDashboardData(rounds)
      expect(result.bestScore?.score).toBe(85)
      expect(result.bestScore?.courseName).toBe('Best CC')
    })
  })

  describe('bestHalf', () => {
    it('returns null when no layoutStrokes in any round', () => {
      expect(
        computeDashboardData([makeRound({ totalStrokes: 88 })]).bestHalf
      ).toBeNull()
    })

    it('finds the minimum single-layout stroke total across all rounds', () => {
      const rounds = [
        makeRound({
          totalStrokes: 88,
          layoutStrokes: [
            { layoutId: 'l1', layoutName: 'OUT', strokes: 44 },
            { layoutId: 'l2', layoutName: 'IN', strokes: 44 },
          ],
        }),
        makeRound({
          totalStrokes: 90,
          layoutStrokes: [
            { layoutId: 'l1', layoutName: 'OUT', strokes: 40 },
            { layoutId: 'l2', layoutName: 'IN', strokes: 50 },
          ],
        }),
      ]
      const result = computeDashboardData(rounds)
      expect(result.bestHalf?.score).toBe(40)
      expect(result.bestHalf?.layoutName).toBe('OUT')
    })
  })

  describe('thisYear', () => {
    const currentYear = new Date().getFullYear()

    it('counts only current-year rounds', () => {
      const rounds = [
        makeRound({ playedAt: new Date(`${currentYear}-03-01`), totalStrokes: 88 }),
        makeRound({ playedAt: new Date(`${currentYear - 1}-03-01`), totalStrokes: 85 }),
      ]
      expect(computeDashboardData(rounds).thisYear.roundCount).toBe(1)
    })

    it('computes average score to 1 decimal place', () => {
      const rounds = [
        makeRound({ playedAt: new Date(`${currentYear}-01-01`), totalStrokes: 90 }),
        makeRound({ playedAt: new Date(`${currentYear}-02-01`), totalStrokes: 80 }),
      ]
      expect(computeDashboardData(rounds).thisYear.avgScore).toBe(85)
    })

    it('returns null avgScore when no rounds this year', () => {
      const rounds = [makeRound({ playedAt: new Date('2020-01-01'), totalStrokes: 88 })]
      expect(computeDashboardData(rounds).thisYear.avgScore).toBeNull()
    })

    it('finds this year best score', () => {
      const rounds = [
        makeRound({ playedAt: new Date(`${currentYear}-01-01`), totalStrokes: 92 }),
        makeRound({ playedAt: new Date(`${currentYear}-06-01`), totalStrokes: 85 }),
      ]
      expect(computeDashboardData(rounds).thisYear.bestScore).toBe(85)
    })
  })

  describe('yearlyAverages', () => {
    it('groups rounds by year and computes average', () => {
      const rounds = [
        makeRound({ playedAt: new Date('2025-01-01'), totalStrokes: 90 }),
        makeRound({ playedAt: new Date('2025-06-01'), totalStrokes: 80 }),
        makeRound({ playedAt: new Date('2024-03-01'), totalStrokes: 95 }),
      ]
      const result = computeDashboardData(rounds)
      expect(result.yearlyAverages).toEqual([
        { year: 2024, avg: 95 },
        { year: 2025, avg: 85 },
      ])
    })

    it('sorts years in ascending order', () => {
      const rounds = [
        makeRound({ playedAt: new Date('2026-01-01'), totalStrokes: 88 }),
        makeRound({ playedAt: new Date('2024-01-01'), totalStrokes: 92 }),
      ]
      const years = computeDashboardData(rounds).yearlyAverages.map(y => y.year)
      expect(years).toEqual([2024, 2026])
    })

    it('excludes rounds with zero strokes', () => {
      const rounds = [
        makeRound({ playedAt: new Date('2025-01-01'), totalStrokes: 90 }),
        makeRound({ playedAt: new Date('2025-02-01'), totalStrokes: 0 }),
      ]
      expect(computeDashboardData(rounds).yearlyAverages).toEqual([{ year: 2025, avg: 90 }])
    })
  })

  describe('recent5 and recent20', () => {
    it('returns at most 5 rounds in recent5', () => {
      const rounds = Array.from({ length: 8 }, (_, i) =>
        makeRound({ id: `r${i}`, totalStrokes: 88 })
      )
      expect(computeDashboardData(rounds).recent5).toHaveLength(5)
    })

    it('returns at most 20 rounds in recent20', () => {
      const rounds = Array.from({ length: 25 }, (_, i) =>
        makeRound({ id: `r${i}`, totalStrokes: 88 })
      )
      expect(computeDashboardData(rounds).recent20).toHaveLength(20)
    })

    it('preserves the order of rounds (most recent first)', () => {
      const rounds = [
        makeRound({ id: 'newest', playedAt: new Date('2026-06-01'), totalStrokes: 88 }),
        makeRound({ id: 'oldest', playedAt: new Date('2026-01-01'), totalStrokes: 92 }),
      ]
      expect(computeDashboardData(rounds).recent5[0].id).toBe('newest')
    })
  })
})
```

- [x] **Step 3: Run tests to verify they fail**

```bash
npm run test
```

Expected: FAIL — `Cannot find module '../metrics'`

- [x] **Step 4: Create `src/lib/dashboard/metrics.ts`**

```typescript
import type { RoundSummary } from './queries'

export type DashboardData = {
  bestScore: { score: number; courseName: string; playedAt: Date } | null
  bestHalf: { score: number; courseName: string; layoutName: string; playedAt: Date } | null
  thisYear: { roundCount: number; bestScore: number | null; avgScore: number | null }
  yearlyAverages: { year: number; avg: number }[]
  recent5: { id: string; playedAt: Date; courseName: string; score: number }[]
  recent20: { id: string; score: number }[]
}

export function computeDashboardData(rounds: RoundSummary[]): DashboardData {
  const currentYear = new Date().getFullYear()
  const scored = rounds.filter(r => r.totalStrokes > 0)

  // Best 18H score
  const bestScoreRound = scored.reduce<RoundSummary | null>(
    (best, r) => (best === null || r.totalStrokes < best.totalStrokes ? r : best),
    null
  )

  // Best half (minimum single-layout stroke total)
  let bestHalf: DashboardData['bestHalf'] = null
  for (const r of rounds) {
    for (const ls of r.layoutStrokes) {
      if (ls.strokes > 0 && (bestHalf === null || ls.strokes < bestHalf.score)) {
        bestHalf = {
          score: ls.strokes,
          courseName: r.courseName,
          layoutName: ls.layoutName,
          playedAt: r.playedAt,
        }
      }
    }
  }

  // This year
  const thisYearRounds = scored.filter(r => r.playedAt.getFullYear() === currentYear)
  const thisYearBest =
    thisYearRounds.length > 0 ? Math.min(...thisYearRounds.map(r => r.totalStrokes)) : null
  const thisYearAvg =
    thisYearRounds.length > 0
      ? Math.round(
          (thisYearRounds.reduce((s, r) => s + r.totalStrokes, 0) / thisYearRounds.length) * 10
        ) / 10
      : null

  // Yearly averages
  const yearMap = new Map<number, number[]>()
  for (const r of scored) {
    const year = r.playedAt.getFullYear()
    const arr = yearMap.get(year) ?? []
    arr.push(r.totalStrokes)
    yearMap.set(year, arr)
  }
  const yearlyAverages = Array.from(yearMap.entries())
    .map(([year, scores]) => ({
      year,
      avg: Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10,
    }))
    .sort((a, b) => a.year - b.year)

  return {
    bestScore: bestScoreRound
      ? {
          score: bestScoreRound.totalStrokes,
          courseName: bestScoreRound.courseName,
          playedAt: bestScoreRound.playedAt,
        }
      : null,
    bestHalf,
    thisYear: {
      roundCount: thisYearRounds.length,
      bestScore: thisYearBest,
      avgScore: thisYearAvg,
    },
    yearlyAverages,
    recent5: rounds.slice(0, 5).map(r => ({
      id: r.id,
      playedAt: r.playedAt,
      courseName: r.courseName,
      score: r.totalStrokes,
    })),
    recent20: rounds.slice(0, 20).map(r => ({ id: r.id, score: r.totalStrokes })),
  }
}
```

- [x] **Step 5: Run tests to verify they all pass**

```bash
npm run test
```

Expected: all tests PASS. If any fail, fix `metrics.ts` logic before continuing.

- [x] **Step 6: Type-check**

```bash
npm run build
```

Expected: build succeeds.

- [x] **Step 7: Commit**

```bash
git add src/lib/dashboard/
git commit -m "feat: add dashboard data layer with metrics tests"
```

---

### Task 6: Install Recharts and create ScoreGraph component

**Files:**
- Modify: `package.json`
- Create: `app/_components/ScoreGraph.tsx`

**Interfaces:**
- Consumes:
  - `yearlyAverages: { year: number; avg: number }[]`
  - `recent20: { id: string; score: number }[]`
- Produces: `<ScoreGraph yearlyAverages={...} recent20={...} />` — client component with toggle state

- [x] **Step 1: Install Recharts**

```bash
npm install recharts
```

Expected: `recharts` appears in `dependencies`.

- [x] **Step 2: Create `app/_components/ScoreGraph.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

type Props = {
  yearlyAverages: { year: number; avg: number }[]
  recent20: { id: string; score: number }[]
}

export default function ScoreGraph({ yearlyAverages, recent20 }: Props) {
  const [mode, setMode] = useState<'yearly' | 'recent'>('recent')

  const recentData = recent20.map((r, i) => ({ label: String(i + 1), score: r.score }))
  const yearlyData = yearlyAverages.map(y => ({ label: String(y.year), score: y.avg }))
  const data = mode === 'recent' ? recentData : yearlyData

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm font-medium text-gray-900">スコア推移</span>
        <div className="flex gap-1">
          <button
            onClick={() => setMode('yearly')}
            className={[
              'text-xs px-3 py-1 rounded border transition-colors',
              mode === 'yearly'
                ? 'bg-blue-50 text-blue-600 border-blue-300'
                : 'bg-transparent text-gray-500 border-gray-300',
            ].join(' ')}
          >
            年別平均
          </button>
          <button
            onClick={() => setMode('recent')}
            className={[
              'text-xs px-3 py-1 rounded border transition-colors',
              mode === 'recent'
                ? 'bg-blue-50 text-blue-600 border-blue-300'
                : 'bg-transparent text-gray-500 border-gray-300',
            ].join(' ')}
          >
            直近20R
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={['dataMin - 5', 'dataMax + 2']} />
          <Tooltip
            formatter={(value: number) => [value.toFixed(1), 'スコア']}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          <Bar dataKey="score" radius={[2, 2, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill="#dbeafe" stroke="#93c5fd" strokeWidth={1.5} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [x] **Step 3: Type-check**

```bash
npm run build
```

Expected: build succeeds.

- [x] **Step 4: Commit**

```bash
git add app/_components/ScoreGraph.tsx package.json package-lock.json
git commit -m "feat: add ScoreGraph client component with Recharts"
```

---

### Task 7: Dashboard page

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes:
  - `fetchRoundSummaries(): Promise<RoundSummary[]>` from `@/src/lib/dashboard/queries`
  - `computeDashboardData(rounds: RoundSummary[]): DashboardData` from `@/src/lib/dashboard/metrics`
  - `<ScoreGraph yearlyAverages={...} recent20={...} />` from `./_components/ScoreGraph`
- Produces: the `/` route rendered as a Server Component

- [x] **Step 1: Replace `app/page.tsx`**

```tsx
import Link from 'next/link'
import { fetchRoundSummaries } from '@/src/lib/dashboard/queries'
import { computeDashboardData } from '@/src/lib/dashboard/metrics'
import ScoreGraph from './_components/ScoreGraph'

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '/')
}

export default async function DashboardPage() {
  const rounds = await fetchRoundSummaries()
  const data = computeDashboardData(rounds)

  return (
    <div className="p-6 flex flex-col gap-4 min-h-screen">
      {/* Summary row */}
      <div className="grid grid-cols-2 gap-4">
        {/* 生涯 */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-4">生涯</div>
          <div className="flex">
            <div className="flex-1">
              <div className="text-[40px] font-medium tabular-nums tracking-tight leading-none">
                {data.bestScore?.score ?? '—'}
              </div>
              <div className="text-xs text-gray-400 mt-1.5">ベストスコア</div>
              {data.bestScore && (
                <div className="text-[11px] text-gray-400 mt-0.5 opacity-70">
                  {data.bestScore.courseName} · {fmtDate(data.bestScore.playedAt)}
                </div>
              )}
            </div>
            <div className="w-px bg-gray-100 mx-5 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-[40px] font-medium tabular-nums tracking-tight leading-none">
                {data.bestHalf?.score ?? '—'}
              </div>
              <div className="text-xs text-gray-400 mt-1.5">ベストハーフ</div>
              {data.bestHalf && (
                <div className="text-[11px] text-gray-400 mt-0.5 opacity-70">
                  {data.bestHalf.courseName} {data.bestHalf.layoutName} · {fmtDate(data.bestHalf.playedAt)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 今年 */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-4">
            {new Date().getFullYear()}年
          </div>
          <div className="flex">
            <div className="flex-1">
              <div className="text-[40px] font-medium tabular-nums tracking-tight leading-none">
                {data.thisYear.roundCount}
              </div>
              <div className="text-xs text-gray-400 mt-1.5">ラウンド数</div>
            </div>
            <div className="w-px bg-gray-100 mx-4 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-[40px] font-medium tabular-nums tracking-tight leading-none">
                {data.thisYear.bestScore ?? '—'}
              </div>
              <div className="text-xs text-gray-400 mt-1.5">ベストスコア</div>
            </div>
            <div className="w-px bg-gray-100 mx-4 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-[40px] font-medium tabular-nums tracking-tight leading-none">
                {data.thisYear.avgScore ?? '—'}
              </div>
              <div className="text-xs text-gray-400 mt-1.5">平均スコア</div>
            </div>
          </div>
        </div>
      </div>

      {/* Graph */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <ScoreGraph yearlyAverages={data.yearlyAverages} recent20={data.recent20} />
        <div className="mt-3 text-right">
          <Link href="/rounds" className="text-xs text-blue-600 hover:underline">
            すべて見る →
          </Link>
        </div>
      </div>

      {/* Recent rounds */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex justify-between items-center mb-4">
          <span className="text-sm font-medium text-gray-900">直近のラウンド</span>
          <Link href="/rounds" className="text-xs text-blue-600 hover:underline">
            すべて見る →
          </Link>
        </div>
        <div className="flex flex-col">
          {data.recent5.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              ラウンドデータがありません
            </p>
          ) : (
            data.recent5.map((r, i) => (
              <div
                key={r.id}
                className={[
                  'flex items-center py-2.5',
                  i < data.recent5.length - 1 ? 'border-b border-gray-100' : '',
                ].join(' ')}
              >
                <div className="text-xs text-gray-400 w-20 flex-shrink-0">
                  {fmtDate(r.playedAt)}
                </div>
                <div className="flex-1 text-sm text-gray-900">{r.courseName}</div>
                <div className="text-xl font-medium tabular-nums text-gray-900">
                  {r.score}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
```

- [x] **Step 2: Type-check and build**

```bash
npm run build
```

Expected: build succeeds with no errors.

- [x] **Step 3: Start dev server and verify visually**

```bash
npm run dev
```

Open http://localhost:3000 and check each of the following:

- [x] Header shows "Golf Stuff" title with 3 nav links
- [x] "ダッシュボード" is underlined/highlighted as the active link
- [x] 生涯サマリーカード: ベストスコア・ベストハーフが表示される（データなしの場合は "—"）
- [x] 今年サマリーカード: ラウンド数・ベストスコア・平均スコアが表示される
- [x] グラフカード: 棒グラフが表示される
- [x] 「直近20R」ボタンが初期アクティブ状態
- [x] 「年別平均」ボタンをクリックするとグラフが切り替わる
- [x] 「すべて見る →」リンクが `/rounds` へ遷移する
- [x] 直近ラウンド一覧に最大5件表示される（データなしの場合は "ラウンドデータがありません"）
- [x] `/rounds` に遷移すると "ラウンド" ナビリンクがハイライトされる
- [x] `/golf-courses` に遷移すると "ゴルフ場" ナビリンクがハイライトされる

- [x] **Step 4: Commit and push**

```bash
git add app/page.tsx
git commit -m "feat: implement dashboard page"
git push origin main
```
