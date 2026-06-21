import { z } from 'zod'

export const hourlyRecordSchema = z.object({
  sessionId:      z.string().min(1),
  hourSlot:       z.number().int().min(1).max(11),
  partId:         z.string().min(1),
  /** ระดับสาย: ไม่บังคับ — ใช้ hybrid เมื่อต้องการอ้างอิงเครื่อง / breakdown ต่อเครื่อง */
  machineId:      z.string().min(1).optional().nullable(),
  operatorId:     z.string().min(1),
  targetQty:      z.number().int().min(0),
  okQty:          z.number().int().min(0),
  isOvertimeHour: z.boolean().default(false),
  remark:         z.string().optional().nullable(),
  lotNumber:      z.string().max(100).optional().nullable(),
  breakdownLogs: z.array(z.object({
    machineId:         z.string().optional().nullable(),
    breakdownStart:    z.string().or(z.date()),
    breakdownEnd:      z.string().or(z.date()).optional().nullable(),
    breakTimeMin:      z.number().int().min(1),
    problemCategoryId: z.string().min(1),
    problemDetail:     z.string().optional().nullable(),
    actionTaken:       z.string().optional().nullable(),
  })).optional().default([]),
  ngLogs: z.array(z.object({
    machineId:         z.string().optional().nullable(),
    ngQty:             z.number().int().min(1),
    problemCategoryId: z.string().min(1),
    problemDetail:     z.string().optional().nullable(),
    actionTaken:       z.string().optional().nullable(),
  })).optional().default([]),
})

export const sessionCreateSchema = z.object({
  sessionDate: z.string().or(z.date()),
  shiftType:   z.enum(['DAY', 'NIGHT']),
  lineId:      z.string().min(1),
  machineId:   z.string().min(1).optional().nullable(),
  operatorId:  z.string().min(1),
  normalHours: z.number().int().default(8),
  otHours:     z.number().int().min(0).max(3).default(0),
  remark:      z.string().optional().nullable(),
})

export const sessionUpdateSchema = z.object({
  status:  z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  endTime: z.string().or(z.date()).optional().nullable(),
  otHours: z.number().int().min(0).max(3).optional(),
  remark:  z.string().optional().nullable(),
})

export const otPlanItemSchema = z.object({
  lineId:       z.string().min(1),
  planDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'planDate must be YYYY-MM-DD'),
  plannedHours: z.number().int().min(0).max(24),
  remark:       z.string().optional().nullable(),
})

export const otPlanBatchSchema = z.object({
  items: z.array(otPlanItemSchema).min(1),
})

export type HourlyRecordInput = z.infer<typeof hourlyRecordSchema>
export type SessionCreateInput = z.infer<typeof sessionCreateSchema>
export type SessionUpdateInput = z.infer<typeof sessionUpdateSchema>
export type OtPlanItem = z.infer<typeof otPlanItemSchema>
export type OtPlanBatchInput = z.infer<typeof otPlanBatchSchema>
