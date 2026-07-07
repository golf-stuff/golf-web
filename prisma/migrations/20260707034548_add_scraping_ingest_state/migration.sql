-- CreateTable
CREATE TABLE "scraping_ingest_state" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "last_ingested_run_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scraping_ingest_state_pkey" PRIMARY KEY ("id")
);
