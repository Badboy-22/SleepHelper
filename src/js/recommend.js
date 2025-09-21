const $ = s => document.querySelector(s);
const toISO = d => d.toISOString().slice(0, 10);

async function getDaySchedule(date) {
  const r = await fetch(`/api/schedule?date=${encodeURIComponent(date)}`);
  if (!r.ok) return [];
  const { items = [] } = await r.json();
  return items;
}
async function getRecentFatigue(days = 7) {
  const end = new Date(); const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(end); d.setDate(end.getDate() - i);
    const iso = toISO(d);
    const r = await fetch(`/api/sleep?date=${iso}`);
    if (r.ok) { const data = await r.json(); if (data?.fatigue !== null && data?.fatigue !== undefined) { out.push({ date: iso, value: data.fatigue }); } }
  }
  return out;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('askGemini')?.addEventListener('click', async () => {
    const sleepAt = document.getElementById('sleepAt').value || null;
    const wake = document.getElementById('wakeTime').value || null;
    const notes = document.getElementById('notes').value || '';
    const date = toISO(new Date());

    const resultBox = document.getElementById('resultBox');
    resultBox.textContent = 'Thinking…';

    const [schedToday, schedTomorrow, fatigue] = await Promise.all([
      getDaySchedule(date),
      getDaySchedule(toISO(new Date(new Date().getTime() + 86400000))),
      getRecentFatigue(7)
    ]);

    const payload = {
      userInputs: { date, sleepAt, wakeTime: wake, notes },
      schedule: { [date]: schedToday, nextDay: schedTomorrow },
      fatigue
    };

    try {
      const r = await fetch('/api/gemini/recommend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (r.ok) {
        const data = await r.json();
        const text = data?.text || data?.result || data?.content || JSON.stringify(data, null, 2);
        resultBox.textContent = text;
      } else {
        throw new Error('endpoint not found');
      }
    } catch (e) {
      resultBox.textContent = 'Could not reach /api/gemini/recommend. Please add the route.\n\nPayload preview:\n' + JSON.stringify(payload, null, 2);
    }
  });

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } finally { location.href = '/src/html/main.html'; }
  });
});
