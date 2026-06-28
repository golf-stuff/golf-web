// src/lib/apiClient.ts
import type { Play, PlayWithScores, Score } from './types';

// 環境変数でモック or 実API を切り替える想定
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const USE_MOCK = true; // まだAPIがないので、しばらくは常に true になる想定

// ----- モックデータ -----
const mockPlays: Play[] = [
  {
    play_id: 'mock-1',
    played_at: '2025-05-01',
    course_name: 'テストゴルフ倶楽部',
    tee: 'White',
    memo: '風強め',
  },
];

const mockScores: Score[] = Array.from({ length: 18 }).map((_, idx) => ({
  play_id: 'mock-1',
  outin: idx < 9 ? 'OUT' : 'IN',
  hole: (idx % 9) + 1,
  score: 4,
  putt: 2,
}));

// ----- 公開関数群 -----

export async function fetchPlays(): Promise<Play[]> {
  if (USE_MOCK) {
    await sleep(200); // ちょっとだけ待たせる（読み込み感）
    return mockPlays;
  }

  const res = await fetch(`${API_BASE}/plays`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch plays');
  return res.json();
}

export async function fetchPlay(playId: string): Promise<PlayWithScores> {
  if (USE_MOCK) {
    await sleep(200);
    const play = mockPlays.find((p) => p.play_id === playId) ?? mockPlays[0];
    const scores = mockScores.filter((s) => s.play_id === play.play_id);
    return { play, scores };
  }

  const res = await fetch(`${API_BASE}/plays/${playId}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch play');
  return res.json();
}

export async function createPlay(input: {
  played_at: string;
  course_name: string;
  tee?: string;
  memo?: string;
}): Promise<Play> {
  if (USE_MOCK) {
    await sleep(200);
    const play: Play = {
      play_id: `mock-${Date.now()}`,
      played_at: input.played_at,
      course_name: input.course_name,
      tee: input.tee ?? null,
      memo: input.memo ?? null,
    };
    mockPlays.unshift(play);
    return play;
  }

  const res = await fetch(`${API_BASE}/plays`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to create play');
  return res.json();
}

export async function updatePlay(playId: string, input: Partial<Play>): Promise<void> {
  if (USE_MOCK) {
    await sleep(200);
    const idx = mockPlays.findIndex((p) => p.play_id === playId);
    if (idx >= 0) mockPlays[idx] = { ...mockPlays[idx], ...input };
    return;
  }

  const res = await fetch(`${API_BASE}/plays/${playId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to update play');
}

export async function updateScores(playId: string, scores: Score[]): Promise<void> {
  if (USE_MOCK) {
    await sleep(200);
    // 一旦全部消してから入れ替え
    for (let i = mockScores.length - 1; i >= 0; i--) {
      if (mockScores[i].play_id === playId) mockScores.splice(i, 1);
    }
    mockScores.push(...scores);
    return;
  }

  const res = await fetch(`${API_BASE}/plays/${playId}/scores`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scores }),
  });
  if (!res.ok) throw new Error('Failed to update scores');
}

// 小さいユーティリティ
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
