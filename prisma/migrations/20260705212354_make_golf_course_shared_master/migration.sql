/*
  Warnings:

  - You are about to drop the column `user_id` on the `mst_golf_courses` table. All the data in that column will be lost.
  - A unique constraint covering the columns `[name,prefecture,city]` on the table `mst_golf_courses` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "mst_golf_courses" DROP CONSTRAINT "mst_golf_courses_user_id_fkey";

-- DropIndex
DROP INDEX "mst_golf_courses_user_id_name_key";

-- AlterTable
ALTER TABLE "mst_golf_courses" DROP COLUMN "user_id",
ADD COLUMN     "prefecture" TEXT,
ADD COLUMN     "city" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "mst_golf_courses_name_prefecture_city_key" ON "mst_golf_courses"("name", "prefecture", "city");
