// server/src/gemini_recommend.js (ESM)
import { Router } from "express";
import "dotenv/config";

let GoogleGenerativeAI;
try {
    // Lazy import so the file still loads if package missing
    ({ GoogleGenerativeAI } = await import("@google/generative-ai"));
} catch (e) {
    console.error("Missing @google/generative-ai:", e?.message);
}

export default function geminiRouter() {
    const router = Router();

    // sanity check
    router.get("/ping", (_req, res) => res.json({ ok: true }));

    router.post("/recommend", async (req, res) => {
        try {
            // 1) Validate setup
            if (!GoogleGenerativeAI) {
                return res.status(500).json({ error: "SDK not installed (@google/generative-ai)" });
            }
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                return res.status(500).json({ error: "GEMINI_API_KEY not set in environment" });
            }

            // 2) Validate input
            const { date, canSleepFrom, canSleepTo, mustWake, targetHours, notes, prompt } = req.body || {};
            if (!date) return res.status(400).json({ error: "Missing 'date'" });

            // 3) Build prompt (keep it simple for first run)
            const ctx =
                `Date: ${date}\n` +
                `Can sleep from: ${canSleepFrom || "(none)"}\n` +
                `Can sleep to:   ${canSleepTo || "(none)"}\n` +
                `Must wake:      ${mustWake || "(none)"}\n` +
                `Target hours:   ${targetHours ?? 7.5}\n` +
                `Notes:          ${notes || "(none)"}\n\n` +
                `Give: (1) optimal bedtime and wake time (HH:MM), ` +
                `(2) best fallback if full target impossible, (3) brief rationale.`;

            const genAI = new GoogleGenerativeAI(apiKey);
            // Start with a stable model name; you can switch to "gemini-2.0-flash" later.
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

            // 4) Call model
            const result = await model.generateContent(prompt ? `${ctx}\n${prompt}` : ctx);
            const text = result?.response?.text?.() || result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                // Log full result server-side for debugging
                console.error("Gemini empty response:", JSON.stringify(result, null, 2));
                return res.status(502).json({ error: "Empty response from Gemini" });
            }

            return res.json({ text });
        } catch (err) {
            console.error("gemini/recommend error:", err);
            const msg = err?.message || String(err);
            return res.status(500).json({ error: msg });
        }
    });

    return router;
}
