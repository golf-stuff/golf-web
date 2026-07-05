# 「GDOで上書き」機能修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/rounds/[roundId]/holes` の「GDOで上書き」ボタンが、実際に既存ラウンドのホール結果を上書き更新するようにする（現状は `roundId` が無視され、常に新規ラウンドが作成されてしまう）。

**Architecture:** `/rounds/import` ページが `searchParams.roundId` を受け取り、既存ラウンドの `golfCourseId` / `playedAt` を取得して `ImportForm` に渡す。`ImportForm` はそれを受けてゴルフ場・日付を固定表示に切り替え、保存時に `roundId` をサーバーアクションに渡す。`importGdoScore` は `roundId` の有無で「新規作成（`create`）」と「上書き（ホールごとに `upsert`）」を分岐する。

**Tech Stack:** Next.js 16 App Router（Server Actions）、Prisma、TypeScript

**Spec:** `docs/superpowers/specs/2026-07-03-gdo-overwrite-fix-design.md`

> **注記（2026-07-05追記）**: 本プランは docs/superpowers/plans/2026-06-30-pr-b-import-expansion.md（18H対応）と同じ3ファイルを対象としていたため、両プランを統合した docs/superpowers/plans/2026-07-04-gdo-import-merged.md として実装・完了しました（コミット `64c5d34`, `5396367`, `cabfe6f`）。上書き時に手動入力項目を温存する設計（ホールごとの`upsert`）はこのプランの方針が採用されていますが、実装は統合プランのタスク構成・コミットの下で行われたため、以下のチェックボックスは本プラン単体の記述通りには実行されていません。チェックは付けません。

## Global Constraints

- 上書き時、`stroke` と `putt` のみ更新する。`shortGame` / `fairwayKeep` / `secondShotOk` / `greenBunker` / `fairwayBunker` / `penalty` など、GDOインポートに含まれない手動入力項目は上書きしない（既存値を温存する）
- 上書きモードではゴルフ場・プレー日は編集不可（表示のみ）。コース（OUT/IN）は、そのゴルフ場の全レイアウトから選択可能（既に結果があるレイアウトに限定しない）
- `roundId` が指定されているが該当ラウンドが存在しない場合は、新規作成モードにフォールバックする（エラー画面を出さない）
- 新規作成モード（`roundId` 無し）の既存挙動は一切変更しない
- `npm run test` が通り続けること

---

## Task 1: サーバーアクション `importGdoScore` に上書き分岐を追加する

**Files:**
- Modify: `golf-web/app/rounds/import/actions.ts`

**Interfaces:**
- Produces: `ImportScoreInput`（`roundId?: string` を追加した型。Task 3 の `ImportForm.tsx` から利用される）

- [ ] **Step 1: `ImportScoreInput` 型に `roundId` を追加する**

`golf-web/app/rounds/import/actions.ts` の以下のブロック:

```ts
export type ImportScoreInput = {
  golfCourseId: string;
  layoutId: string;
  playedAt: string; // YYYY-MM-DD
  scores: { holeNumber: number; stroke: number; putt: number | null }[];
};
```

を以下に置き換える:

```ts
export type ImportScoreInput = {
  roundId?: string; // 指定時は上書きモード
  golfCourseId: string;
  layoutId: string;
  playedAt: string; // YYYY-MM-DD
  scores: { holeNumber: number; stroke: number; putt: number | null }[];
};
```

- [ ] **Step 2: 関数の分割代入に `roundId` を追加する**

以下のブロック:

```ts
export async function importGdoScore(input: ImportScoreInput) {
  const { golfCourseId, layoutId, playedAt, scores } = input;
```

を以下に置き換える:

```ts
export async function importGdoScore(input: ImportScoreInput) {
  const { roundId, golfCourseId, layoutId, playedAt, scores } = input;
```

- [ ] **Step 3: トランザクション部分を新規作成/上書きの分岐に置き換える**

以下のブロック:

