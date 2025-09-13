// server/index.js — CommonJS, same-origin, USERNAME-ONLY auth

const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");

dotenv.config();
const prisma = new PrismaClient();
const app = express();

app.use(express.json());

// ----- sessions (same-origin localhost) -----
app.use(
    session({
        secret: process.env.SESSION_SECRET || "dev-change-me",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: false,
            maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        },
    })
);

// ----- static frontend (same origin) -----
const PUBLIC_ROOT = path.join(__dirname, "..", "public");
app.use(express.static(PUBLIC_ROOT));
app.get("/", (_req, res) => res.sendFile(path.join(PUBLIC_ROOT, "index.html")));

// shape sent to client
const sanitizeUser = (u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    avatarUrl: u.avatarUrl,
    role: u.role,
    prefs: u.prefs || null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    lastLoginAt: u.lastLoginAt,
});
// ---------------- AUTH (username-only) ----------------



// POST /api/auth/register { username, password, name?, avatarUrl? }
app.post("/api/auth/register", async (req, res) => {
    const { username, password, name, avatarUrl } = req.body || {};
    const u = (username || "").toLowerCase().trim();

    // same validation your frontend already does
    if (!u || !password) {
        return res.status(400).json({ error: "username and password required" });
    }

    // existence pre-check to avoid unique-violation 500s
    const exists = await prisma.user.findUnique({ where: { username: u }, select: { id: true } });
    if (exists) return res.status(409).json({ error: "username already in use" });

    const passwordHash = await bcrypt.hash(String(password), 10);

    // build the common fields once
    const baseData = {
        username: u,
        name: name || null,
        avatarUrl: (avatarUrl || "").trim() || null,
        prefs: { use24h: true },
        lastLoginAt: new Date(),
    };

    try {
        // Try schema with "passwordHash" column
        let user;
        try {
            user = await prisma.user.create({
                data: { ...baseData, passwordHash },
            });
        } catch (e) {
            // If the error indicates "passwordHash" is not a known arg/column, fall back to "password"
            const msg = String(e?.message || "");
            const looksLikeUnknownArg = msg.includes("Unknown arg `passwordHash`") || msg.includes("Unknown argument `passwordHash`");
            if (!looksLikeUnknownArg) throw e;

            // Fallback: schema uses `password` instead of `passwordHash`
            user = await prisma.user.create({
                data: { ...baseData, password: passwordHash },
            });
        }

        req.session.userId = user.id;
        return res.status(201).json({ user: sanitizeUser(user) });
    } catch (e) {
        // Prisma unique
        if (e?.code === "P2002" && (e.meta?.target || []).includes("username")) {
            return res.status(409).json({ error: "username already in use" });
        }
        // Missing required fields (e.g., non-null email)
        const m = String(e?.message || "");
        if (m.includes("Missing required value") || m.includes("Argument") && m.includes("is missing")) {
            return res.status(400).json({
                error: "backend schema requires a non-null field (e.g., email). Make that field optional in User or provide it on signup.",
                detail: m.slice(0, 300),
            });
        }

        console.error("REGISTER 500:", e);
        return res.status(500).json({ error: "failed to create user" });
    }
});

// POST /api/auth/login { username, password }
app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body || {};
    const u = (username || "").toLowerCase().trim();
    if (!u || !password) return res.status(400).json({ error: "username and password required" });

    const user = await prisma.user.findUnique({ where: { username: u } });
    if (!user) {
        // uncomment during debugging:
        // console.log("LOGIN 401: user not found", { u });
        return res.status(401).json({ error: "invalid credentials" });
    }

    // NOTE: if your schema uses "password" instead of "passwordHash", change next line accordingly
    if (!user.passwordHash) {
        // console.log("LOGIN 401: missing passwordHash for user", { id: user.id, u });
        return res.status(401).json({ error: "invalid credentials" });
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
        // console.log("LOGIN 401: bad password", { id: user.id, u });
        return res.status(401).json({ error: "invalid credentials" });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    req.session.userId = user.id;
    return res.json({ user: sanitizeUser(user) });
});

// POST /api/auth/logout
app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
});

// -------------- Protected examples --------------
app.put("/api/me/profile", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "unauthorized" });
    const { name, username, avatarUrl } = req.body || {};

    if (typeof username === "string") {
        const newU = username.toLowerCase().trim();
        const existing = await prisma.user.findUnique({ where: { username: newU }, select: { id: true } });
        if (existing && existing.id !== req.session.userId) {
            return res.status(409).json({ error: "username already in use" });
        }
    }

    try {
        const user = await prisma.user.update({
            where: { id: req.session.userId },
            data: {
                name: name ?? undefined,
                username: typeof username === "string" ? username.toLowerCase().trim() : undefined,
                avatarUrl: typeof avatarUrl === "string" ? avatarUrl.trim() : undefined,
            },
        });
        res.json({ user: sanitizeUser(user) });
    } catch (e) {
        if (e?.code === "P2002" && (e.meta?.target || []).includes("username")) {
            return res.status(409).json({ error: "username already in use" });
        }
        console.error("PROFILE 500:", e);
        res.status(500).json({ error: "failed to update profile" });
    }
});

