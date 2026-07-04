# スコア表デザイン統一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/rounds/[roundId]/holes` のスコア表から旧デザイン（グループ背景色・インラインスタイル）を除去し、Tailwindベースの統一デザインに置き換える。

**Architecture:** `globals.css` にテーブル専用の入力欄クラス（`.table-input` / `.table-select`）を追加し、`holes/page.tsx` 内のインラインスタイル定数（`baseTh` / `baseTd` / `bgCourse`〜`bgHazard` / `borderRightStrong`）とその使用箇所を、Tailwindユーティリティクラス + 新規クラスに置き換える。テーブルはカードで囲まず（B案採用）、枠線のみで区切る。

**Tech Stack:** Next.js 16 App Router、Tailwind CSS v4、TypeScript

**Spec:** `docs/superpowers/specs/2026-07-03-holes-table-design-unification-design.md`

## Global Constraints

- ロジック（データ取得・`calcHoleMetrics`・保存処理）は一切変更しない。スタイルのみの変更
- グループ背景色（コース情報=グレー等の5色）は廃止。グループ区切りは太めの縦罫線のみで表現する
- Result列のスコア別文字色（`scoreLabel.color`、インラインstyle）は変更しない
- テーブルはカードで囲まない（B案）。合計サマリー（`page-card`）・保存ボタン（`btn-primary`）・見出し（`page-heading`）・「GDOで上書き」ボタン（`btn-secondary`）は変更しない
- `npm run test` が通り続けること（ロジック変更なしなので既存テストへの影響はないはず）

---

## Task 1: globals.css にテーブル専用スタイルクラスを追加

**Files:**
- Modify: `golf-web/app/globals.css`

**Interfaces:**
- Produces: `.table-input`, `.table-select`（Task 2で使用）

- [ ] **Step 1: globals.css の末尾に以下を追記する**

`golf-web/app/globals.css` の末尾（`.nav-back:hover { text-decoration: underline; }` の後）に追記:

```css

/* スコア表（/rounds/[roundId]/holes）専用の入力欄スタイル */
.table-input {
  border: 1px solid rgb(209 213 219); /* gray-300 */
  border-radius: 0.25rem;
  padding: 0.125rem 0.25rem;
  font-size: 0.75rem;
  width: 3.5rem;
  text-align: center;
  color: rgb(17 24 39); /* gray-900 */
  background: white;
}
.table-input:focus {
  outline: none;
  border-color: rgb(17 24 39);
}

.table-select {
  border: 1px solid rgb(209 213 219);
  border-radius: 0.25rem;
  padding: 0.125rem 0.25rem;
  font-size: 0.75rem;
  color: rgb(17 24 39);
  background: white;
  cursor: pointer;
}
.table-select:focus {
  outline: none;
  border-color: rgb(17 24 39);
}
```

- [ ] **Step 2: ビルドが壊れていないことを確認する**

Run: `cd golf-web && npm run build`
Expected: エラーなく成功する（Tailwind v4 は生の CSS プロパティをそのまま通すため、この追記だけでビルドが壊れることはない）

- [ ] **Step 3: Commit**

```bash
git add golf-web/app/globals.css
git commit -m "style: スコア表専用の入力欄クラスをglobals.cssに追加"
```

---

## Task 2: holes/page.tsx のインラインスタイルをTailwindクラスに置き換え

**Files:**
- Modify: `golf-web/app/rounds/[roundId]/holes/page.tsx`

**Interfaces:**
- Consumes: `.table-input`, `.table-select`（Task 1で追加）
- Produces: なし（末端ページコンポーネント）

- [ ] **Step 1: 既存のスタイル定数をすべて削除する**

`golf-web/app/rounds/[roundId]/holes/page.tsx` の以下のブロックを削除する:

```ts
const baseTh: React.CSSProperties = {
  border: "1px solid #ccc",
  padding: "6px 8px",
  fontSize: "0.85rem",
  whiteSpace: "nowrap",
};

const baseTd: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: "4px 6px",
  textAlign: "center",
  fontSize: "0.85rem",
};

/* グループ別背景色（淡く） */
const bgCourse = { backgroundColor: "#f5f7fa" };      // グレー
const bgScore = { backgroundColor: "#f1f8e9" };       // 薄グリーン
const bgBreakdown = { backgroundColor: "#fffde7" };   // 薄イエロー
const bgTee = { backgroundColor: "#e3f2fd" };         // 薄ブルー
const bgHazard = { backgroundColor: "#fdecea" };      // 薄レッド

/* グループ境界（右側を太線） */
const borderRightStrong = {
  borderRight: "2px solid #999",
};
```

