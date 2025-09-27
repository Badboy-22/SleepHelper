
// recommend.js (client) — sends top-level fields expected by /api/gemini/recommend
const $ = (s) => document.querySelector(s);
const toISO = (d) => d.toISOString().slice(0, 10);

async function getDaySchedule(date) {
  try {
    const r = await fetch(`/api/schedule?date=${encodeURIComponent(date)}`, { credentials: 'same-origin' });
    if (!r.ok) return [];
    const { items = [] } = await r.json();
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

async function getRecentFatigue(days = 7) {
  const end = new Date();
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const iso = toISO(d);
    try {
      const r = await fetch(`/api/sleep?date=${iso}`, { credentials: 'same-origin' });
      if (r.ok) {
        const data = await r.json();
        if (data && data.fatigue !== undefined && data.fatigue !== null) {
          out.push({ date: iso, value: data.fatigue });
        }
      }
    } catch {}
  }
  return out;
}

async function onAskGemini(e) {
  e.preventDefault();
  const sleepWindowStart = $('#sleepAt')?.value?.trim() || '';
  const wakeTime         = $('#wakeTime')?.value?.trim() || '';
  const notes            = $('#notes')?.value?.trim() || '';
  const date             = toISO(new Date()); // 오늘(KST는 서버에서 보정)

  const HHMM = /^\d{2}:\d{2}$/;
  if (!HHMM.test(sleepWindowStart) || !HHMM.test(wakeTime)) {
    alert('시간은 HH:MM 형식(예: 22:30)으로 입력해 주세요.');
    return;
  }

  const resultBox = $('#resultBox');
  if (resultBox) resultBox.textContent = '요청 중…';

  // 참고 데이터(옵션)
  let clientSchedule = null;
  let clientFatigue = null;
  try {
    const [schedToday, schedTomorrow, fatigue] = await Promise.all([
      getDaySchedule(date),
      getDaySchedule(toISO(new Date(Date.now() + 86400000))),
      getRecentFatigue(7),
    ]);
    clientSchedule = { [date]: schedToday, nextDay: schedTomorrow };
    clientFatigue = fatigue;
  } catch {}

  try {
    const r = await fetch('/api/gemini/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        // 서버가 요구하는 최상위 필드
        sleepWindowStart,
        wakeTime,
        date,
        notes,
        // 참조용(옵션)
        schedule: clientSchedule,
        fatigue: clientFatigue,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data?.error || data?.message || '요청 실패';
      throw new Error(`${r.status} ${msg}`);
    }
    const text = data?.text ?? data?.result ?? data?.content ?? JSON.stringify(data, null, 2);
    if (resultBox) resultBox.textContent = text;
  } catch (err) {
    if (resultBox) resultBox.textContent = `요청 실패: ${err.message}`;
    console.error(err);
  }
}

function hookLogout() {
  $('#logoutBtn')?.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      location.href = '/index.html';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  $('#askGemini')?.addEventListener('click', onAskGemini);
  hookLogout();
});
