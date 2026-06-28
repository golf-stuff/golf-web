import Link from "next/link";
import { prisma } from "@/src/lib/db/prisma";

export default async function RoundsPage() {
  const rounds = await prisma.trnRound.findMany({
    orderBy: { playedAt: "desc" },
    include: {
      golfCourse: true,
      holeResults: {
        include: {
          hole: true, // ★ par を取るために必須
        },
      },
    },
  });

  return (
    <main>
      <h1>ラウンド履歴</h1>

      {rounds.length === 0 ? (
        <p>ラウンド履歴はまだありません。</p>
      ) : (
        <table
          style={{
            borderCollapse: "collapse",
            marginTop: "1rem",
            fontSize: "0.9rem",
          }}
        >
          <thead>
            <tr>
              <th style={thStyle}>No</th>
              <th style={thStyle}>プレイ日</th>
              <th style={thStyle}>ゴルフ場</th>
              <th style={thStyle}>スコア</th>
              <th style={thStyle}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((round, index) => {
              const totalScore = round.holeResults.reduce(
                (sum, r) => sum + r.stroke,
                0
              );

              return (
                <tr key={round.id}>
                  <td style={tdCenter}>{index + 1}</td>
                  <td style={tdCenter}>
                    {round.playedAt.toISOString().slice(0, 10)}
                  </td>
                  <td style={tdLeft}>{round.golfCourse.name}</td>
                  <td style={tdCenter}>{totalScore}</td>
                  <td style={tdCenter}>
                    <Link href={`/rounds/${round.id}/holes`}>
                      編集
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: "1rem" }}>
        <Link href="/rounds/new">
          ＋ 新しいラウンドを追加
        </Link>
      </div>
    </main>
  );
}

/* ---------- styles ---------- */

const thStyle: React.CSSProperties = {
  border: "1px solid #ccc",
  padding: "6px 8px",
  backgroundColor: "#f5f5f5",
  whiteSpace: "nowrap",
};

const tdCenter: React.CSSProperties = {
  border: "1px solid #ccc",
  padding: "6px 8px",
  textAlign: "center",
};

const tdLeft: React.CSSProperties = {
  border: "1px solid #ccc",
  padding: "6px 8px",
  textAlign: "left",
};
