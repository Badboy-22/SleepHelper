import { Router } from "express";
import { randomUUID } from "crypto";

export default function fatigueRoutes({ prisma }) {
    const router = Router();

    router.post("/", async (req, res) => {
        try {
            // 세션 → userId, username
            let userId = req.session?.userId || null;
            let username = null;
            if (!userId && req.session?.username) {
                const u = await prisma.user.findUnique({ where: { username: String(req.session.username).toLowerCase().trim() } });
                if (!u) return res.status(401).json({ error: "unauthorized" });
                userId = u.id; username = u.username;
            } else if (userId) {
                const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true } });
                if (!u) return res.status(401).json({ error: "unauthorized" });
                username = u.username;
            } else {
                return res.status(401).json({ error: "unauthorized" });
            }

            // payload
            const { type, value, date, recordedAt, note } = req.body || {};
            const raw = String(type || "").trim().toUpperCase();
            const T =
                raw === "BEFORE" ? "BEFORE_SLEEP" :
                    raw === "AFTER" ? "AFTER_SLEEP" :
                        raw === "DAY" ? "DAYTIME" :
                            raw;
            if (!["BEFORE_SLEEP", "AFTER_SLEEP", "DAYTIME"].includes(T))
                return res.status(400).json({ error: "invalid type" });

            const v = Number(value);
            if (!Number.isFinite(v) || v < 0 || v > 100)
                return res.status(400).json({ error: "value must be 0..100" });

            let when = new Date();
            if (recordedAt) {
                const d = new Date(recordedAt);
                if (!Number.isNaN(+d)) when = d;
            } else if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
                when = new Date(`${date}T12:00:00Z`);
            }

            // SleepLog 준비(필요한 경우)
            let sleepLogConnect = undefined;
            if (date && (T === "BEFORE_SLEEP" || T === "AFTER_SLEEP")) {
                try {
                    await prisma.sleepLog.upsert({
                        where: { username_date: { username, date } }, // 복합 고유키가 이렇게 정의돼 있다면
                        create: { username, date },
                        update: {},
                    });
                    sleepLogConnect = { connect: { username_date: { username, date } } };
                } catch (e) {
                    // 복합키 이름이 다르면 find/create로 보정
                    if (String(e?.message || "").includes("Unknown arg `username_date`")) {
                        const exist = await prisma.sleepLog.findFirst({ where: { username, date } });
                        if (!exist) await prisma.sleepLog.create({ data: { username, date } });
                        sleepLogConnect = { connect: { username, date } };
                    } else {
                        console.error("ensure SleepLog error:", e);
                        return res.status(500).json({ error: "failed to ensure SleepLog for date" });
                    }
                }
            }

            // FatigueLog 생성 (중첩 관계 사용)
            const item = await prisma.fatigueLog.create({
                data: {
                    id: randomUUID(),              // id 필요하면 유지
                    user: { connect: { id: userId } }, // ← 필수
                    type: T,
                    value: Math.round(v),
                    recordedAt: when,
                    note: note ?? null,
                    ...(sleepLogConnect ? { sleepLog: sleepLogConnect } : {}),
                },
            });

            return res.status(201).json({ ok: true, item });
        } catch (e) {
            if (e?.code === "P2002") return res.status(409).json({ error: "duplicate fatigue entry" });
            if (e?.code === "P2003") return res.status(400).json({ error: "foreign key violation" });
            console.error("POST /api/fatigue error:", e);
            return res.status(500).json({ error: "server error" });
        }
    });

    return router;
}
