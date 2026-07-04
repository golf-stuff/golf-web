# PR-B GDOインポート拡張 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GDOスコアインポートを18H一括対応・ペナルティ取込・既存ラウンド更新に拡張する

**Architecture:** パーサーを18H分割対応に拡張し、ImportFormに9H/18Hタブ切り替えと前半/後半コース選択を追加する。既存ラウンド更新は `?roundId=` クエリパラメータで同ページを共用し、ホール結果のみ上書きする。

**Tech Stack:** Next.js 16 App Router、Prisma v7、TypeScript、Vitest

## Global Constraints

- `TrnRound.golfCourseId` は単一 — 18H の場合も前半・後半コースは同一 `MstGolfCourse` 配下の `MstCourseLayout` である前提
- 既存ラウンド更新時はプレー日・ゴルフ場は変更しない（ホール結果のみ上書き）
- スコア行ラベル: `自分` / `スコア` / `Score` / `打数` を受け付ける
- ペナルティ行ラベル: `ペナルティ` / `penalty` を受け付ける
- パーサーは純粋関数（DB アクセスなし）とし、テストを先に書く（TDD）
- `userId` は暫定 `"dummy-user"` を継続使用（認証実装は別タスク）

---

## ファイル構成

| ファイル | 変更内容 |
|---------|---------|
| `golf-web/src/lib/parsers/gdoScorecard.ts` | `parseGdoFullRound()` を追加（18H分割 + ペナルティ） |
| `golf-web/src/lib/parsers/__tests__/gdoScorecard.test.ts` | 18H・ペナルティのテスト追加 |
| `golf-web/app/rounds/import/page.tsx` | `roundId` クエリパラメータ対応、layouts を全件渡す |
| `golf-web/app/rounds/import/ImportForm.tsx` | 9H/18Hタブ、前半/後半コース選択、更新モード |
| `golf-web/app/rounds/import/actions.ts` | `importGdoScore18H()`, `updateRoundFromGdo()` を追加 |

---

## Task 1: パーサーに18H分割とペナルティ対応を追加（TDD）

**Files:**
- Modify: `golf-web/src/lib/parsers/gdoScorecard.ts`
- Modify: `golf-web/src/lib/parsers/__tests__/gdoScorecard.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  // gdoScorecard.ts に追加する型と関数
  export type ParsedHalfRound = {
    scores: ParsedScore[] // { holeNumber, stroke, putt, penalty } の配列
  }

  export type FullRoundParseResult =
    | { ok: true; first: ParsedHalfRound; second: ParsedHalfRound }
    | { ok: false; message: string }

  export function parseGdoFullRound(
    rawText: string,
    holeCount: number // 各ハーフのホール数（通常9）
  ): FullRoundParseResult
  ```

- [ ] **Step 1: 失敗するテストを先に書く**

`golf-web/src/lib/parsers/__tests__/gdoScorecard.test.ts` に以下を追加:

