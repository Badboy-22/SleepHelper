// server/src/auth.js (ESM) — USERNAME-ONLY AUTH
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const router = Router();

const sanitizeUser = (u) => ({
  id: u.id,
  username: u.username,
  name: u.name,
  avatarUrl: u.avatarUrl,
  role: u.role,
  prefs: u.prefs ?? null,
  email: u.email ?? null,      // keep if present in schema; ignored by username-only flow
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
  lastLoginAt: u.lastLoginAt,
});

// POST /api/auth/register { username, password, name?, avatarUrl? }
router.post("/register", async (req, res, next) => {
  try {
    const { username, password, name, avatarUrl } = req.body || {};
    const u = (username || "").toLowerCase().trim();

    if (!u || !password) {
      return res.status(400).json({ error: "username and password required" });
    }

    // Fast check to avoid P2002 500s
    const existing = await prisma.user.findUnique({
      where: { username: u },
      select: { id: true },
    });
    if (existing) {
      return res.status(409).json({ error: "username already in use" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username: u, passwordHash, name, avatarUrl },
    });

    req.session.userId = user.id;
    return res.status(201).json({ user: sanitizeUser(user) });
  } catch (err) {
    // Safety net for race: Prisma P2002
    if (err?.code === "P2002" && (err.meta?.target || []).includes("username")) {
      return res.status(409).json({ error: "username already in use" });
    }
    return next(err);
  }
});

// POST /api/auth/login { username, password }
router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const u = (username || "").toLowerCase().trim();

    if (!u || !password) {
      return res.status(400).json({ error: "username and password required" });
    }

    const user = await prisma.user.findUnique({ where: { username: u } });
    if (!user) return res.status(401).json({ error: "invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    req.session.userId = user.id;
    return res.json({ user: sanitizeUser(user) });
  } catch (err) {
    return next(err);
  }
});

// GET /api/auth/me
router.get("/me", async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.json({ user: null });
    const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
    if (!user) return res.json({ user: null });
    return res.json({ user: sanitizeUser(user) });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

export default router;
