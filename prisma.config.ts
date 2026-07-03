import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL!,
    // @ts-ignore - directUrl is not yet in Prisma 7 type definitions but is supported at runtime
    directUrl: process.env.DIRECT_URL,
  },
});
