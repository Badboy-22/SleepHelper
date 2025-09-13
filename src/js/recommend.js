// recommend.js — shows sleep window & must-wake, then sends to Gemini via POST /api/gemini/recommend

function pad(n) { return String(n).padStart(2, '0'); }
function todayYMD() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isoLocal(datePart, timeHHMM) {
    if (!datePart || !timeHHMM) return null;
    const [H, M] = timeHHMM.split(':').map(Number);
    const [y, mo, da] = datePart.split('-').map(Number);
    const dt = new Date(y, mo - 1, da, H, M, 0);
    return dt.toISOString(); // send ISO to server
}
function hhmm(dt) { return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`; }

function parseForm() {
    const date = document.getElementById("date").value || todayYMD();
    const from = document.getElementById("canSleepFrom").value;
    const to = document.getElementById("canSleepTo").value;
    const must = document.getElementById("mustWake").value;
    const target = Number(document.getElementById("targetHours").value || 7.5);
    const notes = document.getElementById("notes").value || "";
    return { date, from, to, must, target, notes };
}

function renderSummary({ date, from, to, must, target }) {
    const windowText = document.getElementById("windowText");
    const wakeText = document.getElementById("wakeText");
    const fitText = document.getElementById("fitText");

    windowText.textContent = (from && to) ? `${from}–${to}` : "—";
    wakeText.textContent = must || "—";

    let msg = "—";
    let cls = "pill okay";

    if (from && to && must) {
        // Compute overlap between available window [from,to] and needed window [must - target, must]
        const [fH, fM] = from.split(':').map(Number);
        const [tH, tM] = to.split(':').map(Number);
        const [wH, wM] = must.split(':').map(Number);

        const base = new Date();
        base.setHours(0, 0, 0, 0);
        const tFrom = new Date(base); tFrom.setHours(fH, fM, 0, 0);
        const tTo = new Date(base); tTo.setHours(tH, tM, 0, 0);
        if (tTo <= tFrom) tTo.setDate(tTo.getDate() + 1); // crosses midnight

        const wake = new Date(base); wake.setHours(wH, wM, 0, 0);
        if (wake <= tFrom) wake.setDate(wake.getDate() + 1); // if wake earlier, push to next day

        const needStart = new Date(wake.getTime() - target * 60 * 60 * 1000);

        const start = new Date(Math.max(tFrom.getTime(), needStart.getTime()));
        const end = new Date(Math.min(tTo.getTime(), wake.getTime()));
        const overlapMs = Math.max(0, end - start);
        const overlapHr = overlapMs / 36e5;

        if (overlapHr >= target - 1 / 60) {
            msg = `Fits: sleep ${hhmm(start)}–${hhmm(wake)} for ~${target}h`;
            cls = "pill okay";
        } else if (overlapHr > 0) {
            msg = `Partial: best ${hhmm(start)}–${hhmm(end)} (~${overlapHr.toFixed(1)}h), short of ${target}h`;
            cls = "pill warn";
        } else {
            msg = `No overlap — adjust window or wake time (target ${target}h)`;
            cls = "pill bad";
        }
    }

    fitText.className = cls;
    fitText.textContent = msg;
}

function buildPrompt(payload) {
    const { date, from, to, must, target, notes } = payload;
    return `You are a sleep coach. For ${date}, the user can sleep between ${from || "?"} and ${to || "?"}, must wake by ${must || "?"}, and targets ~${target} hours.
Constraints/notes: ${notes || "(none)"}

Please propose:
1) The optimal bedtime (HH:MM) and wake time (HH:MM) for tonight.
2) If the full target is impossible, give the best fallback + quick 2-day recovery plan.
3) Bullet-point rationale (brief). Output concise, with explicit times.`;
}

async function askGemini(e) {
    e?.preventDefault();
    const resultEl = document.getElementById("result");
    const form = parseForm();
    renderSummary(form);

    const body = {
        date: form.date,
        canSleepFrom: isoLocal(form.date, form.from),
        canSleepTo: isoLocal(form.date, form.to),
        mustWake: isoLocal(form.date, form.must),
        targetHours: Number(form.target || 7.5),
        notes: form.notes || "",
        prompt: buildPrompt(form)
    };

    resultEl.textContent = "Asking Gemini…";
    try {
        const resp = await fetch("/api/gemini/recommend", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(body)
        });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        resultEl.textContent = data.text || JSON.stringify(data, null, 2);
    } catch (err) {
        resultEl.textContent = "Error: " + (err?.message || String(err));
    }
}

function previewOnly() {
    const form = parseForm();
    renderSummary(form);
    const resultEl = document.getElementById("result");
    resultEl.textContent = "Preview updated. Click Ask Gemini to get a tailored plan.";
}

function initDefaults() {
    const d = document.getElementById("date");
    const from = document.getElementById("canSleepFrom");
    const to = document.getElementById("canSleepTo");
    const must = document.getElementById("mustWake");
    if (d && !d.value) d.value = todayYMD();
    if (from && !from.value) from.value = "22:30";
    if (to && !to.value) to.value = "08:00";
    if (must && !must.value) must.value = "07:00";
}

window.addEventListener("DOMContentLoaded", () => {
    initDefaults();
    renderSummary(parseForm());
    document.getElementById("btnPreview")?.addEventListener("click", previewOnly);
    document.getElementById("recForm")?.addEventListener("submit", askGemini);
});

async function whoAmI() {
    const r = await fetch("/api/auth/me", { credentials: "include" });
    if (!r.ok) return null;
    const { user } = await r.json().catch(() => ({ user: null }));
    return user || null;
}

document.addEventListener("DOMContentLoaded", async () => {
    const me = await whoAmI();
    if (!me) {
        // session is gone (e.g., server restarted) -> go to login
        location.href = "/index.html";
        return;
    }
    // ...render the main page with `me`...
});