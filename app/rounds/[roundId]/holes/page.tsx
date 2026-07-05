import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/db/prisma";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";
import { getHoleScoreCategory } from "@/src/lib/metrics/holeScoreCategory";
import { scoreCategoryToLabel } from "@/src/lib/ui/scoreLabel";
import { calcHoleMetrics } from "@/src/lib/metrics/holeMetrics";
import { saveRoundHoles } from "../../actions";
import { fairway_keep_result } from "@prisma/client";

type Props = {
  params: Promise<{
    roundId: string;
  }>;
};

const thClass = "border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-500 whitespace-nowrap";
const tdClass = "border border-gray-200 px-2 py-1 text-center text-xs";
const groupEnd = "border-r-2 border-r-gray-300"; // グループ区切り（太めの縦罫線）


function getFwkeepOptions(par: number): fairway_keep_result[] {
  if (par === 3) {
    return [
      fairway_keep_result.ok,
      fairway_keep_result.left,
      fairway_keep_result.right,
      fairway_keep_result.over,
      fairway_keep_result.short,
    ];
  }

  // Par 4, 5
  return [
    fairway_keep_result.ok,
    fairway_keep_result.left,
    fairway_keep_result.right,
  ];
}

export default async function RoundHolesPage({ params }: Props) {
  const { roundId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const round = await prisma.trnRound.findUnique({
    where: { id: roundId },
    include: {
      holeResults: true, // ★ 既存入力結果
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

  const holeResultMap = new Map(
    round.holeResults.map(r => [r.holeId, r] as const)
  );
  const holeResultsTyped = round.holeResults;
  const totalScore = holeResultsTyped.reduce((sum, r) => sum + r.stroke, 0);
  const totalPutt = holeResultsTyped.reduce((sum, r) => sum + (r.putt ?? 0), 0);
  const totalPenalty = holeResultsTyped.reduce((sum, r) => sum + (r.penalty ?? 0), 0);

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
        {round.golfCourse.layouts.map((layout: { id: string; name: string; holes: { id: string; holeNumber: number; par: number; yardRegular: number }[] }) => {
          // この layout に属する holeId を集める
          const layoutHoleIds = new Set(
            layout.holes.map(h => h.id)
          );
          // round.holeResults から該当分だけ抽出
          const layoutResults = holeResultsTyped.filter(r => layoutHoleIds.has(r.holeId));
          const layoutScore = layoutResults.reduce((sum, r) => sum + r.stroke, 0);
          const layoutPutt = layoutResults.reduce((sum, r) => sum + (r.putt ?? 0), 0);
          const layoutPenalty = layoutResults.reduce((sum, r) => sum + (r.penalty ?? 0), 0);

          return (
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
                <thead>
                  {/* グループ行 */}
                  <tr>
                    <th colSpan={3} className={`${thClass} ${groupEnd}`}>コース情報</th>
                    <th colSpan={3} className={`${thClass} ${groupEnd}`}>スコア</th>
                    <th colSpan={6} className={`${thClass} ${groupEnd}`}>スコア分解</th>
                    <th colSpan={2} className={`${thClass} ${groupEnd}`}>ティーショット</th>
                    <th colSpan={2} className={thClass}>ハザード</th>
                  </tr>

                  {/* 項目行 */}
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

                <tbody>
                  {layout.holes.map(hole => {
                    const result = holeResultMap.get(hole.id);
                    const fwOptions = getFwkeepOptions(hole.par);

                    // ★ ここで各HoleのMetsricsを計算する
                    const metrics =
                      result?.stroke != null
                        ? calcHoleMetrics({
                            stroke: result.stroke,
                            par: hole.par,
                            putt: result.putt ?? undefined,
                            shortgame: result.shortGame ?? undefined,
                            penalty: result.penalty,
                          })
                        : null;
                    const diff = metrics?.diff ?? null;
                    const category = getHoleScoreCategory(diff);
                    const scoreLabel = scoreCategoryToLabel(category);

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
                  })}
                </tbody>
              </table>
              </div>
            </section>

          );
        })}

        <div className="mt-4">
          <button type="submit" className="btn-primary">保存</button>
        </div>
      </form>
    </main>
  );
}
