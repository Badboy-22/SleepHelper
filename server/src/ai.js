// server/src/ai.js
import { Router } from "express";

export const aiRouter = Router();

aiRouter.post("/recommend", async (req, res) => {
  try {
    const payload = req.body || {};
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return res.json({
        text: "(stub) GEMINI_API_KEY is not set. Returning a demo response.",
        echo: payload
      });
    }

    const { userInputs = {}, schedule = {}, fatigue = [] } = payload;
    const prompt = [
      "You are SleepHelper assistant. Create a clear, practical schedule for tonight based on:",
      `- Sleep at: ${userInputs.sleepAt || "?"}`,
      `- Wake by: ${userInputs.wakeTime || "?"}`,
      userInputs.notes ? `- Notes: ${userInputs.notes}` : "",
      "- User's schedule items (today & next day). Fit rest and short naps if helpful.",
      "- User's recent fatigue values (0-100). If high, suggest lighter plan.",
      "",
      "Return a concise, step-by-step plan with time ranges in 24h."
    ].filter(Boolean).join("\n");

    const body = {
      contents: [ { role: "user", parts: [ { text: prompt + "\n\nDATA:\n" + JSON.stringify({schedule, fatigue}, null, 2) } ] } ]
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n") || JSON.stringify(data, null, 2);
    res.json({ text });
  } catch (e) {
    console.error("POST /api/gemini/recommend error:", e);
    res.status(500).send(String(e?.message || e));
  }
});
