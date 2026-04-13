-- =============================================================================
-- Migration: line_centric_refactor
-- Strategy : ล้างข้อมูล Transaction ทั้งหมดก่อน จากนั้น refactor schema
--            ให้ ProductionSession unique บน lineId (ไม่ใช่ machineId)
--            เพิ่ม LinePartTarget สำหรับ OEE ระดับ Line
--            machineId เป็น optional บน session / hourly_record
--            เพิ่ม machineId บน breakdown_log เพื่อ MTBF per-machine
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Step 1: ล้างข้อมูล Transaction (FK order: ลบลูกก่อนพ่อ)
-- -----------------------------------------------------------------------------
DELETE FROM "audit_logs";
DELETE FROM "notifications";
DELETE FROM "scan_logs";
DELETE FROM "ng_logs";
DELETE FROM "breakdown_logs";
DELETE FROM "model_changes";
DELETE FROM "hourly_records";
DELETE FROM "production_sessions";

-- -----------------------------------------------------------------------------
-- Step 2: Drop FK constraints ที่จะเปลี่ยน
-- -----------------------------------------------------------------------------
ALTER TABLE "hourly_records" DROP CONSTRAINT "hourly_records_machineId_fkey";
ALTER TABLE "production_sessions" DROP CONSTRAINT "production_sessions_machineId_fkey";

-- -----------------------------------------------------------------------------
-- Step 3: Drop unique index เดิมบน machineId
-- -----------------------------------------------------------------------------
DROP INDEX "production_sessions_sessionDate_shiftType_machineId_key";

-- -----------------------------------------------------------------------------
-- Step 4: Alter columns — machineId → optional (nullable)
-- -----------------------------------------------------------------------------
ALTER TABLE "breakdown_logs" ADD COLUMN "machineId" TEXT;
ALTER TABLE "hourly_records" ALTER COLUMN "machineId" DROP NOT NULL;
ALTER TABLE "production_sessions" ALTER COLUMN "machineId" DROP NOT NULL;

-- -----------------------------------------------------------------------------
-- Step 5: สร้างตาราง line_part_targets (OEE target ระดับ Line)
-- -----------------------------------------------------------------------------
CREATE TABLE "line_part_targets" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "piecesPerHour" INTEGER NOT NULL,
    "target8Hr" INTEGER NOT NULL,
    "target11Hr" INTEGER NOT NULL,
    "cycleTimeMin" DOUBLE PRECISION,
    "efficiency" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "line_part_targets_pkey" PRIMARY KEY ("id")
);

-- -----------------------------------------------------------------------------
-- Step 6: สร้าง Indexes
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX "line_part_targets_lineId_partId_effectiveDate_key"
    ON "line_part_targets"("lineId", "partId", "effectiveDate");

CREATE UNIQUE INDEX "production_sessions_sessionDate_shiftType_lineId_key"
    ON "production_sessions"("sessionDate", "shiftType", "lineId");

-- -----------------------------------------------------------------------------
-- Step 7: Add Foreign Key constraints
-- -----------------------------------------------------------------------------
ALTER TABLE "line_part_targets"
    ADD CONSTRAINT "line_part_targets_lineId_fkey"
    FOREIGN KEY ("lineId") REFERENCES "lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "line_part_targets"
    ADD CONSTRAINT "line_part_targets_partId_fkey"
    FOREIGN KEY ("partId") REFERENCES "parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "production_sessions"
    ADD CONSTRAINT "production_sessions_machineId_fkey"
    FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "hourly_records"
    ADD CONSTRAINT "hourly_records_machineId_fkey"
    FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "breakdown_logs"
    ADD CONSTRAINT "breakdown_logs_machineId_fkey"
    FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
