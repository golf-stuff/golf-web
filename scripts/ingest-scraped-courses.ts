import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { findLatestSuccessfulRun, fetchScrapedRows, type DuckDbConfig } from "../src/lib/ingest/duckdbReader";
import { groupScrapedRows } from "../src/lib/ingest/groupScrapedRows";
import { upsertGolfCourses } from "../src/lib/ingest/upsertGolfCourses";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
  return value;
}

async function main() {
  const pool = new Pool({ connectionString: requireEnv("DIRECT_URL") });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const duckDbConfig: DuckDbConfig = {
      gcsHmacKeyId: requireEnv("SCRAPING_GCS_HMAC_KEY_ID"),
      gcsHmacSecret: requireEnv("SCRAPING_GCS_HMAC_SECRET"),
      gcsBucket: requireEnv("SCRAPING_GCS_BUCKET"),
      warehousePrefix: process.env.SCRAPING_GCS_WAREHOUSE_PREFIX ?? "warehouse/golf_scraper",
    };

    const state = await prisma.scrapingIngestState.findUnique({ where: { id: "singleton" } });
    const lastIngestedRunId = state?.lastIngestedRunId ?? null;

    const latestRun = await findLatestSuccessfulRun(duckDbConfig, lastIngestedRunId);
    if (!latestRun) {
      console.log("取り込み対象の新規runはありません。終了します。");
      return;
    }

    console.log(`run_id=${latestRun.runId} を取り込みます`);

    const rows = await fetchScrapedRows(duckDbConfig, latestRun.runId);
    const groupedCourses = groupScrapedRows(rows);

    const result = await upsertGolfCourses(prisma, groupedCourses);

    console.log(`成功: ${result.succeeded.length}件, 失敗: ${result.failed.length}件`);
    for (const failure of result.failed) {
      console.error(`失敗: matchKey=${failure.matchKey} error=${failure.error}`);
    }

    await prisma.scrapingIngestState.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", lastIngestedRunId: latestRun.runId },
      update: { lastIngestedRunId: latestRun.runId },
    });

    if (result.failed.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
