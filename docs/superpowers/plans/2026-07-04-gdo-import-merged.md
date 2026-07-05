# GDOインポート統合（18H対応 + 上書き機能修正）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GDOスコアインポートを 9H/18H 両対応にし、`/rounds/[roundId]/holes` の「GDOで上書き」ボタンから既存ラウンドのホール結果を安全に上書きできるようにする。

**背景:** 本Planは以下2つの既存planを統合したものである。
- `docs/superpowers/plans/2026-06-30-pr-b-import-expansion.md`（18H分割・ペナルティ・更新モードの追加）
- `docs/superpowers/plans/2026-07-04-gdo-overwrite-fix.md`（上書き時に手動入力項目を温存する安全な実装）

両plan は同じ3ファイル（`actions.ts` / `import/page.tsx` / `ImportForm.tsx`）を対象にしており、かつ「上書き」の実装方式が非互換（pr-bはdeleteMany+createMany、gdo-overwrite-fixはholeごとのupsert）だったため、後者の安全な設計を採用して統合した。また両plan とも `userId: "dummy-user"` を前提にしていたが、現在のコードベースは既に `getCurrentUser()` による認証に移行済みのため、そちらに合わせる。

**現状（本Plan作成時点で既に完了済み）:**
- パーサー層（`src/lib/parsers/gdoScorecard.ts` の `parseGdoFullRound`、`ParsedScore.penalty`）は実装・テスト済み（pr-b Task 1相当）。本Planでは変更しない。
- `app/rounds/[roundId]/holes/page.tsx` の「GDOで上書き」ボタン（`/rounds/import?roundId=xxx` へのリンク）は設置済み。本Planでは変更しない。

**Architecture:** `import/actions.ts` の `importGdoScore`（9H）・`importGdoScore18H`（18H）を、それぞれ `roundId` の有無で「新規作成」「既存ラウンド上書き（holeごとのupsert）」に分岐する形に統一する。`import/page.tsx` は `searchParams.roundId` を受け取り、`currentUser` 所有のラウンドかどうかを確認した上で `existingRound` を取得する（他ユーザーのラウンドや存在しないIDの場合は `null` にフォールバックし、新規作成モードとして動作する）。`ImportForm.tsx` は `existingRound` の有無でゴルフ場・プレー日の編集可否を切り替えつつ、9H/18Hタブを提供する。

**Tech Stack:** Next.js 16 App Router（Server Actions）、Prisma、TypeScript、Vitest

## Global Constraints

- `userId` は `getCurrentUser()` から取得したログインユーザーのIDを使う（既存の `app/rounds/actions.ts` の実装パターンに合わせる）
- 上書き時は `trnRoundHoleResult.upsert` を holeId ごとに実行し、`stroke` / `putt` / `penalty` のみ更新する。`shortGame` / `fairwayKeep` / `secondShotOk` / `greenBunker` / `fairwayBunker` は既存値を一切変更しない（upsertの `create` 分岐でのみ `null`/`0` 初期値を設定し、`update` 分岐では触れない）
- 上書きモードではゴルフ場・プレー日は編集不可（表示のみ）。コース（OUT/IN、前半/後半）は、そのゴルフ場の全レイアウトから選択可能（既存ラウンドで使われていたレイアウトに限定しない）
- `roundId` が指定されているが、該当ラウンドが存在しない、または `currentUser` の所有ラウンドでない場合は、新規作成モードにフォールバックする（エラー画面を出さない）
- 新規作成モード（`roundId` 無し）の9H既存挙動は変更しない
- `TrnRound.golfCourseId` は単一 — 18Hの場合も前半・後半コースは同一 `MstGolfCourse` 配下の `MstCourseLayout` である前提
- `npm run test` と `tsc --noEmit` が通り続けること

---

## Task 1: Server Action を拡張する（9H/18H の新規作成・上書きを統一実装）

**Files:**
- Modify: `app/rounds/import/actions.ts`

