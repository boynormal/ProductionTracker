-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "breakdown_logs_hourlyRecordId_idx" ON "breakdown_logs"("hourlyRecordId");

-- CreateIndex
CREATE INDEX "breakdown_logs_problemCategoryId_idx" ON "breakdown_logs"("problemCategoryId");

-- CreateIndex
CREATE INDEX "breakdown_logs_machineId_breakdownEnd_idx" ON "breakdown_logs"("machineId", "breakdownEnd");

-- CreateIndex
CREATE INDEX "customers_isActive_idx" ON "customers"("isActive");

-- CreateIndex
CREATE INDEX "departments_isActive_idx" ON "departments"("isActive");

-- CreateIndex
CREATE INDEX "divisions_departmentId_idx" ON "divisions"("departmentId");

-- CreateIndex
CREATE INDEX "divisions_isActive_idx" ON "divisions"("isActive");

-- CreateIndex
CREATE INDEX "holidays_isActive_idx" ON "holidays"("isActive");

-- CreateIndex
CREATE INDEX "hourly_records_machineId_idx" ON "hourly_records"("machineId");

-- CreateIndex
CREATE INDEX "hourly_records_operatorId_idx" ON "hourly_records"("operatorId");

-- CreateIndex
CREATE INDEX "hourly_records_partId_idx" ON "hourly_records"("partId");

-- CreateIndex
CREATE INDEX "hourly_records_recordTime_idx" ON "hourly_records"("recordTime");

-- CreateIndex
CREATE INDEX "line_part_targets_lineId_isActive_idx" ON "line_part_targets"("lineId", "isActive");

-- CreateIndex
CREATE INDEX "line_part_targets_partId_isActive_idx" ON "line_part_targets"("partId", "isActive");

-- CreateIndex
CREATE INDEX "lines_sectionId_idx" ON "lines"("sectionId");

-- CreateIndex
CREATE INDEX "lines_isActive_idx" ON "lines"("isActive");

-- CreateIndex
CREATE INDEX "machine_images_machineId_isPrimary_idx" ON "machine_images"("machineId", "isPrimary");

-- CreateIndex
CREATE INDEX "machine_part_targets_machineId_isActive_idx" ON "machine_part_targets"("machineId", "isActive");

-- CreateIndex
CREATE INDEX "machine_part_targets_partId_isActive_idx" ON "machine_part_targets"("partId", "isActive");

-- CreateIndex
CREATE INDEX "machines_lineId_idx" ON "machines"("lineId");

-- CreateIndex
CREATE INDEX "machines_isActive_idx" ON "machines"("isActive");

-- CreateIndex
CREATE INDEX "model_changes_sessionId_idx" ON "model_changes"("sessionId");

-- CreateIndex
CREATE INDEX "ng_logs_hourlyRecordId_idx" ON "ng_logs"("hourlyRecordId");

-- CreateIndex
CREATE INDEX "ng_logs_machineId_idx" ON "ng_logs"("machineId");

-- CreateIndex
CREATE INDEX "ng_logs_problemCategoryId_idx" ON "ng_logs"("problemCategoryId");

-- CreateIndex
CREATE INDEX "notifications_isRead_createdAt_idx" ON "notifications"("isRead", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_type_createdAt_idx" ON "notifications"("type", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_sessionId_idx" ON "notifications"("sessionId");

-- CreateIndex
CREATE INDEX "parts_customerId_idx" ON "parts"("customerId");

-- CreateIndex
CREATE INDEX "parts_isActive_idx" ON "parts"("isActive");

-- CreateIndex
CREATE INDEX "problem_categories_type_isActive_idx" ON "problem_categories"("type", "isActive");

-- CreateIndex
CREATE INDEX "problem_categories_isActive_idx" ON "problem_categories"("isActive");

-- CreateIndex
CREATE INDEX "production_sessions_sessionDate_shiftType_status_idx" ON "production_sessions"("sessionDate", "shiftType", "status");

-- CreateIndex
CREATE INDEX "production_sessions_lineId_status_sessionDate_idx" ON "production_sessions"("lineId", "status", "sessionDate");

-- CreateIndex
CREATE INDEX "production_sessions_lineId_sessionDate_shiftType_status_idx" ON "production_sessions"("lineId", "sessionDate", "shiftType", "status");

-- CreateIndex
CREATE INDEX "production_sessions_machineId_sessionDate_idx" ON "production_sessions"("machineId", "sessionDate");

-- CreateIndex
CREATE INDEX "production_sessions_status_sessionDate_idx" ON "production_sessions"("status", "sessionDate");

-- CreateIndex
CREATE INDEX "scan_logs_machineId_scannedAt_idx" ON "scan_logs"("machineId", "scannedAt");

-- CreateIndex
CREATE INDEX "scan_logs_userId_scannedAt_idx" ON "scan_logs"("userId", "scannedAt");

-- CreateIndex
CREATE INDEX "sections_divisionId_idx" ON "sections"("divisionId");

-- CreateIndex
CREATE INDEX "sections_isActive_idx" ON "sections"("isActive");

-- CreateIndex
CREATE INDEX "users_departmentId_idx" ON "users"("departmentId");

-- CreateIndex
CREATE INDEX "users_divisionId_idx" ON "users"("divisionId");

-- CreateIndex
CREATE INDEX "users_sectionId_idx" ON "users"("sectionId");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE INDEX "users_role_isActive_idx" ON "users"("role", "isActive");
