# ============================================================
# Production Tracker — Setup Script (Local PostgreSQL)
# ไม่ใช้ Docker — ใช้ PostgreSQL ที่ติดตั้งในเครื่องแล้ว
# ============================================================

Write-Host ""
Write-Host "===================================" -ForegroundColor Cyan
Write-Host "  Production Tracker — Setup       " -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# 1. Install npm dependencies
Write-Host "[1/4] Installing npm dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "npm install failed!" -ForegroundColor Red; exit 1 }

# 2. Generate Prisma client
Write-Host ""
Write-Host "[2/4] Generating Prisma client..." -ForegroundColor Yellow
npx prisma generate
if ($LASTEXITCODE -ne 0) { Write-Host "Prisma generate failed!" -ForegroundColor Red; exit 1 }

# 3. Run migration (จะสร้าง database production_tracker อัตโนมัติ)
Write-Host ""
Write-Host "[3/4] Running database migration..." -ForegroundColor Yellow
npx prisma migrate dev --name init
if ($LASTEXITCODE -ne 0) { Write-Host "Migration failed! ตรวจสอบ DATABASE_URL ใน .env.local" -ForegroundColor Red; exit 1 }

# 4. Seed ข้อมูลเริ่มต้น
Write-Host ""
Write-Host "[4/4] Seeding initial data..." -ForegroundColor Yellow
npx prisma db seed
if ($LASTEXITCODE -ne 0) { Write-Host "Seed failed!" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "===================================" -ForegroundColor Green
Write-Host "  Setup Complete!                  " -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Green
Write-Host ""
Write-Host "  รัน:    npm run dev"             -ForegroundColor White
Write-Host "  URL:    http://localhost:3000"    -ForegroundColor Cyan
Write-Host "  Admin:  ADMIN001 / admin1234"     -ForegroundColor Cyan
Write-Host ""
