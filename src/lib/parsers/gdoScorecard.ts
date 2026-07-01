export type ParsedHole = {
  holeNumber: number;
  par: number;
  yardRegular: number;
};

export type ParseResult =
  | { ok: true; holes: ParsedHole[] }
  | { ok: false; message: string };

export type ParsedScore = {
  holeNumber: number;
  stroke: number;
  putt: number | null;
  penalty: number;
};

export type ScoreParseResult =
  | { ok: true; scores: ParsedScore[] }
  | { ok: false; message: string };

function toTokens(line: string): string[] {
  return line
    .trim()
    .split(/\t|\s{2,}/) // タブ or 2スペース以上
    .map(s => s.trim())
    .filter(Boolean);
}

function toNumber(value: string): number | null {
  const normalized = value
    .replace(/,/g, "")
    .replace(/y$/i, "")
    .trim();

  if (!/^\d+$/.test(normalized)) return null;
  return Number(normalized);
}

function extractNumbers(tokens: string[]): number[] {
  return tokens
    .map(toNumber)
    .filter((n): n is number => n !== null);
}

/**
 * GDOスコアカードのコピーテキストをパースする
 * OUT / IN は画面単位で切る前提
 */
export function parseGdoScorecardText(
  rawText: string,
  holeCount: number
): ParseResult {
  if (!rawText.trim()) {
    return { ok: false, message: "貼り付けテキストが空です" };
  }

  const lines = rawText
    .split(/\r?\n/)
    .map(toTokens)
    .filter(tokens => tokens.length > 0);

  const holeLine = lines.find(l => /^hole$/i.test(l[0]));
  const parLine = lines.find(l => /^par$/i.test(l[0]));
  const yardLine = lines.find(l => /^yard$/i.test(l[0]));

  if (!holeLine) return { ok: false, message: "Hole行が見つかりません" };
  if (!parLine) return { ok: false, message: "Par行が見つかりません" };
  if (!yardLine) return { ok: false, message: "Yard行が見つかりません" };

  const holeNumbers = extractNumbers(holeLine).slice(0, holeCount);
  const pars = extractNumbers(parLine).slice(0, holeCount);
  const yards = extractNumbers(yardLine).slice(0, holeCount);

  if (
    holeNumbers.length !== holeCount ||
    pars.length !== holeCount ||
    yards.length !== holeCount
  ) {
    return {
      ok: false,
      message: `Hole/Par/Yard の数が一致しません（期待: ${holeCount}）`,
    };
  }

  const holes: ParsedHole[] = holeNumbers.map((h, i) => ({
    holeNumber: h,
    par: pars[i],
    yardRegular: yards[i],
  }));

  // 連番チェック
  for (let i = 0; i < holes.length; i++) {
    if (holes[i].holeNumber !== i + 1) {
      return {
        ok: false,
        message: `Hole番号が連番ではありません（${i + 1}番目が ${holes[i].holeNumber}）`,
      };
    }
  }

  return { ok: true, holes };
}

/**
 * GDOスコアカードのコピーテキストからスコアをパースする
 * - スコア行: "自分" / "スコア" / "Score" で始まる行
 * - パット行: "Putt" / "パット" で始まる行（任意）
 * - Hole行から hole番号を取得して対応付ける
 */
export function parseGdoScoreText(
  rawText: string,
  holeCount: number
): ScoreParseResult {
  if (!rawText.trim()) {
    return { ok: false, message: "貼り付けテキストが空です" };
  }

  const lines = rawText
    .split(/\r?\n/)
    .map(toTokens)
    .filter(tokens => tokens.length > 0);

  const holeLine = lines.find(l => /^hole$/i.test(l[0]));
  // GDOでは "自分" がスコア行のラベル
  const scoreLine = lines.find(l => /^(スコア|score|打数|自分)$/i.test(l[0]));
  const puttLine = lines.find(l => /^(パット|putt|putts)$/i.test(l[0]));

  if (!holeLine) return { ok: false, message: "Hole行が見つかりません" };
  if (!scoreLine) return { ok: false, message: "スコア行が見つかりません（「自分」「スコア」「Score」のいずれかで始まる行が必要です）" };

  const holeNumbers = extractNumbers(holeLine).slice(0, holeCount);
  const strokes = extractNumbers(scoreLine).slice(0, holeCount);
  const putts = puttLine ? extractNumbers(puttLine).slice(0, holeCount) : null;

  if (holeNumbers.length !== holeCount) {
    return { ok: false, message: `Hole番号の数が一致しません（期待: ${holeCount}、実際: ${holeNumbers.length}）` };
  }
  if (strokes.length !== holeCount) {
    return { ok: false, message: `スコアの数が一致しません（期待: ${holeCount}、実際: ${strokes.length}）` };
  }

  const scores: ParsedScore[] = holeNumbers.map((h, i) => ({
    holeNumber: h,
    stroke: strokes[i],
    putt: putts ? (putts[i] ?? null) : null,
    penalty: 0,
  }));

  return { ok: true, scores };
}