代わりに、削除したブロックの位置に以下のTailwindクラス定数を追加する:

```ts
const thClass = "border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-500 whitespace-nowrap";
const tdClass = "border border-gray-200 px-2 py-1 text-center text-xs";
const groupEnd = "border-r-2 border-r-gray-300"; // グループ区切り（太めの縦罫線）
```

- [ ] **Step 2: レイアウトセクションの見出し・サマリーをTailwindクラスに置き換える**

以下のブロック:

```tsx
            <section key={layout.id} style={{ marginTop: "1rem" }}>
              <h2>{layout.name}</h2>
              <div style={{ marginBottom: "0.5rem", color: "#555" }}>
                  スコア {layoutScore}
                  {" / "}
                  パット {layoutPutt}
                  {" / "}
                  ペナルティ {layoutPenalty}
                </div>
              <table style={{ borderCollapse: "collapse" }}>
```

を以下に置き換える:

```tsx
            <section key={layout.id} className="mt-4">
              <h2 className="page-subheading">{layout.name}</h2>
              <div className="mb-2 text-xs text-gray-400">
                  スコア {layoutScore}
                  {" / "}
                  パット {layoutPutt}
                  {" / "}
                  ペナルティ {layoutPenalty}
                </div>
              <div className="overflow-x-auto">
              <table className="border-collapse">
```

（テーブルが列数の多いテーブルであるため、横スクロール用に `<div className="overflow-x-auto">` で囲む）

- [ ] **Step 3: テーブルの閉じタグに対応する `</div>` を追加する**

以下のブロック:

```tsx
              </table>
            </section>

          );
        })}
```

を以下に置き換える（`overflow-x-auto` の `div` を閉じる）:

```tsx
              </table>
              </div>
            </section>

          );
        })}
```

- [ ] **Step 4: グループヘッダー行（`colSpan`）をTailwindクラスに置き換える**

以下のブロック:

```tsx
                  <tr>
                    <th colSpan={3} style={{ ...baseTh, ...bgCourse, ...borderRightStrong }}>コース情報</th>
                    <th colSpan={3} style={{ ...baseTh, ...bgScore, ...borderRightStrong }}>スコア</th>
                    <th colSpan={6} style={{ ...baseTh, ...bgBreakdown, ...borderRightStrong }}>スコア分解</th>
                    <th colSpan={2} style={{ ...baseTh, ...bgTee, ...borderRightStrong }}>ティーショット</th>
                    <th colSpan={2} style={{ ...baseTh, ...bgHazard }}>ハザード</th>
                  </tr>
```

を以下に置き換える:

```tsx
                  <tr>
                    <th colSpan={3} className={`${thClass} ${groupEnd}`}>コース情報</th>
                    <th colSpan={3} className={`${thClass} ${groupEnd}`}>スコア</th>
                    <th colSpan={6} className={`${thClass} ${groupEnd}`}>スコア分解</th>
                    <th colSpan={2} className={`${thClass} ${groupEnd}`}>ティーショット</th>
                    <th colSpan={2} className={thClass}>ハザード</th>
                  </tr>
```

- [ ] **Step 5: 項目行（`<th>Hole</th>` 等）をTailwindクラスに置き換える**

以下のブロック:

```tsx
                  <tr>
                    {/* コース情報 */}
                    <th>Hole</th>
                    <th>Par</th>
                    <th>Yard</th>

                    {/* スコア */}
                    <th>Result</th>
                    <th>±Par</th>
                    <th>Score</th>

                    {/* スコア分解 */}
                    <th>ShortGame</th>
                    <th>Approach</th>
                    <th>Putt</th>
                    <th>LongGame</th>
                    <th>LongShot</th>
                    <th>Penalty</th>

                    {/* ティーショット */}
                    <th>FW</th>
                    <th>2nd</th>

                    {/* ハザード */}
                    <th>greenBunker</th>
                    <th>fairwayBunker</th>
                  </tr>
                </thead>
```

を以下に置き換える:

