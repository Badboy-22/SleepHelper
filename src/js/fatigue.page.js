// fatigue.page.js — split from infos.js
async function WhoAmI(){
  const r = await fetch('/api/auth/me', { credentials: 'include' });
  if(!r.ok) return null;
  const { user } = await r.json().catch(()=>({user:null}));
  return user || null;
}
function dateKey(iso){ try{ return new Date(iso).toISOString().slice(0,10);}catch{return 'unknown';} }
function setActiveTab(btn){
  document.querySelectorAll('#fatigueTypeTabs .tab').forEach(el=>{
    el.classList.toggle('active', el===btn);
    el.setAttribute('aria-selected', el===btn ? 'true' : 'false');
  });
}

async function FetchFatigueList(limit=200){
  const r = await fetch(`/api/fatigue?limit=${limit}`, { credentials:'include' });
  const data = await r.json().catch(()=>({items:[]}));
  return data.items || [];
}
function RenderFatigueListByDate(container, items){
  const groups = items.reduce((acc, it)=>{
    const k = dateKey(it.recordedAt);
    (acc[k] ||= []).push(it);
    return acc;
  }, {});
  const keys = Object.keys(groups).sort((a,b)=> a<b?1:-1);
  container.innerHTML = '';
  if(!keys.length){
    container.innerHTML = '<div class="small">기록이 없습니다.</div>';
    return;
  }
  keys.forEach(k=>{
    const box = document.createElement('div');
    box.className = 'group';
    const h = document.createElement('div');
    h.className = 'group-title';
    h.textContent = k;
    box.appendChild(h);
    groups[k].sort((a,b)=> new Date(b.recordedAt) - new Date(a.recordedAt));
    groups[k].forEach(it=>{
      const row = document.createElement('div');
      row.className = 'list-item';
      row.textContent = `${new Date(it.recordedAt).toLocaleTimeString()} · ${it.type} · ${it.value}${it.note? ' · '+it.note:''}`;
      box.appendChild(row);
    });
    const hr = document.createElement('div'); hr.className='hr';
    container.appendChild(box); container.appendChild(hr);
  });
}

async function SaveFatigueRequest(payload){
  const r = await fetch('/api/fatigue', {
    method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(()=>({}));
  return { ok: r.ok, data };
}

document.addEventListener('DOMContentLoaded', async ()=>{
  const me = await WhoAmI(); if(!me){ location.href='/login.html'; return; }

  const typeTabs = document.getElementById('fatigueTypeTabs');
  let currentType = 'before';
  typeTabs.querySelectorAll('.tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{ currentType = btn.dataset.type; setActiveTab(btn); });
  });

  const valueEl = document.getElementById('fatigueValueInput');
  const dateEl = document.getElementById('fatigueDateInput');
  const noteEl = document.getElementById('fatigueNoteInput');
  const msgEl = document.getElementById('fatigueMessage');
  const listEl = document.getElementById('fatigueListContainer');
  const statusEl = document.getElementById('fatigueStatus');

  // defaults
  dateEl.value = new Date().toISOString().slice(0,10);

  // save
  document.getElementById('fatigueSaveBtn').addEventListener('click', async ()=>{
    const value = Number(valueEl.value);
    const date = dateEl.value || new Date().toISOString().slice(0,10);
    const note = noteEl.value || null;
    if(!(Number.isFinite(value) && value>=0 && value<=100)){ msgEl.textContent = '0~100 숫자만 입력'; return; }
    msgEl.textContent='저장 중...';

    const { ok, data } = await SaveFatigueRequest({
      type: currentType, value, date, note, recordedAt: new Date().toISOString(),
    });
    msgEl.textContent = ok ? 'Saved.' : (data.error || 'error');
    if(ok){ valueEl.value=''; noteEl.value=''; const items = await FetchFatigueList(); RenderFatigueListByDate(listEl, items); }
  });

  // refresh
  document.getElementById('fatigueRefreshBtn').addEventListener('click', async ()=>{
    statusEl.textContent='불러오는 중...';
    const items = await FetchFatigueList();
    RenderFatigueListByDate(listEl, items);
    statusEl.textContent='';
  });

  // initial load
  document.getElementById('fatigueRefreshBtn').click();
});
