-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('user', 'admin');

-- AlterTable
ALTER TABLE "mst_users" ADD COLUMN     "role" "user_role" NOT NULL DEFAULT 'user';