```tsx
                  <tr>
                    {/* コース情報 */}
                    <th className={thClass}>Hole</th>
                    <th className={thClass}>Par</th>
                    <th className={`${thClass} ${groupEnd}`}>Yard</th>

                    {/* スコア */}
                    <th className={thClass}>Result</th>
                    <th className={thClass}>±Par</th>
                    <th className={`${thClass} ${groupEnd}`}>Score</th>

                    {/* スコア分解 */}
                    <th className={thClass}>ShortGame</th>
                    <th className={thClass}>Approach</th>
                    <th className={thClass}>Putt</th>
                    <th className={thClass}>LongGame</th>
                    <th className={thClass}>LongShot</th>
                    <th className={`${thClass} ${groupEnd}`}>Penalty</th>

                    {/* ティーショット */}
                    <th className={thClass}>FW</th>
                    <th className={`${thClass} ${groupEnd}`}>2nd</th>

                    {/* ハザード */}
                    <th className={thClass}>greenBunker</th>
                    <th className={thClass}>fairwayBunker</th>
                  </tr>
                </thead>
```

- [ ] **Step 6: データ行のセルをTailwindクラスに置き換える**

以下のブロック全体（`<tbody>` 内の `return (` から `);` まで）:

```tsx
                    return (
                      <tr key={hole.id}>
                          {/* コース情報 */}
                          <td>{hole.holeNumber}</td>
                          <td>{hole.par}</td>
                          <td>{hole.yardRegular}</td>
                          {/* スコア */}
                          {/* ★ ±Par 表示 */}
                          <td style={{ textAlign: "center", color: scoreLabel.color }}>
                            <strong>{scoreLabel.label}</strong>
                          </td>
                          <td style={{ textAlign: "center"}}>
                            {diff == null
                              ? "-"
                              : diff === 0
                              ? "E"
                              : diff > 0
                              ? `+${diff}`
                              : diff}
                          </td>
                          <td>
                            <input
                              type="number"
                              name={`hole_${hole.id}_score`}
                              min={1}
                              max={99}
                              defaultValue={result?.stroke ?? ""} />
                          </td>

                          {/* スコア分解 */}
                          <td>
                            <input
                              type="number"
                              name={`hole_${hole.id}_shortgame`}
                              min={1}
                              max={99}
                              defaultValue={result?.shortGame ?? ""}
                            />
                          </td>
                          <td>{metrics?.approach ?? "-"}</td>
                          <td>
                            <input
                              type="number"
                              name={`hole_${hole.id}_putt`}
                              min={0}
                              max={99}
                              defaultValue={result?.putt ?? ""} />
                          </td>
                          <td>{metrics?.longgame ?? "-"}</td>
                          <td>{metrics?.longshot ?? "-"}</td>
                          <td>
                            <input
                              type="number"
                              name={`hole_${hole.id}_penalty`}
                              min={0}
                              max={99}
                              defaultValue={result?.penalty ?? ""} />
                          </td>

                          {/* ティーショット */}
                          <td>
                            <select
                              name={`hole_${hole.id}_fairwayKeep`}
                              defaultValue={result?.fairwayKeep ?? ""}
                            >
                              {/* 未入力 */}
                              <option value="">-</option>

                              {/* enum から生成 */}
                              {fwOptions.map(opt => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              name={`hole_${hole.id}_secondShotOk`}
                              defaultValue={
                                result?.secondShotOk == null
                                  ? ""
                                  : result.secondShotOk
                                  ? "true"
                                  : "false"
                              }
                            >
                              <option value="">-</option>
                              <option value="true">OK</option>
                              <option value="false">NG</option>
                            </select>
                          </td>

                          {/* ハザード */}
                          <td>
                            <input
                              type="number"
                              name={`hole_${hole.id}_greenBunker`}
                              min={0}
                              max={99}
                              defaultValue={result?.greenBunker ?? ""}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              name={`hole_${hole.id}_fairwayBunker`}
                              min={0}
                              max={99}
                              defaultValue={result?.fairwayBunker ?? ""}
                            />
                          </td>
                        </tr>

                    );
```

を以下に置き換える:

