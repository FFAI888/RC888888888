// version: v0.08 —— 新增按钮状态管理（idle/loading/success/error）；BSC/鉴权逻辑不变
const APP_VERSION = "v0.08";
const LS_SESSION  = "session-min"; // { addr, ts }
const BSC_HEX     = "0x38";
const BSC_INFO    = {
  chainId: "0x38",
  chainName: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: ["https://bsc-dataseed.binance.org/"],
  blockExplorerUrls: ["https://bscscan.com/"]
};

function setVersionBadge(){ const el=document.getElementById("verBadge"); if(el) el.textContent=APP_VERSION; }
function saveSession(addr){ localStorage.setItem(LS_SESSION, JSON.stringify({ addr, ts: Date.now() })); }
function loadSession(){ try{ return JSON.parse(localStorage.getItem(LS_SESSION)); }catch(e){ return null; } }
function clearSession(){ localStorage.removeItem(LS_SESSION); }

function showToast(msg, type="info", ms=2600){
  const el = document.getElementById("toast"); if(!el) return;
  el.classList.remove("warn","success","error","show");
  if(type==="warn") el.classList.add("warn");
  else if(type==="success") el.classList.add("success");
  else if(type==="error") el.classList.add("error");
  el.textContent = msg;
  requestAnimationFrame(()=> el.classList.add("show"));
  clearTimeout(el.__timer);
  el.__timer = setTimeout(()=> el.classList.remove("show"), ms);
}

/* —— 兼容/等待/切链（与 v0.07 相同） —— */
async function waitForProvider(maxMs=2000){
  const start = Date.now();
  while(!window.ethereum){
    if(Date.now()-start > maxMs) return false;
    await new Promise(r=>setTimeout(r,100));
  }
  return true;
}
function normalizeChainId(cid){
  if(cid == null) return null;
  if(typeof cid === "number") return "0x" + cid.toString(16);
  if(typeof cid === "string"){
    const s = cid.trim();
    if(/^0x[a-fA-F0-9]+$/.test(s)) return s.toLowerCase();
    if(/^\d+$/.test(s)) return "0x" + parseInt(s,10).toString(16);
  }
  return null;
}
async function getChainIdUnified(tries=6, intervalMs=300){
  const ok = await waitForProvider(2000);
  if(!ok) return null;
  for(let i=0;i<tries;i++){
    try{
      if(window.ethereum && window.ethereum.chainId){
        const n = normalizeChainId(window.ethereum.chainId);
        if(n) return n;
      }
      if(window.ethereum && typeof window.ethereum.request==="function"){
        const cid = await window.ethereum.request({ method:"eth_chainId" });
        const n = normalizeChainId(cid);
        if(n) return n;
      }
    }catch(e){}
    await new Promise(r=>setTimeout(r, intervalMs));
  }
  return null;
}
async function switchToBSC(){
  const ok = await waitForProvider(2000);
  if(!ok) return false;
  if(!window.ethereum?.request) return false;
  try{
    await window.ethereum.request({ method:"wallet_switchEthereumChain", params:[{ chainId: BSC_HEX }] });
    return true;
  }catch(err){
    if(err && (err.code === 4902 || err.message?.includes("Unrecognized chain ID"))){
      try{
        await window.ethereum.request({ method:"wallet_addEthereumChain", params:[BSC_INFO] });
        return true;
      }catch(e2){ showToast("添加 BSC 失败："+(e2?.message||e2), "error", 3000); return false; }
    }
    return false;
  }
}
async function ensureBSC({interactive=false, silent=false}={}){
  const cid = await getChainIdUnified();
  if(cid === BSC_HEX) return true;
  if(!silent){
    if(cid) showToast(`当前网络：${cid}，仅支持 BSC(56)`, "warn", 2200);
    else showToast("正在识别网络或未检测到钱包", "warn", 1800);
  }
  if(interactive){
    const switched = await switchToBSC();
    if(!switched) return false;
    const recheck = await getChainIdUnified(4,250);
    return recheck === BSC_HEX;
  }
  return false;
}

/* —— 新增：按钮状态管理 —— */
function btnSetIdle(btn){
  if(!btn) return;
  btn.disabled = false;
  btn.classList.remove("is-loading","is-success","is-error","shake");
  btn.classList.add("pulse","shimmer-on");
  btn.setAttribute("aria-busy","false");
  // 恢复按钮文本（不改你的原文案）
  if(btn.__origText) btn.textContent = btn.__origText;
}
function btnSetLoading(btn){
  if(!btn) return;
  if(!btn.__origText) btn.__origText = btn.textContent;
  btn.disabled = true;
  btn.classList.remove("pulse","shimmer-on","is-success","is-error","shake");
  btn.classList.add("is-loading");
  btn.setAttribute("aria-busy","true");
  btn.textContent = "连接中…";
}
function btnSetSuccess(btn){
  if(!btn) return;
  btn.disabled = true;
  btn.classList.remove("is-loading","pulse","shimmer-on","is-error","shake");
  btn.classList.add("is-success");
  btn.setAttribute("aria-busy","false");
  btn.textContent = "已连接 ✓";
}
function btnSetError(btn){
  if(!btn) return;
  btn.disabled = false;
  btn.classList.remove("is-loading","is-success");
  btn.classList.add("is-error","shake");
  btn.setAttribute("aria-busy","false");
  // 1 秒后回到待机
  setTimeout(()=> btnSetIdle(btn), 1000);
}