```ts
  const round = await prisma.$transaction(async (tx) => {
    const created = await tx.trnRound.create({
      data: {
        userId: "dummy-user",
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

を以下に置き換える:

```ts
  const resultRoundId = await prisma.$transaction(async (tx) => {
    if (roundId) {
      for (const h of holeData) {
        await tx.trnRoundHoleResult.upsert({
          where: { roundId_holeId: { roundId, holeId: h.holeId } },
          update: { stroke: h.stroke, putt: h.putt },
          create: { roundId, holeId: h.holeId, stroke: h.stroke, putt: h.putt, penalty: 0 },
        });
      }
      return roundId;
    }

    const created = await tx.trnRound.create({
      data: {
        userId: "dummy-user",
        golfCourseId,
        playedAt: new Date(playedAt),
      },
    });

    await tx.trnRoundHoleResult.createMany({
      data: holeData.map(h => ({ ...h, roundId: created.id })),
    });

    return created.id;
  });

  redirect(`/rounds/${resultRoundId}/holes`);
}
```

- [ ] **Step 4: 型チェックを実行する**

Run: `cd golf-web && npx tsc --noEmit`
Expected: 型エラーなし（`trnRoundHoleResult.upsert` の `where.roundId_holeId` は `schema.prisma` の `@@unique([roundId, holeId])` から自動生成される複合キー名）

- [ ] **Step 5: Commit**

```bash
git add golf-web/app/rounds/import/actions.ts
git commit -m "fix: importGdoScoreにroundId指定時の上書き（upsert）分岐を追加"
```

---

## Task 2: `/rounds/import` ページで既存ラウンドを取得する

**Files:**
- Modify: `golf-web/app/rounds/import/page.tsx`

**Interfaces:**
- Consumes: なし
- Produces: `ImportForm` に渡す `existingRound: { id: string; golfCourseId: string; playedAt: string } | null` prop（Task 3 で `ImportForm` が受け取る）

- [ ] **Step 1: `page.tsx` の全体を以下に置き換える**

`golf-web/app/rounds/import/page.tsx` の内容を以下に置き換える:

```tsx
import Link from 'next/link'
import { prisma } from '@/src/lib/db/prisma'
import ImportForm from './ImportForm'

type Props = {
  searchParams: Promise<{ roundId?: string }>
}

export default async function ImportPage({ searchParams }: Props) {
  const { roundId } = await searchParams

  const golfCourses = await prisma.mstGolfCourse.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      layouts: {
        orderBy: { displayOrder: 'asc' },
        select: { id: true, name: true, holeCount: true },
      },
    },
  })

  const existingRound = roundId
    ? await prisma.trnRound.findUnique({
        where: { id: roundId },
        select: { id: true, golfCourseId: true, playedAt: true },
      })
    : null

  return (
    <main className="p-6 max-w-lg mx-auto flex flex-col gap-4">
      <nav>
        <Link href="/rounds" className="text-xs text-blue-600 hover:underline">
          ← ラウンド一覧
        </Link>
      </nav>

      <h1 className="text-lg font-medium text-gray-900">GDOスコアインポート</h1>

      {golfCourses.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-sm text-yellow-800">
          <p className="font-medium mb-1">ゴルフ場が登録されていません</p>
          <p className="text-xs text-yellow-700 mb-3">
            インポートするには、まずゴルフ場とコースレイアウト（OUT/IN）を登録してください。
          </p>
          <Link href="/golf-courses" className="text-xs text-blue-600 hover:underline">
            ゴルフ場を登録する →
          </Link>
        </div>
      ) : (
        <ImportForm
          golfCourses={golfCourses}
          existingRound={
            existingRound
              ? {
                  id: existingRound.id,
                  golfCourseId: existingRound.golfCourseId,
                  playedAt: existingRound.playedAt.toISOString().slice(0, 10),
                }
              : null
          }
        />
      )}
    </main>
  )
}
```

（`roundId` が指定されていても該当ラウンドが存在しなければ `existingRound` は `null` になり、`ImportForm` は自動的に新規作成モードとして動作する＝フォールバック要件を満たす）

- [ ] **Step 2: 型チェックを実行する**

Run: `cd golf-web && npx tsc --noEmit`
Expected: `ImportForm` が `existingRound` prop を受け取れず型エラーになる（Task 3 で解消する。ここではエラーが出ることを確認するだけでよい）

- [ ] **Step 3: Commit**

（Task 3 の変更と合わせてコミットする。ここではコミットしない）

---

## Task 3: `ImportForm` に上書きモードのUIを実装する

**Files:**
- Modify: `golf-web/app/rounds/import/ImportForm.tsx`

**Interfaces:**
- Consumes: `existingRound: { id: string; golfCourseId: string; playedAt: string } | null`（Task 2 の `page.tsx` から渡される）、`ImportScoreInput`（Task 1 の `roundId?: string` 追加後の型）

- [ ] **Step 1: Props型に `existingRound` を追加する**

以下のブロック:

```tsx
type Props = {
  golfCourses: GolfCourse[]
}