export type ParsedHalfRound = {
  scores: ParsedScore[];
};

export type FullRoundParseResult =
  | { ok: true; first: ParsedHalfRound; second: ParsedHalfRound }
  | { ok: false; message: string };

/**
 * 18H分のGDOコピペテキストを前半・後半に分割してパースする
 * - 2つ目の Hole 行で分割（位置ベース）
 * - ペナルティ行: "ペナルティ" / "penalty" で始まる行
 */
export function parseGdoFullRound(
  rawText: string,
  holeCount: number
): FullRoundParseResult {
  if (!rawText.trim()) {
    return { ok: false, message: "貼り付けテキストが空です" };
  }

  // Hole行のインデックスを全行から探す
  const allLines = rawText.split(/\r?\n/);
  const holeLineIndexes: number[] = [];
  for (let i = 0; i < allLines.length; i++) {
    const tokens = toTokens(allLines[i]);
    if (tokens.length > 0 && /^hole$/i.test(tokens[0])) {
      holeLineIndexes.push(i);
    }
  }

  if (holeLineIndexes.length < 2) {
    return {
      ok: false,
      message: "前半・後半の2つの Hole 行が見つかりません（9H のテキストを貼り付けた場合は「9H」モードを使ってください）",
    };
  }

  // 1つ目のHole行〜2つ目のHole行の直前までが前半
  const firstRawText = allLines.slice(holeLineIndexes[0], holeLineIndexes[1]).join('\n');
  // 2つ目のHole行以降が後半
  const secondRawText = allLines.slice(holeLineIndexes[1]).join('\n');

  const firstResult = parseHalfRound(firstRawText, holeCount);
  if (!firstResult.ok) return { ok: false, message: `前半: ${firstResult.message}` };

  const secondResult = parseHalfRound(secondRawText, holeCount);
  if (!secondResult.ok) return { ok: false, message: `後半: ${secondResult.message}` };

  return { ok: true, first: firstResult.data, second: secondResult.data };
}

function extractPenaltiesFromLine(rawLine: string, holeCount: number): number[] {
  // タブ区切りで分割し、ラベル列を除いたホール列を位置で取得
  const cells = rawLine.split('\t').slice(1); // 先頭のラベルを除く
  const result: number[] = [];
  for (let i = 0; i < holeCount; i++) {
    const cell = cells[i] ?? '';
    const n = parseInt(cell.trim(), 10);
    result.push(isNaN(n) ? 0 : n);
  }
  return result;
}

function parseHalfRound(
  rawText: string,
  holeCount: number
): { ok: true; data: ParsedHalfRound } | { ok: false; message: string } {
  const rawLines = rawText.split(/\r?\n/);
  const lines = rawLines
    .map(toTokens)
    .filter(tokens => tokens.length > 0);

  const holeLine = lines.find(l => /^hole$/i.test(l[0]));
  const scoreLine = lines.find(l => /^(スコア|score|打数|自分)$/i.test(l[0]));
  const puttLine = lines.find(l => /^(パット|putt|putts)$/i.test(l[0]));

  // ペナルティ行は元のraw行から取得（空セルの位置を保持するため）
  const penaltyRawLine = rawLines.find(l => /^(ペナルティ|penalty)/i.test(l.trim()));

  if (!holeLine) return { ok: false, message: "Hole 行が見つかりません" };
  if (!scoreLine) return { ok: false, message: "スコア行が見つかりません（「自分」「スコア」「Score」のいずれかで始まる行が必要です）" };

  const holeNumbers = extractNumbers(holeLine).slice(0, holeCount);
  const strokes = extractNumbers(scoreLine).slice(0, holeCount);
  const putts = puttLine ? extractNumbers(puttLine).slice(0, holeCount) : null;
  const penalties = penaltyRawLine ? extractPenaltiesFromLine(penaltyRawLine, holeCount) : null;

  if (holeNumbers.length !== holeCount) {
    return { ok: false, message: `Hole 番号の数が一致しません（期待: ${holeCount}、実際: ${holeNumbers.length}）` };
  }
  if (strokes.length !== holeCount) {
    return { ok: false, message: `スコアの数が一致しません（期待: ${holeCount}、実際: ${strokes.length}）` };
  }

  const scores: ParsedScore[] = holeNumbers.map((h, i) => ({
    holeNumber: h,
    stroke: strokes[i],
    putt: putts ? (putts[i] ?? null) : null,
    penalty: penalties ? (penalties[i] ?? 0) : 0,
  }));

  return { ok: true, data: { scores } };
}