```tsx
                    return (
                      <tr key={hole.id}>
                          {/* コース情報 */}
                          <td className={tdClass}>{hole.holeNumber}</td>
                          <td className={tdClass}>{hole.par}</td>
                          <td className={`${tdClass} ${groupEnd}`}>{hole.yardRegular}</td>
                          {/* スコア */}
                          {/* ★ ±Par 表示 */}
                          <td className={tdClass} style={{ color: scoreLabel.color }}>
                            <strong>{scoreLabel.label}</strong>
                          </td>
                          <td className={tdClass}>
                            {diff == null
                              ? "-"
                              : diff === 0
                              ? "E"
                              : diff > 0
                              ? `+${diff}`
                              : diff}
                          </td>
                          <td className={`${tdClass} ${groupEnd}`}>
                            <input
                              type="number"
                              className="table-input"
                              name={`hole_${hole.id}_score`}
                              min={1}
                              max={99}
                              defaultValue={result?.stroke ?? ""} />
                          </td>

                          {/* スコア分解 */}
                          <td className={tdClass}>
                            <input
                              type="number"
                              className="table-input"
                              name={`hole_${hole.id}_shortgame`}
                              min={1}
                              max={99}
                              defaultValue={result?.shortGame ?? ""}
                            />
                          </td>
                          <td className={tdClass}>{metrics?.approach ?? "-"}</td>
                          <td className={tdClass}>
                            <input
                              type="number"
                              className="table-input"
                              name={`hole_${hole.id}_putt`}
                              min={0}
                              max={99}
                              defaultValue={result?.putt ?? ""} />
                          </td>
                          <td className={tdClass}>{metrics?.longgame ?? "-"}</td>
                          <td className={tdClass}>{metrics?.longshot ?? "-"}</td>
                          <td className={`${tdClass} ${groupEnd}`}>
                            <input
                              type="number"
                              className="table-input"
                              name={`hole_${hole.id}_penalty`}
                              min={0}
                              max={99}
                              defaultValue={result?.penalty ?? ""} />
                          </td>

                          {/* ティーショット */}
                          <td className={tdClass}>
                            <select
                              className="table-select"
                              name={`hole_${hole.id}_fairwayKeep`}
                              defaultValue={result?.fairwayKeep ?? ""}
                            >
                              {/* 未入力 */}
                              <option value="">-</option>

                              {/* enum から生成 */}
                              {fwOptions.map(opt => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className={`${tdClass} ${groupEnd}`}>
                            <select
                              className="table-select"
                              name={`hole_${hole.id}_secondShotOk`}
                              defaultValue={
                                result?.secondShotOk == null
                                  ? ""
                                  : result.secondShotOk
                                  ? "true"
                                  : "false"
                              }
                            >
                              <option value="">-</option>
                              <option value="true">OK</option>
                              <option value="false">NG</option>
                            </select>
                          </td>

                          {/* ハザード */}
                          <td className={tdClass}>
                            <input
                              type="number"
                              className="table-input"
                              name={`hole_${hole.id}_greenBunker`}
                              min={0}
                              max={99}
                              defaultValue={result?.greenBunker ?? ""}
                            />
                          </td>
                          <td className={tdClass}>
                            <input
                              type="number"
                              className="table-input"
                              name={`hole_${hole.id}_fairwayBunker`}
                              min={0}
                              max={99}
                              defaultValue={result?.fairwayBunker ?? ""}
                            />
                          </td>
                        </tr>

                    );
```

- [ ] **Step 7: 型チェックとテストを実行する**

Run: `cd golf-web && npx tsc --noEmit && npm run test`
Expected: 型エラーなし、既存テストがすべて PASS（このタスクはロジックを変更していないため）

- [ ] **Step 8: 開発サーバーで目視確認する**

Run: `cd golf-web && npm run dev`

ブラウザで既存ラウンドの `/rounds/[roundId]/holes` を開き、以下を確認する:
- グループ背景色（グレー・緑・黄・青・赤）が無くなっている
- テーブルに枠線があり、グループの区切り（Yard/Score/Penalty/2nd の右側）が太めの縦線になっている
- Result列の文字色（Bogey=オレンジ等）は維持されている
- 数値入力欄・select が四角い枠線スタイルになっている
- 上部の合計サマリーカード・保存ボタンの見た目は変わっていない
- スコアを入力して「保存」を押すと、これまで通り保存される

- [ ] **Step 9: Commit**

```bash
git add golf-web/app/rounds/\[roundId\]/holes/page.tsx
git commit -m "style: ホール入力ページのスコア表をTailwindデザインに統一"
```

---

## Self-Review Notes

- Spec covレッジ: グループ背景色廃止（Task 2 Step 4）、テーブル専用入力欄クラス（Task 1, Task 2 Step 6）、カード化しない方針（Task 2 は `page-card` を使わず `overflow-x-auto` のみ追加）、Result列の色は維持（Task 2 Step 6 で `style={{ color: scoreLabel.color }}` を残す）を確認済み。合計サマリー・保存ボタンは今回のdiffに含まれておらず変更なし。
