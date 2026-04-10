import { supabase } from "@/integrations/supabase/client";
import { format, addMinutes, isBefore, isAfter, parseISO, startOfDay, setHours, setMinutes } from "date-fns";

export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflicts: { type: "provider" | "room" | "device"; appointmentId: string; label: string }[];
}

/**
 * Parse a "HH:mm:ss" or "HH:mm" time string into hours and minutes.
 */
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const parts = timeStr.split(":");
  return { hours: parseInt(parts[0], 10), minutes: parseInt(parts[1], 10) };
}

/**
 * Set a Date to a specific time string like "09:00:00".
 */
function setTimeOnDate(date: Date, timeStr: string): Date {
  const { hours, minutes } = parseTime(timeStr);
  const d = startOfDay(date);
  return setMinutes(setHours(d, hours), minutes);
}

/**
 * Check if two time ranges overlap.
 */
function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return isBefore(aStart, bEnd) && isAfter(aEnd, bStart);
}

/**
 * Get raw working slots for a provider on a given date, based on recurring
 * availability and per-date overrides. Returns intervals with breaks excluded.
 */
export async function getProviderSlots(
  providerId: string,
  date: Date,
  durationMinutes: number
): Promise<TimeSlot[]> {
  const dayOfWeek = date.getDay(); // 0=Sun … 6=Sat
  const dateStr = format(date, "yyyy-MM-dd");

  // Check for overrides first
  const { data: overrides } = await supabase
    .from("provider_availability_overrides")
    .select("*")
    .eq("provider_id", providerId)
    .eq("override_date", dateStr);

  // If there's an override marking unavailable, return empty
  if (overrides && overrides.length > 0) {
    const offOverride = overrides.find((o) => !o.is_available);
    if (offOverride) return [];

    // If override provides custom hours, use those instead
    const customOverride = overrides.find((o) => o.is_available && o.start_time && o.end_time);
    if (customOverride) {
      const start = setTimeOnDate(date, customOverride.start_time!);
      const end = setTimeOnDate(date, customOverride.end_time!);
      return generateSlots(start, end, null, null, durationMinutes);
    }
  }

  // Fall back to recurring schedule
  const { data: avail } = await supabase
    .from("provider_availability")
    .select("*")
    .eq("provider_id", providerId)
    .eq("day_of_week", dayOfWeek)
    .eq("is_active", true);

  if (!avail || avail.length === 0) return [];

  const allSlots: TimeSlot[] = [];
  for (const block of avail) {
    const start = setTimeOnDate(date, block.start_time);
    const end = setTimeOnDate(date, block.end_time);
    const breakStart = block.break_start ? setTimeOnDate(date, block.break_start) : null;
    const breakEnd = block.break_end ? setTimeOnDate(date, block.break_end) : null;
    allSlots.push(...generateSlots(start, end, breakStart, breakEnd, durationMinutes));
  }

  return allSlots;
}

/**
 * Generate 15-minute interval slots within a working window, excluding break time.
 */
function generateSlots(
  start: Date,
  end: Date,
  breakStart: Date | null,
  breakEnd: Date | null,
  durationMinutes: number
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const INTERVAL = 15; // minutes
  let cursor = new Date(start);

  while (true) {
    const slotEnd = addMinutes(cursor, durationMinutes);
    if (isAfter(slotEnd, end)) break;

    // Skip if slot overlaps with break
    if (breakStart && breakEnd && rangesOverlap(cursor, slotEnd, breakStart, breakEnd)) {
      cursor = addMinutes(cursor, INTERVAL);
      continue;
    }

    slots.push({ start: new Date(cursor), end: new Date(slotEnd) });
    cursor = addMinutes(cursor, INTERVAL);
  }

  return slots;
}

/**
 * Get available (unbooked) slots for a provider on a given date.
 * Filters out slots that overlap with existing appointments.
 */
export async function getAvailableSlots(
  providerId: string,
  date: Date,
  durationMinutes: number
): Promise<TimeSlot[]> {
  const allSlots = await getProviderSlots(providerId, date, durationMinutes);
  if (allSlots.length === 0) return [];

  // Fetch existing appointments for this provider on this date
  const dayStart = startOfDay(date).toISOString();
  const dayEnd = addMinutes(startOfDay(date), 24 * 60).toISOString();

  const { data: existing } = await (supabase
    .from("appointments")
    .select("scheduled_at, duration_minutes") as any)
    .eq("provider_id", providerId)
    .gte("scheduled_at", dayStart)
    .lt("scheduled_at", dayEnd)
    .neq("status", "cancelled")
    .neq("status", "no_show");

  if (!existing || existing.length === 0) return allSlots;

  return allSlots.filter((slot) => {
    return !existing.some((apt) => {
      const aptStart = parseISO(apt.scheduled_at);
      const aptEnd = addMinutes(aptStart, apt.duration_minutes ?? 30);
      return rangesOverlap(slot.start, slot.end, aptStart, aptEnd);
    });
  });
}

/**
 * Hard conflict check before booking. Checks provider, room, and device.
 */
export async function checkConflicts(
  providerId: string | null,
  roomId: string | null,
  deviceId: string | null,
  start: Date,
  end: Date,
  excludeAppointmentId?: string
): Promise<ConflictResult> {
  const conflicts: ConflictResult["conflicts"] = [];
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // Helper: find overlapping appointments for a given column
  const findOverlaps = async (column: string, value: string) => {
    const { data } = await (supabase
      .from("appointments")
      .select("id, scheduled_at, duration_minutes") as any)
      .eq(column, value)
      .neq("status", "cancelled")
      .lt("scheduled_at", endIso);

    return ((data as any[]) ?? []).filter((apt) => {
      if (excludeAppointmentId && apt.id === excludeAppointmentId) return false;
      const aptEnd = addMinutes(parseISO(apt.scheduled_at), apt.duration_minutes ?? 30);
      return isAfter(aptEnd, start);
    });
  };

  if (providerId) {
    const provConflicts = await findOverlaps("provider_id", providerId);
    provConflicts.forEach((c) =>
      conflicts.push({
        type: "provider",
        appointmentId: c.id,
        label: `Provider booked ${format(parseISO(c.scheduled_at), "h:mm a")}–${format(addMinutes(parseISO(c.scheduled_at), c.duration_minutes ?? 30), "h:mm a")}`,
      })
    );
  }

  if (roomId) {
    const roomConflicts = await findOverlaps("room_id", roomId);
    roomConflicts.forEach((c) =>
      conflicts.push({
        type: "room",
        appointmentId: c.id,
        label: `Room in use ${format(parseISO(c.scheduled_at), "h:mm a")}–${format(addMinutes(parseISO(c.scheduled_at), c.duration_minutes ?? 30), "h:mm a")}`,
      })
    );
  }

  if (deviceId) {
    const devConflicts = await findOverlaps("device_id", deviceId);
    devConflicts.forEach((c) =>
      conflicts.push({
        type: "device",
        appointmentId: c.id,
        label: `Device in use ${format(parseISO(c.scheduled_at), "h:mm a")}–${format(addMinutes(parseISO(c.scheduled_at), c.duration_minutes ?? 30), "h:mm a")}`,
      })
    );
  }

  return { hasConflict: conflicts.length > 0, conflicts };
}
