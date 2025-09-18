// server/src/session.js — Express session + attachUser (Firestore)
import session from "express-session";
import { findUserById } from "./userRepo.js";

export function sessionMiddleware() {
  return session({
    secret: process.env.SESSION_SECRET || "dev-change-me",
    resave: false,
    saveUninitialized: false,
    name: "sid",
    cookie: { httpOnly: true, sameSite: "lax", secure: false, maxAge: 1000 * 60 * 60 * 24 * 30 },
  });
}

export async function attachUser(req, _res, next) {
  try {
    const id = req.session?.userId;
    if (id) {
      const u = await findUserById(id);
      if (u) req.user = { id: u.id, username: u.username };
    }
  } catch (e) {
    console.error("attachUser:", e);
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  next();
}
