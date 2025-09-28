// server/src/server_fatigue_routes.js
import { Router } from "express";
import { db } from "./firebase.js";

export const fatigueRouter = Router();
const col = () => db.collection("fatigueLogs");

function userIdFrom(req) {
  return req.user?.id || req.headers["x-debug-userid"] || "debugUser";
}

// --- helpers ---
const pad = (n) => String(n).padStart(2, "0");
function fmtLocalDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseISODate(s) {
  const [y, m, d] = (s || "").split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

// --- POST: create one fatigue entry ---
fatigueRouter.post("/", async (req, res) => {
  try {
    const userId = userIdFrom(req);
    const { type = "DAYTIME", value, date: bodyDate = null } = req.body || {};
    if (value === undefined || value === null)
      return res.status(400).json({ error: "value required" });

    const now = new Date();
    const date = bodyDate || fmtLocalDate(now);

    // 같은 날짜의 문서들 가져와서 userId+type으로 기존 항목 찾기
    const snap = await col().where("date", "==", date).get();
    let existingRef = null, existing = null;
    snap.forEach((doc) => {
      const d = doc.data();
      if (d.userId === userId && (d.type || "DAYTIME") === (type || "DAYTIME")) {
        existingRef = doc.ref;
        existing = { id: doc.id, ...d };
      }
    });

    // 1) 값까지 동일하면 반영 안 함
    if (existing && Number(existing.value) === Number(value)) {
      return res.json({ id: existing.id, ...existing, unchanged: true });
    }

    // 2) 기존이 있으면 업데이트
    if (existingRef) {
      await existingRef.set(
        { value: Number(value), updatedAt: now.toISOString() },
        { merge: true }
      );
      const updated = await existingRef.get();
      return res.json({ id: updated.id, ...updated.data(), updated: true });
    }

    // 3) 없으면 신규 생성
    const payload = {
      userId,
      type,
      value: Number(value),
      date,
      createdAt: now.toISOString(),
    };
    const ref = await col().add(payload);
    return res.json({ id: ref.id, ...payload, created: true });
  } catch (e) {
    console.error("POST /api/fatigue error:", e);
    res.status(500).send(String(e?.message || e));
  }
});

/**
 * GET /api/fatigue?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns **all** entries for the user within the inclusive day range.
 * No composite index required: we query by single-field 'date' equality for each day.
 */
fatigueRouter.get("/", async (req, res) => {
  try {
    const userId = userIdFrom(req);
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: "from and to are required (YYYY-MM-DD)" });
    }

    const start = parseISODate(from);
    const end = parseISODate(to);
    if (end < start) {
      return res.status(400).json({ error: "`to` must be >= `from`" });
    }

    const items = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = fmtLocalDate(d); // local date, avoids UTC drift
      const snap = await col().where("date", "==", iso).get(); // single-field filter
      snap.forEach((doc) => {
        const data = doc.data();
        if (data.userId === userId) {
          items.push({ id: doc.id, ...data });
        }
      });
    }

    // sort stable: date asc, createdAt asc
    items.sort((a, b) => {
      const aKey = `${a.date || ""}:${a.createdAt || ""}`;
      const bKey = `${b.date || ""}:${b.createdAt || ""}`;
      return aKey.localeCompare(bKey);
    });

    res.json({ items });
  } catch (e) {
    console.error("GET /api/fatigue error:", e);
    res.status(500).send(String(e?.message || e));
  }
});

export default fatigueRouter;
