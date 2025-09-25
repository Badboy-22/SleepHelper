const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const ROW = 40;                 // 1 hour = 40px
const DAY_MIN = 24 * 60;
const DAY_PX = 24 * ROW;

const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = s => { const [y, m, d] = (s || '').split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDays = (ds, days) => { const [y, m, d] = ds.split('-').map(Number); const t = new Date(y, m - 1, d); t.setDate(t.getDate() + days); return fmtDate(t); };
const hmToMin = hm => { if (!hm) return null; const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const localDT = (ds, hm) => hm ? `${ds}T${hm}:00` : null;
const hhmm = iso => { if (!iso) return '--:--'; const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const toast = m => { const el = $("#scheduleHint"); if (el) el.textContent = m || ""; };

// ---------- API ----------
async function apiListOneDay(date) {
  const r = await fetch(`/api/schedule?date=${encodeURIComponent(date)}`);
  if (!r.ok) throw new Error('list failed');
  const { items = [] } = await r.json();

  // Normalize broken rows: if end <= start, display as until 24:00 of the same date
  return items.map(it => {
    if (!it.startAt) return it;
    const s = new Date(it.startAt);
    const e = it.endAt ? new Date(it.endAt) : null;
    if (!e || e <= s) {
      const baseDate = (it.date || it.startAt.slice(0, 10));
      const baseMidnight = new Date(`${baseDate}T00:00:00`);
      const showEnd = new Date(baseMidnight.getTime() + DAY_MIN * 60000); // 24:00
      return { ...it, _showEndAt: showEnd.toISOString() };
    }
    return it;
  }).sort((a, b) => (a.startAt || '').localeCompare(b.startAt || ''));
}

// Get items for 'date' plus prev day, then slice to exactly the day window
async function apiListForView(date) {
  const prev = addDays(date, -1);
  const [todayItems, prevItems] = await Promise.all([apiListOneDay(date), apiListOneDay(prev)]);

  // Build segments intersecting the view window
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(dayStart.getTime() + DAY_MIN * 60000);

  const sliceToDay = (it) => {
    const sRaw = it.startAt ? new Date(it.startAt) : dayStart;
    const eRaw = it._showEndAt ? new Date(it._showEndAt) : (it.endAt ? new Date(it.endAt) : new Date(sRaw.getTime() + 30 * 60000));

    const s = new Date(Math.max(sRaw.getTime(), dayStart.getTime()));
    const e = new Date(Math.min(eRaw.getTime(), dayEnd.getTime()));
    if (e <= s) return null; // no overlap with this day
    return {
      title: it.title || '(제목 없음)',
      startAt: s.toISOString(),   // segment start for this day
      endAt: e.toISOString(),     // segment end for this day
      _viewDate: date,            // for minutesWithinDay base
    };
  };

  const segments = [];
  todayItems.forEach(it => { const seg = sliceToDay(it); if (seg) segments.push(seg); });
  prevItems.forEach(it => { const seg = sliceToDay(it); if (seg) segments.push(seg); });
  // Note: If you also want post-midnight continuation of today-items to show on next day,
  // it will appear when viewing that next day because we fetch prev day there.
  return segments.sort((a, b) => (a.startAt || '').localeCompare(b.startAt || ''));
}

// ---------- View ----------
function ensureCSS() {
  if (document.getElementById('sched-inline-style')) return;
  const css = `
    .timetable{position:relative;height:${DAY_PX}px;overflow-y:auto;} /* 24h & scroll */
    .timetable .gutter{position:absolute;left:0;top:0;width:52px;height:${DAY_PX}px;}
    .timetable .track{position:relative;margin-left:52px;height:${DAY_PX}px;}
    .timetable .gridline{position:absolute;left:0;right:0;height:1px;background:rgba(0,0,0,.06);z-index:0;}
    .timetable .hourmark{position:absolute;left:0;right:0;height:${ROW}px;z-index:0;}
    .timetable .hlabel{position:absolute;left:-40px;top:2px;width:36px;text-align:right;font-size:12px;opacity:.6}
    .timetable .item{
      position:absolute;border:1px solid rgba(60,100,200,.22);background:rgba(60,120,255,.12);
      border-radius:10px;overflow:hidden;z-index:2;
      box-shadow:0 1px 2px rgba(0,0,0,.04);
    }
    .timetable .item h5{margin:6px 8px 2px;font-size:13px;font-weight:600}
    .timetable .item time{margin:0 8px 8px;font-size:12px;opacity:.75;display:block}
  `;
  const st = document.createElement('style'); st.id = 'sched-inline-style'; st.textContent = css; document.head.appendChild(st);
}

function renderHours(container) {
  ensureCSS();
  container.innerHTML = '';
  container.classList.add('timetable');
  container.style.height = `${DAY_PX}px`;
  container.style.overflowY = 'auto';

  const gutter = document.createElement('div'); gutter.className = 'gutter';
  const track = document.createElement('div'); track.className = 'track';
  container.append(gutter, track);

  for (let h = 0; h < 24; h++) {
    const y = h * ROW;
    const gl = document.createElement('div'); gl.className = 'gridline'; gl.style.top = `${y}px`; track.appendChild(gl);
    const mark = document.createElement('div'); mark.className = 'hourmark'; mark.style.top = `${y}px`;
    const lab = document.createElement('div'); lab.className = 'hlabel'; lab.textContent = String(h); mark.appendChild(lab);
    track.appendChild(mark);
  }
  return track;
}

// Minutes within current view day
function minutesWithinDay(isoStart, isoEnd, viewDate) {
  const base0 = new Date(`${viewDate}T00:00:00`);
  const s = new Date(isoStart);
  const e = new Date(isoEnd);
  let sMin = Math.round((s - base0) / 60000);
  let eMin = Math.round((e - base0) / 60000);
  sMin = Math.max(0, Math.min(DAY_MIN, sMin));
  eMin = Math.max(0, Math.min(DAY_MIN, eMin));
  if (eMin - sMin < 10) eMin = Math.min(DAY_MIN, sMin + 10);
  return { sMin, eMin };
}

// Column layout for overlapped segments
function layoutColumns(items, viewDate) {
  const S = it => minutesWithinDay(it.startAt, it.endAt, viewDate).sMin;
  const E = it => minutesWithinDay(it.startAt, it.endAt, viewDate).eMin;
  const arr = items.slice().sort((a, b) => S(a) - S(b) || E(a) - E(b));
  let active = [], cluster = [], clusters = [];
  const flush = () => { if (!cluster.length) return; const cols = 1 + Math.max(...cluster.map(x => x._col || 0)); cluster.forEach(x => x._cols = cols); clusters.push(cluster); cluster = []; };
  for (const it of arr) {
    const s = S(it);
    active = active.filter(a => E(a) > s);
    if (active.length === 0) flush();
    const used = new Set(active.map(a => a._col)); let c = 0; while (used.has(c)) c++; it._col = c;
    active.push(it); cluster.push(it);
  }
  flush();
  return arr;
}

function drawItem(track, it, viewDate) {
  const { sMin, eMin } = minutesWithinDay(it.startAt, it.endAt, viewDate);
  const px = ROW / 60, gap = 8;
  const box = document.createElement('div'); box.className = 'item';
  box.style.top = `${sMin * px}px`; box.style.height = `${(eMin - sMin) * px}px`;
  const cols = it._cols || 1, col = it._col || 0; const wPct = 100 / cols, lPct = wPct * col;
  box.style.left = `calc(${lPct}% + 2px)`;
  box.style.width = `calc(${wPct}% - ${gap}px)`;
  box.innerHTML = `<h5>${it.title || '(제목 없음)'}</h5><time>${hhmm(it.startAt)} – ${hhmm(it.endAt)}</time>`;
  track.appendChild(box);
}

// ---------- Refresh/Add ----------
async function refresh(date) {
  try {
    $("#dayLabel") && ($("#dayLabel").textContent = date);
    const segs = await apiListForView(date); // segments for this day only

    const ul = $("#scheduleList");
    if (ul) {
      ul.innerHTML = '';
      segs.forEach(it => {
        const li = document.createElement('li');
        li.textContent = `[${hhmm(it.startAt)}–${hhmm(it.endAt)}] ${it.title || '(제목 없음)'}`;
        ul.appendChild(li);
      });
    }

    const track = renderHours($("#timetable"));
    const laid = layoutColumns(segs, date);
    laid.forEach(it => drawItem(track, it, date));
    toast('');
  } catch (e) {
    console.error(e);
    toast('Refresh failed: ' + e.message);
  }
}

async function apiAdd({ date, title, startAt, endAt }) {
  const r = await fetch('/api/schedule', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, title, startAt, endAt })
  });
  if (!r.ok) { const t = await r.text(); throw new Error(t || 'add failed'); }
  return r.json();
}

