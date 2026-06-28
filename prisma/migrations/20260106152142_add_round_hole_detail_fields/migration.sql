-- CreateEnum
CREATE TYPE "fairway_keep_result" AS ENUM ('ok', 'left', 'right', 'over', 'short');

-- AlterTable
ALTER TABLE "trn_round_hole_results" ADD COLUMN     "fairway_bunker" INTEGER,
ADD COLUMN     "fairway_keep" "fairway_keep_result",
ADD COLUMN     "green_bunker" INTEGER;