```typescript
import { parseGdoFullRound } from '../gdoScorecard'

// 実際のGDOコピペ（18H = OUT + IN）
const SAMPLE_18H = `筑波 【White(L)ティー】
Hole\t1\t2\t3\t4\t5\t6\t7\t8\t9\t前半H\tTotal
Par\t5\t4\t4\t3\t4\t4\t3\t5\t4\t36\t72
Yard\t541y\t369y\t280y\t147y\t386y\t366y\t166y\t436y\t333y\t3,024y\t6,134y
自分\t7\t4\t5\t3\t6\t5\t4\t5\t5\t44\t92
Putt\t2\t2\t2\t1\t2\t1\t3\t2\t2\t　17\t36
ペナルティ\t1\t\t\t\t\t\t\t\t\t1回\t3回
日光 【White(L)ティー】
Hole\t1\t2\t3\t4\t5\t6\t7\t8\t9\t後半H\tTotal
Par\t4\t4\t4\t3\t5\t4\t4\t3\t5\t36\t72
Yard\t423y\t451y\t322y\t138y\t483y\t350y\t349y\t131y\t463y\t3,110y\t6,134y
自分\t6\t5\t5\t5\t6\t5\t5\t4\t7\t48\t92
Putt\t1\t2\t2\t3\t1\t2\t3\t3\t2\t　19\t36
ペナルティ\t1\t\t\t\t1\t\t\t\t\t2回\t3回`

describe('parseGdoFullRound', () => {
  it('18Hテキストを前半と後半に分割してパースできる', () => {
    const result = parseGdoFullRound(SAMPLE_18H, 9)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // 前半（筑波）
    expect(result.first.scores).toHaveLength(9)
    expect(result.first.scores[0]).toEqual({ holeNumber: 1, stroke: 7, putt: 2, penalty: 1 })
    expect(result.first.scores[1]).toEqual({ holeNumber: 2, stroke: 4, putt: 2, penalty: 0 })
    expect(result.first.scores[8]).toEqual({ holeNumber: 9, stroke: 5, putt: 2, penalty: 0 })

    // 後半（日光）
    expect(result.second.scores).toHaveLength(9)
    expect(result.second.scores[0]).toEqual({ holeNumber: 1, stroke: 6, putt: 1, penalty: 1 })
    expect(result.second.scores[4]).toEqual({ holeNumber: 5, stroke: 6, putt: 1, penalty: 1 })
    expect(result.second.scores[8]).toEqual({ holeNumber: 9, stroke: 7, putt: 2, penalty: 0 })
  })

  it('前半の合計スコアが正しい（小計列は含まない）', () => {
    const result = parseGdoFullRound(SAMPLE_18H, 9)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const firstTotal = result.first.scores.reduce((s, r) => s + r.stroke, 0)
    expect(firstTotal).toBe(44)
  })

  it('後半の合計スコアが正しい', () => {
    const result = parseGdoFullRound(SAMPLE_18H, 9)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const secondTotal = result.second.scores.reduce((s, r) => s + r.stroke, 0)
    expect(secondTotal).toBe(48)
  })

  it('ペナルティ行がない場合、penalty は 0 になる', () => {
    const noPenalty = SAMPLE_18H.split('\n').filter(l => !l.startsWith('ペナルティ')).join('\n')
    const result = parseGdoFullRound(noPenalty, 9)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.first.scores.every(s => s.penalty === 0)).toBe(true)
  })

  it('Hole行が1つしかない場合はエラー（9Hテキストを18Hとして処理しようとした）', () => {
    const only9h = `Hole\t1\t2\t3\t4\t5\t6\t7\t8\t9
Par\t4\t3\t5\t4\t4\t3\t5\t4\t4
スコア\t5\t3\t6\t5\t5\t4\t7\t5\t5`
    const result = parseGdoFullRound(only9h, 9)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/前半.*後半|2つ/)
  })

  it('空テキストはエラー', () => {
    const result = parseGdoFullRound('', 9)
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
cd golf-web && npx vitest run src/lib/parsers/__tests__/gdoScorecard.test.ts
```

Expected: `parseGdoFullRound is not a function` などのエラーで FAIL

- [ ] **Step 3: `ParsedScore` の型を拡張し `parseGdoFullRound` を実装する**

`golf-web/src/lib/parsers/gdoScorecard.ts`:

まず `ParsedScore` に `penalty` を追加する:
```typescript
export type ParsedScore = {
  holeNumber: number;
  stroke: number;
  putt: number | null;
  penalty: number;  // 追加
};
```

次に `ParsedHalfRound` と `FullRoundParseResult` 型、`parseGdoFullRound` 関数をファイル末尾に追加する:

