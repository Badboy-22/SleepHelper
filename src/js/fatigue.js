// /src/js/fatigue.js
// 보기 리스트: 카테고리 필터 + 날짜 구분선
// 서버 호환: 먼저 ?from=&to= 요청, 실패 시 /api/fatigue, 마지막으로 ?limit= 시도 (조용히 폴백)

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
