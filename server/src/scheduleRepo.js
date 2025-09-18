// server/src/scheduleRepo.js
import { db } from "./firebase.js";

const schedules = () => db.collection("schedules");

/**
 * Add a schedule item.
 * Avoid composite indexes by writing a denormalized 'pk' = `${userId}|${date}`.
 */
export async function addSchedule({ userId, date, title, startAt = null, endAt = null }) {
  const now = new Date().toISOString();
  const payload = {
    userId,
    date,            // 'YYYY-MM-DD'
    title,
    startAt,         // ISO or null
    endAt,           // ISO or null
    pk: `${userId}|${date}`,
    createdAt: now,
    updatedAt: now
  };
  const ref = await schedules().add(payload);
  return { id: ref.id, ...payload };
}

/**
 * List schedule items for a given user/day.
 * No composite index required: query by 'date' only, then filter userId in memory.
 * (We also support the fast path by 'pk' equality if present; both avoid composite index.)
 */
export async function listSchedulesOn({ userId, date }) {
  // try fast path by pk equality first (single field equality -> no composite index)
  try {
    const fast = await schedules().where("pk", "==", `${userId}|${date}`).get();
    if (!fast.empty) {
      const items = fast.docs.map(d => ({ id: d.id, ...d.data() }));
      items.sort((a,b) => (a.startAt||"").localeCompare(b.startAt||"") || (a.title||"").localeCompare(b.title||""));
      return items;
    }
  } catch (_) {}

  // fallback: single-field filter by date, then filter userId in memory
  const snap = await schedules().where("date", "==", date).get();
  const items = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(it => it.userId === userId);
  items.sort((a,b) => (a.startAt||"").localeCompare(b.startAt||"") || (a.title||"").localeCompare(b.title||""));
  return items;
}
