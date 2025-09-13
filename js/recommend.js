// recommend.js
document.addEventListener('DOMContentLoaded', ()=>{
  const d=document.getElementById('rc-date'); const n=document.getElementById('rc-note');
  const b=document.getElementById('rc-btn'); const o=document.getElementById('rc-out'); const m=document.getElementById('rc-msg');
  d.value=new Date().toISOString().slice(0,10);
  b.addEventListener('click', async ()=>{
    m.textContent='요청 중...'; o.innerHTML='';
    try{ const r=await fetch(`/api/recommend?date=${d.value}&note=${encodeURIComponent(n.value||'')}`);
      if(!r.ok){ m.textContent='서버 응답 실패'; return; }
      const data=await r.json().catch(()=>({}));
      const items=data.items||data.recommendations||[data.text||'결과 없음'];
      items.forEach(x=>{ const div=document.createElement('div'); div.className='list-item'; div.textContent=typeof x==='string'?x:(x.title||JSON.stringify(x)); o.appendChild(div); });
      m.textContent='완료';
    }catch(e){ m.textContent='오류'; }
  });
});