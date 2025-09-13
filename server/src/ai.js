import { Router } from "express";
import { query } from "./db.js";
import { requireAuth } from "./middlewares.js";

const r = Router();
const TZ = "Asia/Seoul";

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h * 60 + m) % (24 * 60);
}

function minutesToHHMM(total) {
  const m = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

function durationMin(s, e) {
  let a = toMinutes(s);
  b = toMinutes(e);
  if (b < a) b += 24 * 60;
  return b - a;
}

const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const median = (a) => { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); const i = Math.floor(b.length / 2); return b.length % 2 ? b[i] : (b[i - 1] + b[i]) / 2; };
function isoLocal(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function nextDay(s) { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
function fallbackWake({ sleepAtISO, medianDuration, earliestEventHHMM, prepMin, commuteMin }) {
  const sleepAt = new Date(sleepAtISO);
  const want = new Date(sleepAt.getTime() + medianDuration * 60000);
  if (earliestEventHHMM) {
    const targetDay = nextDay(sleepAtISO.slice(0, 10));
    const [eh, em] = earliestEventHHMM.split(":").map(Number);
    const firstEvt = new Date(`${targetDay}T${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00`);
    const latestSafe = new Date(firstEvt.getTime() - (prepMin + commuteMin) * 60000);
    if (want > latestSafe) return latestSafe;
  }
  return want;
}

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

r.post("/wakeup", requireAuth, async (req, res) => {
  try {
    const { sleepAt, prepMinutes = 45, commuteMinutes = 0 } = req.body ?? {};
    if (!sleepAt) return res.status(400).json({ error: "sleepAt is required" });
    const uid = req.user.uid;

    const logs = (await query(`SELECT date,start,"end",fatigue FROM sleep_logs WHERE user_id=$1 ORDER BY date DESC LIMIT 30`, [uid])).rows;
    const durations = logs.map(l => durationMin(l.start, l.end)).filter(Number.isFinite);
    const medianDurationMin = Math.round(median(durations.length ? durations : [450]));
    const avgDurationMin = Math.round(mean(durations.length ? durations : [450]));
    const typicalBedMin = Math.round(median(logs.map(l => toMinutes(l.start)).filter(Number.isFinite)));
    const typicalWakeMin = Math.round(median(logs.map(l => toMinutes(l.end)).filter(Number.isFinite)));

    const sleepDay = sleepAt.slice(0, 10);
    const targetDay = nextDay(sleepDay);
    const events = (await query(`SELECT start,"end",title FROM schedule_items WHERE user_id=$1 AND date=$2 ORDER BY start ASC`, [uid, targetDay])).rows;
    const earliestEvent = events[0]?.start ?? null;

    const ctx = {
      timezone: TZ,
      sleepPlan: { sleepAtISO: sleepAt, prepMinutes, commuteMinutes },
      history: {
        sample: logs.slice(0, 10),
        medianDurationMin, avgDurationMin,
        typicalBedtime: minutesToHHMM(typicalBedMin || 0),
        typicalWake: minutesToHHMM(typicalWakeMin || 0)
      },
      nextDay: { date: targetDay, earliestEventStart: earliestEvent, events: events.map(e => ({ start: e.start, end: e.end })) }
    };

    let payload = null;
    if (client) {
      try {
        const c = await client.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          temperature: 0.2,
          messages: [
            { role: "system", content: "You are a careful sleep coach. Output only strict JSON." },
            {
              role: "user", content:
                `Context (JSON): ${JSON.stringify(ctx)}\n` +
                `Task: Recommend a wake-up time in local timezone (${TZ}) for the planned sleepAtISO.\n` +
                `Rules:\n- Prefer the user's median sleep duration.\n- Ensure prep+commute buffer before earliest event.\n- If conflict, choose earlier wake.\n` +
                `Output JSON: {"wakeTimeLocal":"YYYY-MM-DDTHH:mm","why":"...","notes":["..."]}`
            }
          ]
        });
        const text = c.choices?.[0]?.message?.content ?? "{}";
        payload = JSON.parse(text);
      } catch { }
    }

    if (!payload || !payload.wakeTimeLocal) {
      const fbDate = fallbackWake({ sleepAtISO: sleepAt, medianDuration: medianDurationMin || 450, earliestEventHHMM: earliestEvent, prepMin: prepMinutes, commuteMin: commuteMinutes });
      const wakeISO = isoLocal(fbDate);
      return res.json({ source: "fallback", wakeTimeLocal: wakeISO, why: "Historical median + buffer", notes: [], meta: { medianDurationMin, avgDurationMin, earliestEventStart: earliestEvent, targetDay } });
    }
    return res.json({ source: "model", ...payload, meta: { medianDurationMin, avgDurationMin, earliestEventStart: earliestEvent, targetDay } });
  } catch (e) { res.status(500).json({ error: "AI wakeup failed" }); }
});

export default r;
