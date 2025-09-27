// version: v0.09 —— 集成 8/10/19/20/26/27/33 + D1/D5；原有 BSC/守卫逻辑保留
const APP_VERSION = "v0.09";
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

/* ===== 公用：Provider / Chain 识别（保留原逻辑） ===== */
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

/* ===== UI：微气泡提示（20） ===== */
function tipShow(text, type){ const el = document.getElementById("tip"); if(!el) return;
  el.classList.remove("show","error","warn");
  if(type==="error") el.classList.add("error"); else if(type==="warn") el.classList.add("warn");
  el.textContent = text; el.classList.add("show");
}
function tipHide(){ const el = document.getElementById("tip"); if(el) el.classList.remove("show","error","warn"); }

/* ===== UI：分步提示条（19） ===== */
function stepsReset(){
  const wrap = document.getElementById("steps"); if(!wrap) return;
  wrap.hidden = false;
  wrap.querySelector(".steps-bar-fill").style.width = "0%";
  wrap.querySelectorAll(".step").forEach(s=>{ s.classList.remove("active","done","error"); });
}
function stepsSet(n){ // 1..4
  const wrap = document.getElementById("steps"); if(!wrap) return;
  const fill = wrap.querySelector(".steps-bar-fill");
  wrap.querySelectorAll(".step").forEach((li)=>{
    const idx = Number(li.dataset.step);
    if(idx < n) li.classList.add("done");
    if(idx === n) li.classList.add("active");
  });
  const pct = [0, 25, 50, 75, 100][n] ?? 0;
  if(fill) fill.style.width = pct + "%";
}
function stepsError(n){
  const wrap = document.getElementById("steps"); if(!wrap) return;
  const li = wrap.querySelector(`.step[data-step="${n}"]`);
  if(li) li.classList.add("error");
}
function stepsComplete(){
  stepsSet(4);
  const wrap = document.getElementById("steps"); if(!wrap) return;
  wrap.querySelector(".steps-bar-fill").style.width = "100%";
}

/* ===== 按钮状态（含 D1/D5） ===== */
function btnSetIdle(btn){
  if(!btn) return;
  btn.disabled = false;
  btn.classList.remove("is-loading","is-success","is-error","shake","net-ok","net-bad");
  btn.classList.add("pulse","shimmer-on");
  btn.setAttribute("aria-busy","false");
  if(btn.__origText) btn.textContent = btn.__origText;
  tipHide();
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
}
function btnSetRetryCountdown(btn, sec){ // D5
  if(!btn) return;
  btn.disabled = true;
  let left = sec;
  const tick = ()=>{
    btn.textContent = `重试（${left}s）`;
    if(--left < 0){
      btn.disabled = false;
      btnSetIdle(btn);
      return;
    }
    btn.__retryTimer = setTimeout(tick, 1000);
  };
  if(btn.__retryTimer) clearTimeout(btn.__retryTimer);
  tick();
}

/* ===== 33 网络光环/红点 ===== */
function setBtnNetState(isOk){
  const btn = document.getElementById("connectBtn");
  if(!btn) return;
  btn.classList.remove("net-ok","net-bad");
  btn.classList.add(isOk ? "net-ok" : "net-bad");
}

/* ===== 26 夜间护眼：22:00–06:00 ===== */
function applyNightModeIfNeeded(){
  try{
    const h = new Date().getHours();
    if(h >= 22 || h < 6){ document.body.classList.add("night"); }
    else{ document.body.classList.remove("night"); }
  }catch(e){}
}

/* ===== 27 二次确认（首次点击→确认态；再次点击才执行） ===== */
let confirmTimer = null;
async function enterConfirmState(){
  const btn = document.getElementById("connectBtn");
  const confirmLine = document.getElementById("confirmLine");
  const addrPreview = document.getElementById("addrPreview");
  const changeHint = document.getElementById("changeHint");
  if(!btn || !confirmLine) return;
  // 预读已授权地址（不会弹窗）
  let preview = "";
  try{
    if(window.ethereum?.request){
      const accs = await window.ethereum.request({ method:"eth_accounts" });
      if(accs && accs[0]) preview = accs[0];
    }
  }catch(e){}
  if(preview){
    const short = preview.slice(0,6)+"…"+preview.slice(-4);
    addrPreview.textContent = "：" + short;
    addrPreview.hidden = false;
    changeHint.hidden = false;
  }else{
    addrPreview.hidden = true;
    changeHint.hidden = true;
  }
  confirmLine.hidden = false;
  tipShow("再次点击确认连接", "warn");
  btn.dataset.state = "confirm";
  if(confirmTimer) clearTimeout(confirmTimer);
  confirmTimer = setTimeout(()=>{
    // 超时返回 idle
    if(btn.dataset.state === "confirm"){
      btn.dataset.state = "idle";
      confirmLine.hidden = true;
      tipHide();
    }
  }, 8000);
}

