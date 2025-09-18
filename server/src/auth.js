// server/src/auth.js — Firestore auth (username/password)
import { Router } from "express";
import bcrypt from "bcryptjs";
import {
  createUserUnique,
  findUserByUsername,
  updateLastLoginAt,
  findUserById,
} from "./userRepo.js";

const router = Router();
const sanitize = (u) => ({ id: u.id, username: u.username, createdAt: u.createdAt ?? null, lastLoginAt: u.lastLoginAt ?? null });

router.post("/register", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const u = (username || "").toLowerCase().trim();
    if (!u || !password) return res.status(400).json({ error: "username and password required" });

    const existing = await findUserByUsername(u);
    if (existing) return res.status(409).json({ error: "username already in use" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUserUnique({ username: u, passwordHash });
    req.session.userId = user.id;
    return res.status(201).json({ user: sanitize(user) });
  } catch (err) {
    if (err?.message === "USERNAME_TAKEN") return res.status(409).json({ error: "username already in use" });
    return next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    const u = (username || "").toLowerCase().trim();
    if (!u || !password) return res.status(400).json({ error: "username and password required" });

    const user = await findUserByUsername(u);
    if (!user) return res.status(401).json({ error: "invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    await updateLastLoginAt(user.id);
    req.session.userId = user.id;
    return res.json({ user: sanitize({ ...user, lastLoginAt: new Date() }) });
  } catch (err) {
    return next(err);
  }
});

router.get("/me", async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.json({ user: null });
    const user = await findUserById(req.session.userId);
    return res.json({ user: user ? sanitize(user) : null });
  } catch (err) {
    return next(err);
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

export default router;