app.put("/api/me/prefs", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "unauthorized" });
    const incoming = req.body || {};
    const current = await prisma.user.findUnique({
        where: { id: req.session.userId },
        select: { prefs: true },
    });
    const merged = { ...(current?.prefs || {}), ...incoming };
    const user = await prisma.user.update({
        where: { id: req.session.userId },
        data: { prefs: merged },
    });
    res.json({ user: sanitizeUser(user) });
});
// GET /api/auth/me  (and alias /api/me for existing clients)
async function meHandler(req, res) {
    const uid = req.session?.userId;
    if (!uid) return res.json({ user: null });
    const user = await prisma.user.findUnique({
        where: { id: uid },
        select: { id: true, username: true },
    });
    if (!user) {
        req.session.destroy(() => { });
        return res.json({ user: null });
    }
    return res.json({ user });
}
app.get("/api/auth/me", meHandler);
app.get("/api/me", meHandler); // alias for old frontend code

// --- FATIGUE: create one or many ---
// Accepts either:
// 1) { type: "BEFORE_SLEEP"|"AFTER_SLEEP"|"DAYTIME" | "before"|"after"|"day", value: number, date?: "YYYY-MM-DD", note?: string, recordedAt?: ISO }
// 2) { date: "YYYY-MM-DD", before?: number, after?: number, day?: number, note?: string }
app.post("/api/fatigue", async (req, res) => {
    const uid = req.session?.userId;
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    const me = await prisma.user.findUnique({
        where: { id: uid },
        select: { username: true },
    });
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const username = me.username;

    const b = req.body || {};
    const normType = (t) => {
        if (!t) return null;
        const s = String(t).toUpperCase();
        if (s === "BEFORE" || s === "BEFORE_SLEEP") return "BEFORE_SLEEP";
        if (s === "AFTER" || s === "AFTER_SLEEP") return "AFTER_SLEEP";
        if (s === "DAY" || s === "DAYTIME") return "DAYTIME";
        return null;
    };

    // helper to pick recordedAt
    const pickRecordedAt = (date, fallbackIso) => {
        // If client sends recordedAt (ISO), honor it
        if (fallbackIso) {
            const d = new Date(fallbackIso);
            if (!Number.isNaN(+d)) return d;
        }
        // If we only have date (YYYY-MM-DD), store it at noon local to avoid TZ midnight edge cases
        if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return new Date(`${date}T12:00:00Z`);
        }
        // Fallback now
        return new Date();
    };

    // create a single entry
    const createOne = async ({ type, value, date, note, recordedAt }) => {
        const T = normType(type);
        if (!T || typeof value !== "number" || value < 0 || value > 100) {
            return { error: "invalid payload", status: 400 };
        }
        const data = {
            username,
            recordedAt: pickRecordedAt(date, recordedAt),
            type: T,
            value: Math.round(value),
            note: note ?? null,
            // link to the day's SleepLog when BEFORE/AFTER and date provided
            sleepLogUsername: null,
            sleepLogDate: null,
        };
        if (date && (T === "BEFORE_SLEEP" || T === "AFTER_SLEEP")) {
            const logExists = await prisma.sleepLog.findFirst({
                where: { username, date },
                select: { username: true }, // cheap existence check
            });
            if (logExists) {
                data.sleepLogUsername = username;
                data.sleepLogDate = date;
            }
        }
        try {
            const row = await prisma.fatigueLog.create({ data });
            return { row };
        } catch (e) {
            console.error("fatigue create error:", e);
            return { error: "failed to save fatigue", status: 500 };
        }
    };

    // mode 1: single entry with explicit type/value
    if ("type" in b && "value" in b) {
        const r = await createOne({
            type: b.type,
            value: Number(b.value),
            date: b.date,
            note: b.note,
            recordedAt: b.recordedAt,
        });
        if (r.error) return res.status(r.status).json({ error: r.error });
        return res.status(201).json({ ok: true, item: r.row });
    }

    // mode 2: bundle per-day fields
    if ("date" in b && (b.before != null || b.after != null || b.day != null)) {
        const out = [];
        const items = [
            { type: "BEFORE_SLEEP", value: b.before },
            { type: "AFTER_SLEEP", value: b.after },
            { type: "DAYTIME", value: b.day },
        ].filter(x => x.value != null);
        if (!items.length) return res.status(400).json({ error: "no values provided" });

        for (const it of items) {
            const r = await createOne({
                type: it.type,
                value: Number(it.value),
                date: b.date,
                note: b.note,
            });
            if (r.error) return res.status(r.status).json({ error: r.error });
            out.push(r.row);
        }
        return res.status(201).json({ ok: true, items: out });
    }

    return res.status(400).json({ error: "invalid payload shape" });
});


// -------------- boot --------------
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
    console.log("Serving from:", PUBLIC_ROOT);
    console.log(`Server http://localhost:${PORT}`);
});
