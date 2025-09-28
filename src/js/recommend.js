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
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
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
  const t = parseTimeToHHMM(document.querySelector('#timeInput')?.value || '');
  const solMin = parseInt(document.querySelector('#solMin')?.value || '20', 10);
  const out = document.querySelector('#resultText');
  const btn = document.querySelector('#askBtn');

  if (!t) { out.textContent = '시간을 HH:MM 형식으로 입력해 주세요.'; return; }

  // helpers
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const addMin = (d, m) => new Date(d.getTime() + m * 60000);
  const subtractMin = (d, m) => new Date(d.getTime() - m * 60000);
  const diffMin = (a, b) => Math.round((b.getTime() - a.getTime()) / 60000);
  const durTxt = (min) => {
    const h = Math.floor(Math.abs(min) / 60), m = Math.abs(min) % 60;
    return `${h}시간${m ? ' ' + m + '분' : ''}`;
  };
  const pickMetaTime = (meta, keys) => {
    if (!meta) return null;
    for (const k of keys) {
      const v = meta[k];
      if (!v) continue;
      const iso = typeof v === 'string' ? v.replace(' ', 'T') : v;
      const d = new Date(iso);
      if (!isNaN(d)) return d;
    }
    return null;
  };
  // 텍스트에서 시간 뽑기: "23:39 취침, 08:39 기상" / "취침 23:39, 기상 08:39" 등 모두 지원
  function extractTimesFromText(text) {
    if (!text) return null;
    const hhmm = '([01]?\\d|2[0-3]):([0-5]\\d)';
    const rx1 = new RegExp(`${hhmm}\\s*취침`, 'g');      // 23:39 취침
    const rx2 = new RegExp(`취침\\s*${hhmm}`, 'g');      // 취침 23:39
    const rx3 = new RegExp(`${hhmm}\\s*기상`, 'g');      // 08:39 기상
    const rx4 = new RegExp(`기상\\s*${hhmm}`, 'g');      // 기상 08:39

    let bedHM = null, wakeHM = null, m;

    const getHM = (arr) => `${arr[1].padStart(2, '0')}:${arr[2]}`;

    if ((m = rx1.exec(text))) bedHM = getHM(m);
    if (!bedHM && (m = rx2.exec(text))) bedHM = getHM(m);
    if ((m = rx3.exec(text))) wakeHM = getHM(m);
    if (!wakeHM && (m = rx4.exec(text))) wakeHM = getHM(m);

    if (bedHM && wakeHM) return { bedHM, wakeHM };
    return null;
  }
  function hmToDate(hm) {
    const [H, M] = hm.split(':').map(Number);
    const d = new Date();
    d.setHours(H, M, 0, 0);
    return d;
  }

  try {
    btn && (btn.disabled = true);
    out.textContent = '추천 생성 중...';

    const res = await fetch('/api/gemini/recommend', { // ← 이 줄은 네가 쓰는 경로로 유지
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': '*/*' },
      credentials: 'same-origin',
      body: JSON.stringify(mode === 'wake' ? { wakeTime: t, solMin } : { sleepWindowStart: t, solMin })
    });

    if (!res.ok) { out.textContent = `요청 실패: ${res.status}`; return; }

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    let answerText = '', meta = null;

    if (ct.includes('application/json')) {
      const j = await res.json().catch(() => null);
      answerText = (j && (j.answer || j.text || j.message)) || '';
      meta = j && j.meta ? j.meta : null;
    } else {
      answerText = await res.text();
    }

    // 1) meta에서 취침/기상 찾기
    let bed = pickMetaTime(meta, ['bed', 'minBed', 'sleepStart', 'bedTime']);
    let wake = pickMetaTime(meta, ['wake', 'wakeTime', 'sleepEnd']);

    // 2) meta가 없으면 텍스트에서 추출
    if (!(bed && wake)) {
      const got = extractTimesFromText(answerText);
      if (got) {
        const { bedHM, wakeHM } = got;
        bed = hmToDate(bedHM);
        wake = hmToDate(wakeHM);
        // 자정 넘김 보정(예: 23:39 → 08:39)
        if (wake <= bed) wake = addMin(wake, 24 * 60);
      }
    }

    let header = '';
    if (bed && wake) {
      const baseDur = diffMin(bed, wake); // 분
      if (baseDur > 0) {
        if (mode === 'wake') {
          // 기상 고정 → 취침 +90분 (수면 -90분). 불가능하면 B 생략
          if (baseDur > 90) {
            const bedLate = subtractMin(bed, 90);
            const durLate = baseDur - 90;
            header =
              `✅ 옵션 A: ${fmt(bed)} 취침 → ${fmt(wake)} 기상 (총 ${durTxt(baseDur)})\n` +
              `🕘 옵션 B: ${fmt(bedLate)} 취침 → ${fmt(wake)} 기상 (총 ${durTxt(durLate)})`;
          } else {
            header = `✅ 옵션: ${fmt(bed)} 취침 → ${fmt(wake)} 기상 (총 ${durTxt(baseDur)})`;
          }
        } else {
          // 취침 고정 → 기상 +90분 (수면 +90분)
          const wakeLate = subtractMin(wake, 90);
          const durLate = baseDur - 90;
          header =
            `✅ 옵션 A: ${fmt(bed)} 취침 → ${fmt(wake)} 기상 (총 ${durTxt(baseDur)})\n` +
            `🕘 옵션 B: ${fmt(bed)} 취침 → ${fmt(wakeLate)} 기상 (총 ${durTxt(durLate)})`;
        }
      }
    }

    out.textContent = header ? `${header}\n\n${answerText || ''}`.trim() : (answerText || '추천 생성 완료');

  } catch (err) {
    out.textContent = '요청 실패: ' + (err?.message || String(err));
  } finally {
    btn && (btn.disabled = false);
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
