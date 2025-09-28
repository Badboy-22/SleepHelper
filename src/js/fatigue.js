const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const TYPE_LABEL_KO = {
  BEFORE_SLEEP: "잠자기 전",
  AFTER_SLEEP: "일어난 후",
  DAYTIME: "생활할 때",
};

const state = {
  all: [],
  currentFilter: "ALL",
};

// ---------- API ----------
async function apiAddFatigue({ type, value }) {
  const res = await fetch("/api/fatigue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, value: Number(value) }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const isoDate = (d) => d.toISOString().slice(0, 10);

async function tryJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  try { return await res.json(); } catch { return {}; }
}

async function fetchFatigue(days = 30) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  // 1) 선호: from/to
  try {
    const data = await tryJson(`/api/fatigue?from=${isoDate(from)}&to=${isoDate(to)}`);
    return normalize(data);
  } catch { }

  // 2) 평문
  try {
    const data = await tryJson(`/api/fatigue`);
    return normalize(data);
  } catch { }

  // 3) 마지막: limit (일부 서버만 지원)
  try {
    const data = await tryJson(`/api/fatigue?limit=100`);
    return normalize(data);
  } catch (e) {
    // 진짜 실패할 때만 한 번 콘솔 출력
    console.error("피로도 불러오기 실패:", e);
    throw e;
  }
}

function normalize(data) {
  let items = [];
  if (Array.isArray(data)) items = data;
  else if (Array.isArray(data.items)) items = data.items;
  else if (data.item) items = [data.item];

  items = items
    .map((it) => ({
      ...it,
      createdAt: it.createdAt || (it.date ? `${it.date}T00:00:00.000Z` : null),
    }))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  state.all = items;
  return items;
}

// ---------- Utils ----------
const pad = (n) => String(n).padStart(2, "0");
function toLocalDateKey(ts) {
  const d = ts ? new Date(ts) : new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit" });
}
function koType(type) {
  return TYPE_LABEL_KO[type] || type || "";
}

// ---------- Render ----------
function applyActiveTab() {
  $$("#fatigueTabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === state.currentFilter);
  });
}

