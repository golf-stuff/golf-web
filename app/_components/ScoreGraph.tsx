'use client'
import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

type Props = {
  yearlyAverages: { year: number; avg: number }[]
  recent20: { id: string; score: number }[]
}

export default function ScoreGraph({ yearlyAverages, recent20 }: Props) {
  const [mode, setMode] = useState<'yearly' | 'recent'>('recent')

  const recentData = recent20.map((r, i) => ({ label: String(i + 1), score: r.score }))
  const yearlyData = yearlyAverages.map(y => ({ label: String(y.year), score: y.avg }))
  const data = mode === 'recent' ? recentData : yearlyData

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm font-medium text-gray-900">スコア推移</span>
        <div className="flex gap-1">
          <button
            onClick={() => setMode('yearly')}
            className={[
              'text-xs px-3 py-1 rounded border transition-colors',
              mode === 'yearly'
                ? 'bg-blue-50 text-blue-600 border-blue-300'
                : 'bg-transparent text-gray-500 border-gray-300',
            ].join(' ')}
          >
            年別平均
          </button>
          <button
            onClick={() => setMode('recent')}
            className={[
              'text-xs px-3 py-1 rounded border transition-colors',
              mode === 'recent'
                ? 'bg-blue-50 text-blue-600 border-blue-300'
                : 'bg-transparent text-gray-500 border-gray-300',
            ].join(' ')}
          >
            直近20R
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={['dataMin - 5', 'dataMax + 2']} />
          <Tooltip
            formatter={(value) => [Number(value).toFixed(1), 'スコア']}
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
          />
          <Bar dataKey="score" radius={[2, 2, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill="#dbeafe" stroke="#93c5fd" strokeWidth={1.5} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
