
// server/src/ai.js (v8 — SMART duration by availability + SOL + schedules/fatigue, no "90분" wording)
// Endpoints:
//   POST /recommend
//   POST /gemini/recommend
//   POST /gemini/recommand   (legacy)
// Default: text/plain. Accept: application/json or ?format=json → JSON.
// Inputs (one of the two is enough):
//   - sleepWindowStart: "23:00" | "11:00 PM" | ISO
//   - wakeTime:         "07:00" | "7:00 AM"  | ISO
// Optional:
//   - solMin: 15..30 (minutes to fall asleep; default 20; clamped 15–30)
// Notes: "notes" field is intentionally ignored.

import { Router } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "./firebase.js";

export const aiRouter = Router();

// --- Env (Gemini optional; only for polishing text) ---
const GEMINI_API_KEY = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "models/gemini-2.5-flash";
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// --- KST helpers ---
const TZ = "Asia/Seoul";
const partsKST = (d) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(d)
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});

function ymdKST(d) { const p = partsKST(d); return `${p.year}-${p.month}-${p.day}`; }
function hmKST(dOrIso) { const d = typeof dOrIso === "string" ? new Date(dOrIso) : dOrIso; const p = partsKST(d); return `${p.hour}:${p.minute}`; }
function fullKST(d) { const p = partsKST(d); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`; }
function makeKST(dateStr, hh, mm) { const base = new Date(`${dateStr}T00:00:00+09:00`); base.setUTCMinutes(base.getUTCMinutes() + (hh * 60 + mm)); return base; }

function parseHHMM(s) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  let m = t.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);
  if (m) {
    let hh = parseInt(m[1], 10), mm = parseInt(m[2], 10);
    const ap = m[3].toLowerCase();
    if (ap === "pm" && hh < 12) hh += 12;
    if (ap === "am" && hh === 12) hh = 0;
    return [hh, mm];
  }
  m = t.match(/^(\d{2}):(\d{2})$/);
  if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
  return null;
}

// --- Util ---
function uid(req) { return req.session?.userId || req.user?.id || req.user?.uid || req.headers["x-user-id"] || null; }
function wantsJson(req) { const q = (req.query?.format || "").toString().toLowerCase(); if (q === "json") return true; const a = (req.get("accept") || "").toLowerCase(); return a.includes("application/json"); }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// --- Firestore IO ---
async function readSchedules(userId, dateStr) {
  const snap = await db.collection("schedules")
    .where("userId", "==", userId)
    .where("date", "==", dateStr)
    .get();
  const items = snap.docs.map(d => d.data());
  items.sort((a, b) => (a.startAt < b.startAt ? -1 : 1));
  return items;
}
async function readFatigueSummary7d(userId, centerDateStr) {
  const rows = [];
  const base = new Date(`${centerDateStr}T00:00:00+09:00`);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base); d.setUTCDate(d.getUTCDate() - i);
    const dstr = ymdKST(d);
    const snap = await db.collection("fatigueLogs")
      .where("userId", "==", userId).where("date", "==", dstr).get();
    snap.forEach(doc => rows.push(doc.data()));
  }
  const vals = rows.map(r => Number(r.value) || 0);
  const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  return { count: rows.length, avg };
}

// --- Smart duration search ---
// durations: every 30m from 3.5h..9h (210..540)
const DURATIONS = Array.from({ length: 12 }, (_, i) => 210 + i * 30); // 210,240,...,540

function chooseDuration(fatigueAvg) {
  // baseline 7.5h (450). Adjust by fatigue: high(+60), low(-60)
  let target = 450;
  if (typeof fatigueAvg === "number") {
    if (fatigueAvg >= 7) target += 60;
    else if (fatigueAvg <= 3) target -= 60;
  }
  // pick closest 30-min step to target
  let best = DURATIONS[0], bestGap = Infinity;
  for (const d of DURATIONS) {
    const gap = Math.abs(d - target);
    if (gap < bestGap) { bestGap = gap; best = d; }
  }
  return best;
}

function fitByWake({ minBed, wakeAt, solMin, fatigueAvg }) {
  const avail = Math.max(0, Math.round((wakeAt - minBed) / 60000) - solMin);
  const pref = chooseDuration(fatigueAvg);
  // Find best <= avail (prefer near pref, prefer longer)
  let cand = null, bestScore = -1e9;
  for (const d of DURATIONS) {
    if (d > avail) continue;
    const score = 100 - Math.abs(d - pref) / 5 + d / 60;
    if (score > bestScore) { bestScore = score; cand = d; }
  }
  if (!cand) return null;
  const sleepStart = new Date(wakeAt.getTime() - (cand + solMin) * 60000);
  return { sleepStart, wakeAt, sleepMin: cand };
}

function fitByBedStart({ bedStart, nextLimit, solMin, fatigueAvg }) {
  const avail = Math.max(0, Math.round((nextLimit - bedStart) / 60000) - solMin);
  if (avail <= 0) return null;
  const pref = chooseDuration(fatigueAvg);
  let cand = null, bestScore = -1e9;
  for (const d of DURATIONS) {
    if (d > avail) continue;
    const score = 100 - Math.abs(d - pref) / 5 + d / 90;
    if (score > bestScore) { bestScore = score; cand = d; }
  }
  if (!cand) return null;
  const wakeAt = new Date(bedStart.getTime() + (cand + solMin) * 60000);
  return { sleepStart: bedStart, wakeAt, sleepMin: cand };
}

// --- Gemini (optional, to polish wording) ---
async function polishWithGemini(koreanPlain) {
  if (!genAI) return null;
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const prompt = [
    "다음 한국어 문장을 더 자연스럽고 간결하게 다듬어라.",
    "반드시 순수 텍스트만. 불릿/이모지/마크다운 금지. 시간 숫자는 바꾸지 말 것.",
    "",
    koreanPlain
  ].join("\n");
  try {
    const res = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
    const text = res?.response?.text?.()?.trim();
    return text || null;
  } catch { return null; }
}

// --- Core handler ---
async function handleRecommend(req, res) {
  try {
    const userId = uid(req);
    if (!userId) {
      const msg = "인증이 필요합니다. 먼저 로그인하세요.";
      return wantsJson(req) ? res.status(401).json({ ok: false, error: msg }) : res.status(401).type("text/plain; charset=utf-8").send(msg);
    }

    const body = req.body || {};
    const dateStr = body.date || ymdKST(new Date());

    // Inputs: allow either
    const sws = body.sleepWindowStart;
    const wt = body.wakeTime || body.wakeAt;

    // Sleep Onset Latency (minutes to fall asleep)
    let solMin = Number.isFinite(body.solMin) ? Math.round(body.solMin) : 20;
    solMin = clamp(solMin, 1, 60);

    // Data
    const schedules = await readSchedules(userId, dateStr);
    const fatigue = await readFatigueSummary7d(userId, dateStr);
    const fatigueAvg = fatigue?.avg ?? null;

    // minBed = max(22:00 KST, last schedule end)
    let minBed = makeKST(dateStr, 22, 0);
    if (schedules.length) {
      const latestEnd = new Date(schedules.reduce((m, b) => (b.endAt > m ? b.endAt : m), schedules[0].endAt));
      if (latestEnd > minBed) minBed = latestEnd;
    }

    // earliest bedStart from sws (if provided)
    let bedStart = minBed;
    if (typeof sws === "string") {
      const t = parseHHMM(sws);
      if (t) {
        const k = makeKST(dateStr, t[0], t[1]);
        if (k > bedStart) bedStart = k;
      } else {
        const d = new Date(sws);
        if (!isNaN(d) && d > bedStart) bedStart = d;
      }
    }

    // wakeAt from wt (if provided)
    let wakeAt = null;
    if (typeof wt === "string") {
      const t = parseHHMM(wt);
      if (t) {
        wakeAt = makeKST(dateStr, t[0], t[1]);
        if (wakeAt <= bedStart) wakeAt = new Date(wakeAt.getTime() + 24 * 60 * 60 * 1000);
      } else {
        const d = new Date(wt);
        if (!isNaN(d)) wakeAt = d;
      }
    }

    // If only bedStart is known, define nextLimit = first schedule start after bedStart - 30m; else next day 09:00
    let nextLimit = null;
    if (!wakeAt) {
      let nextStart = null;
      for (const b of schedules) {
        const s = new Date(b.startAt);
        if (s > bedStart && (!nextStart || s < nextStart)) nextStart = s;
      }
      if (nextStart) nextLimit = new Date(nextStart.getTime() - 30 * 60000);
      else {
        nextLimit = makeKST(dateStr, 9, 0);
        if (nextLimit <= bedStart) nextLimit = new Date(nextLimit.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    // Decide plan
    let plan = null;
    if (wakeAt && wakeAt > bedStart) {
      plan = fitByWake({ minBed: bedStart, wakeAt, solMin, fatigueAvg });
    } else if (!wakeAt) {
      plan = fitByBedStart({ bedStart, nextLimit, solMin, fatigueAvg });
    }

    if (!plan) {
      const msg = "현재 입력과 일정으로는 충분한 수면 시간을 확보하기 어렵습니다. 일정 조정이나 낮잠(20–30분)을 고려해 주세요.";
      return wantsJson(req) ? res.status(200).json({ ok: true, source: "smart-fallback", answer: msg }) :
        res.status(200).type("text/plain; charset=utf-8").send(msg);
    }

    const minutes = plan.sleepMin;
    const h = Math.floor(minutes / 60), m = minutes % 60;
    const textRaw = [
      `권장 수면: ${hmKST(plan.sleepStart)} 취침, ${hmKST(plan.wakeAt)} 기상 (총 ${h}시간${m ? ` ${m}분` : ""} 수면, 잠들기 ${solMin}분 포함)`,
      `기상 이후 첫 일정까지 준비 여유를 확인하고, 취침 ${solMin}분 전부터 조도를 낮추고 화면 사용을 줄이세요.`
    ].join("\n");

    const polished = await polishWithGemini(textRaw);
    const finalText = polished || textRaw;
    const source = polished ? `Gemini ${GEMINI_MODEL}` : "smart-fallback";

    if (wantsJson(req)) {
      return res.status(200).json({
        ok: true,
        source,
        answer: finalText,
        meta: {
          date: dateStr,
          bedStart: fullKST(plan.sleepStart),
          wake: fullKST(plan.wakeAt),
          minutes,
          solMin,
          fatigueAvg,
        }
      });
    }

    return res
      .status(200)
      .set("X-Plan-Source", source)
      .type("text/plain; charset=utf-8")
      .send(finalText);

  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    return res.status(500).type("text/plain; charset=utf-8").send(`추천 생성 중 오류: ${msg}`);
  }
}

// --- Routes ---
aiRouter.post("/recommend", handleRecommend);
aiRouter.post("/gemini/recommend", handleRecommend);
aiRouter.post("/gemini/recommand", handleRecommend); // legacy

export default aiRouter;