```typescript
export type ParsedHalfRound = {
  scores: ParsedScore[];
};

export type FullRoundParseResult =
  | { ok: true; first: ParsedHalfRound; second: ParsedHalfRound }
  | { ok: false; message: string };

/**
 * 18H分のGDOコピペテキストを前半・後半に分割してパースする
 * - 2つ目の Hole 行で分割（位置ベース）
 * - ペナルティ行: "ペナルティ" / "penalty" で始まる行
 */
export function parseGdoFullRound(
  rawText: string,
  holeCount: number
): FullRoundParseResult {
  if (!rawText.trim()) {
    return { ok: false, message: "貼り付けテキストが空です" };
  }

  // Hole行のインデックスを全行から探す
  const allLines = rawText.split(/\r?\n/);
  const holeLineIndexes: number[] = [];
  for (let i = 0; i < allLines.length; i++) {
    const tokens = toTokens(allLines[i]);
    if (tokens.length > 0 && /^hole$/i.test(tokens[0])) {
      holeLineIndexes.push(i);
    }
  }

  if (holeLineIndexes.length < 2) {
    return {
      ok: false,
      message: "前半・後半の2つの Hole 行が見つかりません（9H のテキストを貼り付けた場合は「9H」モードを使ってください）",
    };
  }

  // 1つ目のHole行〜2つ目のHole行の直前までが前半
  const firstRawText = allLines.slice(holeLineIndexes[0], holeLineIndexes[1]).join('\n');
  // 2つ目のHole行以降が後半
  const secondRawText = allLines.slice(holeLineIndexes[1]).join('\n');

  const firstResult = parseHalfRound(firstRawText, holeCount);
  if (!firstResult.ok) return { ok: false, message: `前半: ${firstResult.message}` };

  const secondResult = parseHalfRound(secondRawText, holeCount);
  if (!secondResult.ok) return { ok: false, message: `後半: ${secondResult.message}` };

  return { ok: true, first: firstResult.data, second: secondResult.data };
}

function parseHalfRound(
  rawText: string,
  holeCount: number
): { ok: true; data: ParsedHalfRound } | { ok: false; message: string } {
  const lines = rawText
    .split(/\r?\n/)
    .map(toTokens)
    .filter(tokens => tokens.length > 0);

  const holeLine = lines.find(l => /^hole$/i.test(l[0]));
  const scoreLine = lines.find(l => /^(スコア|score|打数|自分)$/i.test(l[0]));
  const puttLine = lines.find(l => /^(パット|putt|putts)$/i.test(l[0]));
  const penaltyLine = lines.find(l => /^(ペナルティ|penalty)$/i.test(l[0]));

  if (!holeLine) return { ok: false, message: "Hole 行が見つかりません" };
  if (!scoreLine) return { ok: false, message: "スコア行が見つかりません（「自分」「スコア」「Score」のいずれかで始まる行が必要です）" };

  const holeNumbers = extractNumbers(holeLine).slice(0, holeCount);
  const strokes = extractNumbers(scoreLine).slice(0, holeCount);
  const putts = puttLine ? extractNumbers(puttLine).slice(0, holeCount) : null;
  const penalties = penaltyLine ? extractNumbers(penaltyLine).slice(0, holeCount) : null;

  if (holeNumbers.length !== holeCount) {
    return { ok: false, message: `Hole 番号の数が一致しません（期待: ${holeCount}、実際: ${holeNumbers.length}）` };
  }
  if (strokes.length !== holeCount) {
    return { ok: false, message: `スコアの数が一致しません（期待: ${holeCount}、実際: ${strokes.length}）` };
  }

  const scores: ParsedScore[] = holeNumbers.map((h, i) => ({
    holeNumber: h,
    stroke: strokes[i],
    putt: putts ? (putts[i] ?? null) : null,
    penalty: penalties ? (penalties[i] ?? 0) : 0,
  }));

  return { ok: true, data: { scores } };
}
```

- [ ] **Step 4: `parseGdoScoreText` の `ParsedScore` 変更に伴う既存コードの修正**

`parseGdoScoreText` も `ParsedScore` を返しているが、`penalty` フィールドが追加されたため、戻り値に `penalty: 0` を追加する:

```typescript
  const scores: ParsedScore[] = holeNumbers.map((h, i) => ({
    holeNumber: h,
    stroke: strokes[i],
    putt: putts ? (putts[i] ?? null) : null,
    penalty: 0,  // 追加（9H パーサーはペナルティを取らない）
  }));
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
cd golf-web && npx vitest run src/lib/parsers/__tests__/gdoScorecard.test.ts
```

Expected: 15 tests passed（既存9 + 新規6）

- [ ] **Step 6: 型チェック**

```bash
cd golf-web && node node_modules/typescript/bin/tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add golf-web/src/lib/parsers/
git commit -m "feat: パーサーに18H分割・ペナルティ対応を追加（parseGdoFullRound）"
```

---

## Task 2: Server Action を拡張する（18H保存 + 既存ラウンド更新）

**Files:**
- Modify: `golf-web/app/rounds/import/actions.ts`

