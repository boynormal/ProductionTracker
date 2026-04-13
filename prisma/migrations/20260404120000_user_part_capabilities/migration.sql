-- CreateTable
CREATE TABLE "user_part_capabilities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_part_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_part_capabilities_userId_partId_key" ON "user_part_capabilities"("userId", "partId");

-- AddForeignKey
ALTER TABLE "user_part_capabilities" ADD CONSTRAINT "user_part_capabilities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_part_capabilities" ADD CONSTRAINT "user_part_capabilities_partId_fkey" FOREIGN KEY ("partId") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