**Interfaces:**
- Consumes: `src/lib/parsers/gdoScorecard.ts` の `ParsedScore`（`{ holeNumber, stroke, putt, penalty }`、実装済み）
- Produces:
  ```typescript
  export type ImportScoreInput = {
    roundId?: string; // 指定時は上書きモード
    golfCourseId: string;
    layoutId: string;
    playedAt: string; // YYYY-MM-DD（新規作成時のみ使用）
    scores: ParsedScore[];
  };

  export type ImportScore18HInput = {
    roundId?: string; // 指定時は上書きモード
    golfCourseId: string;
    firstLayoutId: string;
    secondLayoutId: string;
    playedAt: string; // 新規作成時のみ使用
    firstScores: ParsedScore[];
    secondScores: ParsedScore[];
  };

  export async function importGdoScore(input: ImportScoreInput): Promise<void>
  export async function importGdoScore18H(input: ImportScore18HInput): Promise<void>
  ```

- [ ] **Step 1: 失敗するテストを先に書く**

`src/lib/parsers/__tests__/` 配下にServer Actionのユニットテストは無い（Prismaアクセスを伴うため）。代わりに、本タスクでは以下の手動確認をStep 4（型チェック）とTask 4（実機確認）で担保する。ただし `buildHoleData`（純粋なデータ整形部分）は `holeMap` 生成とバリデーションのロジックを含むため、既存のvitest実行（`npm run test`）が壊れていないことを確認する形で進める。

（本タスクはDBアクセスを伴うためTDDの単体テストは書かず、型チェック + 実機確認で検証する。既存の `npm run test` が通り続けることのみ確認する）

- [ ] **Step 2: `actions.ts` を以下の内容に置き換える**

`app/rounds/import/actions.ts`:

```typescript
"use server";

import { prisma } from "@/src/lib/db/prisma";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";
import type { ParsedScore } from "@/src/lib/parsers/gdoScorecard";

// ---- 型定義 ----

export type ImportScoreInput = {
  roundId?: string; // 指定時は上書きモード
  golfCourseId: string;
  layoutId: string;
  playedAt: string; // YYYY-MM-DD（新規作成時のみ使用）
  scores: ParsedScore[];
};

export type ImportScore18HInput = {
  roundId?: string; // 指定時は上書きモード
  golfCourseId: string;
  firstLayoutId: string;
  secondLayoutId: string;
  playedAt: string; // 新規作成時のみ使用
  firstScores: ParsedScore[];
  secondScores: ParsedScore[];
};

// ---- ユーティリティ ----

async function buildHoleData(layoutId: string, scores: ParsedScore[]) {
  const layout = await prisma.mstCourseLayout.findUnique({
    where: { id: layoutId },
    include: { holes: true },
  });
  if (!layout) throw new Error(`レイアウトが見つかりません: ${layoutId}`);
  if (layout.holes.length === 0) {
    throw new Error(`レイアウト「${layout.name}」にホールが登録されていません`);
  }

  const holeMap = new Map(layout.holes.map(h => [h.holeNumber, h.id]));
  const holeData = scores.flatMap(s => {
    const holeId = holeMap.get(s.holeNumber);
    if (!holeId) return [];
    return [{
      holeId,
      stroke: s.stroke,
      putt: s.putt ?? 0,
      penalty: s.penalty,
    }];
  });

  if (holeData.length === 0) {
    const dbNums = Array.from(holeMap.keys()).sort((a, b) => a - b);
    const impNums = scores.map(s => s.holeNumber).sort((a, b) => a - b);
    throw new Error(
      `Hole番号がDBと一致しません。DB: [${dbNums}] / インポート: [${impNums}]`
    );
  }
  return holeData;
}

/** roundIdが指定され、かつcurrentUser所有であれば上書きモード。それ以外はnull（新規作成にフォールバック） */
async function resolveOverwriteRoundId(roundId: string | undefined, userId: string) {
  if (!roundId) return null;
  const round = await prisma.trnRound.findUnique({ where: { id: roundId } });
  if (!round || round.userId !== userId) return null;
  return round.id;
}

/** ホール結果をupsertで上書きする（stroke/putt/penaltyのみ更新。手動入力項目は温存） */
async function upsertHoleResults(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  roundId: string,
  holeData: { holeId: string; stroke: number; putt: number; penalty: number }[]
) {
  for (const h of holeData) {
    await tx.trnRoundHoleResult.upsert({
      where: { roundId_holeId: { roundId, holeId: h.holeId } },
      update: { stroke: h.stroke, putt: h.putt, penalty: h.penalty },
      create: { roundId, holeId: h.holeId, stroke: h.stroke, putt: h.putt, penalty: h.penalty },
    });
  }
}

// ---- アクション ----

/** 9H インポート（roundId指定時は既存ラウンドへの上書き） */
export async function importGdoScore(input: ImportScoreInput) {
  const { roundId, golfCourseId, layoutId, playedAt, scores } = input;

  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("ログインが必要です");

  const holeData = await buildHoleData(layoutId, scores);
  const overwriteRoundId = await resolveOverwriteRoundId(roundId, currentUser.id);

  const resultRoundId = await prisma.$transaction(async (tx) => {
    if (overwriteRoundId) {
      await upsertHoleResults(tx, overwriteRoundId, holeData);
      return overwriteRoundId;
    }

    const created = await tx.trnRound.create({
      data: { userId: currentUser.id, golfCourseId, playedAt: new Date(playedAt) },
    });
    await tx.trnRoundHoleResult.createMany({
      data: holeData.map(h => ({ ...h, roundId: created.id })),
    });
    return created.id;
  });

  redirect(`/rounds/${resultRoundId}/holes`);
}

/** 18H インポート（roundId指定時は既存ラウンドへの上書き） */
export async function importGdoScore18H(input: ImportScore18HInput) {
  const { roundId, golfCourseId, firstLayoutId, secondLayoutId, playedAt, firstScores, secondScores } = input;

  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("ログインが必要です");

  const [firstHoleData, secondHoleData] = await Promise.all([
    buildHoleData(firstLayoutId, firstScores),
    buildHoleData(secondLayoutId, secondScores),
  ]);
  const overwriteRoundId = await resolveOverwriteRoundId(roundId, currentUser.id);

  const resultRoundId = await prisma.$transaction(async (tx) => {
    if (overwriteRoundId) {
      await upsertHoleResults(tx, overwriteRoundId, [...firstHoleData, ...secondHoleData]);
      return overwriteRoundId;
    }

    const created = await tx.trnRound.create({
      data: { userId: currentUser.id, golfCourseId, playedAt: new Date(playedAt) },
    });
    await tx.trnRoundHoleResult.createMany({
      data: [
        ...firstHoleData.map(h => ({ ...h, roundId: created.id })),
        ...secondHoleData.map(h => ({ ...h, roundId: created.id })),
      ],
    });
    return created.id;
  });

  redirect(`/rounds/${resultRoundId}/holes`);
}
```

