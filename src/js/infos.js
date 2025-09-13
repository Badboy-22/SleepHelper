// /src/js/infos.js  (type="module")
// Wires up: fatigue subnav (Before/After/Daytime), range slider + presets, Save → /api/fatigue, Logout

/* ---------------- helpers ---------------- */


async function postJSON(url, data) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include", // use session cookie
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/* ---------------- fatigue type subnav ---------------- */
function getActiveFatigueType() {
  const active = document.querySelector(".subnav .subnav-link.active");
  return active?.dataset?.type || "BEFORE_SLEEP";
}

function setActiveSubnav(btn) {
  document.querySelectorAll(".subnav .subnav-link").forEach(b => {
    const on = b === btn;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
    b.tabIndex = on ? 0 : -1;
  });
  // remember choice locally
  try { localStorage.setItem("fatigueType", getActiveFatigueType()); } catch { }
}

function wireSubnav() {
  const links = document.querySelectorAll(".subnav .subnav-link");
  if (!links.length) return;
  // restore last choice if present
  let restored = false;
  try {
    const last = localStorage.getItem("fatigueType");
    if (last) {
      const match = Array.from(links).find(b => b.dataset.type === last);
      if (match) { setActiveSubnav(match); restored = true; }
    }
  } catch { }
  if (!restored) setActiveSubnav(links[0]);

  links.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      setActiveSubnav(btn);
    });
    // Arrow key support
    btn.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const arr = Array.from(links);
      const i = arr.indexOf(btn);
      const next = e.key === "ArrowRight" ? (i + 1) % arr.length : (i - 1 + arr.length) % arr.length;
      setActiveSubnav(arr[next]);
      arr[next].focus();
    });
  });
}

/* ---------------- slider + presets ---------------- */
function wireFatigueSlider() {
  const range = document.getElementById("fatigue");     // input[type=range]
  const pct = document.getElementById("fatiguePct");    // <output>
  if (!range || !pct) return;

  const sync = () => { pct.textContent = range.value; };
  range.addEventListener("input", sync);
  sync();

  // Preset buttons inside the Fatigue form
  document.querySelectorAll("[data-fatigue]").forEach(btn => {
    btn.addEventListener("click", () => {
      const v = Number(btn.dataset.fatigue);
      if (Number.isFinite(v)) {
        range.value = String(v);
        sync();
      }
    });
  });
}

/* ---------------- save fatigue ---------------- */
async function saveFatigue() {
  const stateEl = document.getElementById("fatigueState");
  const range = document.getElementById("fatigue");
  if (!range || !stateEl) return;

  const value = Number(range.value);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    stateEl.textContent = "Enter a value 0–100.";
    return;
  }

  const type = getActiveFatigueType();
  const btn = document.getElementById("saveFatigue");
  try {
    stateEl.textContent = "Saving…";
    btn && (btn.disabled = true);
    await postJSON("/api/fatigue", {
      type,               // "BEFORE_SLEEP" | "AFTER_SLEEP" | "DAYTIME"
      value,              // 0..100
      // recordedAt, note omitted — your current HTML doesn't include them
    });
    stateEl.textContent = "Saved.";
  } catch (err) {
    stateEl.textContent = "Error: " + escapeHTML(err.message || String(err));
  } finally {
    btn && (btn.disabled = false);
  }
}

/* ---------------- logout ---------------- */
function wireLogout() {
  const logoutBtn = document.getElementById("logout-btn");
  if (!logoutBtn) return;
  logoutBtn.addEventListener("click", async () => {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
    } catch { }
    // send them to sign-in/up or main page; adjust if you have a specific page
    location.href = "/src/html/main.html";
  });
}

/* ---------------- boot ---------------- */
window.addEventListener("DOMContentLoaded", () => {
  wireSubnav();
  wireFatigueSlider();
  wireLogout();

  const saveBtn = document.getElementById("saveFatigue");
  if (saveBtn) saveBtn.addEventListener("click", saveFatigue);

  // (Optional) you can wire schedule add here when your /api/schedule is ready.
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