import { describe, it, expect } from 'vitest'
import { parseGdoScoreText, parseGdoFullRound } from '../gdoScorecard'

const SAMPLE_9H = `
Hole\t1\t2\t3\t4\t5\t6\t7\t8\t9\tOut
Par\t4\t3\t5\t4\t4\t3\t5\t4\t4\t36
Yard\t350\t150\t480\t320\t400\t170\t510\t380\t360\t3120
スコア\t5\t3\t6\t5\t5\t4\t7\t5\t5\t45
パット\t2\t1\t2\t2\t2\t1\t3\t2\t2\t17
`.trim()

// 実際のGDOコピペ（前半9H）
const SAMPLE_GDO_REAL = `筑波 【White(L)ティー】
Hole\t1\t2\t3\t4\t5\t6\t7\t8\t9\t前半H\tTotal
Par\t5\t4\t4\t3\t4\t4\t3\t5\t4\t36\t72
Yard\t541y\t369y\t280y\t147y\t386y\t366y\t166y\t436y\t333y\t3,024y\t6,134y
自分\t7\t4\t5\t3\t6\t5\t4\t5\t5\t44\t92
Putt\t2\t2\t2\t1\t2\t1\t3\t2\t2\t　17\t36
ティショットクラブ\t1W\t5W\t5W\t8i\t1W\t1W\t8i\t1W\t1W\t\t
フェアウェイキープ\t\t\t\t\t\t\t\t\t\t42.9%\t42.9%
OB\t1\t\t\t\t\t\t\t\t\t1回\t3回`.trim()

const SAMPLE_9H_EN = `
Hole\t1\t2\t3\t4\t5\t6\t7\t8\t9
Par\t4\t3\t5\t4\t4\t3\t5\t4\t4
Score\t5\t3\t6\t5\t5\t4\t7\t5\t5
Putt\t2\t1\t2\t2\t2\t1\t3\t2\t2
`.trim()

describe('parseGdoScoreText', () => {
  it('実際のGDOフォーマット（自分行・全角スペース小計・合計列あり）をパースできる', () => {
    const result = parseGdoScoreText(SAMPLE_GDO_REAL, 9)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.scores).toHaveLength(9)
    expect(result.scores[0]).toEqual({ holeNumber: 1, stroke: 7, putt: 2, penalty: 0 })
    expect(result.scores[1]).toEqual({ holeNumber: 2, stroke: 4, putt: 2, penalty: 0 })
    expect(result.scores[8]).toEqual({ holeNumber: 9, stroke: 5, putt: 2, penalty: 0 })
    // 小計・合計は含まれない
    const total = result.scores.reduce((s, r) => s + r.stroke, 0)
    expect(total).toBe(44)
  })

  it('日本語ラベルのスコア行をパースできる', () => {
    const result = parseGdoScoreText(SAMPLE_9H, 9)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.scores).toHaveLength(9)
    expect(result.scores[0]).toEqual({ holeNumber: 1, stroke: 5, putt: 2, penalty: 0 })
    expect(result.scores[8]).toEqual({ holeNumber: 9, stroke: 5, putt: 2, penalty: 0 })
  })

  it('英語ラベルのスコア行をパースできる', () => {
    const result = parseGdoScoreText(SAMPLE_9H_EN, 9)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.scores[0]).toEqual({ holeNumber: 1, stroke: 5, putt: 2, penalty: 0 })
  })

  it('パット行がなくてもパースできる（putt は null）', () => {
    const noPutt = SAMPLE_9H.split('\n').filter(l => !l.startsWith('パット')).join('\n')
    const result = parseGdoScoreText(noPutt, 9)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.scores[0].putt).toBeNull()
  })

  it('空テキストはエラー', () => {
    const result = parseGdoScoreText('', 9)
    expect(result.ok).toBe(false)
  })

  it('Hole行がなければエラー', () => {
    const noHole = SAMPLE_9H.split('\n').filter(l => !l.startsWith('Hole')).join('\n')
    const result = parseGdoScoreText(noHole, 9)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/Hole行/)
  })

  it('スコア行がなければエラー', () => {
    const noScore = SAMPLE_9H.split('\n').filter(l => !l.startsWith('スコア')).join('\n')
    const result = parseGdoScoreText(noScore, 9)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/スコア行/)
  })

  it('スコア数がホール数と一致しない場合エラー', () => {
    // 10ホール期待で9ホール分のデータ
    const result = parseGdoScoreText(SAMPLE_9H, 10)
    expect(result.ok).toBe(false)
  })

  it('合計列（数値のみの列）は無視してholeCount分だけ取得する', () => {
    // OUTの合計値（45）は holeCount=9 でスライスされるので含まれない
    const result = parseGdoScoreText(SAMPLE_9H, 9)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.scores.every(s => s.stroke <= 20)).toBe(true)
  })
})

