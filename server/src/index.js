// server/src/index.js
import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import { sessionMiddleware, attachUser, requireAuth } from "./session.js";
import authRouter from "./auth.js";
import sleepRouter from "./sleep.js";
import { aiRouter } from "./ai.js";
import { fatigueRouter } from "./server_fatigue_routes.js";
import { scheduleRouter } from "./server_schedule_routes.js";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_ROOT = path.resolve(__dirname, "..", ".."); 

app.use(express.json());
app.use(sessionMiddleware());
app.use(attachUser);

app.use("/api/auth", authRouter);
app.use("/api/sleep", requireAuth, sleepRouter);
app.use("/api/fatigue", requireAuth, fatigueRouter);
app.use("/api/schedule", requireAuth, scheduleRouter);
app.use("/api/gemini", requireAuth, aiRouter);

app.use(express.static(PUBLIC_ROOT));
app.get("/", (_req, res) => res.sendFile(path.join(PUBLIC_ROOT, "index.html")));
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.listen(PORT, () => {
    console.log("Serving starting from:", PUBLIC_ROOT);
    console.log(`Link: http://localhost:${PORT}`);
});
