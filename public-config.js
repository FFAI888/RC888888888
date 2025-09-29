// public-config.js v1.00 —— 前端安全读取 Worker /public 并渲染到 #rc-public
// 1) 把下面的 WORKER_PUBLIC 改成你的 Worker 域（不要末尾斜杠）
const WORKER_PUBLIC = 'https://rc-admin-api.453870150.workers.dev';

(function(){
  const box = document.getElementById('rc-public');
  if(!box) return; // 没容器就不执行

  function h(tag, attrs={}, ...kids){
    const el = document.createElement(tag);
    for(const k in attrs){ if(k==='style') Object.assign(el.style, attrs[k]); else el.setAttribute(k, attrs[k]); }
    for(const c of kids){ if(typeof c==='string') el.appendChild(document.createTextNode(c)); else if(c) el.appendChild(c); }
    return el;
  }

  async function load(){
    try{
      const r = await fetch(WORKER_PUBLIC.replace(/\/$/,'') + '/public', { cache:'no-store' });
      const t = await r.text();
      if(!r.ok) throw new Error('HTTP '+r.status+': '+t.slice(0,200));
      const j = JSON.parse(t);
      if(!j.ok) throw new Error(j.error||'返回异常');
      const pub = j.public || {};

      // 渲染
      box.innerHTML = '';
      const title = h('div', {style:{fontWeight:'bold',fontSize:'18px',margin:'8px 0'}}, 'RongChain 公共信息');
      const tip   = h('div', {style:{color:'#64748b',fontSize:'14px',marginBottom:'8px'}}, '来自独立后台的最新配置（只读公开字段）');

      const notice = h('div', {style:{margin:'6px 0'}}, '公告：', pub.notice || '');
      const price  = h('div', {style:{margin:'6px 0'}}, '参考价格：', (pub.price!=null? String(pub.price) : '—'));
      const chain  = h('div', {style:{margin:'6px 0'}}, '链 ID：', String(pub.chainId||'—'));
      const time   = h('div', {style:{margin:'6px 0',color:'#94a3b8'}}, '更新时间：', pub.updatedAt ? new Date(pub.updatedAt).toLocaleString() : '—');

      const list = h('div', {style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'10px',marginTop:'10px'}});
      const products = pub.products || {};
      Object.keys(products).forEach(key=>{
        const p = products[key]||{};
        const card = h('div', {style:{border:'1px solid #e5e7eb',borderRadius:'10px',padding:'10px'}},
          p.image ? h('img', {src:p.image, alt:p.title||key, style:{width:'100%',height:'140px',objectFit:'cover',borderRadius:'8px',marginBottom:'8px'}}) : null,
          h('div', {style:{fontWeight:'bold'}}, p.title||key),
          h('div', {}, `价格：${p.price!=null?p.price:'—'} ${p.currency||''}`)
        );
        list.appendChild(card);
      });

      box.append(title, tip, notice, price, chain, time, list);
    }catch(e){
      box.innerHTML = '<div style="color:#ef4444">加载失败：'+ String(e) +'</div>';
    }
  }

  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) load(); });
  load();
})();
