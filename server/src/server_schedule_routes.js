// server_schedule_routes.js
import { Router } from "express";

/** @param {{ prisma: import('@prisma/client').PrismaClient }} deps */
export default function scheduleRoutes({ prisma }) {
    const router = Router();

    // POST /api/schedule  { date:"YYYY-MM-DD", start:"HH:MM", end:"HH:MM", title:"..." }
    router.post("/", async (req, res) => {
        try {
            const { date, start, end, title } = req.body || {};
            if (!date || !start || !end || !title?.trim()) {
                return res.status(400).json({ error: "Missing date/start/end/title" });
            }

            // Resolve the user primary key we must store
            // Prefer session.userId; if only username is present, look up id.
            let userId = req.session?.userId || null;
            if (!userId && req.session?.username) {
                const u = await prisma.user.findUnique({ where: { username: String(req.session.username) } });
                if (!u) return res.status(401).json({ error: "unauthorized: user not found" });
                userId = u.id;
            }

            // Try to detect schema shape:
            // If your Schedule model has a userId column -> use that.
            // If your Schedule model stores username instead, use altCreate below.
            let item;
            try {
                item = await prisma.schedule.create({
                    data: { userId, date, start, end, title: title.trim() }
                });
            } catch (e) {
                // Fallback: username-based schema
                const username = req.session?.username || (await prisma.user.findUnique({ where: { id: userId } }))?.username;
                if (!username) throw e;
                item = await prisma.schedule.create({
                    data: { username, date, start, end, title: title.trim() }
                });
            }

            res.json({ ok: true, item });
        } catch (e) {
            console.error("POST /api/schedule error:", e);
            res.status(500).json({ error: "server error" });
        }
    });

    // GET /api/schedule?date=YYYY-MM-DD (optional)
    router.get("/", async (req, res) => {
        try {
            let userId = req.session?.userId || null;
            if (!userId && req.session?.username) {
                const u = await prisma.user.findUnique({ where: { username: String(req.session.username) } });
                userId = u?.id ?? null;
            }

            const { date } = req.query;
            // Try id-based first
            try {
                const items = await prisma.schedule.findMany({
                    where: { ...(userId ? { userId } : {}), ...(date ? { date: String(date) } : {}) },
                    orderBy: [{ date: "asc" }, { start: "asc" }],
                    take: 500
                });
                return res.json({ items });
            } catch {
                // Fallback to username-based
                const username = req.session?.username || (await prisma.user.findUnique({ where: { id: userId } }))?.username;
                const items = await prisma.schedule.findMany({
                    where: { ...(username ? { username } : {}), ...(date ? { date: String(date) } : {}) },
                    orderBy: [{ date: "asc" }, { start: "asc" }],
                    take: 500
                });
                return res.json({ items });
            }
        } catch (e) {
            console.error("GET /api/schedule error:", e);
            res.status(500).json({ error: "server error" });
        }
    });

    return router;
}