// 実際のGDOコピペ（18H = OUT + IN）
const SAMPLE_18H = `筑波 【White(L)ティー】
Hole\t1\t2\t3\t4\t5\t6\t7\t8\t9\t前半H\tTotal
Par\t5\t4\t4\t3\t4\t4\t3\t5\t4\t36\t72
Yard\t541y\t369y\t280y\t147y\t386y\t366y\t166y\t436y\t333y\t3,024y\t6,134y
自分\t7\t4\t5\t3\t6\t5\t4\t5\t5\t44\t92
Putt\t2\t2\t2\t1\t2\t1\t3\t2\t2\t　17\t36
ペナルティ\t1\t\t\t\t\t\t\t\t\t1回\t3回
日光 【White(L)ティー】
Hole\t1\t2\t3\t4\t5\t6\t7\t8\t9\t後半H\tTotal
Par\t4\t4\t4\t3\t5\t4\t4\t3\t5\t36\t72
Yard\t423y\t451y\t322y\t138y\t483y\t350y\t349y\t131y\t463y\t3,110y\t6,134y
自分\t6\t5\t5\t5\t6\t5\t5\t4\t7\t48\t92
Putt\t1\t2\t2\t3\t1\t2\t3\t3\t2\t　19\t36
ペナルティ\t1\t\t\t\t1\t\t\t\t\t2回\t3回`

describe('parseGdoFullRound', () => {
  it('18Hテキストを前半と後半に分割してパースできる', () => {
    const result = parseGdoFullRound(SAMPLE_18H, 9)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // 前半（筑波）
    expect(result.first.scores).toHaveLength(9)
    expect(result.first.scores[0]).toEqual({ holeNumber: 1, stroke: 7, putt: 2, penalty: 1 })
    expect(result.first.scores[1]).toEqual({ holeNumber: 2, stroke: 4, putt: 2, penalty: 0 })
    expect(result.first.scores[8]).toEqual({ holeNumber: 9, stroke: 5, putt: 2, penalty: 0 })

    // 後半（日光）
    expect(result.second.scores).toHaveLength(9)
    expect(result.second.scores[0]).toEqual({ holeNumber: 1, stroke: 6, putt: 1, penalty: 1 })
    expect(result.second.scores[4]).toEqual({ holeNumber: 5, stroke: 6, putt: 1, penalty: 1 })
    expect(result.second.scores[8]).toEqual({ holeNumber: 9, stroke: 7, putt: 2, penalty: 0 })
  })

  it('前半の合計スコアが正しい（小計列は含まない）', () => {
    const result = parseGdoFullRound(SAMPLE_18H, 9)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const firstTotal = result.first.scores.reduce((s, r) => s + r.stroke, 0)
    expect(firstTotal).toBe(44)
  })

  it('後半の合計スコアが正しい', () => {
    const result = parseGdoFullRound(SAMPLE_18H, 9)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const secondTotal = result.second.scores.reduce((s, r) => s + r.stroke, 0)
    expect(secondTotal).toBe(48)
  })

  it('ペナルティ行がない場合、penalty は 0 になる', () => {
    const noPenalty = SAMPLE_18H.split('\n').filter(l => !l.startsWith('ペナルティ')).join('\n')
    const result = parseGdoFullRound(noPenalty, 9)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.first.scores.every(s => s.penalty === 0)).toBe(true)
  })

  it('Hole行が1つしかない場合はエラー（9Hテキストを18Hとして処理しようとした）', () => {
    const only9h = `Hole\t1\t2\t3\t4\t5\t6\t7\t8\t9
Par\t4\t3\t5\t4\t4\t3\t5\t4\t4
スコア\t5\t3\t6\t5\t5\t4\t7\t5\t5`
    const result = parseGdoFullRound(only9h, 9)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/前半.*後半|2つ/)
  })

  it('空テキストはエラー', () => {
    const result = parseGdoFullRound('', 9)
    expect(result.ok).toBe(false)
  })
})
