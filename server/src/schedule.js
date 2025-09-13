// server/src/schedule.js  — plain pg version (no prisma)
import { Router } from "express";
import { query } from "./db.js";
import { requireAuth } from "./session.js";

const r = Router();

let ready = false;
async function ensure() {
  if (ready) return;
  await query(`
    CREATE TABLE IF NOT EXISTS schedule_items (
      username  STRING NOT NULL,
      date      DATE   NOT NULL,
      start     STRING NOT NULL,   -- "HH:MM"
      "end"     STRING NOT NULL,   -- quoted because END is a keyword
      title     STRING NOT NULL,
      PRIMARY KEY (username, date, start)
    )
  `);
  ready = true;
}

// GET /api/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
r.get("/", requireAuth, async (req, res) => {
  await ensure();
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: "from & to required (YYYY-MM-DD)" });

  const { rows } = await query(
    `SELECT date, start, "end", title
       FROM schedule_items
      WHERE username=$1 AND date BETWEEN $2 AND $3
      ORDER BY date ASC, start ASC`,
    [req.user.username, from, to]
  );

  res.json(rows.map(r => ({ date: r.date, start: r.start, end: r.end, title: r.title })));
});

// POST /api/schedule/create { date, start, end, title }
r.post("/create", requireAuth, async (req, res) => {
  await ensure();
  const { date, start, end, title } = req.body ?? {};
  if (!date || !start || !end || !title) {
    return res.status(400).json({ error: "date/start/end/title required" });
  }

  await query(
    `INSERT INTO schedule_items (username, date, start, "end", title)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (username, date, start)
     DO UPDATE SET "end"=EXCLUDED."end", title=EXCLUDED.title`,
    [req.user.username, date, start, end, title]
  );

  res.status(201).json({ date, start, end, title });
});

// POST /api/schedule/delete { date, start }
r.post("/delete", requireAuth, async (req, res) => {
  await ensure();
  const { date, start } = req.body ?? {};
  if (!date || !start) return res.status(400).json({ error: "date & start required" });

  await query(
    `DELETE FROM schedule_items WHERE username=$1 AND date=$2 AND start=$3`,
    [req.user.username, date, start]
  );

  res.json({ ok: true });
});

export default r;
