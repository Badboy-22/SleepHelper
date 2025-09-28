// recommend.js — single input, plain text only
const $ = (s) => document.querySelector(s);

function parseTimeToHHMM(s) {
  if (!s) return null;
  const t = String(s).trim();
  let m = t.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);
  if (m) {
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ap = m[3].toLowerCase();
    if (ap === 'pm' && hh < 12) hh += 12;
    if (ap === 'am' && hh === 12) hh = 0;
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  }
  m = t.match(/^(\d{2}):(\d{2})$/);
  return m ? t : null;
}

function updateModeUI() {
  const mode = document.querySelector('input[name="mode"]:checked')?.value || 'wake';
  const label = $('#timeLabel');
  const input = $('#timeInput');
  if (mode === 'wake') {
    label.textContent = '언제 일어나야 하나요?';
    input.placeholder = '07:00';
  } else {
    label.textContent = '몇시부터 잘 수 있나요?';
    input.placeholder = '23:00';
  }
  input.value = '';
}

async function onAsk(e) {
  e?.preventDefault();
  const mode = document.querySelector('input[name="mode"]:checked')?.value || 'wake';
  const t = parseTimeToHHMM($('#timeInput')?.value || '');
  const solMin = parseInt($('#solMin')?.value || '20', 10);
  const out = $('#resultText');
  const btn = $('#askBtn');

  if (!t) { out.textContent = '시간을 HH:MM 형식으로 입력해 주세요.'; return; }

  const payload = mode === 'wake'
    ? { wakeTime: t, solMin }
    : { sleepWindowStart: t, solMin };

  try {
    if (btn) btn.disabled = true;
    out.textContent = '추천 생성 중...';

    const res = await fetch('/api/gemini/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/plain' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json')) {
      const j = await res.json();
      out.textContent = j?.answer || JSON.stringify(j, null, 2);
    } else {
      out.textContent = await res.text();
    }
  } catch (err) {
    out.textContent = '요청 실패: ' + (err?.message || String(err));
  } finally {
    if (btn) btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', updateModeUI));
  updateModeUI();
  $('#solMin')?.addEventListener('input', () => { $('#solVal').textContent = `${$('#solMin').value}분`; });
  $('#askBtn')?.addEventListener('click', onAsk);
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } finally {
    location.href = '/index.html';
  }
});