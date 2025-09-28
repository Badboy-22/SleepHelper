// server/src/server_schedule_routes.js
import { Router } from "express";
import { addSchedule, listSchedulesOn } from "./scheduleRepo.js";

export const scheduleRouter = Router();

function userIdFrom(req) {
  return req.user?.id || req.headers["x-debug-userid"] || "debugUser";
}

scheduleRouter.get("/", async (req, res) => {
  try {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: "date query required (YYYY-MM-DD)" });
    const items = await listSchedulesOn({ userId: userIdFrom(req), date });
    res.json({ items });
  } catch (e) {
    console.error("GET /api/schedule error:", e);
    res.status(500).send(String(e?.message || e));
  }
});

scheduleRouter.post("/", async (req, res) => {
  try {
    const { date, title, startAt = null, endAt = null } = req.body || {};
    if (!date || !title) return res.status(400).json({ error: "date and title are required" });
    const out = await addSchedule({ userId: userIdFrom(req), date, title, startAt, endAt });
    res.json(out);
  } catch (e) {
    console.error("POST /api/schedule error:", e);
    res.status(500).send(String(e?.message || e));
  }
});
