// version: v0.03 —— 稳健链识别 + 重试等待 + 一键切到 BSC；其它逻辑不变
const APP_VERSION = "v0.03";
const LS_SESSION  = "session-min"; // { addr, ts }
const BSC_HEX     = "0x38";        // 56
const BSC_INFO    = {              // 用于 wallet_addEthereumChain
  chainId: "0x38",
  chainName: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: ["https://bsc-dataseed.binance.org/"],
  blockExplorerUrls: ["https://bscscan.com/"]
};

/* 版本徽章 */
function setVersionBadge(){ const el=document.getElementById("verBadge"); if(el) el.textContent=APP_VERSION; }

/* 会话 */
function saveSession(addr){ localStorage.setItem(LS_SESSION, JSON.stringify({ addr, ts: Date.now() })); }
function loadSession(){ try{ return JSON.parse(localStorage.getItem(LS_SESSION)); }catch(e){ return null; } }
function clearSession(){ localStorage.removeItem(LS_SESSION); }

/* 弹窗 */
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

/* 等待 provider 注入（部分钱包会延迟注入 window.ethereum） */
async function waitForProvider(maxMs=2000){
  const start = Date.now();
  while(!window.ethereum){
    if(Date.now()-start > maxMs) return false;
    await new Promise(r=>setTimeout(r,100));
  }
  return true;
}

/* 统一规范 chainId：接受 "0x38" / "56" / 56 等，最终返回小写16进制字符串 */
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

/* 获取 chainId（更稳：先看 ethereum.chainId，再调 eth_chainId），带重试 */
async function getChainIdUnified(tries=6, intervalMs=300){
  const ok = await waitForProvider(2000);
  if(!ok) return null;

  for(let i=0;i<tries;i++){
    try{
      // 1) 直接读属性
      if(window.ethereum && window.ethereum.chainId){
        const n = normalizeChainId(window.ethereum.chainId);
        if(n) return n;
      }
      // 2) 调 RPC
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

/* 交互切链（支持自动添加链） */
async function switchToBSC(){
  const ok = await waitForProvider(2000);
  if(!ok) return false;
  if(!window.ethereum?.request) return false;

  try{
    await window.ethereum.request({ method:"wallet_switchEthereumChain", params:[{ chainId: BSC_HEX }] });
    return true;
  }catch(err){
    // 4902: 未添加该链
    if(err && (err.code === 4902 || err.message?.includes("Unrecognized chain ID"))){
      try{
        await window.ethereum.request({ method:"wallet_addEthereumChain", params:[BSC_INFO] });
        return true;
      }catch(e2){
        showToast("添加 BSC 失败："+(e2?.message||e2), "error", 3000);
        return false;
      }
    }
    return false;
  }
}

/* 确保是 BSC（可选择是否弹出切链对话框） */
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

/* 登录页：连接钱包（先尝试切到 BSC） */
async function connectWallet(){
  const status = document.getElementById("status");
  const say = t => { if(status) status.textContent = "状态：" + t; };

  const okProv = await waitForProvider(2000);
  if(!okProv){ say("未检测到钱包。"); showToast("未检测到钱包，请用钱包内置浏览器打开","warn"); return; }

  // 先确保在 BSC（允许交互切链）
  const onBsc = await ensureBSC({interactive:true});
  if(!onBsc){ say("请切换到 BSC 主网后再连接"); return; }

  try{
    const accounts = await window.ethereum.request({ method:"eth_requestAccounts" });
    if(!accounts || !accounts.length){ say("未授权账户"); showToast("未授权账户","warn"); return; }
    const addr = accounts[0];
    saveSession(addr);
    say("已连接 "+addr.slice(0,6)+"..."+addr.slice(-4));
    showToast("连接成功，正在进入首页…","success",1400);
    setTimeout(()=> location.href="home.html", 500);
  }catch(err){
    say("连接失败："+(err?.message||String(err)));
    showToast("连接失败："+(err?.message||String(err)),"error",3000);
  }
}

/* 首页守卫：更稳的链判定（先等待→再判定），必要时尝试切链 */
async function guardHome(){
  const sess = loadSession();
  if(!sess?.addr){ location.href="index.html"; return; }

  const line = document.getElementById("addrLine");
  if(line) line.textContent = "地址：" + sess.addr;

  // 等待/重试识别链，避免钱包注入慢导致误判
  let onBsc = await ensureBSC({interactive:false, silent:true});
  if(!onBsc){
    // 再给两次机会：提示并尝试交互切链
    showToast("正在检测或切换网络到 BSC…","warn",1800);
    onBsc = await ensureBSC({interactive:true});
  }
  if(!onBsc){
    showToast("当前非 BSC，已退出。请切换到 BSC 后重新登录","error",2600);
    setTimeout(()=>{ clearSession(); location.href="index.html"; }, 900);
    return;
  }

  // 退出按钮
  const btn = document.getElementById("logoutBtn");
  if(btn) btn.onclick = ()=>{ clearSession(); location.href="index.html"; };

  // 实时监听：换链/换号即退出
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

/* 登录页轻守卫：加载时提示当前网络，链变更即提示 */
async function guardLogin(){
  await waitForProvider(2000);
  const onBsc = await ensureBSC({interactive:false});
  if(onBsc) showToast("已在 BSC 主网，可以连接","success",1500);

  const btn = document.getElementById("connectBtn");
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
