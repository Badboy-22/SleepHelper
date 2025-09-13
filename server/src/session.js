// server/src/session.js (ESM)
import session from "express-session";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Same-origin dev cookies. (If your UI is on a different origin/port, tell me and I’ll give you the CORS/HTTPS config.)
export function sessionMiddleware() {
  return session({
    secret: process.env.SESSION_SECRET || "dev-change-me",
    resave: false,
    saveUninitialized: false,
    name: "sid",
    cookie: { httpOnly: true, sameSite: "lax", secure: false, maxAge: 1000 * 60 * 60 * 24 * 30 }
  });
}

// Populate req.user from req.session.userId (only this key)
export async function attachUser(req, _res, next) {
  try {
    const id = req.session?.userId;
    if (id) {
      const u = await prisma.user.findUnique({ where: { id } });
      if (u) req.user = { id: u.id, username: u.username, email: u.email };
    }
  } catch (e) {
    console.error("attachUser:", e);
  }
  next();
}

// Guard: requires a real req.user
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  next();
}
