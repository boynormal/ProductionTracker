-- Telegram routing settings by division (Option A)
ALTER TABLE "divisions"
ADD COLUMN "telegramChatId" TEXT,
ADD COLUMN "telegramEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "divisions_telegramEnabled_idx"
ON "divisions"("telegramEnabled");