- [ ] **Step 3: 型チェックを実行する**

Run: `npx tsc --noEmit`
Expected: エラーなし（`trnRoundHoleResult.upsert` の `where.roundId_holeId` は `schema.prisma` の `@@unique([roundId, holeId])` から自動生成される複合キー名）

- [ ] **Step 4: 既存テストを実行する**

Run: `npm run test`
Expected: 既存30テストが引き続きPASS（本タスクはパーサーを変更しないため影響なし）

- [ ] **Step 5: コミット**

```bash
git add app/rounds/import/actions.ts
git commit -m "feat: GDOインポートActionに18H対応とroundId指定時の上書き（upsert）分岐を追加"
```

---

## Task 2: `/rounds/import` ページを roundId 対応にする

**Files:**
- Modify: `app/rounds/import/page.tsx`

**Interfaces:**
- Consumes: `getCurrentUser()`
- Produces: `ImportForm` に渡す `existingRound: { id: string; golfCourseId: string; playedAt: string } | null` prop（Task 3で`ImportForm`が受け取る）

- [ ] **Step 1: `page.tsx` の内容を以下に置き換える**

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/src/lib/db/prisma'
import { getCurrentUser } from '@/src/lib/auth/getCurrentUser'
import ImportForm from './ImportForm'

type Props = {
  searchParams: Promise<{ roundId?: string }>
}

