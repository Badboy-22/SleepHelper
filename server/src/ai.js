// server/src/ai.js
// Quota-friendly Gemini recommend endpoint with Firestore data joined in.
// - Pulls schedule & fatigue for the user
// - Shrinks payload size to reduce token usage
// - Falls back across models (flash-8b -> flash -> pro) and retries politely
// - Responds in Korean, without 'no access' disclaimers

import express from "express";
import { requireAuth } from "./session.js";
import { db } from "./firebase.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const aiRouter = express.Router();

/** KST YYYY-MM-DD from a Date-like */
function toKSTDateString(date = new Date()) {
  const d = new Date(date);
  // Convert to KST (UTC+9)
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 3600000);
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const day = String(kst.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hhmm(dateLike) {
  const d = new Date(dateLike);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Get schedule for date:
 *  - read events for the day + previous day (to include cross-midnight)
 *  - slice to [00:00, 24:00) of the target day
 *  - return simplified HH:MM items
 */
async function getScheduleForDate(userId, dateStr) {
  const oneDayMs = 24 * 3600000;
  const dayStart = new Date(`${dateStr}T00:00:00+09:00`).getTime();
  const dayEnd = dayStart + oneDayMs;

  // Same-day items (no orderBy to avoid composite index requirement)
  const snapToday = await db
    .collection("schedules")
    .where("userId", "==", userId)
    .where("date", "==", dateStr)
    .get();

  // Previous day to include cross-midnight events
  const prev = new Date(dayStart - 1);
  const prevStr = toKSTDateString(prev);
  const snapPrev = await db
    .collection("schedules")
    .where("userId", "==", userId)
    .where("date", "==", prevStr)
    .get();

  const raw = [...snapToday.docs, ...snapPrev.docs].map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  const sliced = [];
  for (const ev of raw) {
    const s = new Date(ev.startAt).getTime();
    const e = new Date(ev.endAt).getTime();
    const start = Math.max(s, dayStart);
    const end = Math.min(e, dayEnd);
    if (isFinite(start) && isFinite(end) && start < end) {
      sliced.push({
        title: ev.title || "",
        startAt: new Date(start).toISOString(),
        endAt: new Date(end).toISOString(),
      });
    }
  }

  return sliced
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
    .map((x) => ({
      title: x.title,
      start: hhmm(x.startAt),
      end: hhmm(x.endAt),
    }));
}

/** Recent fatigue logs (load broadly, then sort in memory to avoid index needs) */
async function getRecentFatigue(userId, days = 30) {
  const snap = await db
    .collection("fatigueLogs")
    .where("userId", "==", userId)
    .get();

  const all = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((x) => x.createdAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Cap to avoid huge prompts
  const list = all.slice(0, 150);

  const KO = {
    BEFORE_SLEEP: "잠자기 전",
    AFTER_SLEEP: "일어난 후",
    DAYTIME: "생활할 때",
  };

  return list.map((x) => ({
    when: x.createdAt,
    date: x.date || x.createdAt?.slice(0, 10),
    type: x.type,
    typeKo: KO[x.type] || x.type,
    value: x.value,
    time: hhmm(x.createdAt),
  }));
}

// ---- Gemini helpers ----

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash-8b";

function shrinkPayload(payload) {
  const schedule = (payload.schedule || []).slice(0, 24);
  const fatigue = (payload.fatigue || []).slice(0, 40);
  const stat = {};
  const groups = { BEFORE_SLEEP: [], AFTER_SLEEP: [], DAYTIME: [] };
  for (const f of fatigue) if (groups[f.type]) groups[f.type].push(Number(f.value) || 0);
  for (const k of Object.keys(groups)) {
    const arr = groups[k];
    if (arr.length) {
      stat[k] = {
        count: arr.length,
        avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
        latest: fatigue.find((f) => f.type === k)?.value ?? null,
      };
    }
  }
  return { ...payload, schedule, fatigue, fatigueStat: stat };
}

async function callModel(model, prompt) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const m = genAI.getGenerativeModel({ model });
  const res = await m.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return res.response.text();
}

async function askGemini(payload) {
  let compact = shrinkPayload(payload);

  const prompt = `당신은 한국어로 답하는 수면 코치입니다.
다음 "사용자 입력", "일정", "피로 통계/로그"를 바탕으로 오늘 밤 수면 계획을 제안하세요.

요구:
- 24시간 HH:MM 표기.
- 준비 → 수면 → 기상 단계별 플랜과 마지막 요점 요약.
- 일정 충돌 시 현실적인 대안 제시.
- 불필요한 사족/면책/“데이터 접근 불가” 같은 문구 금지.

<사용자 입력>
${JSON.stringify(compact.userInputs, null, 2)}

<일정(HH:MM)>
${JSON.stringify(compact.schedule, null, 2)}

<피로 통계>
${JSON.stringify(compact.fatigueStat || {}, null, 2)}

<최근 피로 로그(최대 40개)>
${JSON.stringify(compact.fatigue, null, 2)}
`;

  const tryModels = [
    DEFAULT_MODEL,
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ].filter((v, i, a) => !!v && a.indexOf(v) === i);

  for (const model of tryModels) {
    try {
      return await callModel(model, prompt);
    } catch (err) {
      const s = Number(err?.status) || 0;
      const body = JSON.stringify(err?.errorDetails || err || "");

      // 429: quota/rate → optional small wait then fallback model
      if (s === 429 || /quota|Too Many Requests/i.test(body)) {
        const m = /"retryDelay":"(\d+)s"/.exec(body);
        const delayMs = m ? Number(m[1]) * 1000 : 0;
        if (delayMs && delayMs <= 30000) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        continue;
      }
      // 400: possibly prompt too big → shrink and retry with next model
      if (s === 400) {
        compact = shrinkPayload(compact);
        continue;
      }
      // Other errors: give up
      throw err;
    }
  }
  throw new Error("모든 모델이 쿼터/요청 제한으로 응답하지 못했습니다.");
}

// ---- Route ----

aiRouter.post("/recommend", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      sleepWindowStart,
      wakeTime,
      notes = "",
      date,
    } = req.body || {};

    const targetDate = date || toKSTDateString(new Date());

    const [schedule, fatigue] = await Promise.all([
      getScheduleForDate(userId, targetDate),
      getRecentFatigue(userId, 30),
    ]);

    const payload = {
      userInputs: {
        date: targetDate,
        sleepWindowStart,
        wakeTime,
        notes,
      },
      schedule,
      fatigue,
    };

    const text = await askGemini(payload);
    res.json({ ok: true, text });
  } catch (e) {
    const status = e?.status || 500;
    const msg =
      status === 429
        ? "AI 쿼터가 초과되었습니다. 잠시 후 다시 시도하거나 더 낮은 모델(gemini-1.5-flash-8b)을 사용하세요."
        : String(e);
    console.error("recommend error", e);
    res.status(status).json({ ok: false, error: msg });
  }
});
