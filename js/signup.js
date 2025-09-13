// signup.js
document.addEventListener('DOMContentLoaded', ()=>{
  const u=document.getElementById('su-username'); const p=document.getElementById('su-password');
  const b=document.getElementById('su-btn'); const m=document.getElementById('su-msg');
  b.addEventListener('click', async ()=>{
    const username=(u.value||'').trim(); const password=p.value||'';
    if(!username||!password){ m.textContent='입력해 주세요'; return; }
    m.textContent='처리 중...';
    const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({username,password})});
    const data=await r.json().catch(()=>({}));
    if(r.status===409){ m.textContent='username already in use'; return; }
    m.textContent=r.ok?'회원가입 완료':(data.error||'error');
    if(r.ok){ location.href='/src/html/main.html'; }
  });
});