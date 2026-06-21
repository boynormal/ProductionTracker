-- CreateTable
CREATE TABLE "ot_plans" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "planDate" DATE NOT NULL,
    "plannedHours" INTEGER NOT NULL DEFAULT 0,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ot_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ot_plans_planDate_idx" ON "ot_plans"("planDate");

-- CreateIndex
CREATE UNIQUE INDEX "ot_plans_lineId_planDate_key" ON "ot_plans"("lineId", "planDate");

-- AddForeignKey
ALTER TABLE "ot_plans" ADD CONSTRAINT "ot_plans_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
