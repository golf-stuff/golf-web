import Link from "next/link";
import { prisma } from "@/src/lib/db/prisma";

export default async function RoundsPage() {
  const rounds = await prisma.trnRound.findMany({
    orderBy: { playedAt: "desc" },
    include: {
      golfCourse: true,
      holeResults: {
        include: {
          hole: true,
        },
      },
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
