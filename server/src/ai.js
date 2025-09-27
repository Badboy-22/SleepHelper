// src/ai.js
// Express router for Gemini-based sleep recommendation.
// - KST timezone normalization
// - Fetch schedules & fatigue from Firestore without requiring composite indexes
// - Builds a Korean prompt that enforces 90-minute cycles and respects fixed events
// - Returns plain text from Gemini (no markdown rendering on server)
// - Endpoint: POST /api/gemini/recommend
//   Body: { userInputs: { date:'YYYY-MM-DD', sleepWindowStart:'HH:mm', wakeTime:'HH:mm', notes?:string } }

import express from "express";
import { db } from "./firebase.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const aiRouter = express.Router();

// ---------- Gemini ----------
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || "");
// Prefer the current stable model name. If your key only has Flash, change to "gemini-2.5-flash".
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-pro";

function getModel() {
  if (!genAI) throw new Error("Gemini client not initialized");
  return genAI.getGenerativeModel({ model: MODEL_NAME });
}

// ---------- Time helpers (KST) ----------
const KST_TZ = "Asia/Seoul";
const pad2 = (n) => (n < 10 ? "0" + n : "" + n);

function fmtKSTDate(d) {
  // Returns YYYY-MM-DD in KST
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: KST_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(d);
}
function fmtKSTTime(d) {
  // HH:MM in KST
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: KST_TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  return fmt.format(d);
}
function toKSTDateObj(isoOrMillis) {
  // Create Date but interpretation is always UTC; we only format with KST.
  return new Date(isoOrMillis);
}
function parseHM(hm) {
  // "HH:mm" -> minutes from 00:00
  if (!hm || typeof hm !== "string") return null;
  const [h, m] = hm.split(":").map((v) => parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}
function fmtHM(mins) {
  const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return pad2(h) + ":" + pad2(mm);
}

function addDaysStr(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return fmtKSTDate(dt);
}

// ---------- Domain helpers ----------
const PHASE_KO = {
  BEFORE_SLEEP: "잠자기 전",
  AFTER_SLEEP: "일어난 후",
  DAYTIME: "생활할 때",
};

function minutesDiff(aMin, bMin) {
  // absolute difference on circular day not required here; simple diff
  return Math.abs(aMin - bMin);
}

function blocksToListText(blocks) {
  if (!blocks?.length) return "(없음)";
  return blocks
    .sort((a, b) => a.startMin - b.startMin)
    .map((b) => `- ${fmtHM(b.startMin)} ~ ${fmtHM(b.endMin)} ${b.title}`)
    .join("\\n");
}

// Try to find a 90-min cycle (>= 3h) window that ends by target wake
function chooseSleepWindowKST(earliestStartMin, targetWakeMin, hardBlocks) {
  // hardBlocks: array [{startMin, endMin, title}] in the same day context (00:00~24:00) for the **target date**
  // We ensure chosen sleep interval does not overlap any block.
  const CYCLE = 90; // minutes
  const candidates = [];

  // We'll try durations from 6h down to 3h in 90-min steps
  const durations = [6 * 60, 4.5 * 60, 3 * 60];
  for (const dur of durations) {
    // sleepEnd must be <= targetWakeMin
    const end = targetWakeMin;
    const start = end - dur;
    if (start < earliestStartMin) continue; // start earlier than allowed window

    // Check overlaps with blocks
    const overlaps = hardBlocks.some((b) => !(end <= b.startMin || start >= b.endMin));
    if (overlaps) continue;

    // Near to cycles (already are exact cycles). Favor longer duration earlier in list.
    candidates.push({ startMin: start, endMin: end, duration: dur });
  }

  // If none fit, try pushing later (wake later) up to +45 minutes to hit cycle close to target
  if (!candidates.length) {
    for (const dur of durations) {
      for (let shift = 15; shift <= 45; shift += 15) {
        const end = targetWakeMin + shift;
        const start = end - dur;
        if (start < earliestStartMin) continue;
        const overlaps = hardBlocks.some((b) => !(end <= b.startMin || start >= b.endMin));
        if (overlaps) continue;
        candidates.push({ startMin: start, endMin: end, duration: dur, shifted: shift });
        break;
      }
      if (candidates.length) break;
    }
  }

  // If still none, as a fallback pick the largest gap between blocks after earliestStartMin
  if (!candidates.length) {
    const dayStart = 0;
    const dayEnd = 24 * 60;
    const ranges = [{ s: dayStart, e: dayEnd }];
    for (const b of hardBlocks.sort((a, b) => a.startMin - b.startMin)) {
      const last = ranges.pop();
      if (last.s < b.startMin) ranges.push({ s: last.s, e: b.startMin });
      if (b.endMin < last.e) ranges.push({ s: b.endMin, e: last.e });
    }
    const gaps = ranges
      .map((r) => ({
        s: Math.max(r.s, earliestStartMin),
        e: r.e,
      }))
      .filter((r) => r.e - r.s >= 3 * 60);
    if (gaps.length) {
      // choose the one whose end is closest to (but not after) wake
      gaps.sort((g1, g2) => Math.abs((g1.e) - targetWakeMin) - Math.abs((g2.e) - targetWakeMin));
      const g = gaps[0];
      // fit a 90-min chunk inside the gap ending as close to targetWakeMin
      const end = Math.min(g.e, targetWakeMin);
      const start = Math.max(g.s, end - 3 * 60);
      candidates.push({ startMin: start, endMin: end, duration: end - start, note: "gap-fallback" });
    }
  }
  if (!candidates.length) return null;

  // Prefer longer sleep; if tie, prefer less shift; then start later (closer to wake)
  candidates.sort((a, b) => {
    if (b.duration !== a.duration) return b.duration - a.duration;
    const shA = a.shifted || 0, shB = b.shifted || 0;
    if (shA !== shB) return shA - shB;
    return b.startMin - a.startMin;
  });
  return candidates[0];
}

function humanizeChosen(chosen) {
  if (!chosen) return "적절한 수면 구간을 찾지 못했습니다.";
  const durH = Math.floor(chosen.duration / 60);
  const durM = chosen.duration % 60;
  const durStr = durM ? `${durH}시간 ${durM}분` : `${durH}시간`;
  return `취침 **${fmtHM(chosen.startMin)}**, 기상 **${fmtHM(chosen.endMin)}** (예상 수면 ${durStr})`;
}

// ---------- Firestore fetch (no composite indexes required) ----------
async function fetchSchedulesForDate(uid, dateStr) {
  // Query only by userId (no orderBy) to avoid composite indexes, then filter in memory by KST date string
  const snap = await db.collection("schedules").where("userId", "==", uid).limit(500).get();
  const items = [];
  const next = addDaysStr(dateStr, 1);
  snap.forEach((doc) => {
    const d = doc.data();
    if (!d) return;
    const start = d.startAt ? toKSTDateObj(d.startAt) : null;
    const end = d.endAt ? toKSTDateObj(d.endAt) : null;
    const kstStartDate = start ? fmtKSTDate(start) : d.date;
    const kstEndDate = end ? fmtKSTDate(end) : d.date;
    const onDay =
      kstStartDate === dateStr ||
      kstEndDate === dateStr ||
      (d.date === dateStr) ||
      (kstStartDate === next && fmtKSTTime(start) < "06:00"); // early morning spillover
    if (onDay) {
      // prepare minutes-in-day
      const sMin = start ? parseInt(fmtKSTTime(start).slice(0, 2), 10) * 60 + parseInt(fmtKSTTime(start).slice(3, 5), 10) : null;
      const eMin = end ? parseInt(fmtKSTTime(end).slice(0, 2), 10) * 60 + parseInt(fmtKSTTime(end).slice(3, 5), 10) : null;
      items.push({
        title: d.title || "(제목 없음)",
        date: kstStartDate || dateStr,
        startMin: sMin ?? parseHM((d.startTime || "")),
        endMin: eMin ?? parseHM((d.endTime || "")),
      });
    }
  });
  // filter only valid mins
  return items.filter((b) => Number.isFinite(b.startMin) && Number.isFinite(b.endMin));
}

async function fetchFatigueRecent(uid) {
  // Only userId filter + limit to avoid index; we'll sort in memory.
  const snap = await db.collection("fatigueLogs").where("userId", "==", uid).limit(400).get();
  const rows = [];
  snap.forEach((doc) => {
    const d = doc.data();
    if (!d) return;
    const created = d.createdAt ? toKSTDateObj(d.createdAt) : null;
    rows.push({
      type: d.type,
      value: typeof d.value === "number" ? d.value : null,
      date: d.date || (created ? fmtKSTDate(created) : null),
      createdAt: created,
    });
  });
  // last 7 days (KST)
  const today = new Date();
  const todayStr = fmtKSTDate(today);
  const sevenAgo = new Date(today);
  sevenAgo.setUTCDate(sevenAgo.getUTCDate() - 7);
  const sevenAgoStr = fmtKSTDate(sevenAgo);

  const filtered = rows.filter((r) => r.date && r.date >= sevenAgoStr && r.date <= todayStr);
  // group stats
  const sums = { BEFORE_SLEEP: { c: 0, s: 0 }, AFTER_SLEEP: { c: 0, s: 0 }, DAYTIME: { c: 0, s: 0 } };
  for (const r of filtered) {
    if (!sums[r.type]) continue;
    if (typeof r.value === "number") {
      sums[r.type].c += 1;
      sums[r.type].s += r.value;
    }
  }
  const lines = Object.keys(sums).map((k) => {
    const c = sums[k].c;
    const avg = c ? Math.round(sums[k].s / c) : "-";
    return `${PHASE_KO[k]}: ${c}개, 평균 ${avg}`;
  });
  return { lines, sampleCount: filtered.length };
}

// ---------- Prompt builder ----------
function buildPromptKorean({ dateStr, earliestHM, wakeHM, blocks, fatigueLines, memo }) {
  const blocksText = blocksToListText(blocks);
  const guidance = [
    `목표 기상 시각은 **${wakeHM} (KST)** 입니다.`,
    `취침 시작은 **${earliestHM} (KST)** 이후여야 합니다.`,
    `**90분 수면 주기**를 우선으로 고려하세요. 6시간(최우선) → 4시간30분 → 3시간 순으로 시도하고, 불가하면 기상 시각을 최대 45분 이내에서만 조정하세요.`,
    `고정 일정과 **시간이 겹치면 안 됩니다**. 반드시 피해 주세요.`,
    `수업/고정 일정 중에는 과제/독서/준비 같은 활동을 제안하지 마세요.`,
    `결과는 한국어로, 간단하고 실천 가능한 단계로 제시하세요. 불필요한 시스템/디버그 문장은 넣지 마세요.`,
  ].join("\\n- ");

  return [
    `당신은 개인 수면 코치입니다. 다음 정보를 바탕으로 오늘 밤 수면 계획을 제안하세요.`,
    ``,
    `### 날짜`,
    `- ${dateStr} (KST)`,
    ``,
    `### 오늘 일정`,
    blocksText,
    ``,
    `### 피로도 요약(최근 7일)`,
    (fatigueLines && fatigueLines.length ? `- ${fatigueLines.join("\\n- ")}` : "(데이터 없음)"),
    memo ? `\\n### 메모\\n- ${memo}` : "",
    ``,
    `### 지침`,
    `- ${guidance}`,
    ``,
    `### 출력 형식 (예시)`,
    `**권장 수면 계획:** 취침 HH:MM → 기상 HH:MM (예상 수면 X시간 Y분)`,
    `1) 취침 준비: … (겹치는 일정 제안 금지)`,
    `2) 수면: …`,
    `3) 기상: …`,
    ``,
    `이제 위 형식 그대로 결과만 작성하세요.`,
  ].join("\\n");
}

// ---------- Route ----------
aiRouter.post("/recommend", async (req, res) => {
  try {
    const uid = req.user?.id || req.userId || req.uid; // session middleware should set one of these
    if (!uid) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

    const userInputs = req.body?.userInputs || req.body;
    const dateStr = userInputs?.date || fmtKSTDate(new Date());
    const earliestHM = userInputs?.sleepWindowStart || userInputs?.sleepEarliest || "22:30";
    const wakeHM = userInputs?.wakeTime || "07:00";
    const memo = (userInputs?.notes || "").toString().slice(0, 400);

    // Fetch data
    const [blocks, fatigue] = await Promise.all([
      fetchSchedulesForDate(uid, dateStr),
      fetchFatigueRecent(uid),
    ]);

    const fatigueLines = fatigue?.lines || [];

    // For the quick local algorithm suggestion (and for guard-rails within prompt)
    const earliestMin = parseHM(earliestHM) ?? 22 * 60 + 30;
    const wakeMin = parseHM(wakeHM) ?? 7 * 60;
    const chosen = chooseSleepWindowKST(earliestMin, wakeMin, blocks);
    const chosenLine = humanizeChosen(chosen);

    // Build prompt
    const prompt = buildPromptKorean({
      dateStr,
      earliestHM,
      wakeHM,
      blocks,
      fatigueLines,
      memo,
    });

    // Ask Gemini (return text only)
    const model = getModel();
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.9,
        maxOutputTokens: 1024,
      },
    });

    const text = result?.response?.text?.() || "";
    const output = text || chosenLine || "추천을 생성하지 못했습니다.";

    return res.json({
      ok: true,
      model: MODEL_NAME,
      date: dateStr,
      earliest: earliestHM,
      wake: wakeHM,
      blocks: blocks.map((b) => ({ title: b.title, start: fmtHM(b.startMin), end: fmtHM(b.endMin) })),
      fatigueSummary: fatigueLines,
      fallbackPlan: chosenLine,
      text: output,
    });
  } catch (err) {
    console.error("askGemini error", err);
    const status = err?.status ? Number(err.status) : 500;
    return res.status(status).json({ ok: false, error: err?.message || "GEN_AI_ERROR" });
  }
});
