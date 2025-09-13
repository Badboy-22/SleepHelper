
// ui.js — small helpers (toast, fetch guard, button lock)
(function(){
  function ensureToast(){
    var t = document.getElementById('toast');
    if(!t){ t=document.createElement('div'); t.id='toast'; document.body.appendChild(t); }
    return t;
  }
  function showToast(msg, type){
    var t = ensureToast();
    t.classList.remove('visually-hidden');
    var el = document.createElement('div');
    el.className = 'toast ' + (type||'');
    el.textContent = msg;
    t.appendChild(el);
    setTimeout(function(){ el.remove(); if(!t.children.length){ t.classList.add('visually-hidden'); } }, 2200);
  }
  function lock(btn, lock){
    if(!btn) return;
    btn.disabled = !!lock;
    if(lock){
      btn.dataset._txt = btn.textContent;
      btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> 처리 중...';
    }else{
      btn.innerHTML = btn.dataset._txt || '완료';
    }
  }
  window.UI = { showToast, lock };
})();