export default async function ImportPage({ searchParams }: Props) {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const { roundId } = await searchParams

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

  // roundIdが指定されていても、currentUserの所有ラウンドでなければnull（新規作成モードにフォールバック）
  const existingRoundRow = roundId
    ? await prisma.trnRound.findUnique({
        where: { id: roundId },
        select: { id: true, golfCourseId: true, playedAt: true, userId: true },
      })
    : null
  const existingRound = existingRoundRow && existingRoundRow.userId === currentUser.id
    ? {
        id: existingRoundRow.id,
        golfCourseId: existingRoundRow.golfCourseId,
        playedAt: existingRoundRow.playedAt.toISOString().slice(0, 10),
      }
    : null

  return (
    <main className="p-6 max-w-lg mx-auto flex flex-col gap-4">
      <nav>
        <Link
          href={existingRound ? `/rounds/${existingRound.id}/holes` : '/rounds'}
          className="nav-back"
        >
          ← {existingRound ? 'ホール入力へ戻る' : 'ラウンド一覧'}
        </Link>
      </nav>

      <h1 className="page-heading">
        {existingRound ? 'GDOスコアで上書き' : 'GDOスコアインポート'}
      </h1>

      {golfCourses.length === 0 ? (
        <div className="page-card bg-yellow-50 border-yellow-200 text-sm text-yellow-800">
          <p className="font-medium mb-1">ゴルフ場が登録されていません</p>
          <p className="text-xs text-yellow-700 mb-3">
            インポートするには、まずゴルフ場とコースレイアウト（OUT/IN）を登録してください。
          </p>
          <Link href="/golf-courses" className="text-xs text-blue-600 hover:underline">
            ゴルフ場を登録する →
          </Link>
        </div>
      ) : (
        <ImportForm golfCourses={golfCourses} existingRound={existingRound} />
      )}
    </main>
  )
}
```

**注意:** `nav-back` / `page-heading` / `page-card` クラスは `app/globals.css` に既存（PR-A design unificationで導入済み）。既存の `import/page.tsx` は生のTailwindクラス（`text-xs text-blue-600` 等）を使っていたが、他ページとの統一のためこれらの共通クラスに置き換える。

- [ ] **Step 2: 型チェックを実行する**

Run: `npx tsc --noEmit`
Expected: `ImportForm` が `existingRound` propを受け取れず型エラーになる（Task 3で解消する。ここではエラーが出ることを確認するだけでよい）

- [ ] **Step 3: コミット**

（Task 3の変更と合わせてコミットする。ここではコミットしない）

---

## Task 3: `ImportForm` を9H/18Hタブ・上書きモード対応にする

**Files:**
- Modify: `app/rounds/import/ImportForm.tsx`

**Interfaces:**
- Consumes: `existingRound: { id: string; golfCourseId: string; playedAt: string } | null`（Task 2の`page.tsx`から渡される）、`importGdoScore` / `importGdoScore18H`（Task 1で`roundId?`が追加された型）、`parseGdoScoreText`（9Hモード）、`parseGdoFullRound`（18Hモード、実装済み）

- [ ] **Step 1: `ImportForm.tsx` を以下の内容に置き換える**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { parseGdoScoreText, parseGdoFullRound, type ParsedScore } from '@/src/lib/parsers/gdoScorecard'
import { importGdoScore, importGdoScore18H } from './actions'

type Layout = { id: string; name: string; holeCount: number }
type GolfCourse = { id: string; name: string; layouts: Layout[] }
type ExistingRound = { id: string; golfCourseId: string; playedAt: string } | null

type Props = {
  golfCourses: GolfCourse[]
  existingRound: ExistingRound
}

type HalfPreview = { scores: ParsedScore[] }

export default function ImportForm({ golfCourses, existingRound }: Props) {
  const isUpdateMode = existingRound !== null
  const [mode, setMode] = useState<'9h' | '18h'>('18h')
  const [courseId, setCourseId] = useState(existingRound?.golfCourseId ?? '')
  const [firstLayoutId, setFirstLayoutId] = useState('')
  const [secondLayoutId, setSecondLayoutId] = useState('')
  const [playedAt, setPlayedAt] = useState(existingRound?.playedAt ?? '')
  const [rawText, setRawText] = useState('')
  const [firstPreview, setFirstPreview] = useState<HalfPreview | null>(null)
  const [secondPreview, setSecondPreview] = useState<HalfPreview | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedCourse = golfCourses.find(c => c.id === courseId)
  const availableLayouts = selectedCourse?.layouts ?? []
  const firstLayout = availableLayouts.find(l => l.id === firstLayoutId)

  function clearPreview() {
    setFirstPreview(null)
    setSecondPreview(null)
    setParseError(null)
  }

  function handleParse() {
    clearPreview()

    if (mode === '9h') {
      if (!firstLayoutId) { setParseError('コースを選択してください'); return }
      const result = parseGdoScoreText(rawText, firstLayout!.holeCount)
      if (!result.ok) { setParseError(result.message); return }
      setFirstPreview({ scores: result.scores })
    } else {
      if (!firstLayoutId || !secondLayoutId) { setParseError('前半・後半のコースを選択してください'); return }
      const holeCount = firstLayout?.holeCount ?? 9
      const result = parseGdoFullRound(rawText, holeCount)
      if (!result.ok) { setParseError(result.message); return }
      setFirstPreview({ scores: result.first.scores })
      setSecondPreview({ scores: result.second.scores })
    }
  }

  function handleSave() {
    if (!firstPreview) return
    setSaveError(null)

    startTransition(async () => {
      try {
        if (mode === '18h' && secondPreview) {
          await importGdoScore18H({
            roundId: existingRound?.id,
            golfCourseId: courseId,
            firstLayoutId,
            secondLayoutId,
            playedAt,
            firstScores: firstPreview.scores,
            secondScores: secondPreview.scores,
          })
        } else {
          await importGdoScore({
            roundId: existingRound?.id,
            golfCourseId: courseId,
            layoutId: firstLayoutId,
            playedAt,
            scores: firstPreview.scores,
          })
        }
      } catch (e) {
        if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e
        setSaveError(e instanceof Error ? e.message : '保存に失敗しました')
      }
    })
  }

  const totalFirst = firstPreview?.scores.reduce((s, r) => s + r.stroke, 0) ?? 0
  const totalSecond = secondPreview?.scores.reduce((s, r) => s + r.stroke, 0) ?? 0

  return (
    <div className="flex flex-col gap-4">
      {/* ラウンド情報（上書きモードはゴルフ場・日付を固定表示） */}
      <div className="page-card flex flex-col gap-4">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-widest">1 ラウンド情報</span>

        {isUpdateMode ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">ゴルフ場 / プレー日</span>
            <div className="text-sm text-gray-900">
              {selectedCourse?.name ?? '-'} ／ {playedAt}
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className="field-label">ゴルフ場</label>
              <select
                className="select-underline"
                value={courseId}
                onChange={e => { setCourseId(e.target.value); setFirstLayoutId(''); setSecondLayoutId(''); clearPreview() }}
              >
                <option value="">選択してください</option>
                {golfCourses.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">プレー日</label>
              <input
                type="date"
                className="input-underline"
                value={playedAt}
                onChange={e => setPlayedAt(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      {/* モード切替 + コース選択 */}
      <div className="page-card flex flex-col gap-4">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-widest">2 コース選択</span>

        {/* 9H / 18H タブ */}
        <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
          {(['9h', '18h'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); clearPreview() }}
              className={[
                'flex-1 text-xs py-1.5 rounded-md transition-colors',
                mode === m
                  ? 'bg-white text-gray-900 font-medium shadow-sm border border-gray-200'
                  : 'text-gray-500',
              ].join(' ')}
            >
              {m === '9h' ? '9H（ハーフ）' : '18H（1ラウンド）'}
            </button>
          ))}
        </div>

        {selectedCourse ? (
          <div className={mode === '18h' ? 'grid grid-cols-2 gap-4' : ''}>
            <div>
              <label className="field-label">{mode === '18h' ? '前半コース' : 'コース'}</label>
              <select
                className="select-underline"
                value={firstLayoutId}
                onChange={e => { setFirstLayoutId(e.target.value); clearPreview() }}
              >
                <option value="">選択</option>
                {availableLayouts.map(l => (
                  <option key={l.id} value={l.id} disabled={l.id === secondLayoutId}>
                    {l.name}（{l.holeCount}H）
                  </option>
                ))}
              </select>
            </div>
            {mode === '18h' && (
              <div>
                <label className="field-label">後半コース</label>
                <select
                  className="select-underline"
                  value={secondLayoutId}
                  onChange={e => { setSecondLayoutId(e.target.value); clearPreview() }}
                >
                  <option value="">選択</option>
                  {availableLayouts.map(l => (
                    <option key={l.id} value={l.id} disabled={l.id === firstLayoutId}>
                      {l.name}（{l.holeCount}H）
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400">まずゴルフ場を選択してください</p>
        )}
      </div>

      {/* テキスト貼り付け */}
      <div className="page-card flex flex-col gap-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-widest">3 スコアカードを貼り付け</span>
        <p className="text-xs text-gray-400">
          GDOサイトのスコアカード（{mode === '18h' ? 'OUT〜INをまとめてコピー' : 'ハーフ分'}）を貼り付けてください。
        </p>
        <textarea
          className="border border-gray-200 rounded-lg p-3 text-xs font-mono h-36 resize-none w-full focus:outline-none focus:border-gray-400"
          placeholder={mode === '18h'
            ? '筑波 【White(L)ティー】\nHole\t1\t2\t...\n自分\t7\t4\t...\n日光 【White(L)ティー】\nHole\t1\t2\t...\n自分\t6\t5\t...'
            : 'Hole\t1\t2\t...\n自分\t5\t3\t...'
          }
          value={rawText}
          onChange={e => { setRawText(e.target.value); clearPreview() }}
        />
        {parseError && <p className="text-xs text-red-500">{parseError}</p>}
        <button
          onClick={handleParse}
          disabled={!firstLayoutId || (mode === '18h' && !secondLayoutId) || !rawText.trim()}
          className="btn-primary self-start text-xs px-4 py-2"
        >
          パース
        </button>
      </div>

      {/* プレビュー */}
      {firstPreview && (
        <div className="page-card flex flex-col gap-4">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-widest">
            {isUpdateMode ? '4 確認して上書き' : '4 確認してインポート'}
          </span>

          <div className="flex gap-6">
            {mode === '18h' ? (
              <>
                <div>
                  <div className="text-xs text-gray-400">前半</div>
                  <div className="text-2xl font-medium tabular-nums">{totalFirst}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">後半</div>
                  <div className="text-2xl font-medium tabular-nums">{totalSecond}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">合計</div>
                  <div className="text-2xl font-medium tabular-nums text-gray-900">{totalFirst + totalSecond}</div>
                </div>
              </>
            ) : (
              <div>
                <div className="text-xs text-gray-400">合計スコア</div>
                <div className="text-2xl font-medium tabular-nums">{totalFirst}</div>
              </div>
            )}
          </div>

          <div className={mode === '18h' ? 'grid grid-cols-2 gap-4' : ''}>
            {[firstPreview, ...(secondPreview ? [secondPreview] : [])].map((half, hi) => (
              <table key={hi} className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="py-1 text-left">{mode === '18h' ? (hi === 0 ? '前半' : '後半') : 'Hole'}</th>
                    <th className="py-1 text-right">Score</th>
                    <th className="py-1 text-right">Putt</th>
                    <th className="py-1 text-right">Pen</th>
                  </tr>
                </thead>
                <tbody>
                  {half.scores.map(s => (
                    <tr key={s.holeNumber} className="border-b border-gray-50">
                      <td className="py-1 text-gray-500 text-xs">{s.holeNumber}</td>
                      <td className="py-1 text-right font-medium tabular-nums">{s.stroke}</td>
                      <td className="py-1 text-right text-gray-400 tabular-nums text-xs">{s.putt ?? '—'}</td>
                      <td className="py-1 text-right text-gray-400 tabular-nums text-xs">{s.penalty || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>

          {saveError && <p className="text-xs text-red-500">{saveError}</p>}

          <button
            onClick={handleSave}
            disabled={isPending || !firstLayoutId || (mode === '18h' && !secondLayoutId) || (!isUpdateMode && (!playedAt || !courseId))}
            className="btn-primary self-start"
          >
            {isPending ? '保存中...' : isUpdateMode ? '上書き保存' : 'インポート'}
          </button>
        </div>
      )}
    </div>
  )
}
```

