// schedule.page.js — split from infos.js
async function WhoAmI(){
  const r = await fetch('/api/auth/me', { credentials:'include' });
  if(!r.ok) return null;
  const { user } = await r.json().catch(()=>({user:null}));
  return user || null;
}
function toISO(dt){ if(!dt) return null; try{ return new Date(dt).toISOString(); }catch{return null;} }
function displayTime(iso){ if(!iso) return ''; return iso.replace('T',' ').slice(0,16); }

async function FetchScheduleForDate(yyyyMmDd){
  const r = await fetch(`/api/schedule?date=${yyyyMmDd}`, { credentials:'include' });
  const data = await r.json().catch(()=>({items:[]}));
  return data.items || [];
}
function RenderScheduleList(container, items){
  container.innerHTML = items.length ? '' : '<li>일정 없음</li>';
  items.forEach(it=>{
    const li = document.createElement('li');
    li.innerHTML = `<span class="time">${displayTime(it.start)} ~ ${displayTime(it.end)}</span> · ${it.title||''}`;
    container.appendChild(li);
  });
}

async function SaveScheduleRequest(payload){
  const r = await fetch('/api/schedule', {
    method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(()=>({}));
  return { ok: r.ok, data };
}

document.addEventListener('DOMContentLoaded', async ()=>{
  const me = await WhoAmI(); if(!me){ location.href='/login.html'; return; }

  const titleEl = document.getElementById('scheduleTitleInput');
  const startEl = document.getElementById('scheduleStartInput');
  const endEl   = document.getElementById('scheduleEndInput');
  const noteEl  = document.getElementById('scheduleNoteInput');
  const msgEl   = document.getElementById('scheduleMessage');
  const viewDateEl = document.getElementById('scheduleViewDateInput');
  const listEl  = document.getElementById('schedule-list');
  const statusEl= document.getElementById('scheduleStatus');

  viewDateEl.value = new Date().toISOString().slice(0,10);

  document.getElementById('scheduleSaveBtn').addEventListener('click', async ()=>{
    const title = (titleEl.value||'').trim();
    const start = toISO(startEl.value);
    const end   = toISO(endEl.value);
    const note  = noteEl.value || null;
    if(!title){ msgEl.textContent='제목을 입력하세요'; return; }
    if(!start || !end){ msgEl.textContent='시작/종료를 입력하세요'; return; }
    msgEl.textContent='저장 중...';
    const { ok, data } = await SaveScheduleRequest({ title, start, end, note });
    msgEl.textContent = ok ? 'Saved.' : (data.error || 'error');
    if(ok){
      titleEl.value=''; startEl.value=''; endEl.value=''; noteEl.value='';
      const items = await FetchScheduleForDate(viewDateEl.value);
      RenderScheduleList(listEl, items);
    }
  });

  async function refresh(){
    statusEl.textContent='불러오는 중...';
    const items = await FetchScheduleForDate(viewDateEl.value);
    RenderScheduleList(listEl, items);
    statusEl.textContent='';
  }
  document.getElementById('scheduleRefreshBtn').addEventListener('click', refresh);
  viewDateEl.addEventListener('change', refresh);

  // initial
  await refresh();
});
