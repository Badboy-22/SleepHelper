// fatigue.page.js
function $(id){ return document.getElementById(id); }
async function whoAmI(){ const r=await fetch('/api/auth/me',{credentials:'include'}); if(!r.ok) return null; const {user}=await r.json().catch(()=>({user:null})); return user||null; }
function byDateKey(iso){ try{ return new Date(iso).toISOString().slice(0,10);}catch{return 'unknown';} }
function setActive(tab){ document.querySelectorAll('.tab').forEach(el=>{ el.classList.toggle('active', el===tab); el.setAttribute('aria-selected', el===tab? 'true':'false'); }); }
async function loadGroups(){
  $('fatigue-status').textContent='불러오는 중...';
  const r=await fetch('/api/fatigue?limit=200',{credentials:'include'});
  const data=await r.json().catch(()=>({items:[]})); const items=data.items||[];
  const groups=items.reduce((acc,it)=>{ const k=byDateKey(it.recordedAt); (acc[k] ||= []).push(it); return acc; },{});
  const keys=Object.keys(groups).sort((a,b)=> a<b?1:-1);
  const wrap=$('fatigue-groups'); wrap.innerHTML='';
  if(!keys.length){ wrap.innerHTML='<div class="small">기록이 없습니다.</div>'; $('fatigue-status').textContent=''; return; }
  keys.forEach(k=>{ const box=document.createElement('div'); box.className='group'; const h=document.createElement('h4'); h.textContent=k; box.appendChild(h);
    groups[k].sort((a,b)=> new Date(b.recordedAt)-new Date(a.recordedAt));
    groups[k].forEach(it=>{ const row=document.createElement('div'); row.className='list-item'; row.textContent=`${new Date(it.recordedAt).toLocaleTimeString()} · ${it.type} · ${it.value}${it.note? ' · '+it.note:''}`; box.appendChild(row); });
    const hr=document.createElement('div'); hr.className='hr'; wrap.appendChild(box); wrap.appendChild(hr); });
  $('fatigue-status').textContent='';
}
document.addEventListener('DOMContentLoaded', async ()=>{
  const me=await whoAmI(); if(!me){ location.href='/login.html'; return; }
  $('fatigue-date').value=new Date().toISOString().slice(0,10);
  let currentType='before';
  document.querySelectorAll('.tab').forEach(btn=> btn.addEventListener('click', ()=>{ currentType=btn.dataset.type; setActive(btn); }));
  $('fatigue-save').addEventListener('click', async ()=>{
    const v=Number($('fatigue-value').value); const d=$('fatigue-date').value||new Date().toISOString().slice(0,10); const note=$('fatigue-note').value||null;
    if(!(Number.isFinite(v)&&v>=0&&v<=100)){ $('fatigue-msg').textContent='0~100 숫자만 입력'; return; }
    $('fatigue-msg').textContent='저장 중...';
    const r=await fetch('/api/fatigue',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({type:currentType,value:v,date:d,note,recordedAt:new Date().toISOString()})});
    const data=await r.json().catch(()=>({})); $('fatigue-msg').textContent=r.ok?'Saved.':(data.error||'error');
    if(r.ok){ $('fatigue-value').value=''; $('fatigue-note').value=''; await loadGroups(); }
  });
  $('fatigue-refresh').addEventListener('click', loadGroups);
  await loadGroups();
  $('logout').addEventListener('click', async ()=>{ await fetch('/api/auth/logout',{method:'POST'}); location.href='/login.html'; });
});