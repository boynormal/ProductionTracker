-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OPERATOR', 'SUPERVISOR', 'ENGINEER', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ProblemType" AS ENUM ('BREAKDOWN', 'NG');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('DAY', 'NIGHT');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MISSING_RECORD', 'LOW_PRODUCTION', 'HIGH_NG', 'LONG_BREAKDOWN', 'SYSTEM');

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "departmentCode" TEXT NOT NULL,
    "departmentName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "divisions" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "divisionCode" TEXT NOT NULL,
    "divisionName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "divisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "sectionCode" TEXT NOT NULL,
    "sectionName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "employeeTitle" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "pin" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'OPERATOR',
    "positionCode" TEXT,
    "positionName" TEXT,
    "departmentId" TEXT,
    "divisionId" TEXT,
    "sectionId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lines" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT,
    "lineCode" TEXT NOT NULL,
    "lineName" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "customerName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machines" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "mcNo" TEXT NOT NULL,
    "mcName" TEXT NOT NULL,
    "mcType" TEXT,
    "department" TEXT,
    "process" TEXT,
    "sheetRef" TEXT,
    "assetCode" TEXT,
    "serialNo" TEXT,
    "brand" TEXT,
    "modelNo" TEXT,
    "manufacturerYear" INTEGER,
    "purchaseDate" TIMESTAMP(3),
    "warrantyExpiry" TIMESTAMP(3),
    "location" TEXT,
    "installDate" TIMESTAMP(3),
    "powerKW" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "dimensions" TEXT,
    "voltage" TEXT,
    "frequency" TEXT,
    "maintenanceIntervalDays" INTEGER,
    "lastMaintenanceDate" TIMESTAMP(3),
    "nextMaintenanceDate" TIMESTAMP(3),
    "responsiblePerson" TEXT,
    "pmGeneralNote" TEXT,
    "pmMajorNote" TEXT,
    "conditionRating" INTEGER,
    "remark" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_images" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "machine_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parts" (
    "id" TEXT NOT NULL,
    "partSamco" INTEGER NOT NULL,
    "partNo" TEXT NOT NULL,
    "partName" TEXT NOT NULL,
    "customerId" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'PCS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_part_targets" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "cycleTimeMin" DOUBLE PRECISION NOT NULL,
    "piecesPerHour" INTEGER NOT NULL,
    "target8Hr" INTEGER NOT NULL,
    "target11Hr" INTEGER NOT NULL,
    "efficiency" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_part_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problem_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProblemType" NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_sessions" (
    "id" TEXT NOT NULL,
    "sessionDate" DATE NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "lineId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "normalHours" INTEGER NOT NULL DEFAULT 8,
    "otHours" INTEGER NOT NULL DEFAULT 0,
    "totalHours" INTEGER NOT NULL,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hourly_records" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "hourSlot" INTEGER NOT NULL,
    "recordTime" TIMESTAMP(3) NOT NULL,
    "partId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "targetQty" INTEGER NOT NULL,
    "okQty" INTEGER NOT NULL,
    "isOvertimeHour" BOOLEAN NOT NULL DEFAULT false,
    "hasBreakdown" BOOLEAN NOT NULL DEFAULT false,
    "hasNg" BOOLEAN NOT NULL DEFAULT false,
    "isModelChanged" BOOLEAN NOT NULL DEFAULT false,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hourly_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breakdown_logs" (
    "id" TEXT NOT NULL,
    "hourlyRecordId" TEXT NOT NULL,
    "breakdownStart" TIMESTAMP(3) NOT NULL,
    "breakdownEnd" TIMESTAMP(3),
    "breakTimeMin" INTEGER NOT NULL,
    "problemCategoryId" TEXT NOT NULL,
    "problemDetail" TEXT,
    "actionTaken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "breakdown_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ng_logs" (
    "id" TEXT NOT NULL,
    "hourlyRecordId" TEXT NOT NULL,
    "ngQty" INTEGER NOT NULL,
    "problemCategoryId" TEXT NOT NULL,
    "problemDetail" TEXT,
    "actionTaken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ng_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_changes" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "hourlyRecordId" TEXT NOT NULL,
    "changeTime" TIMESTAMP(3) NOT NULL,
    "fromPartId" TEXT,
    "toPartId" TEXT,
    "changeoverMin" INTEGER,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_qr_codes" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "qrContent" TEXT NOT NULL,
    "qrImagePath" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_logs" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "userId" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "action" TEXT,

    CONSTRAINT "scan_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "targetRole" "UserRole",
    "machineId" TEXT,
    "sessionId" TEXT,
    "hourSlot" INTEGER,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "sentVia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_configs" (
    "id" TEXT NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "label" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "otEndTime" TEXT NOT NULL,
    "normalHours" INTEGER NOT NULL DEFAULT 8,
    "maxOtHours" INTEGER NOT NULL DEFAULT 3,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_departmentCode_key" ON "departments"("departmentCode");

-- CreateIndex
CREATE UNIQUE INDEX "divisions_divisionCode_key" ON "divisions"("divisionCode");

-- CreateIndex
CREATE UNIQUE INDEX "sections_sectionCode_key" ON "sections"("sectionCode");

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeCode_key" ON "users"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "lines_lineCode_key" ON "lines"("lineCode");

-- CreateIndex
CREATE UNIQUE INDEX "customers_customerCode_key" ON "customers"("customerCode");

-- CreateIndex
CREATE UNIQUE INDEX "machines_mcNo_key" ON "machines"("mcNo");

-- CreateIndex
CREATE UNIQUE INDEX "parts_partSamco_key" ON "parts"("partSamco");

-- CreateIndex
CREATE UNIQUE INDEX "machine_part_targets_machineId_partId_effectiveDate_key" ON "machine_part_targets"("machineId", "partId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "problem_categories_code_key" ON "problem_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "production_sessions_sessionDate_shiftType_machineId_key" ON "production_sessions"("sessionDate", "shiftType", "machineId");

-- CreateIndex
CREATE UNIQUE INDEX "hourly_records_sessionId_hourSlot_key" ON "hourly_records"("sessionId", "hourSlot");

-- CreateIndex
CREATE UNIQUE INDEX "model_changes_hourlyRecordId_key" ON "model_changes"("hourlyRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "machine_qr_codes_machineId_key" ON "machine_qr_codes"("machineId");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_key" ON "holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "shift_configs_shiftType_key" ON "shift_configs"("shiftType");

-- AddForeignKey
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lines" ADD CONSTRAINT "lines_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_images" ADD CONSTRAINT "machine_images_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parts" ADD CONSTRAINT "parts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_part_targets" ADD CONSTRAINT "machine_part_targets_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_part_targets" ADD CONSTRAINT "machine_part_targets_partId_fkey" FOREIGN KEY ("partId") REFERENCES "parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_sessions" ADD CONSTRAINT "production_sessions_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_sessions" ADD CONSTRAINT "production_sessions_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_sessions" ADD CONSTRAINT "production_sessions_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hourly_records" ADD CONSTRAINT "hourly_records_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "production_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hourly_records" ADD CONSTRAINT "hourly_records_partId_fkey" FOREIGN KEY ("partId") REFERENCES "parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hourly_records" ADD CONSTRAINT "hourly_records_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hourly_records" ADD CONSTRAINT "hourly_records_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breakdown_logs" ADD CONSTRAINT "breakdown_logs_hourlyRecordId_fkey" FOREIGN KEY ("hourlyRecordId") REFERENCES "hourly_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breakdown_logs" ADD CONSTRAINT "breakdown_logs_problemCategoryId_fkey" FOREIGN KEY ("problemCategoryId") REFERENCES "problem_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ng_logs" ADD CONSTRAINT "ng_logs_hourlyRecordId_fkey" FOREIGN KEY ("hourlyRecordId") REFERENCES "hourly_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ng_logs" ADD CONSTRAINT "ng_logs_problemCategoryId_fkey" FOREIGN KEY ("problemCategoryId") REFERENCES "problem_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_changes" ADD CONSTRAINT "model_changes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "production_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_changes" ADD CONSTRAINT "model_changes_hourlyRecordId_fkey" FOREIGN KEY ("hourlyRecordId") REFERENCES "hourly_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_qr_codes" ADD CONSTRAINT "machine_qr_codes_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_logs" ADD CONSTRAINT "scan_logs_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_logs" ADD CONSTRAINT "scan_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
