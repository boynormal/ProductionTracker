-- Add nullable reporting date for phased rollout.
ALTER TABLE "production_sessions"
ADD COLUMN "reportingDate" DATE;

-- Query performance for reporting-date based reads.
CREATE INDEX "production_sessions_reportingDate_shiftType_status_idx"
ON "production_sessions"("reportingDate", "shiftType", "status");

CREATE INDEX "production_sessions_lineId_status_reportingDate_idx"
ON "production_sessions"("lineId", "status", "reportingDate");

CREATE INDEX "production_sessions_lineId_reportingDate_shiftType_status_idx"
ON "production_sessions"("lineId", "reportingDate", "shiftType", "status");

CREATE INDEX "production_sessions_machineId_reportingDate_idx"
ON "production_sessions"("machineId", "reportingDate");

CREATE INDEX "production_sessions_status_reportingDate_idx"
ON "production_sessions"("status", "reportingDate");
