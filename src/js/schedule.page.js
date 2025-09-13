// schedule.page.js — 좌: 추가 / 우: 날짜별 보기
function $(id) { return document.getElementById(id); }
async function whoAmI() {
  const r = await fetch("/api/auth/me", { credentials: "include" });
  if (!r.ok) return null; const { user } = await r.json().catch(() => ({ user: null }));
  return user || null;
}
function toISO(dtLocal) {
  if (!dtLocal) return null;
  try { const d = new Date(dtLocal); return d.toISOString(); } catch { return null; }
}
function fmt(s) { if (!s) return ""; return s.replace("T", " ").slice(0, 16); }

async function loadFor(dateStr) {
  $("sch-status").textContent = "불러오는 중...";
  const r = await fetch(`/api/schedule?date=${dateStr}`, { credentials: "include" });
  const data = await r.json().catch(() => ({ items: [] }));
  const items = data.items || [];
  const ul = $("sch-list");
  ul.innerHTML = items.length ? "" : "<li>일정 없음</li>";
  items.forEach(it => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="time">${fmt(it.start)} ~ ${fmt(it.end)}</span> · ${it.title || ""}`;
    ul.appendChild(li);
  });
  $("sch-status").textContent = "";
}

document.addEventListener("DOMContentLoaded", async () => {
  const me = await whoAmI(); if (!me) { location.href = "/index.html"; return; }

  // 오른쪽 날짜 기본값 = 오늘
  $("view-date").value = new Date().toISOString().slice(0, 10);
  await loadFor($("view-date").value);

  $("sch-refresh").addEventListener("click", () => loadFor($("view-date").value));
  $("view-date").addEventListener("change", () => loadFor($("view-date").value));

  // 저장
  $("sch-save").addEventListener("click", async () => {
    const title = $("sch-title").value.trim();
    const start = toISO($("sch-start").value);
    const end = toISO($("sch-end").value);
    const note = $("sch-note").value || null;
    if (!title) { $("sch-msg").textContent = "제목을 입력하세요"; return; }
    if (!start || !end) { $("sch-msg").textContent = "시작/종료를 입력하세요"; return; }
    $("sch-msg").textContent = "저장 중...";
    const r = await fetch("/api/schedule", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ title, start, end, note })
    });
    const data = await r.json().catch(() => ({}));
    $("sch-msg").textContent = r.ok ? "Saved." : (data.error || "error");
    if (r.ok) {
      $("sch-title").value = ""; $("sch-start").value = ""; $("sch-end").value = ""; $("sch-note").value = "";
      await loadFor($("view-date").value);
    }
  });

  $("logout").addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    location.href = "/index.html";
  });
});
