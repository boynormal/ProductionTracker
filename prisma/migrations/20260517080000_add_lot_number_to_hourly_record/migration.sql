-- AlterTable
ALTER TABLE "hourly_records" ADD COLUMN "lotNumber" VARCHAR(100);

-- CreateIndex
CREATE INDEX "hourly_records_lotNumber_idx" ON "hourly_records"("lotNumber");
