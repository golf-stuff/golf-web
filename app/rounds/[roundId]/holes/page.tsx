import Link from "next/link";
import { prisma } from "@/src/lib/db/prisma";
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

  if (!round) {
    return <div>ラウンドが見つかりません</div>;
  }

  const holeResultMap = new Map(
    round.holeResults.map(r => [r.holeId, r])
  );
  const totalScore = round.holeResults.reduce(
    (sum, r) => sum + r.stroke,
    0
  );
  const totalPutt = round.holeResults.reduce(
    (sum, r) => sum + (r.putt ?? 0),
    0
  );
  const totalPenalty = round.holeResults.reduce(
    (sum, r) => sum + (r.penalty ?? 0),
    0
  );

  return (
    <main>
      <nav>
        <Link href="/rounds">
          ラウンド履歴へ戻る
        </Link>
      </nav>

      <h1>ラウンド入力</h1>
      <p>{round.golfCourse.name}</p>

      <section style={{ marginBottom: "1rem" }}>
        <h2>合計</h2>
        <ul>
          <li>合計スコア：{totalScore}</li>
          <li>合計パット：{totalPutt}</li>
          <li>合計ペナルティ：{totalPenalty}</li>
        </ul>
      </section>

      <form action={saveRoundHoles}>
        <input type="hidden" name="roundId" value={round.id} />

        {round.golfCourse.layouts.map(layout => {
          // この layout に属する holeId を集める
          const layoutHoleIds = new Set(
            layout.holes.map(h => h.id)
          );
          // round.holeResults から該当分だけ抽出
          const layoutResults = round.holeResults.filter(r =>
            layoutHoleIds.has(r.holeId)
          );
          // 合計計算
          const layoutScore = layoutResults.reduce(
            (sum, r) => sum + r.stroke,
            0
          );
          const layoutPutt = layoutResults.reduce(
            (sum, r) => sum + (r.putt ?? 0),
            0
          );
          const layoutPenalty = layoutResults.reduce(
            (sum, r) => sum + (r.penalty ?? 0),
            0
          );

          return (
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
                <thead>
                  {/* グループ行 */}
                  <tr>
                    <th colSpan={3} style={{ ...baseTh, ...bgCourse, ...borderRightStrong }}>コース情報</th>
                    <th colSpan={3} style={{ ...baseTh, ...bgScore, ...borderRightStrong }}>スコア</th>
                    <th colSpan={6} style={{ ...baseTh, ...bgBreakdown, ...borderRightStrong }}>スコア分解</th>
                    <th colSpan={2} style={{ ...baseTh, ...bgTee, ...borderRightStrong }}>ティーショット</th>
                    <th colSpan={2} style={{ ...baseTh, ...bgHazard }}>ハザード</th>
                  </tr>

                  {/* 項目行 */}
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
                            putt: result.putt,
                            shortgame: result.shortgame,
                            approach: result.approach,
                            penalty: result.penalty,
                          })
                        : null;
                    const diff = metrics?.diff ?? null;
                    const category = getHoleScoreCategory(diff);
                    const scoreLabel = scoreCategoryToLabel(category);

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
                              defaultValue={result?.shortgame ?? ""}
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
                  })}
                </tbody>
              </table>
            </section>
          
          );
        })}

        <button type="submit" style={{ marginTop: "1rem" }}>
          保存
        </button>
      </form>
    </main>
  );
}
