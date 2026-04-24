# Production Tracker — ระบบติดตามการผลิตรายชั่วโมง

เอกสารนี้อธิบายภาพรวม สถาปัตยกรรม การติดตั้ง และแนวทางใช้งานของแอปพลิเคชัน **Factory Production Tracking** สำหรับโรงงาน — บันทึกผลผลิตรายชั่วโมงต่อเครื่อง/ต่อสาย วิเคราะห์ OEE และเชื่อมกับ QR / แจ้งเตือน Telegram

---

## สารบัญ

1. [ภาพรวมระบบ](#1-ภาพรวมระบบ)
2. [เทคโนโลยีที่ใช้](#2-เทคโนโลยีที่ใช้)
3. [ความต้องการของระบบ](#3-ความต้องการของระบบ)
4. [การติดตั้งและรันโปรเจกต์](#4-การติดตั้งและรันโปรเจกต์)
5. [ตัวแปรสภาพแวดล้อม](#5-ตัวแปรสภาพแวดล้อม)
6. [สคริปต์ npm](#6-สคริปต์-npm)
7. [โครงสร้างโฟลเดอร์หลัก](#7-โครงสร้างโฟลเดอร์หลัก)
8. [โมเดลฐานข้อมูล (สรุป)](#8-โมเดลฐานข้อมูล-สรุป)
9. [กฎธุรกิจสำคัญ](#9-กฎธุรกิจสำคัญ)
   - [9.5 การปิดกะเมื่อจบจริง (SOP) / auto-close / ตรวจสอบข้อมูล](#95-การปิดกะเมื่อจบจริง-sop--auto-close--ตรวจสอบข้อมูล)
10. [การยืนยันตัวตนและสิทธิ์](#10-การยืนยันตัวตนและสิทธิ์)
11. [เส้นทางหน้าเว็บ (UI)](#11-เส้นทางหน้าเว็บ-ui)
12. [API (สรุปตามกลุ่ม)](#12-api-สรุปตามกลุ่ม)
13. [QR / Scan และการบันทึกแบบไม่ล็อกอิน](#13-qr--scan-และการบันทึกแบบไม่ล็อกอิน)
14. [การแจ้งเตือน](#14-การแจ้งเตือน)
15. [CI และการตรวจสอบก่อน merge](#15-ci-และการตรวจสอบก่อน-merge)
16. [หมายเหตุสำหรับนักพัฒนา](#16-หมายเหตุสำหรับนักพัฒนา)

---

## 1. ภาพรวมระบบ

ระบบช่วยให้โรงงาน:

- **บันทึกการผลิตรายชั่วโมง** ผูกกับ Session ของกะ (กลางวัน/กลางคืน) ต่อสายและเครื่อง
- **กำหนดเป้า (target)** จาก Part และเครื่อง หรือระดับสาย (`machine_part_targets`, `line_part_targets`)
- **ติดตาม Breakdown / NG / เปลี่ยนรุ่น** ในแต่ละชั่วโมง
- **ดู Dashboard** แบบรายวัน/รายเดือน พร้อมตัวกรอง **Section**
- **สแกน QR** ที่เครื่องเพื่อเข้าหน้าบันทึก (ใช้ PIN แทนการล็อกอินแบบเต็มรูปแบบในบาง flow)
- **แจ้งเตือน** (เช่น ชั่วโมงที่ยังไม่บันทึก) และส่งไป **Telegram** (ถ้าตั้งค่าไว้)

Backend เป็น **Next.js Route Handlers** + **Prisma ORM** กับ **PostgreSQL** (รองรับ SQLite ในบางสภาพแวดล้อม dev ตาม schema)

---

## 2. เทคโนโลยีที่ใช้

| ชั้น | เทคโนโลยี |
|------|-----------|
| Framework | **Next.js 15** (App Router), **React 18**, **TypeScript** |
| UI | **Tailwind CSS**, **shadcn/ui** (Radix), **Lucide**, **Recharts** |
| ฟอร์ม | **React Hook Form** + **Zod** |
| State / Data fetching | **SWR**, **Zustand** (ตามจุดที่ใช้ในโปรเจกต์) |
| Auth | **NextAuth.js v5** (Credentials + session) |
| ORM / DB | **Prisma 5**, **PostgreSQL 16** (แนะนำ) |
| อื่น ๆ | **QR** (`qrcode`, `qrcode.react`), **Telegram** (`node-telegram-bot-api`), **node-cron** |

---

## 3. ความต้องการของระบบ

- **Node.js** เวอร์ชัน 20 LTS (ตรงกับ CI ใน `.github/workflows/verify.yml`)
- **PostgreSQL** สำหรับ runtime (หรือใช้ connection string ตาม `DATABASE_URL`)
- **npm** — โปรเจกต์ใช้ `package-lock.json` สำหรับ dependency ที่ล็อกแล้ว

---

## 4. การติดตั้งและรันโปรเจกต์

### 4.1 โคลนและติดตั้ง dependencies

```bash
git clone <repository-url>
cd production-tracker
npm ci
```

### 4.2 ฐานข้อมูล

**ตัวเลือก A — Docker (มีไฟล์ `docker-compose.yml`)**

```bash
docker compose up -d
```

จากนั้นตั้ง `DATABASE_URL` ให้ชี้ไปที่ PostgreSQL (ดูค่าตัวอย่างใน `docker-compose.yml`: user `pt_user`, db `production_tracker`, port `5432`)

**ตัวเลือก B — PostgreSQL ที่ติดตั้งเอง**

สร้างฐานข้อมูลและใส่ connection string ใน `.env` / `.env.local`

### 4.3 Prisma migrate และ seed

```bash
npx prisma migrate dev
npx prisma generate
npm run db:seed
```

(หรือใช้ `npx prisma db seed` ถ้าตั้งค่าใน `package.json` แล้ว)

### 4.4 รันโหมดพัฒนา

```bash
npm run dev
```

แอปเปิดที่ `http://localhost:3000` (สคริปต์ `dev` ผูก `-H 0.0.0.0` เพื่อเข้าจากเครื่องอื่นใน LAN ได้)

### 4.5 Build โปรดักชัน

```bash
npm run verify
```

คำสั่งนี้รัน **TypeScript check** แล้วตามด้วย **`next build`** — ใช้เป็นเกณฑ์ก่อน merge (ดู [ข้อ 15](#15-ci-และการตรวจสอบก่อน-merge))

---

## 5. ตัวแปรสภาพแวดล้อม

ตั้งค่าใน `.env` หรือ `.env.local` (ไฟล์เหล่านี้ถูก ignore จาก git — **ห้าม commit ความลับ**)

| ตัวแปร | ความหมาย |
|--------|-----------|
| `DATABASE_URL` | Connection string ของ PostgreSQL |
| `NEXTAUTH_URL` | URL ฐานของแอป (เช่น `http://localhost:3000`) |
| `NEXTAUTH_SECRET` | Secret สำหรับเข้ารหัส session (ความยาวเพียงพอใน production) |
| `NEXT_PUBLIC_BASE_URL` | URL สำหรับสร้างลิงก์ QR (มักตั้งเป็น IP ภายใน LAN) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | ใช้ส่งแจ้งเตือน Telegram |
| `NOTIFICATION_CHECK_INTERVAL_MINUTES` | ช่วงเวลาตรวจแจ้งเตือน (ค่าเริ่มต้นตามที่ใช้ในโค้ด เช่น 15 นาที) |
| `LINE_TARGET_GUARD_MODE` | โหมด guard ตอนเปิด session: `warn` (ค่าเริ่มต้น) หรือ `enforce` |
| `LINE_TARGET_GUARD_ALLOW_OVERRIDE` | อนุญาต override ตอนขาด line target (`true`/`false`) |
| `LINE_TARGET_GUARD_OVERRIDE_ROLES` | รายชื่อ role ที่ override ได้ คั่นด้วย `,` (เช่น `SUPERVISOR,ENGINEER`) |

รายละเอียดพฤติกรรมแต่ละจุดอยู่ในโค้ดของ route ที่เกี่ยวข้อง (`app/api/...`)

---

## 6. สคริปต์ npm

| สคริปต์ | คำอธิบาย |
|---------|----------|
| `npm run dev` | Next.js development server |
| `npm run build` | Production build |
| `npm run verify` | `tsc --noEmit` แล้ว `npm run build` |
| `npm run lint` | ESLint (build อาจข้าม lint ตาม `next.config.mjs`) |
| `npm run db:generate` | `prisma generate` |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | รัน seed ผ่าน `ts-node` + `prisma/seed.ts` |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | reset DB + migrate (ระวังข้อมูลหาย) |
| `npm run db:import` / `db:import-sections` / `db:import-employees` | สคริปต์นำเข้าข้อมูล (ดูไฟล์ใน `prisma/`) |
| `npm run telegram:ping` | ทดสอบส่ง Telegram (`scripts/telegram-ping.mjs`) |

---

## 7. โครงสร้างโฟลเดอร์หลัก

```
app/
  (auth)/login/           # หน้า Login
  (dashboard)/            # หลังล็อกอิน — Layout หลัก
    page.tsx               # Dashboard หน้าแรก
    production/            # บันทึก / ประวัติ / รายงาน / MTBF
    master/                # Master data (สาย, เครื่อง, Part, ปัญหา, องค์กร)
    admin/                 # ผู้ใช้, วันหยุด, แจ้งเตือน, logs, permissions
    alerts/
  scan/[machineId]/        # หน้า Scan QR (ไม่บังคับ session ก่อน — ดู auth)
  api/                     # Route Handlers (REST-style)
components/                # UI ร่วม (production, dashboard, machines, qr, ui)
lib/                       # prisma, auth, validations, utils (oee, shift, mtbf, …)
prisma/
  schema.prisma
  migrations/
  seed.ts และสคริปต์ import
middleware.ts               # ใช้ NextAuth middleware
```

---

## 8. โมเดลฐานข้อมูล (สรุป)

Prisma กำหนดโมเดลหลัก ได้แก่ (ไม่ครบทุกฟิลด์ — ดู `prisma/schema.prisma`)

**องค์กร:** `Department` → `Division` → `Section` — สายผลิต `Line` อ้างอิง `Section` (และอาจมี `divisionCode` สำเนา)

**Master:** `Machine`, `Line`, `Part`, `Customer`, `ProblemCategory`, `MachinePartTarget`, `LinePartTarget`, `MachineImage`, `MachineQrCode`

**ธุรกรรม:** `ProductionSession` (กำหนดด้วยวันที่ + กะ + สาย — unique ตาม schema), `HourlyRecord`, `BreakdownLog`, `NgLog`, `ModelChange`

**ระบบ:** `User`, `ScanLog`, `Notification`, `Holiday`, `AuditLog`, `SystemLog`, ตาราง **Permission** (`Permission`, `RolePermission`, `PermissionScope`, `UserPermissionOverride`)

Enum สำคัญ: `UserRole`, `ShiftType` (DAY/NIGHT), `SessionStatus`, `ProblemType` (BREAKDOWN/NG), ฯลฯ

---

## 9. กฎธุรกิจสำคัญ

### 9.1 กะและชั่วโมง (Shift / hour slot)

- กะกลางวัน / กลางคืน มีช่วงเวลาตามนิยามใน `lib` (เช่น `lib/time-utils`, `lib/utils/shift`)
- ชั่วโมงทำงานปกติและ OT สูงสุดรวมได้ถึง **11 ชั่วโมง** ตามที่ระบุในเอกสารโปรเจกต์
- `hourSlot` เป็นหมายเลขชั่วโมงที่ 1…11 — OT เริ่มจากช่องที่กำหนดหลังชั่วโมงปกติ

### 9.2 OEE

สูตรภาพรวมอยู่ใน `lib/utils/oee.ts`:

- **Availability** — จากเวลาทำงานและ downtime (breakdown เป็นหน่วยนาที)
- **Performance** — ผลผลิตจริงเทียบเป้า
- **Quality** — OK เทียบกับ OK+NG

### 9.3 MTBF / MTTR

การคำนวณและเงื่อนไขกรอง session ที่ `COMPLETED` และ breakdown ที่ปิดแล้ว อยู่ใน `lib/utils/mtbf.ts` และ API ที่เกี่ยวข้อง

### 9.4 Dashboard

- API: `GET /api/production/dashboard` — query: `mode` (`day`|`month`), `date` (YYYY-MM-DD), `month` (YYYY-MM), `sectionId` (optional) เพื่อกรองเฉพาะสายที่อยู่ใน Section นั้น
- ตัวเลขเครื่อง active / session สอดคล้องกับตัวกรอง; การแจ้งเตือนที่ยังไม่อ่านอาจเป็นทั้งระบบ (ไม่กรองตาม section — ตามพฤติกรรมปัจจุบันของ API)

### 9.5 การปิดกะเมื่อจบจริง (SOP) / auto-close / ตรวจสอบข้อมูล

**หลักการ:** การบันทึกรายชั่วโมง **ไม่แทน** การปิดกะ — เมื่อกะจบการผลิตจริง ต้องให้ session เป็น `COMPLETED` ไม่ปล่อยให้ `IN_PROGRESS` ค้างไปซ้อนกับกะถัดไปบนสายและ `sessionDate` เดียวกัน (DAY + NIGHT เปิดพร้อมกันได้ตาม schema แต่จะทำให้หน้าบันทึก/ประวัติสับสนและเสี่ยงผูกข้อมูลผิดกะ)

**ใครปิด:** ผู้ใช้ที่มีสิทธิ์ `api.production.session.write` (กำหนดบทบาทในทีม เช่น หัวหน้าไลน์ / PC / วิศวกร — ตามที่องค์กรตกลง)

**เมื่อไหร่:** ทันทีที่กะจบจริง ไม่เลื่อนไปวันถัดไป — **ก่อน** ที่กะถัดไปจะต้องบันทึกหรือเปิด session ใหม่

**ทำอย่างไร:**

- ผ่าน UI: หน้า **`/production/history`** — ปุ่ม **ปิดกะ** สีน้ำเงินอยู่ใต้ตัวเลขในคอลัมน์ **กะเช้า** / **กะดึก** ของแถวสาย (เมื่อ session นั้นยัง `IN_PROGRESS` และมีสิทธิ์); ยังมีปุ่มซ้ำได้เมื่อขยายรายละเอียดสาย
- ผ่าน API: `PATCH /api/production/sessions/[id]` ด้วย body `{ "status": "COMPLETED" }` (optional `endTime` เป็น ISO string)

**ตรวจสอบรายสัปดาห์ (PostgreSQL):** หาไลน์ที่มีมากกว่า 1 session ยัง `IN_PROGRESS` ในวันเดียวกัน (`sessionDate`)

```sql
SELECT "lineId", "sessionDate"::date AS session_day,
       COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') AS open_cnt
FROM production_sessions
GROUP BY "lineId", "sessionDate"
HAVING COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') > 1;
```

**แก้ข้อมูลค้าง (ครั้งเดียว / ops):** หลังยืนยันว่าเป็นกะที่จบแล้วจริง ให้ปิดด้วย `PATCH` ข้างต้นหรือปุ่มในประวัติ — อย่าแก้ `hourly_records` แทนการปิด session โดยไม่มีเหตุผล

**Auto-close (safety net):** `POST /api/production/sessions/auto-close` (cron + `CRON_SECRET` หรือสิทธิ์ `api.production.sessions.auto-close`) จะบังคับ `COMPLETED` ในช่วงเวลาไทยที่กำหนดใน [`lib/production/session-auto-close.ts`](lib/production/session-auto-close.ts) — เป็น **สำรอง** กรณีพลาดปิดกะด้วยมือ ไม่ใช่ขั้นตอนหลัก

**Cron:** แนะนำให้ scheduler เรียก auto-close **อย่างน้อยทุก 5–15 นาที** ในช่วงหลังกะ (เช่น หลัง 20:15 น. และช่วงเช้า) เพื่อให้ทับช่วง hard-close ที่ระบบเปิดไว้

---

## 10. การยืนยันตัวตนและสิทธิ์

- **NextAuth** ใช้ **Credentials** (รหัสพนักงาน + รหัสผ่าน) — ดู `lib/auth.ts`
- **Middleware** เรียก `auth()` เพื่อกัน route; มีข้อยกเว้นสำหรับ `/scan`, `/api/scan`, `/login`, `/api/auth`, และบาง endpoint (เช่น cron แจ้งเตือน, auto-close session) ตามที่กำหนดใน `callbacks.authorized`
- **QR / บันทึกผลิต:** หลังยืนยัน PIN อาจได้ **HttpOnly JWT** สำหรับ operator scan — อนุญาต `/production/record` และ API production ที่เกี่ยวข้องเมื่อ token ถูกต้อง
- **Permissions:** มีระบบ scope ตามบทบาทและเมนู (ดู `lib/permissions/` และหน้า `/admin/permissions`)

---

## 11. เส้นทางหน้าเว็บ (UI)

| เส้นทาง | คำอธิบาย |
|---------|----------|
| `/` | Dashboard (รายวัน/รายเดือน, กรอง Section) |
| `/login` | เข้าสู่ระบบ |
| `/alerts` | แจ้งเตือน |
| `/production/record` | บันทึกการผลิต |
| `/production/history` | ประวัติ |
| `/production/report` | รายงาน |
| `/production/mtbf` | MTBF / MTTR |
| `/master/lines`, `/master/machines`, `/master/parts`, … | Master data |
| `/master/departments` | โครงสร้างองค์กร (แผนก / ส่วน / สาย) |
| `/master/machines/qr` | QR เครื่อง |
| `/admin/users`, `/admin/holidays`, `/admin/notifications`, `/admin/logs`, `/admin/permissions` | ผู้ดูแลระบบ |
| `/scan/[machineId]` | สแกนเข้าหน้าเครื่อง |

เมนูด้านข้างถูกกำหนดใน `components/layout/useDashboardNav.tsx` และผูกกับ permission keys

---

## 12. API (สรุปตามกลุ่ม)

ทุก route ภายใต้ `app/api/` เป็น **Route Handler** ของ Next.js

| กลุ่ม | ตัวอย่างเส้นทาง |
|--------|------------------|
| Auth | `/api/auth/[...nextauth]`, `/api/auth/pin` |
| Production | `/api/production/records`, `/api/production/records/[id]`, `/api/production/sessions`, `/api/production/sessions/[id]`, `/api/production/dashboard`, `/api/production/summary`, `/api/production/reports`, `/api/production/mtbf`, `/api/production/record-operators`, `/api/production/sessions/auto-close` |
| Master | `/api/master/departments`, `divisions`, `sections`, `lines`, `machines`, `parts`, `customers`, `problem-categories`, `machine-part-targets`, รวมถึงรูปเครื่องและ line-part-targets แบบซ้อน |
| Scan | `/api/scan/[machineId]` |
| Notifications | `/api/notifications`, `/api/notifications/check` |
| Admin | `/api/admin/users`, `holidays`, logs, `permissions/*` |

รูปแบบ response ที่ใช้บ่อย: `{ data, pagination }` สำหรับรายการแบบแบ่งหน้า; `{ error }` เมื่อผิดพลาด — ดูแต่ละ route สำหรับรายละเอียด

---

## 13. QR / Scan และการบันทึกแบบไม่ล็อกอิน

Flow โดยย่อ:

1. สร้าง QR ชี้ไปที่ `/scan/[machineId]` (หรือ URL ที่กำหนด)
2. หน้า scan ดึงข้อมูลเครื่องและ Part ที่เกี่ยวข้อง
3. ผู้ใช้กรอกรหัสพนักงานและยืนยันผ่าน **PIN** (`/api/auth/pin`) — บันทึก `ScanLog`
4. เลือก Part — ระบบดึง **target** จาก `machine_part_targets` (หรือตาม logic ในโค้ด)
5. ส่งข้อมูลรายชั่วโมงผ่าน `POST /api/production/records`

**ข้อจำกัดสำคัญ:** `hourly_records` มี unique ตาม `[sessionId, hourSlot]` — ห้ามซ้ำช่องเวลาใน session เดียวกัน

---

## 14. การแจ้งเตือน

- Cron หรือ scheduler ภายนอกเรียก **`/api/notifications/check`** (ตรวจวันหยุด, กะ, session ที่กำลังทำงาน, ชั่วโมงที่คาดว่าต้องมีข้อมูล)
- หากพบชั่วโมงที่ “ขาด” อาจสร้าง `Notification` และส่งข้อความไป **Telegram** (ฟังก์ชันส่งอยู่ใน `lib/telegram.ts` — ควรมี try/catch ไม่ให้ล้ม flow หลัก)

---

## 14.1 LineTarget Guard Rollout (แนะนำ)

ใช้เพื่อลดปัญหา “เปิด session/ออก QR ได้ทั้งที่ line ยังไม่มี LinePartTarget”

### Soft Gate (ช่วงเริ่มต้น)

- ตั้ง `LINE_TARGET_GUARD_MODE=warn`
- ตั้ง `LINE_TARGET_GUARD_ALLOW_OVERRIDE=true`
- ตั้ง `LINE_TARGET_GUARD_OVERRIDE_ROLES=SUPERVISOR,ENGINEER`
- ระบบจะ:
  - บันทึก audit event `SESSION_GUARD_WARN` เมื่อเปิด session ทั้งที่ไม่มี line target
  - บันทึก `SESSION_GUARD_OVERRIDE` เมื่อใช้ override พร้อมเหตุผล
  - แจ้งเตือนผู้ใช้ให้ไปตั้งค่าใน Master

### Hard Enforcement (หลังข้อมูลนิ่ง)

- เปลี่ยนเป็น `LINE_TARGET_GUARD_MODE=enforce`
- แนะนำตั้ง `LINE_TARGET_GUARD_ALLOW_OVERRIDE=false` เพื่อ block เต็มรูปแบบ
- ถ้ายังต้อง emergency override ให้เปิด `LINE_TARGET_GUARD_ALLOW_OVERRIDE=true` ชั่วคราวและจำกัด role

### Daily Health Check (แนะนำรันทุกวันก่อนเริ่มกะ)

ใช้ query จากไฟล์ `scripts/sql/line-target-health-check.sql`

```bash
# ตัวอย่างรันบน VPS ที่มี psql
sudo -u postgres psql -d productiontracker -f scripts/sql/line-target-health-check.sql
```

---

## 15. CI และการตรวจสอบก่อน merge

ไฟล์ `.github/workflows/verify.yml`:

- รันบน **push/PR** ไปยัง `main` หรือ `master`
- ตั้ง `DATABASE_URL` แบบ placeholder สำหรับ build เท่านั้น
- ขั้นตอน: `npm ci` → `npx prisma generate` → `npm run verify`

แนะนำให้ตั้ง **branch protection** ให้ job นี้ผ่านก่อน merge

---

## 16. หมายเหตุสำหรับนักพัฒนา

1. **อย่าแก้ Prisma schema โดยไม่มี migration** — ใช้ `prisma migrate dev` และตรวจสอบบน staging
2. **อย่า commit** `.env`, `.env.local`, `node_modules/`, `.next/`
3. หลังแก้ logic สำคัญ ให้รัน **`npm run verify`** และทดสอบ flow ที่เกี่ยวข้องด้วยมือ
4. เอกสารเชิงลึกบางส่วนอาจอยู่ใน `CLAUDE.md` (ถ้ามีใน repo หรือโฟลเดอร์แม่) — ใช้เป็นคู่มืออ้างอิงเพิ่มเติมได้

---

## ใบอนุญาตและการสนับสนุน

รายละเอียด license (ถ้ามี) อยู่ที่ไฟล์ `LICENSE` ใน repo หากไม่มี ให้สอบถามเจ้าของโปรเจกต์

เอกสารนี้สะท้อนสถานะโปรเจกต์ ณ เวลาที่เขียน — หากโค้ดเปลี่ยน ให้อัปเดต README คู่กับการเปลี่ยนแปลงที่สำคัญ