**注意:** `page-card` / `field-label` / `select-underline` / `input-underline` / `btn-primary` は `app/globals.css` に既存（PR-A design unification / holes-table design unificationで導入済み）のクラス名を使用する。既存クラスに一致するものがなければ、実装時に `app/globals.css` の既存クラス名を確認し、最も近い既存クラスに置き換えること（新規クラスを追加しない）。

- [ ] **Step 2: 型チェックを実行する**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: テストを実行する**

Run: `npm run test`
Expected: 既存30テストがすべてPASS（ロジック変更なしのため影響なし）

- [ ] **Step 4: コミット**

```bash
git add app/rounds/import/page.tsx app/rounds/import/ImportForm.tsx
git commit -m "feat: GDOインポートを9H/18Hタブ・既存ラウンド上書きモードに対応"
```

---

## Task 4: 実機での動作確認

**Files:** なし（コード変更なし。動作確認のみ）

**Interfaces:**
- Consumes: Task 1〜3で実装した一連の機能

- [ ] **Step 1: 開発サーバーを起動し、ログインする**

`supabase start` 済みであることを確認し、`npm run dev` を実行。Supabase StudioでテストユーザーとしてログインしてUIから確認する。

- [ ] **Step 2: 新規9Hインポートを確認する**

`/rounds/import` で9Hモードのままコース・日付・GDOテキストを入力し「パース」→「インポート」。`/rounds/[id]/holes` に遷移し、9ホール分のスコアが表示されることを確認する。