/* 登录页：连接钱包（保持原逻辑，插入按钮状态） */
async function connectWallet(){
  const btn = document.getElementById("connectBtn");
  const status = document.getElementById("status");
  const say = t => { if(status) status.textContent = "状态：" + t; };

  const okProv = await waitForProvider(2000);
  if(!okProv){
    say("未检测到钱包。"); showToast("未检测到钱包，请用钱包内置浏览器打开","warn");
    if(btn) btnSetError(btn);
    return;
  }

  if(btn) btnSetLoading(btn);

  const onBsc = await ensureBSC({interactive:true});
  if(!onBsc){
    say("请切换到 BSC 主网后再连接");
    showToast("请切换到 BSC 主网(56) 后重试","warn");
    if(btn) btnSetError(btn);
    return;
  }

  try{
    const accounts = await window.ethereum.request({ method:"eth_requestAccounts" });
    if(!accounts || !accounts.length){
      say("未授权账户"); showToast("未授权账户","warn");
      if(btn) btnSetError(btn);
      return;
    }
    const addr = accounts[0];
    saveSession(addr);
    say("已连接 "+addr.slice(0,6)+"..."+addr.slice(-4));
    showToast("连接成功，正在进入首页…","success",1400);
    if(btn) btnSetSuccess(btn);
    setTimeout(()=> location.href = "home.html", 500);
  }catch(err){
    say("连接失败："+(err?.message||String(err)));
    showToast("连接失败："+(err?.message||String(err)),"error",3000);
    if(btn) btnSetError(btn);
  }
}

/* 首页守卫（逻辑不变） */
async function guardHome(){
  const sess = loadSession();
  if(!sess?.addr){ location.href="index.html"; return; }
  const line = document.getElementById("addrLine");
  if(line) line.textContent = "地址：" + sess.addr;

  let onBsc = await ensureBSC({interactive:false, silent:true});
  if(!onBsc){
    showToast("正在检测或切换网络到 BSC…","warn",1800);
    onBsc = await ensureBSC({interactive:true});
  }
  if(!onBsc){
    showToast("当前非 BSC，已退出。请切换到 BSC 后重新登录","error",2600);
    setTimeout(()=>{ clearSession(); location.href="index.html"; }, 900);
    return;
  }

  const btn = document.getElementById("logoutBtn");
  if(btn) btn.onclick = ()=>{ clearSession(); location.href = "index.html"; };

  if(window.ethereum?.on){
    window.ethereum.on("chainChanged", async (newCid)=>{
      const norm = normalizeChainId(newCid);
      if(norm !== BSC_HEX){
        showToast("检测到网络切换，当前非 BSC，已退出","warn",2200);
        clearSession(); location.href="index.html";
      }
    });
    window.ethereum.on("accountsChanged", (accs)=>{
      const current = accs && accs[0] ? accs[0].toLowerCase() : "";
      if(!current || current !== String(sess.addr||"").toLowerCase()){
        showToast("账户已切换，需重新登录","warn",2000);
        clearSession(); location.href="index.html";
      }
    });
  }
}

/* 登录页轻守卫（增加：初始把按钮设为待机态） */
async function guardLogin(){
  const btn = document.getElementById("connectBtn");
  if(btn) btnSetIdle(btn); // 呼吸 + 扫光

  await waitForProvider(2000);
  const onBsc = await ensureBSC({interactive:false});
  if(onBsc) showToast("已在 BSC 主网，可以连接","success",1500);

  if(btn) btn.onclick = connectWallet;

  if(window.ethereum?.on){
    window.ethereum.on("chainChanged", async (cid)=>{
      const norm = normalizeChainId(cid);
      if(norm === BSC_HEX) showToast("已切到 BSC 主网，可以连接","success",1500);
      else showToast(`当前网络 ${norm||cid} 不支持，请切到 BSC(56)`,"warn",2200);
    });
  }
}

/* 入口 */
document.addEventListener("DOMContentLoaded", ()=>{
  setVersionBadge();
  const isLogin = location.pathname.endsWith("index.html") || /\/$/.test(location.pathname);
  if(isLogin) guardLogin(); else guardHome();
});
