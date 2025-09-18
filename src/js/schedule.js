// schedule.js (local time + overlap layout + nav fix)
const $  = s => document.querySelector(s);

// Local date helpers
const pad = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseDate = (s) => { const [y,m,d] = (s||'').split('-').map(Number); return new Date(y,(m||1)-1,d||1); };

async function apiList(date){
  const r=await fetch(`/api/schedule?date=${encodeURIComponent(date)}`);
  if(!r.ok) throw new Error('list failed');
  const {items=[]}=await r.json();
  // normalize 0-length items to 30min so they render
  items.forEach(it=>{
    if(it.startAt && !it.endAt){
      const d=new Date(it.startAt); d.setMinutes(d.getMinutes()+30); it.endAt=d.toISOString();
    }
  });
  // sort by start
  return items.sort((a,b)=>(a.startAt||'').localeCompare(b.startAt||''));
}
async function apiAdd({date,title,startAt,endAt}){
  const r=await fetch('/api/schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date,title,startAt,endAt})});
  if(!r.ok){ const t=await r.text(); throw new Error(t||'add failed'); }
  return r.json();
}

const hhmm=(iso)=>{ if(!iso) return '--:--'; const d=new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
// store as local time (no Z)
const tie=(date,hm)=>hm?`${date}T${hm}:00`:null;

function renderHours(container){
  container.innerHTML='';
  container.classList.add('timetable');
  const hours=document.createElement('div'); hours.className='hours';
  const track=document.createElement('div'); track.className='track';
  container.append(hours,track);
  for(let h=0;h<24;h++){
    const row=document.createElement('div'); row.className='hour'; row.style.top=`${h*35}px`; row.innerHTML=`<strong>${h}</strong>`;
    const gl=document.createElement('div'); gl.className='gridline'; gl.style.top=`${h*35}px`; track.appendChild(gl);
    hours.appendChild(row);
  }
  return track;
}

// Layout overlapping items into columns
function layoutColumns(items){
  const startM = iso => { const d=new Date(iso); return d.getHours()*60 + d.getMinutes(); };
  const endM = iso => { const d=new Date(iso); return d.getHours()*60 + d.getMinutes(); };

  let groups=[]; let active=[]; let currentGroup=[]; let groupId=0;

  const flushGroup=()=>{
    if(currentGroup.length){
      const cols = 1 + Math.max(...currentGroup.map(it=>it._col||0));
      currentGroup.forEach(it => it._cols = cols);
      groups.push({ id: groupId++, items: currentGroup.slice(), cols });
      currentGroup = [];
    }
  };

  const takeFreeCol = (used) => {
    let c=0; while(used.has(c)) c++; return c;
  };

  const byStart = items.slice().sort((a,b)=>startM(a.startAt)-startM(b.startAt) || endM(a.endAt)-endM(b.endAt));

  for(const it of byStart){
    // remove all finished from active
    active = active.filter(a => endM(a.endAt) > startM(it.startAt));
    const used = new Set(active.map(a=>a._col));
    it._col = takeFreeCol(used);
    active.push(it);

    // continue same group while there's overlap chain
    currentGroup.push(it);
    // If next will not overlap with any of current actives, we will flush later in caller
  }

  // determine groups by scanning again: whenever an item starts after all previous end, flush
  active=[]; currentGroup=[]; groups=[]; groupId=0;
  for(const it of byStart){
    // pop finished from active
    active = active.filter(a => endM(a.endAt) > startM(it.startAt));
    // if active empty -> new group boundary
    if(active.length===0 && currentGroup.length){
      const cols = 1 + Math.max(...currentGroup.map(x=>x._col||0));
      currentGroup.forEach(x => x._cols = cols);
      groups.push({ id: groupId++, items: currentGroup.slice(), cols });
      currentGroup = [];
    }
    currentGroup.push(it);
    active.push(it);
  }
  if(currentGroup.length){
    const cols = 1 + Math.max(...currentGroup.map(x=>x._col||0));
    currentGroup.forEach(x => x._cols = cols);
    groups.push({ id: groupId++, items: currentGroup.slice(), cols });
  }

  return byStart;
}

function drawItem(track,it){
  const px=35/60;
  const mins=(iso)=>{ const d=new Date(iso); return d.getHours()*60+d.getMinutes(); };
  const s=mins(it.startAt), e=mins(it.endAt);
  const G=6; // gap px between columns

  const box=document.createElement('div'); box.className='item';
  box.style.top=`${s*px}px`; box.style.height=`${Math.max(18,(e-s)*px)}px`;

  const cols = it._cols || 1, col = it._col || 0;
  const widthPct = 100/cols;
  const leftPct  = widthPct*col;

  box.style.left  = `calc(${leftPct}% + 2px)`;
  box.style.width = `calc(${widthPct}% - ${G}px)`;
  box.style.right = ""; // override CSS 'right:8px'

  box.innerHTML=`<h5>${it.title||'(no title)'}</h5><time>${hhmm(it.startAt)} – ${hhmm(it.endAt)}</time>`;
  track.appendChild(box);
}

async function refresh(date){
  document.getElementById('dayLabel').textContent=date;
  const items=await apiList(date);
  const withLayout = layoutColumns(items);
  const ul=document.getElementById('scheduleList'); ul.innerHTML='';
  withLayout.forEach(it=>{ const li=document.createElement('li'); li.textContent=`[${hhmm(it.startAt)}–${hhmm(it.endAt)}] ${it.title||'(no title)'}`; ul.appendChild(li); });
  const track=renderHours(document.getElementById('timetable'));
  withLayout.forEach(it=>drawItem(track,it));
}

async function onAdd(){
  const date=$('#scheduleDate')?.value;
  const title=$('#scheduleTitle')?.value?.trim();
  const start=$('#scheduleStart')?.value;
  const end=$('#scheduleEnd')?.value;
  if(!date) return toast('Pick a date');
  if(!title) return toast('Enter a title');
  try{
    await apiAdd({date,title,startAt:tie(date,start),endAt:tie(date,end)});
    toast('Saved ✓'); $('#scheduleTitle').value='';
    await refresh(date);
  }catch(e){ toast('Add failed: '+e.message); }
}
function toast(m){ const el=document.getElementById('scheduleHint'); if(el) el.textContent=m; }

document.addEventListener('DOMContentLoaded', async ()=>{
  const di=document.getElementById('scheduleDate');
  if(di && !di.value) di.value=fmtDate(new Date());

  document.getElementById('scheduleAdd')?.addEventListener('click', onAdd);
  document.getElementById('scheduleRefresh')?.addEventListener('click', async ()=>{ await refresh($('#scheduleDate').value); });
  document.getElementById('scheduleDate')?.addEventListener('change', e=>refresh(e.target.value));

  document.getElementById('prevDay')?.addEventListener('click', async ()=>{
    const d=parseDate($('#scheduleDate').value); d.setDate(d.getDate()-1);
    const s=fmtDate(d); $('#scheduleDate').value=s; await refresh(s);
  });
  document.getElementById('nextDay')?.addEventListener('click', async ()=>{
    const d=parseDate($('#scheduleDate').value); d.setDate(d.getDate()+1);
    const s=fmtDate(d); $('#scheduleDate').value=s; await refresh(s);
  });
  document.getElementById('todayDay')?.addEventListener('click', async ()=>{
    const s=fmtDate(new Date()); $('#scheduleDate').value=s; await refresh(s);
  });

  document.getElementById('logoutBtn')?.addEventListener('click', async ()=>{
    try{ await fetch('/api/auth/logout',{method:'POST'});}finally{ location.href='/src/html/main.html'; }
  });

  await refresh(document.getElementById('scheduleDate')?.value || fmtDate(new Date()));
});
