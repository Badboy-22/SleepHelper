import { Router } from "express";
import { prisma } from "./prisma.js";
import { requireAuth } from "./session.js";

const r = Router();

// GET /api/sleep?date=YYYY-MM-DD
r.get("/", requireAuth, async (req, res) => {
  const username = req.user.username;
  const date = String(req.query.date || "").trim();
  if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });

  const today = await prisma.sleepLog.findUnique({
    where: { username_date: { username, date } },
    select: { date: true, sleepStart: true, sleepEnd: true, fatigue: true }
  });

  const recent = await prisma.sleepLog.findMany({
    where: { username },
    orderBy: [{ date: "desc" }],
    take: 14,
    select: { date: true, sleepStart: true, sleepEnd: true, fatigue: true }
  });

  res.json({ today, recent });
});

// POST /api/sleep  { date, sleepStart?, sleepEnd?, fatigue? }  (upsert)
r.post("/", requireAuth, async (req, res) => {
  const username = req.user.username;
  const { date, sleepStart, sleepEnd, fatigue } = req.body ?? {};
  if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });

  // allow numbers or strings like "85" / "85%"
  let f = null;
  if (fatigue !== undefined && fatigue !== null && String(fatigue).trim() !== "") {
    const n = parseInt(String(fatigue).replace("%", "").trim(), 10);
    if (!Number.isNaN(n)) f = Math.max(0, Math.min(100, n));
  }

  const row = await prisma.sleepLog.upsert({
    where: { username_date: { username, date: String(date) } },
    update: { sleepStart: sleepStart ?? null, sleepEnd: sleepEnd ?? null, fatigue: f },
    create: { username, date: String(date), sleepStart: sleepStart ?? null, sleepEnd: sleepEnd ?? null, fatigue: f },
    select: { date: true, sleepStart: true, sleepEnd: true, fatigue: true }
  });

  res.json(row);
});

export default r;