**Interfaces:**
- Consumes: Task 1 の `ParsedScore` 型（`{ holeNumber, stroke, putt, penalty }`）
- Produces:
  ```typescript
  // 18H新規インポート
  export async function importGdoScore18H(input: ImportScore18HInput): Promise<void>
  // 既存ラウンドのホール結果を上書き
  export async function updateRoundFromGdo(input: UpdateRoundInput): Promise<void>
  ```

- [ ] **Step 1: `actions.ts` に型と関数を追加する**

`golf-web/app/rounds/import/actions.ts` を以下に置き換える:

```typescript
"use server";

import { prisma } from "@/src/lib/db/prisma";
import { redirect } from "next/navigation";
import type { ParsedScore } from "@/src/lib/parsers/gdoScorecard";

// ---- 型定義 ----

export type ImportScoreInput = {
  golfCourseId: string;
  layoutId: string;
  playedAt: string; // YYYY-MM-DD
  scores: ParsedScore[];
};

export type ImportScore18HInput = {
  golfCourseId: string;
  firstLayoutId: string;
  secondLayoutId: string;
  playedAt: string;
  firstScores: ParsedScore[];
  secondScores: ParsedScore[];
};

export type UpdateRoundInput = {
  roundId: string;
  firstLayoutId: string;
  secondLayoutId: string | null; // 9H更新の場合は null
  firstScores: ParsedScore[];
  secondScores: ParsedScore[] | null;
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

// ---- アクション ----

/** 9H新規インポート（既存） */
export async function importGdoScore(input: ImportScoreInput) {
  const { golfCourseId, layoutId, playedAt, scores } = input;
  const holeData = await buildHoleData(layoutId, scores);

  const round = await prisma.$transaction(async (tx) => {
    const created = await tx.trnRound.create({
      data: { userId: "dummy-user", golfCourseId, playedAt: new Date(playedAt) },
    });
    await tx.trnRoundHoleResult.createMany({
      data: holeData.map(h => ({ ...h, roundId: created.id })),
    });
    return created;
  });

  redirect(`/rounds/${round.id}/holes`);
}

/** 18H新規インポート */
export async function importGdoScore18H(input: ImportScore18HInput) {
  const { golfCourseId, firstLayoutId, secondLayoutId, playedAt, firstScores, secondScores } = input;

  const [firstHoleData, secondHoleData] = await Promise.all([
    buildHoleData(firstLayoutId, firstScores),
    buildHoleData(secondLayoutId, secondScores),
  ]);

  const round = await prisma.$transaction(async (tx) => {
    const created = await tx.trnRound.create({
      data: { userId: "dummy-user", golfCourseId, playedAt: new Date(playedAt) },
    });
    await tx.trnRoundHoleResult.createMany({
      data: [
        ...firstHoleData.map(h => ({ ...h, roundId: created.id })),
        ...secondHoleData.map(h => ({ ...h, roundId: created.id })),
      ],
    });
    return created;
  });

  redirect(`/rounds/${round.id}/holes`);
}

/** 既存ラウンドのホール結果を上書き（プレー日・ゴルフ場は変更しない） */
export async function updateRoundFromGdo(input: UpdateRoundInput) {
  const { roundId, firstLayoutId, secondLayoutId, firstScores, secondScores } = input;

  const firstHoleData = await buildHoleData(firstLayoutId, firstScores);
  const secondHoleData = secondLayoutId && secondScores
    ? await buildHoleData(secondLayoutId, secondScores)
    : [];

  // 対象 holeId のリストを組み立てて削除 → 再作成
  const allHoleIds = [
    ...firstHoleData.map(h => h.holeId),
    ...secondHoleData.map(h => h.holeId),
  ];

  await prisma.$transaction(async (tx) => {
    // 対象ホールの結果だけ削除（他レイアウトの結果は残す）
    await tx.trnRoundHoleResult.deleteMany({
      where: { roundId, holeId: { in: allHoleIds } },
    });
    await tx.trnRoundHoleResult.createMany({
      data: [
        ...firstHoleData.map(h => ({ ...h, roundId })),
        ...secondHoleData.map(h => ({ ...h, roundId })),
      ],
    });
  });

  redirect(`/rounds/${roundId}/holes`);
}
```