- [ ] **Step 3: 新規18Hインポートを確認する**

`/rounds/import` で18Hモードに切り替え、前半・後半コースを別々に選択し、18H分のGDOテキスト（`SAMPLE_18H` と同形式）を貼り付けて「パース」→「インポート」。前半・後半それぞれ9ホールずつ、計18ホール分のスコアが保存されることを確認する。プレビューにペナルティ列が表示されることも確認する。

- [ ] **Step 4: 上書き前のラウンド件数・手動入力項目を記録する**

Supabase Studioの Table Editor（`trn_rounds` / `trn_round_hole_results`）で、対象ラウンドの件数と、対象ホールの `short_game` / `fairway_keep` 等の値を記録しておく（事前に手動入力していない場合は `/rounds/[id]/holes` から適当な値を1件入力しておく）。

- [ ] **Step 5: 上書きフローを確認する**

1. `/rounds/[id]/holes` の「GDOで上書き」ボタンをクリック
2. ゴルフ場名・プレー日が編集不可のテキスト表示になっていることを確認する
3. 9H/18Hいずれかのモードでコースを選択し、GDOテキストを貼り付けて「パース」
4. 「上書き保存」ボタン（ラベルが変わっていることを確認）をクリック

- [ ] **Step 6: 上書き後の整合性を確認する**

