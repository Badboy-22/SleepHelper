// server/src/index.js  — cleaned
import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { sessionMiddleware, attachUser, requireAuth } from "./session.js";
import authRouter from "./auth.js";
import fatigueRoutes from "./server_fatigue_routes.js";
import scheduleRoutes from "./server_schedule_routes.js";
import geminiRouter from "./gemini_recommend.js";

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// ---------- STATIC ROOT ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_ROOT = path.resolve(__dirname, "..", "..");

// ---------- CORE MIDDLEWARE (ORDER MATTERS) ----------
app.use(express.json());
app.use(sessionMiddleware());   // <-- single source of truth for session cookies
app.use(attachUser);            // <-- populates req.user from session
app.get("/api/debug/session", (req, res) => {
    res.json({
        hasSession: !!req.session,
        sessionId: req.sessionID,
        userId: req.session?.userId ?? null,
        cookieName: "sid"   // whatever name you set in session.js
    });
});

// ---------- OPEN ROUTES (NO AUTH) ----------
app.use("/api/auth", authRouter);
app.use("/api/gemini", geminiRouter());
app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/api/me", (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: "unauthorized" });
    res.json({ userId: req.session.userId });
});

// ---------- PROTECTED ROUTES ----------
app.use("/api/fatigue", requireAuth, fatigueRoutes({ prisma }));
app.use("/api/schedule", requireAuth, scheduleRoutes({ prisma })); // use same guard

// ---------- STATIC LAST ----------
app.use(express.static(PUBLIC_ROOT));
app.get("/", (_req, res) => res.sendFile(path.join(PUBLIC_ROOT, "index.html")));

// 404 fallback
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.listen(PORT, () => {
    console.log("Serving starting from:", PUBLIC_ROOT);
    console.log(`Link: http://localhost:${PORT}`);
});
