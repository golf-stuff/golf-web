import duckdb from "duckdb";
import type { ScrapedHoleRow } from "./types";

export interface DuckDbConfig {
  gcsHmacKeyId: string;
  gcsHmacSecret: string;
  gcsBucket: string;
  /** golf-course-scraper側のIcebergテーブル配置ルート（例: "warehouse/golf_scraper"） */
  warehousePrefix: string;
}

function createConnection(config: DuckDbConfig): Promise<duckdb.Connection> {
  return new Promise((resolve, reject) => {
    const db = new duckdb.Database(":memory:");
    const conn = db.connect();
    conn.run("INSTALL httpfs; LOAD httpfs; INSTALL iceberg; LOAD iceberg;", (err) => {
      if (err) return reject(err);
      conn.run(
        `CREATE SECRET (
          TYPE S3,
          KEY_ID '${config.gcsHmacKeyId}',
          SECRET '${config.gcsHmacSecret}',
          ENDPOINT 'storage.googleapis.com',
          URL_STYLE 'path'
        );`,
        (secretErr) => {
          if (secretErr) return reject(secretErr);
          resolve(conn);
        }
      );
    });
  });
}

function tablePath(config: DuckDbConfig, tableName: string): string {
  return `gs://${config.gcsBucket}/${config.warehousePrefix}/${tableName}`;
}

export async function findLatestSuccessfulRun(
  config: DuckDbConfig,
  afterRunId: string | null
): Promise<{ runId: string } | null> {
  const conn = await createConnection(config);
  const path = tablePath(config, "scraping_runs");

  return new Promise((resolve, reject) => {
    const sql = afterRunId
      ? `SELECT run_id FROM iceberg_scan('${path}') WHERE status = 'success' AND started_at > (SELECT started_at FROM iceberg_scan('${path}') WHERE run_id = '${afterRunId}') ORDER BY started_at DESC LIMIT 1;`
      : `SELECT run_id FROM iceberg_scan('${path}') WHERE status = 'success' ORDER BY started_at DESC LIMIT 1;`;

    conn.all(sql, (err, rows) => {
      if (err) return reject(err);
      if (rows.length === 0) return resolve(null);
      resolve({ runId: rows[0].run_id as string });
    });
  });
}

export async function fetchScrapedRows(
  config: DuckDbConfig,
  runId: string
): Promise<ScrapedHoleRow[]> {
  const conn = await createConnection(config);
  const path = tablePath(config, "golf_courses_scraped");

  return new Promise((resolve, reject) => {
    conn.all(
      `SELECT run_id, match_key, course_name, prefecture, city, source_site, layout_name, hole_number, par, yard_regular, scraped_at
       FROM iceberg_scan('${path}') WHERE run_id = '${runId}';`,
      (err, rows) => {
        if (err) return reject(err);
        resolve(
          rows.map((r) => ({
            runId: r.run_id as string,
            matchKey: r.match_key as string,
            courseName: r.course_name as string,
            prefecture: r.prefecture as string,
            city: (r.city as string | null) ?? null,
            sourceSite: r.source_site as ScrapedHoleRow["sourceSite"],
            layoutName: r.layout_name as string,
            holeNumber: r.hole_number as number,
            par: r.par as number,
            yardRegular: r.yard_regular as number,
            scrapedAt: (r.scraped_at as Date).toISOString(),
          }))
        );
      }
    );
  });
}