function renderList() {
  const ul = $("#fatigueList");
  if (!ul) return;

  const list =
    state.currentFilter === "ALL"
      ? state.all
      : state.all.filter((it) => it.type === state.currentFilter);

  ul.innerHTML = "";
  if (!list.length) {
    const li = document.createElement("li");
    li.textContent = "No entries";
    ul.appendChild(li);
    return;
  }

  const groups = new Map();
  for (const it of list) {
    const key = toLocalDateKey(it.createdAt || it.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }

  const keys = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));
  for (const key of keys) {
    const divider = document.createElement("li");
    divider.className = "date-divider";
    divider.textContent = key;
    ul.appendChild(divider);

    for (const it of groups.get(key)) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="time">[${fmtTime(it.createdAt || it.date)}]</span> <span class="type">${koType(it.type)}</span> — <span class="value">${it.value}</span>`;
      ul.appendChild(li);
    }
  }
}

// ---------- Handlers ----------
async function refreshFatigue() {
  await fetchFatigue(30);
  renderList();
}

function bindTabs() {
  $("#fatigueTabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-filter]");
    if (!btn) return;
    state.currentFilter = btn.dataset.filter;
    applyActiveTab();
    renderList();
  });
}

function bindInput() {
  $("#fatigueAdd")?.addEventListener("click", async () => {
    const type = $("#fatigueType")?.value;
    const value = $("#fatigueValue")?.value;
    const hint = $("#fatigueHint");

    if (!type || value === "" || value == null) {
      alert("타입과 값을 입력하세요.");
      return;
    }
    if (value < 0 || value > 100) {
      alert("값은 0에서 100 사이여야 합니다.");
      return;
    }
    try {
      await apiAddFatigue({ type, value });
      if (hint) { hint.textContent = "Saved ✓"; setTimeout(() => (hint.textContent = ""), 1500); }
      await refreshFatigue();
    } catch {
      alert("저장 실패");
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  bindInput();
  bindTabs();
  $("#fatigueRefresh")?.addEventListener("click", refreshFatigue);
  await refreshFatigue();
  applyActiveTab();
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } finally {
    location.href = '/index.html';
  }
});
document.addEventListener("DOMContentLoaded", ensureLoggedIn);

async function ensureLoggedIn() {
  const CHECKS = ["/api/auth/me"];

  for (const url of CHECKS) {
    try {
      const res = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: { "Accept": "application/json" },
        cache: "no-store"
      });

      // 인증 안 됨
      if (res.status === 401 || res.status === 403) {
        return redirectToLogin();
      }

      // 인증 확인됨 (JSON이면 최소 user 필드 존재 확인)
      if (res.ok) {
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        if (!ct.includes("application/json")) return; // 200 OK면 통과
        const data = await res.json().catch(() => ({}));
        if (data && (data.ok === true || data.user || data.uid || data.id)) return; // 통과
        // 200이지만 사용자 정보 없음 → 다음 체크 시도
      }

      // 404 등은 다음 후보 체크
    } catch {
      // 네트워크 오류 → 다음 후보 체크
    }
  }

  // 어떤 체크도 인증을 확정 못하면 로그인 페이지로
  redirectToLogin();
}

function redirectToLogin() {
  alert("로그인이 필요합니다.");
  location.replace("/index.html");
}

// === [AI additive] per-part upsert & grid ===
(function () {
  const PARTS = ['morning', 'afternoon', 'evening', 'night'];
  function labelForPart(k) { return { morning: "아침", afternoon: "오후", evening: "저녁", night: "밤" }[k] || k; }
  function todayKST() {
    const now = new Date();
    const y = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(now);
    const m = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit' }).format(now);
    const d = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', day: '2-digit' }).format(now);
    return `${y}-${m}-${d}`;
  }
  function setDateToday() { const el = document.getElementById('aiFDate'); if (!el) return; el.value = todayKST(); }

  async function loadRange(days) {
    const tbody = document.querySelector('#aiFatigueTable tbody'); if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6">불러오는 중...</td></tr>';
    try {
      const res = await fetch(`/api/fatigue/logs?days=${days}`, { credentials: 'include', headers: { 'Accept': 'application/json' }, cache: 'no-store' });
      let rows = []; if (res.ok) { const j = await res.json().catch(() => null); rows = Array.isArray(j?.items) ? j.items : (Array.isArray(j) ? j : []); }
      const byDate = new Map();
      rows.forEach(r => { const date = r.date; if (!date) return; if (!byDate.has(date)) byDate.set(date, {}); const p = (r.part || '').toLowerCase() || 'day'; byDate.get(date)[p] = r; });
      const dates = [...byDate.keys()].sort((a, b) => a < b ? 1 : -1);
      tbody.innerHTML = '';
      let sum = 0, cnt = 0;
      dates.forEach(date => {
        const map = byDate.get(date) || {};
        const tds = PARTS.map(p => {
          const r = map[p]; if (!r) return '<td class="ai-empty">—</td>';
          sum += Number(r.value) || 0; cnt += 1; return `<td>${r.value}</td>`;
        });
        const vals = PARTS.map(p => map[p]?.value).filter(v => v != null).map(Number);
        const avg = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : '-';
        tbody.insertAdjacentHTML('beforeend', `<tr><td>${date}</td>${tds.join('')}<td>${avg}</td></tr>`);
      });
      document.getElementById('aiAvgBadge').textContent = `평균 ${cnt ? Math.round((sum / cnt) * 10) / 10 : '-'}`;
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6">불러오기 실패</td></tr>`;
      document.getElementById('aiAvgBadge').textContent = '평균 -';
    }
  }

  async function saveFatigue() {
    const date = document.getElementById('aiFDate')?.value;
    const part = document.getElementById('aiFPart')?.value;
    const value = parseInt(document.getElementById('aiFatigue')?.value || '5', 10);
    const note = document.getElementById('aiSaveNote'); if (!date || !part) return;
    note.textContent = '저장 중...';
    let existingId = null;
    try {
      const res = await fetch('/api/fatigue/logs?days=1', { credentials: 'include', headers: { 'Accept': 'application/json' }, cache: 'no-store' });
      if (res.ok) {
        const j = await res.json().catch(() => null); const rows = Array.isArray(j?.items) ? j.items : (Array.isArray(j) ? j : []);
        const found = rows.find(r => r.date === date && (r.part || '').toLowerCase() === part); if (found && (found.id || found._id)) existingId = found.id || found._id;
      }
    } catch { }
    let ok = false;
    if (existingId) {
      try { const r = await fetch(`/api/fatigue/log/${encodeURIComponent(existingId)}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ value }) }); ok = r.ok; } catch { }
    }
    if (!ok) {
      const r = await fetch('/api/fatigue/log', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ date, part, value }) });
      ok = r.ok;
    }
    note.textContent = ok ? '저장 완료' : '저장 실패';
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('aiFatigueTable')) {
      setDateToday();
      const slider = document.getElementById('aiFatigue'), out = document.getElementById('aiFatigueVal');
      if (slider && out) { out.textContent = slider.value; slider.addEventListener('input', () => out.textContent = slider.value); }
      document.getElementById('aiSaveFatigue')?.addEventListener('click', saveFatigue);
      document.getElementById('aiRange')?.addEventListener('change', e => loadRange(parseInt(e.target.value, 10)));
      loadRange(7);
    }
  });
})();
