// fatigue.js (refresh fix: use only /api/fatigue?from&to)
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2,'0');
const toISODate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

async function fetchRange(fromISO, toISO){
  const r = await fetch(`/api/fatigue?from=${fromISO}&to=${toISO}`);
  if(!r.ok){
    // fallback to legacy sleep endpoint day-by-day
    const out=[];
    const start = new Date(fromISO+"T00:00:00");
    const end = new Date(toISO+"T00:00:00");
    for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
      const iso = toISODate(d);
      const rr= await fetch(`/api/sleep?date=${iso}`);
      if(rr.ok){ const v=await rr.json(); if(v?.fatigue!=null){ out.push({ date: iso, value: v.fatigue }); } }
    }
    return out;
  }
  const data = await r.json();
  const arr = Array.isArray(data) ? data : (data.items || []);
  return arr;
}

function renderList(items){
  const ul = document.getElementById('fgList'); ul.innerHTML='';
  if(!items.length){ ul.innerHTML='<li>No entries</li>'; return; }
  items.sort((a,b)=> (a.date||'').localeCompare(b.date||''));
  for(const it of items){
    const li=document.createElement('li'); li.textContent=`${it.date}: ${it.value}${it.type?` (${it.type})`:''}`;
    ul.appendChild(li);
  }
}

async function loadRecent(){
  const end = new Date();
  const start = new Date(); start.setDate(end.getDate()-6);
  const list = await fetchRange(toISODate(start), toISODate(end));
  renderList(list);
}

async function onAdd(){
  const type=$('#fgType').value;
  const value=Number($('#fgValue').value);
  const hint=m=>{ const el=$('#fgHint'); if(el) el.textContent=m; };
  if(Number.isNaN(value)) return hint('Enter 0–100');
  try{
    const r=await fetch('/api/fatigue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,value})});
    if(!r.ok) throw new Error(await r.text());
    hint('Saved ✓'); await loadRecent();
  }catch(e){ console.error(e); hint('Save failed: '+e.message); }
}

document.addEventListener('DOMContentLoaded', ()=>{
  $('#fgAdd')?.addEventListener('click', onAdd);
  $('#fgRefresh')?.addEventListener('click', loadRecent);
  document.getElementById('logoutBtn')?.addEventListener('click', async ()=>{
    try{ await fetch('/api/auth/logout',{method:'POST'});}finally{ location.href='/src/html/main.html'; }
  });
  loadRecent();
});
