export type ParsedHole = {
  holeNumber: number;
  par: number;
  yardRegular: number;
};

export type ParseResult =
  | { ok: true; holes: ParsedHole[] }
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