export default function ImportForm({ golfCourses }: Props) {
```

を以下に置き換える:

```tsx
type ExistingRound = {
  id: string
  golfCourseId: string
  playedAt: string
}

type Props = {
  golfCourses: GolfCourse[]
  existingRound: ExistingRound | null
}

export default function ImportForm({ golfCourses, existingRound }: Props) {
```

- [ ] **Step 2: `courseId` / `playedAt` の初期値を `existingRound` から設定する**

以下のブロック:

```tsx
  const [courseId, setCourseId] = useState('')
  const [layoutId, setLayoutId] = useState('')
  const [playedAt, setPlayedAt] = useState('')
```

を以下に置き換える:

```tsx
  const [courseId, setCourseId] = useState(existingRound?.golfCourseId ?? '')
  const [layoutId, setLayoutId] = useState('')
  const [playedAt, setPlayedAt] = useState(existingRound?.playedAt ?? '')
```

- [ ] **Step 3: `handleImport` で `roundId` を渡す**

以下のブロック:

```tsx
        await importGdoScore({
          golfCourseId: courseId,
          layoutId,
          playedAt,
          scores: preview,
        })
```

を以下に置き換える:

```tsx
        await importGdoScore({
          roundId: existingRound?.id,
          golfCourseId: courseId,
          layoutId,
          playedAt,
          scores: preview,
        })
```

- [ ] **Step 4: 「1. ラウンド情報」セクションを上書きモード対応にする**

以下のブロック:

```tsx
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">ゴルフ場</span>
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={courseId}
              onChange={e => { setCourseId(e.target.value); setLayoutId(''); setPreview(null) }}
            >
              <option value="">選択してください</option>
              {golfCourses.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          {selectedCourse && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">コース（OUT / IN）</span>
              <select
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={layoutId}
                onChange={e => { setLayoutId(e.target.value); setPreview(null) }}
              >
                <option value="">選択してください</option>
                {selectedCourse.layouts.map(l => (
                  <option key={l.id} value={l.id}>{l.name}（{l.holeCount}H）</option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">プレー日</span>
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={playedAt}
              onChange={e => setPlayedAt(e.target.value)}
            />
          </label>
        </div>
```

を以下に置き換える:

```tsx
        <div className="flex flex-col gap-3">
          {existingRound ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">ゴルフ場 / プレー日</span>
              <div className="text-sm text-gray-900">
                {selectedCourse?.name ?? '-'} ／ {playedAt}
              </div>
            </div>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">ゴルフ場</span>
              <select
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={courseId}
                onChange={e => { setCourseId(e.target.value); setLayoutId(''); setPreview(null) }}
              >
                <option value="">選択してください</option>
                {golfCourses.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}

          {selectedCourse && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">コース（OUT / IN）</span>
              <select
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={layoutId}
                onChange={e => { setLayoutId(e.target.value); setPreview(null) }}
              >
                <option value="">選択してください</option>
                {selectedCourse.layouts.map(l => (
                  <option key={l.id} value={l.id}>{l.name}（{l.holeCount}H）</option>
                ))}
              </select>
            </label>
          )}

          {!existingRound && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">プレー日</span>
              <input
                type="date"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={playedAt}
                onChange={e => setPlayedAt(e.target.value)}
              />
            </label>
          )}
        </div>
```

- [ ] **Step 5: インポートボタンのラベルを上書きモードで変更する**

以下のブロック:

```tsx
          <button
            onClick={handleImport}
            disabled={isPending || !playedAt || !courseId || !layoutId}
            className="self-start px-5 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-40"
          >
            {isPending ? '保存中...' : 'インポート'}
          </button>
```

を以下に置き換える:

```tsx
          <button
            onClick={handleImport}
            disabled={isPending || !playedAt || !courseId || !layoutId}
            className="self-start px-5 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-40"
          >
            {isPending ? '保存中...' : existingRound ? '上書き保存' : 'インポート'}
          </button>
```

- [ ] **Step 6: 型チェックとテストを実行する**

Run: `cd golf-web && npx tsc --noEmit && npm run test`
Expected: 型エラーなし、既存テストがすべて PASS

- [ ] **Step 7: Commit**

```bash
git add golf-web/app/rounds/import/page.tsx golf-web/app/rounds/import/ImportForm.tsx
git commit -m "feat: GDOで上書きボタンから既存ラウンドを上書きインポートできるようにする"
```

---

## Task 4: 実機での上書き動作確認

**Files:**
- なし（コード変更なし。動作確認のみ）

**Interfaces:**
- Consumes: Task 1〜3 で実装した一連の上書き機能

- [ ] **Step 1: 開発サーバーを起動する**

Run: `cd golf-web && npm run dev`

（`.env.local` の `DATABASE_URL` がSupabaseローカル（ポート54322）を指している前提。`supabase start` 済みであること）

- [ ] **Step 2: 上書き前のラウンド件数を記録する**

Run: `docker ps --format '{{.Names}}' | grep supabase_db` でコンテナ名を確認し、以下を実行する:

```bash
docker exec -i <supabase_db_のコンテナ名> psql -U postgres -d postgres \
  -c "SELECT id, played_at FROM trn_rounds ORDER BY played_at DESC;"
```

出力されたラウンド件数・IDをメモしておく。

- [ ] **Step 3: ブラウザで上書きフローを実行する**

1. `/rounds` から任意の既存ラウンドの「編集」を開く
2. 右上の「GDOで上書き」ボタンをクリック
3. ゴルフ場名・プレー日が編集不可のテキスト表示になっていることを確認する
4. コース（OUT/IN）を選択し、GDOスコアカード形式のテキストを貼り付けて「パース」
5. 「上書き保存」ボタン（ラベルが変わっていることを確認）をクリック

- [ ] **Step 4: 上書き後にラウンドが増えていないことを確認する**

Run: Step 2 と同じコマンドを再実行する

Expected: ラウンド件数が変わっておらず、Step 3 で操作したラウンドの `played_at` が変わっていない（新しい行が増えていない）こと

- [ ] **Step 5: 手動入力項目が温存されていることを確認する**

上書き対象のラウンドに事前に `short_game` や `fairway_keep` 等を手動入力していた場合、以下で確認する:

```bash
docker exec -i <supabase_db_のコンテナ名> psql -U postgres -d postgres \
  -c "SELECT hole_id, stroke, putt, short_game, fairway_keep FROM trn_round_hole_results WHERE round_id = '<対象roundId>';"
```

Expected: `stroke` / `putt` はGDOインポート内容に更新されているが、`short_game` / `fairway_keep` は上書き前の値のまま（`null` のまま、または以前入力した値のまま）であること

- [ ] **Step 6: 開発サーバーを停止する**

上書き確認が完了したら `npm run dev` のプロセスを停止する（Ctrl+C）。

---

## Self-Review Notes

- Spec coverage: ゴルフ場/日付固定表示（Task 3 Step 4）、レイアウト選択肢はゴルフ場の全レイアウト（Task 2 で `golfCourses` クエリを変更せず流用しているため既に全レイアウトが渡っている）、upsertでstroke/putt以外温存（Task 1 Step 3）、存在しないroundIdへのフォールバック（Task 2 の `existingRound` が `null` になり自動的に新規作成モードへ）、ボタンラベル変更（Task 3 Step 5）を確認済み。
- 型整合性: `ImportScoreInput.roundId`（Task 1）→ `ImportForm` の `importGdoScore` 呼び出し（Task 3 Step 3）→ `actions.ts` の分割代入（Task 1 Step 2）で名称が一致している。`existingRound` の型・プロパティ名（`id` / `golfCourseId` / `playedAt`）も Task 2 の `page.tsx` と Task 3 の `ImportForm.tsx` で一致している。
