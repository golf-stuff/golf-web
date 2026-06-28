/*
  Warnings:

  - Added the required column `updated_at` to the `mst_course_layouts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `mst_holes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `mst_users` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "mst_course_layouts" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "mst_holes" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "mst_users" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
