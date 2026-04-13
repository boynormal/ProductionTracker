-- AlterTable
ALTER TABLE "lines" ADD COLUMN     "divisionCode" TEXT;

-- Backfill จาก Section → Division (ข้อมูลเดิม)
UPDATE "lines" l
SET "divisionCode" = d."divisionCode"
FROM "sections" s
JOIN "divisions" d ON s."divisionId" = d.id
WHERE l."sectionId" = s.id;

-- CreateIndex
CREATE INDEX "lines_divisionCode_idx" ON "lines"("divisionCode");