/* ===== 登录：连接流程（含 D1 冷却、19 分步条 等） ===== */
async function connectWallet(){
  const btn = document.getElementById("connectBtn");
  const status = document.getElementById("status");
  const say = t => { if(status) status.textContent = "状态：" + t; };

  // 按钮状态机：idle → confirm → loading → success/error
  const st = btn?.dataset.state || "idle";
  if(st === "loading") { tipShow("正在处理上一次请求…","warn"); return; }
  if(st === "confirm"){ btn.dataset.state = "idle"; /* 第二次点击通过 */ }
  else {
    // 第一次点击：进入确认态（27）
    await enterConfirmState();
    return;
  }

  // 进入加载态（D1 最短冷却 1.2s）
  btn.dataset.state = "loading";
  const startAt = Date.now();
  stepsReset(); stepsSet(1); // 19-请求账户
  btnSetLoading(btn);

  const okProv = await waitForProvider(2000);
  if(!okProv){
    say("未检测到钱包。"); tipShow("未检测到钱包，请用钱包内置浏览器打开","error");
    btnSetError(btn); stepsError(1);
    btnSetRetryCountdown(btn, 2); // D5
    btn.dataset.state = "idle";
    return;
  }

  // 继续分步：检查网络
  stepsSet(2);
  let onBsc = await ensureBSC({interactive:true});
  if(!onBsc){
    say("请切换到 BSC 主网后再连接");
    tipShow("当前网络不支持，请切到 BSC(56)","error");
    setBtnNetState(false);
    btnSetError(btn); stepsError(2);
    btnSetRetryCountdown(btn, 2); // D5
    btn.dataset.state = "idle";
    return;
  } else {
    setBtnNetState(true);
  }

  // 授权中
  stepsSet(3);
  try{
    const accounts = await window.ethereum.request({ method:"eth_requestAccounts" });
    if(!accounts || !accounts.length){
      say("未授权账户"); tipShow("未授权账户","error");
      btnSetError(btn); stepsError(3);
      btnSetRetryCountdown(btn, 2); // D5
      btn.dataset.state = "idle";
      return;
    }

    const addr = accounts[0];
    saveSession(addr);
    say("已连接 "+addr.slice(0,6)+"..."+addr.slice(-4));

    // D1：保证最少冷却 1.2s
    const MIN = 1200;
    const wait = Math.max(0, MIN - (Date.now() - startAt));
    await new Promise(r=>setTimeout(r, wait));

    // 成功
    stepsComplete();
    btnSetSuccess(btn);
    tipShow("连接成功，正在进入首页…", ""); // 常态气泡
    setTimeout(()=> location.href="home.html", 500);
  }catch(err){
    say("连接失败："+(err?.message||String(err)));
    tipShow("连接失败："+(err?.message||String(err)), "error");
    btnSetError(btn); stepsError(3);
    btnSetRetryCountdown(btn, 2); // D5
    btn.dataset.state = "idle";
  }
}

/* ===== 首页守卫（保留） ===== */
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

/* ===== 登录页轻守卫 + 夜间 + 网络光环 + 初始气泡 ===== */
async function guardLogin(){
  applyNightModeIfNeeded();

  const btn = document.getElementById("connectBtn");
  if(btn) { btnSetIdle(btn); btn.dataset.state = "idle"; }

  // 初次微气泡（20）
  tipShow("仅支持 BSC 主网（56），请在钱包内置浏览器打开","");
  setTimeout(tipHide, 3000);

  // 网络光环（33）
  await waitForProvider(2000);
  const isBsc = (await getChainIdUnified()) === BSC_HEX;
  setBtnNetState(!!isBsc);

  // 事件
  if(btn) btn.onclick = connectWallet;

  if(window.ethereum?.on){
    window.ethereum.on("chainChanged", async (cid)=>{
      const norm = normalizeChainId(cid);
      const ok = norm === BSC_HEX;
      setBtnNetState(ok);
      if(ok) showToast("已切到 BSC 主网，可以连接","success",1500);
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
