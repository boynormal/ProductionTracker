import { z } from 'zod'

const boolish = z
  .union([z.boolean(), z.string()])
  .transform(v => v === true || v === 'true' || v === '1')

export const departmentSchema = z.object({
  departmentCode: z.string().min(1).max(30),
  departmentName: z.string().min(1).max(200),
  isActive:       boolish.optional().default(true),
})

export const divisionSchema = z.object({
  divisionCode: z.string().min(1).max(30),
  divisionName: z.string().min(1).max(200),
  departmentId: z.string().min(1),
  isActive:     boolish.optional().default(true),
})

export const sectionSchema = z.object({
  sectionCode: z.string().min(1).max(30),
  sectionName: z.string().min(1).max(200),
  divisionId:  z.string().min(1),
  isActive:    boolish.optional().default(true),
})

/** ค่าว่างจากฟอร์ม (Select / input) → null สำหรับ FK / ข้อความที่ไม่บังคับ */
const emptyToNull = (v: unknown) => (v === '' ? null : v)

export const lineSchema = z.object({
  lineCode:    z.string().min(1).max(50),
  lineName:    z.string().min(1).max(100),
  sectionId:   z.preprocess(
    emptyToNull,
    z.union([z.string().min(1), z.null()]).optional(),
  ),
  description: z.preprocess(
    emptyToNull,
    z.union([z.string(), z.null()]).optional(),
  ),
  isActive:    z.boolean().default(true),
})

export const machineSchema = z.object({
  mcNo:        z.string().min(1).max(50),
  mcName:      z.string().min(1).max(100),
  lineId:      z.string().min(1),
  mcType:      z.string().optional().nullable(),
  department:  z.string().optional().nullable(),
  process:     z.string().optional().nullable(),
  assetCode:   z.string().optional().nullable(),
  serialNo:    z.string().optional().nullable(),
  brand:       z.string().optional().nullable(),
  modelNo:     z.string().optional().nullable(),
  location:    z.string().optional().nullable(),
  powerKW:     z.number().optional().nullable(),
  weightKg:    z.number().optional().nullable(),
  dimensions:  z.string().optional().nullable(),
  voltage:     z.string().optional().nullable(),
  frequency:   z.string().optional().nullable(),
  maintenanceIntervalDays: z.number().int().optional().nullable(),
  responsiblePerson:       z.string().optional().nullable(),
  pmGeneralNote:           z.string().optional().nullable(),
  pmMajorNote:             z.string().optional().nullable(),
  conditionRating:         z.number().int().min(1).max(5).optional().nullable(),
  remark:     z.string().optional().nullable(),
  isActive:   z.boolean().default(true),
})

/** PATCH เครื่อง — รวมฟิลด์วันที่ที่ไม่ได้อยู่ใน machineSchema */
export const machinePatchSchema = machineSchema
  .partial()
  .extend({
    manufacturerYear: z.number().int().optional().nullable(),
    sheetRef:         z.string().optional().nullable(),
    purchaseDate:     z.union([z.string(), z.null()]).optional(),
    installDate:      z.union([z.string(), z.null()]).optional(),
    lastMaintenanceDate: z.union([z.string(), z.null()]).optional(),
    nextMaintenanceDate: z.union([z.string(), z.null()]).optional(),
    warrantyExpiry:   z.union([z.string(), z.null()]).optional(),
  })

export const partSchema = z.object({
  partSamco:  z.number().int().min(1),
  partNo:     z.string().min(1),
  partName:   z.string().min(1),
  customerId: z.string().optional().nullable(),
  unit:       z.string().default('PCS'),
  isActive:   z.boolean().default(true),
})

export const customerSchema = z.object({
  customerCode: z.string().min(1).max(20),
  customerName: z.string().optional().nullable(),
  isActive:     z.boolean().default(true),
})

export const problemCategorySchema = z.object({
  code:        z.string().min(1).max(20),
  name:        z.string().min(1).max(100),
  type:        z.enum(['BREAKDOWN', 'NG']),
  description: z.string().optional().nullable(),
  isActive:    z.boolean().default(true),
})

export const machinePartTargetSchema = z.object({
  machineId:     z.string().min(1),
  partId:        z.string().min(1),
  cycleTimeMin:  z.number().positive(),
  piecesPerHour: z.number().int().positive(),
  target8Hr:     z.number().int().min(0),
  target11Hr:    z.number().int().min(0),
  efficiency:    z.number().min(0).max(1).default(0.85),
  effectiveDate: z.string().or(z.date()).optional(),
  isActive:      z.boolean().default(true),
})

/** เป้าระดับสาย (บันทึก/OEE ตามสาย) — cycle ว่างได้ */
export const linePartTargetSchema = z.object({
  lineId:        z.string().min(1),
  partId:        z.string().min(1),
  cycleTimeMin:  z.union([z.number().positive(), z.null()]).optional(),
  piecesPerHour: z.number().int().positive(),
  target8Hr:     z.number().int().min(0),
  target11Hr:    z.number().int().min(0),
  efficiency:    z.number().min(0).max(1).default(0.85),
  effectiveDate: z.string().or(z.date()).optional(),
  isActive:      z.boolean().default(true),
})

export const holidaySchema = z.object({
  date:        z.string().or(z.date()),
  name:        z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  isActive:    z.boolean().default(true),
})

export const userCreateSchema = z.object({
  employeeCode:  z.string().min(1).max(20),
  employeeTitle: z.string().optional().nullable(),
  firstName:     z.string().min(1),
  lastName:      z.string().min(1),
  email:         z.string().email().optional().nullable(),
  password:      z.string().min(6),
  pin:           z.string().length(4).optional().nullable(),
  role:          z.enum(['OPERATOR', 'SUPERVISOR', 'ENGINEER', 'MANAGER', 'ADMIN']).default('OPERATOR'),
  positionCode:  z.string().optional().nullable(),
  positionName:  z.string().optional().nullable(),
  departmentId:  z.string().optional().nullable(),
  divisionId:    z.string().optional().nullable(),
  sectionId:     z.string().optional().nullable(),
  capablePartIds: z.array(z.string()).optional(),
})

export const userUpdateSchema = z.object({
  employeeTitle: z.string().optional().nullable(),
  firstName:     z.string().min(1).optional(),
  lastName:      z.string().min(1).optional(),
  email:         z.string().email().optional().nullable(),
  password:      z.string().min(6).optional(),
  pin:           z.string().length(4).optional().nullable(),
  role:          z.enum(['OPERATOR', 'SUPERVISOR', 'ENGINEER', 'MANAGER', 'ADMIN']).optional(),
  positionCode:  z.string().optional().nullable(),
  positionName:  z.string().optional().nullable(),
  departmentId:  z.string().optional().nullable(),
  divisionId:    z.string().optional().nullable(),
  sectionId:     z.string().optional().nullable(),
  isActive:      z.boolean().optional(),
  capablePartIds: z.array(z.string()).optional(),
})
