// server/src/sleep.js
import { Router } from "express";
import { db } from "./firebase.js";
import { requireAuth } from "./session.js";

const r = Router();
const col = () => db.collection("sleepLogs");

// GET /api/sleep?date=YYYY-MM-DD
r.get("/", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const date = String(req.query.date || "").trim();
  if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });

  const id = `${userId}_${date}`;
  const snap = await col().doc(id).get();
  if (!snap.exists) return res.json({ date, sleepStart: null, sleepEnd: null, fatigue: null });
  const d = snap.data();
  res.json({ date: d.date, sleepStart: d.sleepStart ?? null, sleepEnd: d.sleepEnd ?? null, fatigue: d.fatigue ?? null });
});

// POST /api/sleep { date, sleepStart?, sleepEnd?, fatigue? }
r.post("/", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { date, sleepStart = null, sleepEnd = null, fatigue = null } = req.body || {};
  if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });

  let f = null;
  if (fatigue !== null && fatigue !== undefined) {
    const n = Number(fatigue);
    if (!Number.isNaN(n)) f = Math.max(0, Math.min(100, n));
  }

  const id = `${userId}_${String(date)}`;
  const data = { userId, date: String(date), sleepStart, sleepEnd, ...(f !== null ? { fatigue: f } : {}) };
  await col().doc(id).set(data, { merge: true });

  const snap = await col().doc(id).get();
  const d = snap.data();
  res.status(201).json({ date: d.date, sleepStart: d.sleepStart ?? null, sleepEnd: d.sleepEnd ?? null, fatigue: d.fatigue ?? null });
});

export default r;
