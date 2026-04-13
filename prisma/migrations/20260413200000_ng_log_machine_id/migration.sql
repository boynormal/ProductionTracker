-- AlterTable
ALTER TABLE "ng_logs" ADD COLUMN "machineId" TEXT;

-- AddForeignKey
ALTER TABLE "ng_logs" ADD CONSTRAINT "ng_logs_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
