// home.js v1.00
const API_BASE = 'https://rc-admin-api.453870150.workers.dev'; // 如用自定义公开域，请改这里
const $ = sel => document.querySelector(sel);

function fmtMoney(n, ccy='CNY'){
  if (typeof n !== 'number') return '—';
  const map = { CNY:'¥', USD:'$', USDT:'$' };
  const pre = map[ccy?.toUpperCase?.()] ?? '';
  return pre + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function ts2str(ts){
  if(!ts) return '';
  try{ return new Date(ts).toLocaleString(); } catch{ return '' }
}

async function main(){
  const tip = $('#updateTip');
  try{
    tip.textContent = '加载中…';
    const r = await fetch(`${API_BASE}/config?t=${Date.now()}`);
    const cfg = await r.json();

    // v0.07B 情况（GET 受限）直接提示
    if (cfg && cfg.ok === false){
      tip.textContent = '（前台无法读取 /config：后端设为仅后台可读）';
      return;
    }

    const apple = cfg?.products?.apple;
    if (!apple || apple.visible === false){
      $('#appleBox').style.display = 'none';
      tip.textContent = '（苹果信息未开启显示）';
      return;
    }

    $('#appleTitle').textContent = apple.title || 'Apple iPhone';
    $('#appleImg').src = apple.image || 'tupian/iphone.jpg';
    $('#applePrice').textContent = fmtMoney(Number(apple.price), apple.currency || 'CNY');
    tip.textContent = '更新于 ' + ts2str(cfg.updatedAt || Date.now());
  }catch(e){
    tip.textContent = '读取失败（检查公开 GET /config 与 CORS）';
  }
}
main();