- [ ] **Step 2: 型チェック**

```bash
cd golf-web && node node_modules/typescript/bin/tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
git add golf-web/app/rounds/import/actions.ts
git commit -m "feat: 18H保存・既存ラウンド更新の Server Action を追加"
```

---

## Task 3: インポートページを18H対応・更新モードに拡張する

**Files:**
- Modify: `golf-web/app/rounds/import/page.tsx`
- Modify: `golf-web/app/rounds/import/ImportForm.tsx`

**Interfaces:**
- Consumes: Task 2 の `importGdoScore`, `importGdoScore18H`, `updateRoundFromGdo`
- Consumes: Task 1 の `parseGdoScoreText`（9Hモード）、`parseGdoFullRound`（18Hモード）

- [ ] **Step 1: `page.tsx` を更新する（layout一覧渡し + roundId検出）**

`golf-web/app/rounds/import/page.tsx`:

```tsx
import Link from 'next/link'
import { prisma } from '@/src/lib/db/prisma'
import ImportForm from './ImportForm'

type Props = {
  searchParams: Promise<{ roundId?: string }>
}

export default async function ImportPage({ searchParams }: Props) {
  const { roundId } = await searchParams

  // 既存ラウンド更新モード: roundId が指定された場合、ラウンド情報を取得
  const existingRound = roundId
    ? await prisma.trnRound.findUnique({
        where: { id: roundId },
        include: { golfCourse: true },
      })
    : null

  const golfCourses = await prisma.mstGolfCourse.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      layouts: {
        orderBy: { displayOrder: 'asc' },
        select: { id: true, name: true, holeCount: true },
      },
    },
  })

  return (
    <main className="p-6 max-w-lg mx-auto flex flex-col gap-4">
      <nav>
        <Link
          href={existingRound ? `/rounds/${existingRound.id}/holes` : '/rounds'}
          className="nav-back"
        >
          ← {existingRound ? `${existingRound.golfCourse.name} ホール入力へ戻る` : 'ラウンド一覧'}
        </Link>
      </nav>

      <h1 className="page-heading">
        {existingRound ? 'GDOスコアで上書き' : 'GDOスコアインポート'}
      </h1>

      {existingRound && (
        <div className="page-card bg-blue-50 border-blue-200 text-sm text-blue-900">
          <div className="font-medium">{existingRound.golfCourse.name}</div>
          <div className="text-xs text-blue-600 mt-0.5">
            {existingRound.playedAt.toISOString().slice(0, 10).replace(/-/g, '/')} のホール結果を上書きします
          </div>
        </div>
      )}

      {golfCourses.length === 0 ? (
        <div className="page-card bg-yellow-50 border-yellow-200 text-sm text-yellow-800">
          <p className="font-medium mb-1">ゴルフ場が登録されていません</p>
          <p className="text-xs text-yellow-700 mb-3">
            インポートするには、まずゴルフ場とコースレイアウトを登録してください。
          </p>
          <Link href="/golf-courses" className="text-xs text-blue-600 hover:underline">
            ゴルフ場を登録する →
          </Link>
        </div>
      ) : (
        <ImportForm
          golfCourses={golfCourses}
          existingRound={existingRound
            ? { id: existingRound.id, golfCourseId: existingRound.golfCourseId }
            : null
          }
        />
      )}
    </main>
  )
}
```

- [ ] **Step 2: `ImportForm.tsx` を全面更新する**

