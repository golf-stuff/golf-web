'use client'

import { useState, useTransition } from 'react'
import { parseGdoScoreText, parseGdoFullRound, type ParsedScore } from '@/src/lib/parsers/gdoScorecard'
import { importGdoScore, importGdoScore18H } from './actions'

type Layout = { id: string; name: string; holeCount: number }
type GolfCourse = { id: string; name: string; layouts: Layout[] }
type ExistingRound = { id: string; golfCourseId: string; playedAt: string } | null

type Props = {
  golfCourses: GolfCourse[]
  existingRound: ExistingRound
}

type HalfPreview = { scores: ParsedScore[] }

export default function ImportForm({ golfCourses, existingRound }: Props) {
  const isUpdateMode = existingRound !== null
  const [mode, setMode] = useState<'9h' | '18h'>('18h')
  const [courseId, setCourseId] = useState(existingRound?.golfCourseId ?? '')
  const [firstLayoutId, setFirstLayoutId] = useState('')
  const [secondLayoutId, setSecondLayoutId] = useState('')
  const [playedAt, setPlayedAt] = useState(existingRound?.playedAt ?? '')
  const [rawText, setRawText] = useState('')
  const [firstPreview, setFirstPreview] = useState<HalfPreview | null>(null)
  const [secondPreview, setSecondPreview] = useState<HalfPreview | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedCourse = golfCourses.find(c => c.id === courseId)
  const availableLayouts = selectedCourse?.layouts ?? []
  const firstLayout = availableLayouts.find(l => l.id === firstLayoutId)

  function clearPreview() {
    setFirstPreview(null)
    setSecondPreview(null)
    setParseError(null)
  }

  function handleParse() {
    clearPreview()

    if (mode === '9h') {
      if (!firstLayoutId) { setParseError('コースを選択してください'); return }
      const result = parseGdoScoreText(rawText, firstLayout!.holeCount)
      if (!result.ok) { setParseError(result.message); return }
      setFirstPreview({ scores: result.scores })
    } else {
      if (!firstLayoutId || !secondLayoutId) { setParseError('前半・後半のコースを選択してください'); return }
      const holeCount = firstLayout?.holeCount ?? 9
      const result = parseGdoFullRound(rawText, holeCount)
      if (!result.ok) { setParseError(result.message); return }
      setFirstPreview({ scores: result.first.scores })
      setSecondPreview({ scores: result.second.scores })
    }
  }

  function handleSave() {
    if (!firstPreview) return
    setSaveError(null)

    startTransition(async () => {
      try {
        if (mode === '18h' && secondPreview) {
          await importGdoScore18H({
            roundId: existingRound?.id,
            golfCourseId: courseId,
            firstLayoutId,
            secondLayoutId,
            playedAt,
            firstScores: firstPreview.scores,
            secondScores: secondPreview.scores,
          })
        } else {
          await importGdoScore({
            roundId: existingRound?.id,
            golfCourseId: courseId,
            layoutId: firstLayoutId,
            playedAt,
            scores: firstPreview.scores,
          })
        }
      } catch (e) {
        if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e
        setSaveError(e instanceof Error ? e.message : '保存に失敗しました')
      }
    })
  }

  const totalFirst = firstPreview?.scores.reduce((s, r) => s + r.stroke, 0) ?? 0
  const totalSecond = secondPreview?.scores.reduce((s, r) => s + r.stroke, 0) ?? 0

  return (
    <div className="flex flex-col gap-4">
      {/* ラウンド情報（上書きモードはゴルフ場・日付を固定表示） */}
      <div className="page-card flex flex-col gap-4">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-widest">1 ラウンド情報</span>

        {isUpdateMode ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">ゴルフ場 / プレー日</span>
            <div className="text-sm text-gray-900">
              {selectedCourse?.name ?? '-'} ／ {playedAt}
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className="field-label">ゴルフ場</label>
              <select
                className="select-underline"
                value={courseId}
                onChange={e => { setCourseId(e.target.value); setFirstLayoutId(''); setSecondLayoutId(''); clearPreview() }}
              >
                <option value="">選択してください</option>
                {golfCourses.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">プレー日</label>
              <input
                type="date"
                className="input-underline"
                value={playedAt}
                onChange={e => setPlayedAt(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      {/* モード切替 + コース選択 */}
      <div className="page-card flex flex-col gap-4">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-widest">2 コース選択</span>

        {/* 9H / 18H タブ */}
        <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
          {(['9h', '18h'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); clearPreview() }}
              className={[
                'flex-1 text-xs py-1.5 rounded-md transition-colors',
                mode === m
                  ? 'bg-white text-gray-900 font-medium shadow-sm border border-gray-200'
                  : 'text-gray-500',
              ].join(' ')}
            >
              {m === '9h' ? '9H（ハーフ）' : '18H（1ラウンド）'}
            </button>
          ))}
        </div>

        {selectedCourse ? (
          <div className={mode === '18h' ? 'grid grid-cols-2 gap-4' : ''}>
            <div>
              <label className="field-label">{mode === '18h' ? '前半コース' : 'コース'}</label>
              <select
                className="select-underline"
                value={firstLayoutId}
                onChange={e => { setFirstLayoutId(e.target.value); clearPreview() }}
              >
                <option value="">選択</option>
                {availableLayouts.map(l => (
                  <option key={l.id} value={l.id} disabled={l.id === secondLayoutId}>
                    {l.name}（{l.holeCount}H）
                  </option>
                ))}
              </select>
            </div>
            {mode === '18h' && (
              <div>
                <label className="field-label">後半コース</label>
                <select
                  className="select-underline"
                  value={secondLayoutId}
                  onChange={e => { setSecondLayoutId(e.target.value); clearPreview() }}
                >
                  <option value="">選択</option>
                  {availableLayouts.map(l => (
                    <option key={l.id} value={l.id} disabled={l.id === firstLayoutId}>
                      {l.name}（{l.holeCount}H）
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400">まずゴルフ場を選択してください</p>
        )}
      </div>

      {/* テキスト貼り付け */}
      <div className="page-card flex flex-col gap-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-widest">3 スコアカードを貼り付け</span>
        <p className="text-xs text-gray-400">
          GDOサイトのスコアカード（{mode === '18h' ? 'OUT〜INをまとめてコピー' : 'ハーフ分'}）を貼り付けてください。
        </p>
        <textarea
          className="border border-gray-200 rounded-lg p-3 text-xs font-mono h-36 resize-none w-full focus:outline-none focus:border-gray-400"
          placeholder={mode === '18h'
            ? '筑波 【White(L)ティー】\nHole\t1\t2\t...\n自分\t7\t4\t...\n日光 【White(L)ティー】\nHole\t1\t2\t...\n自分\t6\t5\t...'
            : 'Hole\t1\t2\t...\n自分\t5\t3\t...'
          }
          value={rawText}
          onChange={e => { setRawText(e.target.value); clearPreview() }}
        />
        {parseError && <p className="text-xs text-red-500">{parseError}</p>}
        <button
          onClick={handleParse}
          disabled={!firstLayoutId || (mode === '18h' && !secondLayoutId) || !rawText.trim()}
          className="btn-primary self-start text-xs px-4 py-2"
        >
          パース
        </button>
      </div>

      {/* プレビュー */}
      {firstPreview && (
        <div className="page-card flex flex-col gap-4">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-widest">
            {isUpdateMode ? '4 確認して上書き' : '4 確認してインポート'}
          </span>

          <div className="flex gap-6">
            {mode === '18h' ? (
              <>
                <div>
                  <div className="text-xs text-gray-400">前半</div>
                  <div className="text-2xl font-medium tabular-nums">{totalFirst}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">後半</div>
                  <div className="text-2xl font-medium tabular-nums">{totalSecond}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">合計</div>
                  <div className="text-2xl font-medium tabular-nums text-gray-900">{totalFirst + totalSecond}</div>
                </div>
              </>
            ) : (
              <div>
                <div className="text-xs text-gray-400">合計スコア</div>
                <div className="text-2xl font-medium tabular-nums">{totalFirst}</div>
              </div>
            )}
          </div>

          <div className={mode === '18h' ? 'grid grid-cols-2 gap-4' : ''}>
            {[firstPreview, ...(secondPreview ? [secondPreview] : [])].map((half, hi) => (
              <table key={hi} className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="py-1 text-left">{mode === '18h' ? (hi === 0 ? '前半' : '後半') : 'Hole'}</th>
                    <th className="py-1 text-right">Score</th>
                    <th className="py-1 text-right">Putt</th>
                    <th className="py-1 text-right">Pen</th>
                  </tr>
                </thead>
                <tbody>
                  {half.scores.map(s => (
                    <tr key={s.holeNumber} className="border-b border-gray-50">
                      <td className="py-1 text-gray-500 text-xs">{s.holeNumber}</td>
                      <td className="py-1 text-right font-medium tabular-nums">{s.stroke}</td>
                      <td className="py-1 text-right text-gray-400 tabular-nums text-xs">{s.putt ?? '—'}</td>
                      <td className="py-1 text-right text-gray-400 tabular-nums text-xs">{s.penalty || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>

          {saveError && <p className="text-xs text-red-500">{saveError}</p>}

          <button
            onClick={handleSave}
            disabled={isPending || !firstLayoutId || (mode === '18h' && !secondLayoutId) || (!isUpdateMode && (!playedAt || !courseId))}
            className="btn-primary self-start"
          >
            {isPending ? '保存中...' : isUpdateMode ? '上書き保存' : 'インポート'}
          </button>
        </div>
      )}
    </div>
  )
}
