// src/lib/types.ts
export type Play = {
  play_id: string;
  played_at: string; // 'YYYY-MM-DD' くらいの文字列でOK
  course_name: string;
  tee?: string | null;
  memo?: string | null;
};

export type Score = {
  play_id: string;
  outin: 'OUT' | 'IN';
  hole: number;
  score: number;
  putt?: number | null;
};

export type PlayWithScores = {
  play: Play;
  scores: Score[];
};
