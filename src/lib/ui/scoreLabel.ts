import { HoleScoreCategory } from "../metrics/holeScoreCategory";

export function scoreCategoryToLabel(
  category: HoleScoreCategory
) {
  switch (category) {
    case "eagle_plus":
      return { text: "-2", label: "Eagle+", color: "#1e88e5" };
    case "birdie":
      return { text: "-1", label: "Birdie", color: "#1e88e5" };
    case "par":
      return { text: "E", label: "Par", color: "#2e7d32" };
    case "bogey":
      return { text: "+1", label: "Bogey", color: "#f9a825" };
    case "double":
      return { text: "+2", label: "Double", color: "#ef6c00" };
    case "triple_plus":
      return { text: "+3+", label: "Triple+", color: "#c62828" };
    default:
      return { text: "-", label: "N/A", color: "#999" };
  }
}
