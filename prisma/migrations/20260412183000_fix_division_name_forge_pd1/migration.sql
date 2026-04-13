-- แก้ชื่อฝ่ายที่บันทึกผิดจากนำเข้า: CAP Section PD1 -> Forge Section PD1
UPDATE "divisions"
SET "divisionName" = 'Forge Section PD1', "updatedAt" = NOW()
WHERE "divisionName" = 'CAP Section PD1';