Table Editorで以下を確認する:
- `trn_rounds` の件数が増えていないこと（新しいラウンドが作られていない）
- 上書き対象ホールの `stroke` / `putt` / `penalty` がGDOインポート内容に更新されていること
- Step 4で記録した `short_game` / `fairway_keep` 等の値が変わっていないこと（温存されている）

- [ ] **Step 7: 開発サーバーを停止する**

確認が完了したら `npm run dev` のプロセスを停止する（Ctrl+C）。

---

## 完了確認

全タスク完了後に以下を確認する:

```bash
npm run test && npx tsc --noEmit
```

Expected:
- Tests: 30 passed
- TypeScript: エラーなし

**ブラウザ動作確認チェックリスト（Task 4で実施）:**

- [ ] `/rounds/import` で9H/18Hタブが切り替えられる
- [ ] 18Hモードで前半・後半コースを別々に選択できる
- [ ] GDOコピペテキストを貼り付けて「パース」するとOUT・IN別にプレビューが表示される
- [ ] プレビューにペナルティ列が表示される
- [ ] 「インポート」で `/rounds/[id]/holes` に遷移し、18ホール分のスコアが入力済みになっている
- [ ] `/rounds/[id]/holes` の「GDOで上書き」ボタンから `/rounds/import?roundId=xxx` に遷移する
- [ ] 上書きモードでは「ゴルフ場・プレー日」フォームが非表示で、ラウンド情報が固定表示される
- [ ] 上書き保存後、ラウンド件数が増えておらず、ホール入力ページのスコアが新しいデータで上書きされている
- [ ] 上書き保存後も、事前に入力していた手動入力項目（ショートゲーム等）が温存されている