`golf-web/app/rounds/import/ImportForm.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { parseGdoScoreText, parseGdoFullRound, type ParsedScore } from '@/src/lib/parsers/gdoScorecard'
import { importGdoScore, importGdoScore18H, updateRoundFromGdo } from './actions'

type Layout = { id: string; name: string; holeCount: number }
type GolfCourse = { id: string; name: string; layouts: Layout[] }
type ExistingRound = { id: string; golfCourseId: string } | null

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
  const [playedAt, setPlayedAt] = useState('')
  const [rawText, setRawText] = useState('')
  const [firstPreview, setFirstPreview] = useState<HalfPreview | null>(null)
  const [secondPreview, setSecondPreview] = useState<HalfPreview | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedCourse = golfCourses.find(c => c.id === courseId)
  const firstLayout = selectedCourse?.layouts.find(l => l.id === firstLayoutId)

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
      // 18H
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
        if (isUpdateMode) {
          await updateRoundFromGdo({
            roundId: existingRound!.id,
            firstLayoutId,
            secondLayoutId: mode === '18h' ? secondLayoutId : null,
            firstScores: firstPreview.scores,
            secondScores: mode === '18h' && secondPreview ? secondPreview.scores : null,
          })
        } else if (mode === '18h' && secondPreview) {
          await importGdoScore18H({
            golfCourseId: courseId,
            firstLayoutId,
            secondLayoutId,
            playedAt,
            firstScores: firstPreview.scores,
            secondScores: secondPreview.scores,
          })
        } else {
          await importGdoScore({
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
      {/* ラウンド情報（更新モードはゴルフ場・日付を固定） */}
      {!isUpdateMode && (
        <div className="page-card flex flex-col gap-4">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-widest">1 ラウンド情報</span>

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
        </div>
      )}

      {/* モード切替 + コース選択 */}
      <div className="page-card flex flex-col gap-4">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-widest">
          {isUpdateMode ? '1 コース選択' : '2 コース選択'}
        </span>

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

        {selectedCourse || isUpdateMode ? (
          <div className={mode === '18h' ? 'grid grid-cols-2 gap-4' : ''}>
            <div>
              <label className="field-label">{mode === '18h' ? '前半コース' : 'コース'}</label>
              <select
                className="select-underline"
                value={firstLayoutId}
                onChange={e => { setFirstLayoutId(e.target.value); clearPreview() }}
              >
                <option value="">選択</option>
                {(isUpdateMode
                  ? golfCourses.find(c => c.id === existingRound!.golfCourseId)?.layouts
                  : selectedCourse?.layouts
                )?.map(l => (
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
                  {(isUpdateMode
                    ? golfCourses.find(c => c.id === existingRound!.golfCourseId)?.layouts
                    : selectedCourse?.layouts
                  )?.map(l => (
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
        <span className="text-xs font-medium text-gray-500 uppercase tracking-widest">
          {isUpdateMode ? '2 スコアカードを貼り付け' : '3 スコアカードを貼り付け'}
        </span>
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
            {isUpdateMode ? '3 確認して上書き' : '4 確認してインポート'}
          </span>

          {/* 合計 */}
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

          {/* ホール別プレビューテーブル */}
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

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isPending || (!isUpdateMode && (!playedAt || !courseId))}
              className="btn-primary"
            >
              {isPending ? '保存中...' : isUpdateMode ? 'ホール結果を上書き' : 'インポート'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 型チェックを実行する**

```bash
cd golf-web && node node_modules/typescript/bin/tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 4: テストを実行する**

```bash
cd golf-web && npx vitest run
```

Expected: 15 tests passed（スタイル変更なしのためロジックテストはすべて通過）

- [ ] **Step 5: コミット**

```bash
git add golf-web/app/rounds/import/
git commit -m "feat: インポートページを18H対応・既存ラウンド更新モードに拡張"
```

---

## 完了確認

全タスク完了後に以下を確認する:

```bash
cd golf-web && npx vitest run && node node_modules/typescript/bin/tsc --noEmit
```

Expected:
- Tests: 15 passed（または追加分込み）
- TypeScript: エラーなし

**ブラウザ動作確認チェックリスト:**

- [ ] `/rounds/import` で9H/18Hタブが切り替えられる
- [ ] 18Hモードで前半・後半コースを別々に選択できる
- [ ] 実際のGDOコピペテキスト（`SAMPLE_18H` と同形式）を貼り付けて「パース」するとOUT・IN別にプレビューが表示される
- [ ] プレビューにペナルティ列が表示される
- [ ] 「インポート」で `/rounds/[id]/holes` に遷移し、18ホール分のスコアが入力済みになっている
- [ ] `/rounds/[id]/holes` の「GDOで上書き」ボタンが存在し、クリックすると `/rounds/import?roundId=xxx` に遷移する
- [ ] 更新モードでは「ゴルフ場・プレー日」フォームが非表示で、ラウンド情報がヘッダーに表示される
- [ ] 更新保存後、ホール入力ページのスコアが新しいデータで上書きされている
