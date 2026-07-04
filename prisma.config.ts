import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  datasource: {
    // prisma migrate 等のCLIコマンド専用。Poolerを経由しないDirect接続を使う。
    // アプリ実行時の接続（src/lib/db/prisma.ts）は DATABASE_URL（Pooler接続）を直接参照しており、こことは独立している。
    url: process.env.DIRECT_URL!,
  },
});
