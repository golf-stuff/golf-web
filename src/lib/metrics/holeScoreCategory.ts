export type HoleScoreCategory =
  | "eagle_plus"
  | "birdie"
  | "par"
  | "bogey"
  | "double"
  | "triple_plus"
  | "na";

export function getHoleScoreCategory(
  diff: number | null
): HoleScoreCategory {
  if (diff == null) return "na";
  if (diff <= -2) return "eagle_plus";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  if (diff === 2) return "double";
  return "triple_plus";
}
