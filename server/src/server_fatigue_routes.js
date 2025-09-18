// server/src/server_fatigue_routes.js
import { Router } from "express";
import { db } from "./firebase.js";

export const fatigueRouter = Router();
const col = () => db.collection("fatigueLogs");

function userIdFrom(req) {
  return req.user?.id || req.headers["x-debug-userid"] || "debugUser";
}

fatigueRouter.post("/", async (req, res) => {
  try {
    const userId = userIdFrom(req);
    const { type = "DAYTIME", value } = req.body || {};
    if (value === undefined || value === null) return res.status(400).json({ error: "value required" });
    const now = new Date();
    const date = now.toISOString().slice(0,10);
    const payload = { userId, type, value: Number(value), date, createdAt: now.toISOString() };
    const ref = await col().add(payload);
    res.json({ id: ref.id, ...payload });
  } catch (e) {
    console.error("POST /api/fatigue error:", e);
    res.status(500).send(String(e?.message || e));
  }
});

/**
 * GET /api/fatigue?from=YYYY-MM-DD&to=YYYY-MM-DD
 * (loops by day to avoid composite indexes)
 */
fatigueRouter.get("/", async (req, res) => {
  try {
    const userId = userIdFrom(req);
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: "from and to are required (YYYY-MM-DD)" });

    // iterate day-by-day and pick the latest entry for that date
    const start = new Date(from + "T00:00:00");
    const end = new Date(to + "T00:00:00");
    const items = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0,10);
      const snap = await col().where("date","==",iso).get(); // single-field filter (no composite index)
      const dayItems = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(x => x.userId === userId);
      if (dayItems.length) {
        // choose latest for that date
        dayItems.sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||""));
        const { value, type } = dayItems[0];
        items.push({ date: iso, value, type });
      }
    }
    res.json({ items });
  } catch (e) {
    console.error("GET /api/fatigue error:", e);
    res.status(500).send(String(e?.message || e));
  }
});
