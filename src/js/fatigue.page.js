// fatigue.page.js — 좌: 추가 / 우: 날짜별 그룹 보기
async function whoAmI() {
  const r = await fetch("/api/auth/me", { credentials: "include" });
  if (!r.ok) return null; const { user } = await r.json().catch(() => ({ user: null }));
  return user || null;
}
function ymd(d) { return new Date(d).toISOString().slice(0, 10); }
function byDateKey(iso) { try { return new Date(iso).toISOString().slice(0, 10); } catch { return "unknown"; } }
function $(id) { return document.getElementById(id); }
function setActive(tab) {
  document.querySelectorAll(".tab").forEach(el => {
    el.classList.toggle("active", el === tab);
    el.setAttribute("aria-selected", el === tab ? "true" : "false");
  });
}

async function loadGroups() {
  const status = $("fatigue-status");
  status.textContent = "불러오는 중...";
  const r = await fetch("/api/fatigue?limit=200", { credentials: "include" });
  const data = await r.json().catch(() => ({ items: [] }));
  const items = (data.items || []);
  // 날짜별 그룹
  const groups = items.reduce((acc, it) => {
    const key = byDateKey(it.recordedAt);
    (acc[key] ||= []).push(it);
    return acc;
  }, {});
  // 최신 날짜 순
  const keys = Object.keys(groups).sort((a, b) => a < b ? 1 : -1);

  const wrap = $("fatigue-groups");
  wrap.innerHTML = "";
  if (!keys.length) { wrap.innerHTML = "<div class='small'>기록이 없습니다.</div>"; status.textContent = ""; return; }

  keys.forEach(k => {
    const box = document.createElement("div");
    box.className = "group";
    const h = document.createElement("h4");
    h.textContent = k;
    box.appendChild(h);
    groups[k].sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt));
    groups[k].forEach(it => {
      const row = document.createElement("div");
      row.className = "list-item";
      const t = new Date(it.recordedAt).toLocaleTimeString();
      row.textContent = `${t} · ${it.type} · ${it.value}${it.note ? " · " + it.note : ""}`;
      box.appendChild(row);
    });
    const hr = document.createElement("div"); hr.className = "hr";
    wrap.appendChild(box); wrap.appendChild(hr);
  });
  status.textContent = "";
}

document.addEventListener("DOMContentLoaded", async () => {
  const me = await whoAmI(); if (!me) { location.href = "/index.html"; return; }

  // 기본 날짜 = 오늘
  const dateEl = document.getElementById("fatigue-date");
  if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);

  // 탭 선택
  let currentType = "before";
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      currentType = btn.dataset.type;
      setActive(btn);
    });
  });

  // 저장
  document.getElementById("fatigue-save").addEventListener("click", async () => {
    const v = Number(document.getElementById("fatigue-value").value);
    const d = (document.getElementById("fatigue-date").value || new Date().toISOString().slice(0, 10));
    const note = document.getElementById("fatigue-note").value || null;
    if (!(Number.isFinite(v) && v >= 0 && v <= 100)) { document.getElementById("fatigue-msg").textContent = "0~100 숫자만 입력"; return; }
    document.getElementById("fatigue-msg").textContent = "저장 중...";
    const payload = { type: currentType, value: v, date: d, note, recordedAt: new Date().toISOString() };
    const r = await fetch("/api/fatigue", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    document.getElementById("fatigue-msg").textContent = r.ok ? "Saved." : (data.error || "error");
    if (r.ok) {
      document.getElementById("fatigue-value").value = "";
      document.getElementById("fatigue-note").value = "";
      await loadGroups();
    }
  });

  // 새로고침
  document.getElementById("fatigue-refresh").addEventListener("click", loadGroups);
  await loadGroups();

  // 로그아웃
  document.getElementById("logout").addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    location.href = "/index.html";
  });
});