async function onAdd() {
  const date = $('#scheduleDate')?.value;
  const title = $('#scheduleTitle')?.value?.trim();
  const start = $('#scheduleStart')?.value;
  const end = $('#scheduleEnd')?.value;
  if (!date) return toast('날짜를 선택하세요');
  if (!title) return toast('제목을 입력하세요');
  if (!start) return toast('시작 시간을 입력하세요');

  // Cross midnight: bump end date if end <= start
  let endDate = date;
  if (end && hmToMin(end) <= hmToMin(start)) endDate = addDays(date, 1);

  try {
    await apiAdd({ date, title, startAt: localDT(date, start), endAt: end ? localDT(endDate, end) : null });
    toast('저장됨 ✓'); $('#scheduleTitle').value = '';
    await refresh(date);
  } catch (e) { toast('저장 실패: ' + e.message); }
}

// ---------- Mount ----------
document.addEventListener('DOMContentLoaded', async () => {
  const di = $('#scheduleDate'); if (di && !di.value) di.value = fmtDate(new Date());
  $('#scheduleAdd')?.addEventListener('click', onAdd);
  $('#scheduleRefresh')?.addEventListener('click', async () => refresh($('#scheduleDate').value));
  $('#scheduleDate')?.addEventListener('change', e => refresh(e.target.value));
  $('#prevDay')?.addEventListener('click', async () => {
    const d = parseDate($('#scheduleDate').value); d.setDate(d.getDate() - 1);
    const s = fmtDate(d); $('#scheduleDate').value = s; await refresh(s);
  });
  $('#nextDay')?.addEventListener('click', async () => {
    const d = parseDate($('#scheduleDate').value); d.setDate(d.getDate() + 1);
    const s = fmtDate(d); $('#scheduleDate').value = s; await refresh(s);
  });
  $('#todayDay')?.addEventListener('click', async () => {
    const s = fmtDate(new Date()); $('#scheduleDate').value = s; await refresh(s);
  });

  await refresh($('#scheduleDate')?.value || fmtDate(new Date()));
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } finally {
    location.href = '/index.html';
  }
});