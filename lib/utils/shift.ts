/**
 * Shift schedule & slot helpers — canonical implementation lives in `@/lib/time-utils`.
 */
export type { ShiftType, SlotInfo } from '@/lib/time-utils'
export {
  SHIFT_CONFIGS,
  getCurrentShift,
  getCurrentHourSlot,
  isOvertimeSlot,
  getSlotTime,
  getSlotStartTime,
} from '@/lib/time-utils'
