// Main ultra-light patch v2
// - Keep your original code intact.
// - Fix only two things: safe sliceToDay + add ?limit=100 to schedule/fatigue GETs
// - Works with both relative and absolute URLs.
// - Sends cookies by default (credentials: 'same-origin').
(function () {
  /* ---------- 1) Guard sliceToDay ---------- */
  function guardedSliceToDay(items, dateStr) {
    const list = Array.isArray(items)
      ? items
      : (items && Array.isArray(items.items) ? items.items : []);

    const dayStart = new Date(`${dateStr}T00:00:00+09:00`).getTime();
    const dayEnd = dayStart + 24 * 3600000;
    const out = [];
    for (const ev of list) {
      const s = new Date(ev.startAt).getTime();
      const e = new Date(ev.endAt).getTime();
      if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
      const ns = Math.max(s, dayStart);
      const ne = Math.min(e, dayEnd);
      if (ns < ne) out.push({ title: ev.title || "", startAt: new Date(ns), endAt: new Date(ne) });
    }
    return out.sort((a, b) => a.startAt - b.startAt);
  }
  if (typeof window.sliceToDay === "function") {
    const prev = window.sliceToDay;
    window.sliceToDay = function (items, dateStr) {
      try { return guardedSliceToDay(items, dateStr); }
      catch (e) { return prev(items, dateStr); }
    };
  } else {
    window.sliceToDay = guardedSliceToDay;
  }

  /* ---------- 2) Add ?limit=100 & send cookies ---------- */
  const origFetch = window.fetch.bind(window);
  window.fetch = function (input, init = {}) {
    try {
      // turn input into editable URL
      let urlStr = typeof input === "string" ? input : (input && input.url) || "";
      const url = new URL(urlStr, location.origin);
      const method = (init.method || (typeof input !== "string" && input && input.method) || "GET").toUpperCase();

      const path = url.pathname;
      const isTarget = (path === "/api/schedule" || path === "/api/fatigue");
      if (isTarget && method === "GET") {
        const hasFrom = url.searchParams.has("from");
        const hasLimit = url.searchParams.has("limit");
        if (!hasFrom && !hasLimit) {
          url.searchParams.set("limit", "100"); // append, keep other params like date
          urlStr = url.pathname + "?" + url.searchParams.toString();
          input = urlStr;
        }
      }
      if (!("credentials" in init)) init.credentials = "same-origin";
    } catch (e) {
      // ignore, fall through
    }
    return origFetch(input, init);
  };
})();

(function () {
  const $ = (s) => document.querySelector(s);

  function kstYmd(d = new Date()) {
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    const kst = new Date(utc + 9 * 3600000);
    const y = kst.getFullYear();
    const m = String(kst.getMonth() + 1).padStart(2, "0");
    const dd = String(kst.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  function asArray(x) {
    if (Array.isArray(x)) return x;
    if (x && Array.isArray(x.items)) return x.items;
    if (x && Array.isArray(x.data)) return x.data;
    return [];
  }

  // “오늘 카드”에서 쓰는 슬라이스 (배열/교차 자정 모두 안전)
  function sliceToDaySafe(items, dateStr) {
    const list = asArray(items);
    const dayStart = new Date(`${dateStr}T00:00:00+09:00`).getTime();
    const dayEnd = dayStart + 24 * 3600000;
    const out = [];
    for (const ev of list) {
      const s = new Date(ev.startAt).getTime();
      const e = new Date(ev.endAt).getTime();
      if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
      const ns = Math.max(s, dayStart);
      const ne = Math.min(e, dayEnd);
      if (ns < ne) out.push({ title: ev.title || "", startAt: new Date(ns), endAt: new Date(ne) });
    }
    return out.sort((a, b) => a.startAt - b.startAt);
  }

  const hhmm = (t) => new Date(t).toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit" });

  async function getJson(url) {
    const res = await fetch(url, { credentials: "same-origin" });
    if (res.status === 401) {
      alert("로그인이 필요합니다.");
      location.href = "/index.html";
      throw new Error("401");
    }
    return res.json();
  }

  async function loadTodaySchedule() {
    const dateStr = kstYmd();
    // 1) 날짜 필터 먼저, 2) 실패/빈배열이면 최근 100 중에서 오늘만 필터
    let list = [];
    try {
      list = asArray(await getJson(`/api/schedule?date=${encodeURIComponent(dateStr)}`));
    } catch { }
    if (!list.length) {
      try {
        list = asArray(await getJson(`/api/schedule?limit=100`)).filter((x) => x.date === dateStr);
      } catch { }
    }
    const sliced = sliceToDaySafe(list, dateStr);

    const ul = document.getElementById("todaySchedule") || $("#todaySchedule") || $("#todayList"); // 네이밍 대비
    const hint = document.getElementById("todayHint") || $("#todayHint");
    if (!ul) return;

    ul.innerHTML = "";
    if (!sliced.length) {
      ul.innerHTML = `<li class="dim">오늘 일정이 없습니다.</li>`;
    } else {
      for (const ev of sliced) {
        const li = document.createElement("li");
        li.innerHTML = `<span class="time">[${hhmm(ev.startAt)}–${hhmm(ev.endAt)}]</span> <span class="title">${ev.title}</span>`;
        ul.appendChild(li);
      }
    }
    if (hint) hint.textContent = `총 ${sliced.length}건`;
  }

  async function loadFatigueRecent() {
    // 최근 7일 범위 → 실패 시 최근 100개
    const to = kstYmd();
    const from = kstYmd(new Date(Date.now() - 6 * 24 * 3600000));
    let list = [];
    try {
      list = asArray(await getJson(`/api/fatigue?from=${from}&to=${to}`));
    } catch { }
    if (!list.length) {
      try { list = asArray(await getJson(`/api/fatigue?limit=100`)); } catch { }
    }
    // 최신순 10개만
    list = list
      .map((x) => ({
        createdAt: x.createdAt || (x.date ? `${x.date}T00:00:00+09:00` : null),
        type: x.type, value: Number(x.value) || 0,
      }))
      .filter((x) => x.createdAt)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);

    const TYPE_KO = { BEFORE_SLEEP: "잠자기 전", AFTER_SLEEP: "일어난 후", DAYTIME: "생활할 때" };
    const ul = document.getElementById("fatigueRecent") || $("#fatigueRecent") || $("#recentFatigue");
    const hint = document.getElementById("fatigueHint") || $("#fatigueHint");
    if (!ul) return;

    ul.innerHTML = "";
    if (!list.length) ul.innerHTML = `<li class="dim">최근 기록이 없습니다.</li>`;
    else {
      for (const it of list) {
        const li = document.createElement("li");
        li.innerHTML = `<span class="time">[${hhmm(it.createdAt)}]</span> ${TYPE_KO[it.type] || it.type} — ${it.value}`;
        ul.appendChild(li);
      }
    }
    if (hint) hint.textContent = `${list.length}개 표시`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    // 기존 초기화가 있어도 함께 동작(충돌 없음)
    loadTodaySchedule().catch(console.error);
    loadFatigueRecent().catch(console.error);
  });
})();