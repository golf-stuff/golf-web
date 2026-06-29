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
      {/* サマリー行 */}
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

      {/* グラフ */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <ScoreGraph yearlyAverages={data.yearlyAverages} recent20={data.recent20} />
        <div className="mt-3 text-right">
          <Link href="/rounds" className="text-xs text-blue-600 hover:underline">
            すべて見る →
          </Link>
        </div>
      </div>

      {/* 直近ラウンド */}
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
