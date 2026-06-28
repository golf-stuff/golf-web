import { prisma } from "@/src/lib/db/prisma";
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
    <main>
      {/* 戻る導線 */}
      <nav>
        <Link href="/golf-courses">
          ← ゴルフ場一覧へ戻る
        </Link>
      </nav>

      <h1>{golfCourse.name} のコース管理</h1>

      <section>
        <h2>登録済みコース</h2>
        <ul>
          {golfCourse.layouts.map(layout => {
            const hasHoles = layout.holes.length > 0;

            return (
              <li key={layout.id} style={{ marginBottom: "1.5rem" }}>
                {/* コース名編集フォーム */}
                <form
                  action={updateCourseLayoutName}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
                >
                  <input type="hidden" name="layoutId" value={layout.id} />
                  <input type="hidden" name="golfCourseId" value={golfCourse.id} />

                  <input
                    type="text"
                    name="name"
                    defaultValue={layout.name}
                    style={{ width: "8rem" }}
                    required
                  />

                  <button type="submit">保存</button>
                </form>
                <span style={{ marginLeft: "0.5rem", color: "#666" }}>
                  （{layout.holeCount}H）
                </span>
                <strong>
                  {layout.name}（{layout.holeCount}H）
                </strong>

                {hasHoles ? (
                  <div style={{ marginLeft: "1rem", marginTop: "0.5rem" }}>
                    <table
                      style={{
                        borderCollapse: "collapse",
                        marginTop: "0.5rem",
                        fontSize: "0.9rem",
                      }}
                    >
                      <tbody>
                        <tr>
                          <th style={thStyle}>Hole</th>
                          {layout.holes.map(h => (
                            <td key={h.id} style={tdCenterStyle}>
                              {h.holeNumber}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <th style={thStyle}>Par</th>
                          {layout.holes.map(h => (
                            <td key={h.id} style={tdCenterStyle}>
                              {h.par}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <th style={thStyle}>Yard</th>
                          {layout.holes.map(h => (
                            <td key={h.id} style={tdRightStyle}>
                              {h.yardRegular}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>


                  </div>
                ) : (
                  <div style={{ marginLeft: "1rem", color: "#666" }}>
                    （未登録）
                  </div>
                )}


                <div style={{ marginTop: "0.25rem" }}>
                  <Link
                    href={`/golf-courses/${golfCourse.id}/layouts/${layout.id}/holes`}
                  >
                    ホール定義
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>

      </section>

      <section>
        <h2>コースを追加</h2>

        <form action={createCourseLayout}>
          <input
            type="hidden"
            name="golfCourseId"
            value={golfCourse.id}
          />

          <div>
            <label>
              コース名
              <input
                type="text"
                name="name"
                placeholder="OUT / IN / 東 / 西"
                required
              />
            </label>
          </div>

          <button type="submit">追加</button>
        </form>
      </section>
    </main>
  );
}

const thStyle: React.CSSProperties = {
  border: "1px solid #ccc",
  padding: "4px 8px",
  textAlign: "center",
  backgroundColor: "#f9f9f9",
  whiteSpace: "nowrap",
};

const tdCenterStyle: React.CSSProperties = {
  border: "1px solid #ccc",
  padding: "4px 8px",
  textAlign: "center",
};

const tdRightStyle: React.CSSProperties = {
  border: "1px solid #ccc",
  padding: "4px 8px",
  textAlign: "right",
};
