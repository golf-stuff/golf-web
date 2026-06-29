'use client'

import { useState, useTransition } from 'react'
import { parseGdoScoreText, type ParsedScore } from '@/src/lib/parsers/gdoScorecard'
import { importGdoScore } from './actions'

type Layout = {
  id: string
  name: string
  holeCount: number
}

type GolfCourse = {
  id: string
  name: string
  layouts: Layout[]
}

type Props = {
  golfCourses: GolfCourse[]
}

export default function ImportForm({ golfCourses }: Props) {
  const [courseId, setCourseId] = useState('')
  const [layoutId, setLayoutId] = useState('')
  const [playedAt, setPlayedAt] = useState('')
  const [rawText, setRawText] = useState('')
  const [preview, setPreview] = useState<ParsedScore[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedCourse = golfCourses.find(c => c.id === courseId)
  const selectedLayout = selectedCourse?.layouts.find(l => l.id === layoutId)

  function handleParse() {
    setParseError(null)
    setPreview(null)

    if (!selectedLayout) {
      setParseError('レイアウトを選択してください')
      return
    }

    const result = parseGdoScoreText(rawText, selectedLayout.holeCount)
    if (!result.ok) {
      setParseError(result.message)
      return
    }
    setPreview(result.scores)
  }

  function handleImport() {
    if (!preview || !courseId || !layoutId || !playedAt) return
    startTransition(async () => {
      await importGdoScore({
        golfCourseId: courseId,
        layoutId,
        playedAt,
        scores: preview,
      })
    })
  }

  const totalStroke = preview?.reduce((s, r) => s + r.stroke, 0) ?? 0
  const totalPutt = preview?.reduce((s, r) => s + (r.putt ?? 0), 0) ?? 0

  return (
    <div className="flex flex-col gap-6">
      {/* 基本情報 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-4">
        <div className="text-sm font-medium text-gray-700">1. ラウンド情報</div>

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
      </div>

      {/* GDOテキスト貼り付け */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-4">
        <div className="text-sm font-medium text-gray-700">2. GDOスコアカードを貼り付け</div>
        <p className="text-xs text-gray-400">
          GDOサイトのスコアカード（Hole / Par / スコア / パット 行を含む）をコピーして貼り付けてください。
        </p>
        <textarea
          className="border border-gray-300 rounded-lg p-3 text-xs font-mono h-40 resize-none"
          placeholder={'Hole\t1\t2\t...\nPar\t4\t3\t...\nスコア\t5\t3\t...\nパット\t2\t1\t...'}
          value={rawText}
          onChange={e => { setRawText(e.target.value); setPreview(null) }}
        />

        {parseError && (
          <p className="text-xs text-red-500">{parseError}</p>
        )}

        <button
          onClick={handleParse}
          disabled={!layoutId || !rawText.trim()}
          className="self-start px-4 py-2 text-sm rounded-lg bg-gray-900 text-white disabled:opacity-40"
        >
          パース
        </button>
      </div>

      {/* プレビュー */}
      {preview && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-4">
          <div className="text-sm font-medium text-gray-700">3. 確認してインポート</div>

          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-gray-400 text-xs">合計スコア</span>
              <div className="text-2xl font-medium tabular-nums">{totalStroke}</div>
            </div>
            {totalPutt > 0 && (
              <div>
                <span className="text-gray-400 text-xs">合計パット</span>
                <div className="text-2xl font-medium tabular-nums">{totalPutt}</div>
              </div>
            )}
          </div>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="py-1 text-left">Hole</th>
                <th className="py-1 text-right">Score</th>
                <th className="py-1 text-right">Putt</th>
              </tr>
            </thead>
            <tbody>
              {preview.map(s => (
                <tr key={s.holeNumber} className="border-b border-gray-50">
                  <td className="py-1 text-gray-600">{s.holeNumber}</td>
                  <td className="py-1 text-right font-medium tabular-nums">{s.stroke}</td>
                  <td className="py-1 text-right text-gray-400 tabular-nums">{s.putt ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            onClick={handleImport}
            disabled={isPending || !playedAt || !courseId || !layoutId}
            className="self-start px-5 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-40"
          >
            {isPending ? '保存中...' : 'インポート'}
          </button>
        </div>
      )}
    </div>
  )
}
