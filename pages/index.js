import { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext, memo } from "react";
import Head from "next/head";

const T = {
  gold:"#C8A84B", goldLight:"#E2C870", goldDark:"#8A6612",
  bg:"#000000", surface:"#0A0A0A", s2:"#111111", s3:"#1A1A1A",
  border:"rgba(255,255,255,0.07)", borderGold:"rgba(200,168,75,0.3)",
  text:"#FFFFFF", muted:"#8E8E93", dim:"#48484A",
  green:"#30D158", blue:"#0A84FF", orange:"#FF9F0A", red:"#FF453A",
};
const STATUS = {
  holding:  { label:"持有",   color:T.green,  bg:"rgba(61,170,106,0.1)"  },
  for_sale: { label:"待出",   color:T.orange, bg:"rgba(224,120,48,0.1)"  },
  grading:  { label:"送评中", color:T.blue,   bg:"rgba(74,158,255,0.1)"  },
  sold:     { label:"已出",   color:T.muted,  bg:"rgba(122,122,140,0.1)" },
};
const CAT = { PC:{label:"PC",color:T.gold}, investment:{label:"投资",color:T.blue}, longhold:{label:"长持",color:"#9B6DFF"}, other:{label:"其他",color:T.muted} };
const PC_DEF = [
  { id:"p_kg", name:"Kevin Garnett",        short:"KG",     emoji:"🐺", color1:"#1D6B3F", color2:"#0E3D23", display_order:1 },
  { id:"p_sc", name:"Stephen Curry",         short:"Curry",  emoji:"🎯", color1:"#1D428A", color2:"#FFC72C", display_order:2 },
  { id:"p_ga", name:"Giannis Antetokounmpo", short:"Giannis",emoji:"🦌", color1:"#00471B", color2:"#EEE1C6", display_order:3 },
  { id:"p_vw", name:"Victor Wembanyama",     short:"Wemby",  emoji:"👽", color1:"#C4CED4", color2:"#000000", display_order:4 },
];
const LOCS = ["PC-KG-01","PC-KG-02","PC-KG-03","PC-SC-01","PC-SC-02","PC-GA-01","PC-GA-02","PC-VW-01","PC-VW-02","INV-A01","INV-A02","INV-B01","SLAB-01","SLAB-02","SLAB-03","送评中"];
const SRCS = ["eBay","卡淘","自拆","StockX","朋友购入","线下卡展"];
const DEF_RATE = 7.25;

const ZH = {
  "字母哥":"Giannis Antetokounmpo","字母":"Giannis Antetokounmpo","浓眉":"Anthony Davis","浓眉哥":"Anthony Davis",
  "库里":"Stephen Curry","加内特":"Kevin Garnett","文班":"Victor Wembanyama","文班亚马":"Victor Wembanyama",
  "詹姆斯":"LeBron James","勒布朗":"LeBron James","科比":"Kobe Bryant","乔丹":"Michael Jordan",
  "魔术师":"Magic Johnson","大鲨鱼":"Shaquille O'Neal","奥尼尔":"Shaquille O'Neal",
  "德克":"Dirk Nowitzki","东契奇":"Luka Doncic","卢卡":"Luka Doncic","约基奇":"Nikola Jokic",
  "塔图姆":"Jayson Tatum","哈登":"James Harden","威少":"Russell Westbrook","杜兰特":"Kevin Durant",
  "欧文":"Kyrie Irving","汤普森":"Klay Thompson","克莱":"Klay Thompson","里拉德":"Damian Lillard",
  "阿门":"Amen Thompson","皮蓬":"Scottie Pippen","邓肯":"Tim Duncan","韦德":"Dwyane Wade",
  "旗手":"Cooper Flagg","弗拉格":"Cooper Flagg","哈珀":"Dylan Harper","迪伦":"Dylan Harper",
  "勇士":"Golden State Warriors","湖人":"Los Angeles Lakers","凯尔特人":"Boston Celtics","绿军":"Boston Celtics",
  "火箭":"Houston Rockets","雄鹿":"Milwaukee Bucks","马刺":"San Antonio Spurs","尼克斯":"New York Knicks",
  "公牛":"Chicago Bulls","热火":"Miami Heat","快船":"Los Angeles Clippers","森林狼":"Minnesota Timberwolves",
  "雷霆":"Oklahoma City Thunder","独行侠":"Dallas Mavericks","小牛":"Dallas Mavericks","太阳":"Phoenix Suns",
  "步行者":"Indiana Pacers","猛龙":"Toronto Raptors","老鹰":"Atlanta Hawks","篮网":"Brooklyn Nets",
  "新秀卡":"Rookie RC","签名卡":"Auto Autograph","金卡":"Gold","银卡":"Silver Prizm",
  "折射":"Refractor","碎冰":"Cracked Ice Sapphire","彩虹":"Rainbow","全息":"Holo",
  "评级卡":"PSA BGS SGC","满分":"PSA 10","送评":"grading","持有":"holding","待出":"for_sale","已出":"sold",
  "蓝宝石":"Sapphire","限量":"numbered",
};

function expandQ(q) {
  if (!q) return [];
  const lo = q.toLowerCase().trim();
  const terms = [lo];
  for (const [zh, en] of Object.entries(ZH)) {
    if (zh.toLowerCase().includes(lo) || lo.includes(zh.toLowerCase()))
      en.split(" ").forEach(t => terms.push(t.toLowerCase()));
  }
  return [...new Set(terms)];
}

function cGrad(player, ps) {
  const p = ps?.find(x => x.name === player);
  if (p) return `linear-gradient(145deg,${p.color1}CC,${p.color2}CC)`;
  const fb = ["#1a1a3e","#2a1a3e","#1a2a3e","#3e1a2a","#1a3e2a"];
  return `linear-gradient(145deg,${fb[(player?.charCodeAt(0)||0)%fb.length]},#0a0a18)`;
}
const pEmoji = (name, ps) => ps?.find(p => p.name === name)?.emoji || "🏀";

function fmtP(n, dc="RMB", rate=DEF_RATE, sc="RMB") {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (isNaN(v)) return "—";
  if (dc === "RMB") { const rmb = sc==="USD"?v*rate:v; return `¥${Math.round(rmb).toLocaleString("zh-CN")}`; }
  else { const usd = sc==="RMB"?v/rate:v; return `$${Math.round(usd).toLocaleString("en-US")}`; }
}
function fmtDual(n, rate=DEF_RATE, sc="RMB") {
  if (!n || isNaN(Number(n))) return { rmb:"—", usd:"—" };
  const v = Number(n);
  const rmb = sc==="USD"?v*rate:v, usd = sc==="RMB"?v/rate:v;
  return { rmb:`¥${Math.round(rmb).toLocaleString("zh-CN")}`, usd:`$${Math.round(usd).toLocaleString("en-US")}` };
}

function compressImg(url, maxDim=1400, q=0.85) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      let {width:w,height:h} = img;
      const r = Math.min(maxDim/w, maxDim/h, 1);
      if (r<1) { w=Math.round(w*r); h=Math.round(h*r); }
      const c = document.createElement("canvas"); c.width=w; c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      res(c.toDataURL("image/jpeg", q));
    };
    img.onerror = () => res(url);
    img.src = url;
  });
}
const mkThumb = url => compressImg(url, 400, 0.65);
const toB64 = f => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); });

// ── API ──────────────────────────────────────────────────────────────────────
const apiRecognize = async (f,b) => { const r=await fetch("/api/recognize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({frontImage:f,backImage:b})}); const d=await r.json(); if(!r.ok) return{success:false,error:d.error||"识别失败"}; return{success:true,data:d.data}; };
const apiGet = async () => { const r=await fetch("/api/cards"); if(!r.ok) return[]; return r.json(); };
const apiAdd = async c => { const r=await fetch("/api/cards",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(c)}); if(!r.ok){const e=await r.json();throw new Error(e.error);} return r.json(); };
const apiPut = async (id,c) => { const r=await fetch(`/api/cards/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(c)}); if(!r.ok){const e=await r.json();throw new Error(e.error);} return r.json(); };
const apiDel = async id => { const r=await fetch(`/api/cards/${id}`,{method:"DELETE"}); if(!r.ok){const e=await r.json();throw new Error(e.error);} };

const apiMarketPrice = async (card) => {
  const r = await fetch("/api/market-price", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ player:card.player, series:card.series, parallel:card.parallel, numbered:card.numbered, grade:card.grade, year:card.year }) });
  const d = await r.json();
  return r.ok ? d : { success:false, error:d.error||"查询失败" };
};

const apiCardStory = async (card) => {
  const r = await fetch("/api/card-story", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ backImage:card.back_image, player:card.player, year:card.year, series:card.series, cardNumber:card.card_number }) });
  const d = await r.json();
  return r.ok ? d : { success:false, error:d.error };
};

const apiVerifyCard = async (card) => {
  try {
    const r = await fetch("/api/verify-card", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ player:card.player, year:card.year, series:card.series, parallel:card.parallel, numbered:card.numbered, manufacturer:card.manufacturer }) });
    const d = await r.json();
    return r.ok ? d : null;
  } catch { return null; }
};

const apiSaveStory = async (cardId, story) => {
  try { await apiPut(cardId, { story }); } catch(e) { console.error("Story save failed:", e); }
};

const apiEbayPrice = async (card, customQuery) => {
  try {
    const r = await fetch("/api/ebay-price", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ player:card.player, year:card.year, series:card.series, parallel:card.parallel, numbered:card.numbered, grade:card.grade, customQuery }) });
    const d = await r.json();
    return r.ok ? d : { success:false, error:d.error };
  } catch(e) { return { success:false, error:e.message }; }
};

// ── 雷达 API ─────────────────────────────────────────────────────────────────
const apiGetGoals = async () => {
  const r = await fetch("/api/collection-goals");
  return r.ok ? r.json() : [];
};
const apiCreateGoal = async (body) => {
  const r = await fetch("/api/collection-goals", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
  const d = await r.json();
  return r.ok ? { success:true, data:d } : { success:false, error:d.error };
};
const apiDeleteGoal = async (id) => {
  const r = await fetch(`/api/collection-goals?id=${id}`, { method:"DELETE" });
  return r.ok;
};
const apiSyncGoal = async (id) => {
  const r = await fetch(`/api/collection-goals?action=sync&id=${id}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:"{}" });
  const d = await r.json();
  return r.ok ? { success:true, data:d } : { success:false, error:d.error };
};
const apiGetChecklists = async (search) => {
  const url = search ? `/api/checklists?search=${encodeURIComponent(search)}` : "/api/checklists";
  const r = await fetch(url);
  return r.ok ? r.json() : [];
};
const apiGenerateChecklist = async (body) => {
  const r = await fetch("/api/checklists", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
  const d = await r.json();
  return r.ok ? { success:true, data:d } : { success:false, error:d.error };
};
const apiRadarScan = async (goal_id = null) => {
  const body = goal_id ? { goal_id } : {};
  const r = await fetch("/api/radar-scan", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
  const d = await r.json();
  return r.ok ? { success:true, ...d } : { success:false, error:d.error };
};
const apiGetScanResults = async () => {
  const r = await fetch("/api/radar-scan");
  const d = await r.json();
  return r.ok ? d : { mustWatch:[], niceToHave:[], lastScanned:null };
};
const apiGetParallels = async (series, year, numbered) => {
  if (!series) return null;
  try {
    const r = await fetch('/api/find-parallels', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ series, year, numbered: numbered || null })
    });
    const d = await r.json();
    return r.ok ? d : null;
  } catch { return null; }
};

const apiAddWatchItem = async (body) => {
  const r = await fetch("/api/watch-items", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
  const d = await r.json();
  return r.ok ? { success:true, data:d } : { success:false, error:d.error };
};
const apiRemoveGoalItem = async (goalId, itemName) => {
  const r = await fetch(`/api/collection-goals?id=${goalId}&action=remove_item`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ item_name: itemName }) });
  const d = await r.json();
  return r.ok ? { success:true, data:d } : { success:false, error:d.error };
};
const apiRadarScanSold = async (goal_id = null) => {
  const body = { action:'sold', ...(goal_id ? { goal_id } : {}) };
  const r = await fetch("/api/radar-scan", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
  const d = await r.json();
  return r.ok ? d : { success:false, results:[] };
};

// ── 投资分析 API ───────────────────────────────────────────────────────────────
const apiGetInvestments = async () => { const r = await fetch("/api/investments"); if (!r.ok) return []; return r.json(); };
const apiCreateInvestment = async (body) => { const r = await fetch("/api/investments", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "创建失败"); return d; };
const apiUpdateInvestment = async (id, body) => { const r = await fetch(`/api/investments?id=${id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "更新失败"); return d; };
const apiCloseInvestment = async (id) => { const r = await fetch(`/api/investments?id=${id}`, { method:"DELETE" }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "关闭失败"); return d; };
const apiGetInvestment = async (id) => { const r = await fetch(`/api/investments/${id}`); if (!r.ok) return null; return r.json(); };
const apiAddCheckpoint = async (id, body) => { const r = await fetch(`/api/investments/${id}?action=checkpoint`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "添加失败"); return d; };
const apiLinkCard = async (id, body) => { const r = await fetch(`/api/investments/${id}?action=link-card`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "关联失败"); return d; };

// ── 批量导入 API ──────────────────────────────────────────────────────────────
const apiBatchValidate = async (cards) => {
  const r = await fetch("/api/batch-import?action=validate", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ cards }) });
  const d = await r.json();
  return r.ok ? { success:true, data:d } : { success:false, error:d.error };
};
const apiBatchImport = async (cards, skipDuplicates = true) => {
  const r = await fetch("/api/batch-import?action=import", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ cards, skip_duplicates: skipDuplicates }) });
  const d = await r.json();
  return r.ok ? { success:true, data:d } : { success:false, error:d.error };
};

// 投资类型 / 行动分工具
const INV_TYPE = {
  pc:          { label:"PC 永久收藏", short:"PC",  color:T.gold,    emoji:"❤️" },
  investment:  { label:"投资",        short:"投资", color:T.blue,    emoji:"📈" },
  speculation: { label:"投机",        short:"投机", color:"#9B6DFF", emoji:"🎲" },
};
const actionColor = (s) => { if (s == null) return T.dim; if (s >= 75) return T.green; if (s >= 60) return T.gold; if (s >= 40) return T.orange; return T.red; };
const actionAdvice = (s) => { if (s == null) return "未评分"; if (s >= 75) return "强力买入 / 加仓"; if (s >= 60) return "可逢低吸纳"; if (s >= 40) return "持有观望"; return "减仓 / 规避"; };
const SIGNAL_MAP = { buy:{label:"买入",color:T.green,bg:"rgba(48,209,88,0.1)"}, accumulate:{label:"吸纳",color:"#64D2FF",bg:"rgba(100,210,255,0.1)"}, hold:{label:"持有",color:T.gold,bg:"rgba(201,168,76,0.1)"}, reduce:{label:"减仓",color:T.orange,bg:"rgba(255,159,10,0.1)"}, close:{label:"关闭",color:T.red,bg:"rgba(255,69,58,0.1)"} };
const holderAdvice = (tScore, isHolder) => {
  if (tScore == null) return "";
  if (isHolder) {
    if (tScore >= 75) return "🔥 有买家，考虑出货";
    if (tScore >= 60) return "📈 市场回暖，可考虑部分止盈";
    if (tScore >= 40) return "⏳ 市场平淡，继续持有";
    return "❄️ 市场冷淡，继续持有";
  }
  if (tScore >= 75) return "🎯 严重低估，强力买入窗口";
  if (tScore >= 60) return "💡 价格合理偏低，可逢低吸纳";
  if (tScore >= 40) return "⏸ 价格中性，观望为主";
  return "⚠️ 价格偏高，暂不建议入场";
};

// ── Context ──────────────────────────────────────────────────────────────────
const Ctx = createContext(null);
const useApp = () => useContext(Ctx);

function AppProvider({children}) {
  const [cards,setCards]     = useState([]);
  const [pcP]                = useState(PC_DEF);
  const [loading,setLoading] = useState(true);
  const [daily,setDaily]     = useState(null);
  const [dailyHistory,setDailyHistory] = useState([]);
  const [screen,setScreen]   = useState("home");
  const [sel,setSel]         = useState(null);
  const [toast,setToast]     = useState(null);
  const [dc,setDC]           = useState("RMB");
  const [rate,setRate]       = useState(DEF_RATE);

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const sc=localStorage.getItem("cv_c"); const sr=localStorage.getItem("cv_r");
    if(sc)setDC(sc); if(sr)setRate(parseFloat(sr));
    apiGet().then(d=>{
      setCards(d);
      if(d.length>0){ const pick=d[Math.floor(Math.random()*d.length)]; setDaily(pick); setDailyHistory([pick.id]); }
      setLoading(false);
    });
  },[]);

  const toggleDC = useCallback(()=>setDC(c=>{ const n=c==="RMB"?"USD":"RMB"; localStorage.setItem("cv_c",n); return n; }),[]);
  const showToast = useCallback((msg,type="ok")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),2800); },[]);

  const addCard = useCallback(async data => {
    try { const s=await apiAdd(data); setCards(p=>[s,...p]); showToast("✓ 已入库"); return s; }
    catch(e) { showToast(e.message,"warn"); return null; }
  },[showToast]);

  const updCard = useCallback(async (id,data) => {
    try { const s=await apiPut(id,data); setCards(p=>p.map(c=>c.id===s.id?s:c)); showToast("✓ 已更新"); return s; }
    catch(e) { showToast(e.message,"warn"); return null; }
  },[showToast]);

  const delCard = useCallback(async id => {
    try { await apiDel(id); setCards(p=>p.filter(c=>c.id!==id)); showToast("已删除","warn"); }
    catch(e) { showToast(e.message,"warn"); }
  },[showToast]);

  const nav = useCallback((s,card=null)=>{ setSel(card); setScreen(s); },[]);
  const refreshCards = useCallback(async () => { const d = await apiGet(); setCards(d); return d; },[]);

  const refreshDaily = useCallback((allCards) => {
    const pool = (allCards||cards).filter(c => !dailyHistory.includes(c.id));
    const src = pool.length > 0 ? pool : (allCards||cards);
    if (src.length === 0) return;
    const pick = src[Math.floor(Math.random()*src.length)];
    setDaily(pick);
    setDailyHistory(h => [...h.slice(-10), pick.id]);
  }, [cards, dailyHistory]);

  const stats = useMemo(() => ({
    total:cards.length, pc:cards.filter(c=>c.category==="PC").length,
    inv:cards.filter(c=>c.category==="investment").length,
    grading:cards.filter(c=>c.status==="grading").length,
    forSale:cards.filter(c=>c.status==="for_sale").length,
    oneOfOnes:cards.filter(c=>c.is_one_of_one).length,
    longhold:cards.filter(c=>c.category==="longhold").length,
    cost:cards.reduce((s,c)=>s+(parseFloat(c.buy_price)||0),0),
    pnl:cards.filter(c=>c.status==="sold"&&c.sell_price).reduce((s,c)=>s+(parseFloat(c.sell_price)||0)-(parseFloat(c.buy_price)||0),0),
  }), [cards]);

  return <Ctx.Provider value={{cards,pcP,loading,daily,screen,sel,stats,toast,dc,rate,toggleDC,nav,refreshDaily,refreshCards,addCard,updCard,delCard,showToast}}>{children}</Ctx.Provider>;
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function Chip({label,color,bg,style={}}) { return <span style={{display:"inline-flex",alignItems:"center",padding:"3px 10px",borderRadius:20,background:bg||`${color}15`,color,fontSize:10,fontWeight:600,letterSpacing:0.2,flexShrink:0,...style}}>{label}</span>; }
function GChip({grade}) { if(!grade||grade==="RAW")return null; const p=grade==="PSA 10",b=grade.startsWith("BGS"); return <Chip label={grade} color={p?"#FFD700":b?"#C0C0C0":T.muted} bg={p?"rgba(255,215,0,0.12)":b?"rgba(192,192,192,0.1)":"rgba(122,122,140,0.1)"} />; }
function Thumb({card,size=56,ps}) {
  const img=card?.front_image;
  return <div style={{width:size,height:size*1.4,borderRadius:size*0.12,background:img?"#0a0a14":cGrad(card?.player,ps),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,overflow:"hidden",border:`1px solid rgba(255,255,255,0.08)`,boxShadow:"0 4px 16px rgba(0,0,0,0.4)",position:"relative"}}>
    {img?<img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} />:
    <div style={{textAlign:"center"}}><div style={{fontSize:size*0.45}}>{pEmoji(card?.player,ps)}</div>{card?.numbered&&<div style={{fontFamily:"'Space Mono',monospace",fontSize:size*0.12,color:T.gold,fontWeight:700,marginTop:2}}>{card.numbered}</div>}</div>}
    {card?.is_one_of_one&&<div style={{position:"absolute",top:3,right:3,width:8,height:8,borderRadius:"50%",background:T.gold,boxShadow:`0 0 6px ${T.gold}`}} />}
  </div>;
}
const CardRow = memo(function CardRow({card,onClick,ps,style={}}) {
  const {dc,rate}=useApp(); const st=STATUS[card.status]||STATUS.holding;
  return <div onClick={onClick} style={{display:"flex",gap:14,padding:"12px 14px",borderRadius:16,cursor:"pointer",alignItems:"center",background:T.s2,border:`1px solid ${T.border}`,transition:"all 0.18s",...style}}
    onMouseEnter={e=>{e.currentTarget.style.background=T.s3;}}
    onMouseLeave={e=>{e.currentTarget.style.background=T.s2;}}>
    <Thumb card={card} size={56} ps={ps} />
    <div style={{flex:1,minWidth:0}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
        <span style={{fontSize:15,fontWeight:600,color:T.text,letterSpacing:"-0.2px"}}>{card.player}</span>
        {card.is_rc&&<span style={{fontSize:9,fontWeight:700,color:T.green,background:"rgba(48,209,88,0.12)",padding:"2px 6px",borderRadius:4}}>RC</span>}
      </div>
      <div style={{fontSize:12,color:T.muted,marginBottom:6,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{card.year} · {card.parallel||card.series}</div>
      <div style={{display:"flex",gap:5,overflow:"hidden",alignItems:"center"}}>
        {card.numbered&&<span style={{fontSize:10,fontWeight:700,color:T.gold}}>{card.numbered}</span>}
        {card.numbered&&<span style={{color:T.dim,fontSize:10}}>·</span>}
        <span style={{fontSize:10,color:st.color,fontWeight:500}}>{st.label}</span>
        {card.grade&&card.grade!=="RAW"&&<><span style={{color:T.dim,fontSize:10}}>·</span><span style={{fontSize:10,color:T.muted}}>{card.grade}</span></>}
      </div>
    </div>
    <div style={{textAlign:"right",flexShrink:0}}>
      {(card.buy_price!==null&&card.buy_price!==undefined&&card.buy_price!=="")&&<div style={{fontSize:14,fontWeight:600,color:T.text}}>{fmtP(card.buy_price,dc,rate,card.price_currency||"RMB")}</div>}
      {card.location&&<div style={{fontSize:10,color:T.dim,marginTop:3}}>📍{card.location}</div>}
    </div>
  </div>;
});
function SHdr({title,sub,action,onAction}) { return <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div><span style={{fontSize:17,fontWeight:600,color:T.text,letterSpacing:"-0.3px"}}>{title}</span>{sub&&<span style={{fontSize:12,color:T.muted,marginLeft:6}}>{sub}</span>}</div>{action&&<button onClick={onAction} style={{background:"none",border:"none",color:T.gold,fontSize:13,cursor:"pointer",padding:0,fontWeight:500}}>{action}</button>}</div>; }
function Skel({width="100%",height=16,radius=6,style={}}) { return <div style={{width,height,borderRadius:radius,background:`linear-gradient(90deg,${T.s2} 25%,${T.s3} 50%,${T.s2} 75%)`,backgroundSize:"200% 100%",animation:"shimmer 1.5s infinite",...style}} />; }
function ToastView({toast}) { if(!toast)return null; return <div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",padding:"10px 20px",borderRadius:10,zIndex:999,background:toast.type==="warn"?"rgba(224,120,48,0.9)":"rgba(61,170,106,0.9)",color:"#fff",fontSize:13,fontWeight:600,boxShadow:"0 4px 20px rgba(0,0,0,0.4)",backdropFilter:"blur(8px)",animation:"fadeUp 0.3s ease both",whiteSpace:"nowrap"}}>{toast.msg}</div>; }
function CurrBtn() { const {dc,toggleDC}=useApp(); return <button onClick={toggleDC} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${T.borderGold}`,background:`rgba(201,168,76,0.08)`,color:T.gold,fontFamily:"'Space Mono',monospace",fontSize:11,fontWeight:700,cursor:"pointer"}}>{dc==="RMB"?"¥ RMB":"$ USD"}</button>; }

function FF({label,required,children}) { return <div style={{marginBottom:14}}><label style={{display:"block",fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,letterSpacing:0.8,marginBottom:6}}>{label.toUpperCase()} {required&&<span style={{color:T.gold}}>*</span>}</label>{children}</div>; }
function Inp({value,onChange,placeholder,type="text"}) { return <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:8,background:T.s3,color:T.text,fontSize:13,outline:"none",transition:"border-color 0.2s"}} onFocus={e=>e.target.style.borderColor=T.gold} onBlur={e=>e.target.style.borderColor=T.border} />; }
function Sl({value,onChange,options}) { return <select value={value||""} onChange={e=>onChange(e.target.value)} style={{width:"100%",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:8,background:T.s3,color:value?T.text:T.muted,fontSize:13,outline:"none",appearance:"none",cursor:"pointer"}}>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>; }
function Tog({label,value,onChange}) { return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:8,background:T.s3,cursor:"pointer"}} onClick={()=>onChange(!value)}><span style={{fontSize:13,color:T.muted}}>{label}</span><div style={{width:36,height:20,borderRadius:10,background:value?T.gold:T.border,position:"relative",transition:"background 0.2s",flexShrink:0}}><div style={{position:"absolute",top:2,left:value?16:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}} /></div></div>; }

const EMPTY = () => ({ player:"",team:"",year:"",series:"",manufacturer:"",card_number:"",parallel:"",numbered:"",is_one_of_one:false,sub_series:"",is_rc:false,grade:"RAW",grade_company:"",grade_score:"",category:"PC",status:"holding",price_currency:"RMB",buy_price:"",buy_date:"",sell_price:"",sell_date:"",source:"",location:"",notes:"",tags:[] });

// 智能平行版本选择器
function ParallelPicker({ value, onChange, series, year, numbered }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searched, setSearched] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filteredByRun, setFilteredByRun] = useState(null);
  const [mode, setMode] = useState('select'); // 'select' | 'manual'

  // numbered 变化时也要重新查
  const seriesKey = `${series}__${year}__${numbered||''}`;

  useEffect(() => {
    if (!series || series.length < 3) return;
    if (seriesKey === searched) return;
    setLoading(true);
    setOptions([]);
    apiGetParallels(series, year, numbered).then(d => {
      if (d?.parallels?.length) {
        setOptions(d.parallels);
        setTotalCount(d.total_parallels || d.parallels.length);
        setFilteredByRun(d.filtered_by_print_run || null);
        setSearched(seriesKey);
      }
      setLoading(false);
    });
  }, [seriesKey]);

  const TIER_COLOR = { common: T.muted, numbered: T.blue, premium: T.gold, ultra: T.orange, '1of1': T.red };

  if (mode === 'manual') {
    return (
      <FF label="平行类型">
        <div style={{ display:'flex', gap:6 }}>
          <Inp value={value} onChange={onChange} placeholder="手动输入平行类型" />
          {options.length > 0 &&
            <button onClick={() => setMode('select')} style={{ padding:'8px 10px', borderRadius:8, border:`1px solid ${T.borderGold}`, background:'rgba(200,168,75,0.08)', color:T.gold, fontSize:11, cursor:'pointer', flexShrink:0, whiteSpace:'nowrap' }}>
              从列表选
            </button>}
        </div>
      </FF>
    );
  }

  return (
    <FF label="平行类型">
      <div style={{ position:'relative' }}>
        {/* 主选择框 */}
        <div onClick={() => !loading && options.length > 0 && setShowDropdown(d => !d)}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', border:`1px solid ${showDropdown ? T.gold : T.border}`, borderRadius:8, background:T.s3, cursor: options.length > 0 ? 'pointer' : 'default', minHeight:40 }}>
          {loading
            ? <span style={{ fontSize:12, color:T.dim, display:'flex', alignItems:'center', gap:6 }}><span style={{ animation:'pulse 1s ease infinite' }}>✨</span> 正在查询平行清单...</span>
            : value
              ? <span style={{ fontSize:13, color:T.text, flex:1 }}>{value}</span>
              : options.length > 0
                ? <span style={{ fontSize:13, color:T.dim, flex:1 }}>点击选择平行版本</span>
                : <span style={{ fontSize:13, color:T.dim, flex:1 }}>填写系列后自动加载</span>}
          {options.length > 0 && !loading && <span style={{ color:T.gold, fontSize:11 }}>{showDropdown ? '▲' : '▼'} {options.length}种</span>}
          {value && <button onClick={e => { e.stopPropagation(); onChange(''); }} style={{ background:'none', border:'none', color:T.dim, fontSize:14, cursor:'pointer', padding:'0 2px' }}>✕</button>}
        </div>

        {/* 下拉列表 */}
        {showDropdown && options.length > 0 && (
          <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:T.s2, border:`1px solid ${T.borderGold}`, borderRadius:10, zIndex:50, maxHeight:260, overflowY:'auto', boxShadow:'0 8px 32px rgba(0,0,0,0.5)' }}>
            {/* 分组显示 */}
            {['common','numbered','premium','ultra','1of1'].map(tier => {
              const group = options.filter(o => o.tier === tier);
              if (!group.length) return null;
              const tierLabel = { common:'无编号', numbered:'有编号 >50', premium:'编号 /6-50', ultra:'编号 /2-5', '1of1':'限量 1/1' }[tier];
              return (
                <div key={tier}>
                  <div style={{ padding:'6px 12px 3px', fontSize:9, color:T.dim, fontFamily:"'Space Mono',monospace", letterSpacing:1, background:T.s3 }}>{tierLabel}</div>
                  {group.map((opt, i) => (
                    <div key={i} onClick={() => { onChange(opt.value); setShowDropdown(false); }}
                      style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 14px', cursor:'pointer', borderBottom:`1px solid ${T.border}` }}
                      onMouseEnter={e => e.currentTarget.style.background = T.s3}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div>
                        <span style={{ fontSize:13, color:T.text }}>{opt.name}</span>
                        {opt.name_cn && <span style={{ fontSize:11, color:T.muted, marginLeft:6 }}>{opt.name_cn}</span>}
                      </div>
                      {opt.print_run && <span style={{ fontSize:11, fontWeight:700, color:TIER_COLOR[tier]||T.muted, fontFamily:'monospace' }}>/{opt.print_run}</span>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* 底部操作 */}
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:5 }}>
          {options.length > 0 && !loading
            ? <span style={{ fontSize:10, color:T.dim }}>
                来自官方 checklist ·{' '}
                {filteredByRun
                  ? <span style={{ color:T.gold }}>/{filteredByRun} 编号 {options.length} 种</span>
                  : `${options.length} 种版本`}
                {filteredByRun && totalCount > options.length && <span style={{ color:T.dim }}> (共{totalCount}种)</span>}
              </span>
            : <span style={{ fontSize:10, color:T.dim }}></span>}
          <button onClick={() => setMode('manual')} style={{ background:'none', border:'none', color:T.dim, fontSize:10, cursor:'pointer', padding:0 }}>手动输入</button>
        </div>
      </div>
    </FF>
  );
}

function CardFormFields({form,set,tab,setTab}) {
  const sym = form.price_currency==="USD"?"$":"¥";
  return <>
    <div style={{display:"flex",gap:2,marginBottom:18,background:T.s2,borderRadius:10,padding:3}}>
      {[["card","🃏 卡片"],["purchase","💰 入手"],["sell","📤 出售"]].map(([id,l])=>(
        <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"8px",borderRadius:8,border:"none",background:tab===id?T.s3:"transparent",color:tab===id?T.gold:T.muted,fontSize:12,fontWeight:tab===id?700:400,transition:"all 0.2s"}}>{l}</button>
      ))}
    </div>
    {tab==="card"&&<div style={{animation:"fadeUp 0.3s ease both"}}>
      <FF label="球星" required><Inp value={form.player} onChange={set("player")} placeholder="如 Kevin Garnett" /></FF>
      <FF label="球队"><Inp value={form.team} onChange={set("team")} placeholder="如 Boston Celtics" /></FF>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
        <FF label="赛季" required><Inp value={form.year} onChange={set("year")} placeholder="2025-26" /></FF>
        <FF label="卡号"><Inp value={form.card_number} onChange={set("card_number")} placeholder="#247" /></FF>
      </div>
      <FF label="系列" required><Inp value={form.series} onChange={set("series")} placeholder="如 Topps Chrome" /></FF>
      <FF label="厂商"><Sl value={form.manufacturer} onChange={set("manufacturer")} options={[["","选择"],["Topps","Topps"],["Panini","Panini"],["Upper Deck","Upper Deck"],["其他","其他"]]} /></FF>
      <ParallelPicker
        value={form.parallel}
        onChange={set("parallel")}
        series={form.series}
        year={form.year}
        numbered={form.numbered}
      />
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
        <FF label="编号"><Inp value={form.numbered} onChange={set("numbered")} placeholder="/50" /></FF>
        <FF label="子系列"><Inp value={form.sub_series} onChange={set("sub_series")} placeholder="City Edition" /></FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
        <FF label="评级"><Sl value={form.grade} onChange={v=>{set("grade")(v);if(v!=="RAW"){set("grade_company")(v.split(" ")[0]);set("grade_score")(v.split(" ")[1]||"");}}} options={[["RAW","RAW"],["PSA 10","PSA 10"],["PSA 9","PSA 9"],["BGS 9.5","BGS 9.5"],["BGS 9","BGS 9"],["SGC 10","SGC 10"],["SGC 9.5","SGC 9.5"]]} /></FF>
        <FF label="分类"><Sl value={form.category} onChange={set("category")} options={[["PC","PC（热爱）"],["investment","投资"],["longhold","长持（看好长期）"],["other","其他"]]} /></FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
        <Tog label="新秀卡 RC" value={form.is_rc} onChange={set("is_rc")} />
        <Tog label="1 of 1" value={form.is_one_of_one} onChange={v=>{set("is_one_of_one")(v);if(v)set("numbered")("1/1");}} />
      </div>
    </div>}
    {tab==="purchase"&&<div style={{animation:"fadeUp 0.3s ease both"}}>
      <FF label="持有状态"><Sl value={form.status} onChange={set("status")} options={[["holding","持有"],["for_sale","待出"],["grading","送评中"],["sold","已出"]]} /></FF>
      <FF label="货币单位"><Sl value={form.price_currency} onChange={set("price_currency")} options={[["RMB","人民币 ¥"],["USD","美元 $"]]} /></FF>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
        <FF label={`买入价 (${sym})`}><Inp value={form.buy_price} onChange={set("buy_price")} type="number" placeholder="0" /></FF>
        <FF label="买入日期"><Inp value={form.buy_date} onChange={set("buy_date")} type="date" /></FF>
      </div>
      <FF label="来源渠道"><Sl value={form.source} onChange={set("source")} options={[["","选择渠道"],...SRCS.map(s=>[s,s])]} /></FF>
      <FF label="存放位置 📍"><Sl value={form.location} onChange={set("location")} options={[["","选择位置"],...LOCS.map(l=>[l,l])]} /></FF>
      <FF label="标签"><Inp value={Array.isArray(form.tags)?form.tags.join(", "):form.tags||""} onChange={v=>set("tags")(v)} placeholder="Gold, /50, KG..." /></FF>
      <FF label="备注"><textarea value={form.notes||""} onChange={e=>set("notes")(e.target.value)} placeholder="备注..." style={{width:"100%",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:8,background:T.s3,color:T.text,fontSize:13,outline:"none",resize:"vertical",minHeight:80,lineHeight:1.6}} onFocus={e=>e.target.style.borderColor=T.gold} onBlur={e=>e.target.style.borderColor=T.border} /></FF>
    </div>}
    {tab==="sell"&&<div style={{animation:"fadeUp 0.3s ease both"}}>
      <div style={{padding:"12px 14px",borderRadius:10,background:`rgba(201,168,76,0.06)`,border:`1px solid ${T.borderGold}`,marginBottom:16,fontSize:12,color:T.muted,lineHeight:1.7}}>
        💡 填写出售价后状态自动变为"已出"，盈亏将在统计面板中显示。
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
        <FF label={`出售价 (${sym})`}><Inp value={form.sell_price} onChange={set("sell_price")} type="number" placeholder="0" /></FF>
        <FF label="出售日期"><Inp value={form.sell_date} onChange={set("sell_date")} type="date" /></FF>
      </div>
      <FF label="出售平台"><Sl value={form.source} onChange={set("source")} options={[["","选择"],...SRCS.map(s=>[s,s])]} /></FF>
    </div>}
  </>;
}

function buildTags(form) {
  const base = typeof form.tags==="string"?form.tags.split(/[,，\s]+/).filter(Boolean):[...(form.tags||[])];
  const tags = [...base];
  if(form.numbered&&!tags.includes(form.numbered))tags.push(form.numbered);
  if(form.is_rc&&!tags.includes("RC"))tags.push("RC");
  if(form.is_one_of_one&&!tags.includes("1/1"))tags.push("1/1");
  if(form.category==="PC"&&!tags.includes("PC"))tags.push("PC");
  return [...new Set(tags)];
}

function VerificationBanner({ result, onApplySuggestion }) {
  if (!result) return null;
  const issues = [];
  if (result.parallelValid === false) issues.push("parallel");
  if (result.seriesValid === false) issues.push("series");
  if (result.numberedValid === false) issues.push("numbered");
  if (issues.length === 0 && result.confidence !== "low") {
    return <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:10,background:"rgba(61,170,106,0.08)",border:"1px solid rgba(61,170,106,0.2)",marginBottom:14}}><span style={{fontSize:14}}>✅</span><span style={{fontSize:12,color:T.green}}>卡片信息已验证，与官方 checklist 一致</span></div>;
  }
  return (
    <div style={{padding:"12px 14px",borderRadius:10,background:"rgba(224,120,48,0.08)",border:"1px solid rgba(224,120,48,0.25)",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><span style={{fontSize:14}}>⚠️</span><span style={{fontSize:12,color:T.orange,fontWeight:700}}>识别信息需要确认</span></div>
      {result.notes && <p style={{fontSize:12,color:T.muted,lineHeight:1.7,marginBottom:result.parallelSuggestions?.length?10:0}}>{result.notes}</p>}
      {result.parallelValid === false && result.parallelSuggestions?.length > 0 && (
        <div>
          <div style={{fontSize:11,color:T.dim,marginBottom:6,fontFamily:"'Space Mono',monospace"}}>该系列实际存在的平行类型：</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {result.parallelSuggestions.map((s,i)=>(
              <button key={i} onClick={()=>onApplySuggestion("parallel",s)} style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${T.borderGold}`,background:`rgba(201,168,76,0.1)`,color:T.gold,fontSize:11,cursor:"pointer"}}>{s} ✓</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoBox({label,image,onCapture}) {
  const ref=useRef();
  const handle=async e=>{ const f=e.target.files?.[0]; if(!f)return; onCapture(await toB64(f)); };
  return <div onClick={()=>ref.current?.click()} style={{width:145,height:200,borderRadius:14,cursor:"pointer",background:image?"#0a0a14":T.s2,border:`2px dashed ${image?T.borderGold:T.border}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",overflow:"hidden",position:"relative",transition:"all 0.2s"}}>
    <input ref={ref} type="file" accept="image/*" onChange={handle} style={{display:"none"}} />
    {image?(<><img src={image} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} /><div style={{position:"absolute",top:8,right:8,padding:"3px 8px",background:"rgba(61,170,106,0.9)",borderRadius:6,fontFamily:"'Space Mono',monospace",fontSize:10,color:"#fff",fontWeight:700}}>✓</div></>):
    (<><div style={{fontSize:32,marginBottom:8}}>📷</div><div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.dim,fontWeight:700}}>{label}</div><div style={{fontSize:10,color:T.dim,marginTop:4}}>点击拍摄</div></>)}
  </div>;
}
function AnimF({fields}) {
  const [n,setN]=useState(0);
  useEffect(()=>{ if(n<fields.length){const t=setTimeout(()=>setN(x=>x+1),200);return()=>clearTimeout(t);} },[n,fields.length]);
  return <div>{fields.slice(0,n).map((f,i)=><div key={i} style={{display:"flex",gap:8,padding:"4px 0",animation:"fadeUp 0.2s ease both",fontFamily:"'Space Mono',monospace",fontSize:12}}><span style={{color:T.green}}>✓</span><span style={{color:T.muted}}>{f.l}：</span><span style={{color:T.text,fontWeight:700}}>{f.v}</span></div>)}{n<fields.length&&<div style={{display:"flex",gap:6,padding:"4px 0",fontFamily:"'Space Mono',monospace",fontSize:12,color:T.dim}}><span style={{animation:"pulse 0.8s ease infinite"}}>◆</span><span>提取中...</span></div>}</div>;
}
function StepBar({cur}) {
  return <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:24}}>{[["1","拍照"],["2","识别"],["3","入库"]].map(([n,l],i)=>{
    const done=i<cur,act=i===cur;
    return <div key={n} style={{display:"flex",alignItems:"center",gap:6}}>
      <div style={{width:26,height:26,borderRadius:"50%",background:act?"linear-gradient(135deg,#C9A84C,#8B6914)":done?"rgba(61,170,106,0.2)":T.s2,border:`1px solid ${act?T.borderGold:done?"rgba(61,170,106,0.4)":T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Space Mono',monospace",fontSize:10,fontWeight:700,color:act?"#000":done?T.green:T.dim}}>{done?"✓":n}</div>
      <span style={{fontSize:11,color:act?T.gold:T.dim}}>{l}</span>
      {i<2&&<div style={{width:16,height:1,background:T.border}} />}
    </div>;
  })}</div>;
}

function AddScreen() {
  const {addCard,nav,pcP}=useApp();
  const [step,setStep]=useState("photo");
  const [front,setFront]=useState(null); const [back,setBack]=useState(null);
  const [anim,setAnim]=useState([]); const [rec,setRec]=useState(null);
  const [err,setErr]=useState(null); const [form,setForm]=useState(EMPTY());
  const [saving,setSaving]=useState(false); const [tab,setTab]=useState("card");
  const [verifyResult,setVerifyResult]=useState(null);
  const [contCount,setContCount]=useState(0);
  const [inherited,setInherited]=useState({});
  const set=k=>v=>setForm(f=>({...f,[k]:v}));

  const recognize=async()=>{
    if(!front&&!back)return;
    setStep("recognizing"); setErr(null); setAnim([]); setVerifyResult(null);
    try {
      const [cf,cb]=await Promise.all([front?compressImg(front,1400,0.88):null,back?compressImg(back,1400,0.88):null]);
      const r=await apiRecognize(cf,cb);
      if(r.success){
        const d=r.data;
        const f=[d.player&&{l:"球星",v:d.player},d.team&&{l:"球队",v:d.team},d.year&&{l:"赛季",v:d.year},d.series&&{l:"系列",v:d.series},d.cardNumber&&{l:"卡号",v:d.cardNumber},d.parallel&&{l:"平行",v:d.parallel},d.numbered&&{l:"编号",v:d.numbered},d.isOneOfOne&&{l:"稀有",v:"1 OF 1 🔥"},d.isRC&&{l:"身份",v:"RC 新秀"},d.subSeries&&{l:"子系列",v:d.subSeries},(d.grade&&d.grade!=="RAW")&&{l:"评级",v:d.grade}].filter(Boolean);
        setAnim(f); setRec(d);
        const isPC=pcP.some(p=>p.name===d.player);
        setForm({...EMPTY(),player:d.player||"",team:d.team||"",year:d.year||"",series:d.series||"",manufacturer:d.manufacturer||"",card_number:d.cardNumber||"",parallel:d.parallel||"",numbered:d.numbered||"",is_one_of_one:d.isOneOfOne||false,sub_series:d.subSeries||"",is_rc:d.isRC||false,grade:d.grade||"RAW",grade_company:d.gradeCompany||"",grade_score:d.gradeScore||"",category:isPC?"PC":"investment",status:"holding",buy_date:new Date().toISOString().slice(0,10)});
        setTimeout(()=>setStep("confirm"),f.length*200+600);
      } else { setErr(r.error); setStep("photo"); }
    } catch(e){ setErr(e?.message||"识别失败"); setStep("photo"); }
  };

  const save=async()=>{
    if(!form.player)return; setSaving(true);
    const tags=buildTags(form);
    const [tf,tb]=await Promise.all([front?mkThumb(front):null,back?mkThumb(back):null]);
    const status=form.sell_price?"sold":form.status;
    const result=await addCard({...form,buy_price:form.buy_price?parseFloat(form.buy_price):null,sell_price:form.sell_price?parseFloat(form.sell_price):null,is_one_of_one:!!form.is_one_of_one,is_rc:!!form.is_rc,numbered:form.numbered||null,sub_series:form.sub_series||null,grade_company:form.grade_company||null,grade_score:form.grade_score||null,pc_player:form.category==="PC"?form.player:null,front_image:tf,back_image:tb,tags,notes:form.notes||"",status});
    if(rec){
      const diffFields=["player","series","parallel","numbered","year"];
      const orig={player:rec.player||"",series:rec.series||"",parallel:rec.parallel||"",numbered:rec.numbered||"",year:rec.year||""};
      const corr={player:form.player||"",series:form.series||"",parallel:form.parallel||"",numbered:form.numbered||"",year:form.year||""};
      const hasDiff=diffFields.some(f=>orig[f]!==corr[f]);
      if(hasDiff){try{await fetch("/api/recognition-corrections",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({original:orig,corrected:corr})})}catch(e){console.error("纠错记录失败:",e)}}
    }
    setSaving(false);
    if(result){
      const next={};
      if(form.series)next.series=form.series;
      if(form.year)next.year=form.year;
      setInherited(next);setContCount(c=>c+1);
      setFront(null);setBack(null);setRec(null);setVerifyResult(null);setAnim([]);setErr(null);
      setForm({...EMPTY(),...next});setTab("card");setStep("photo");
    }
  };

  if(step==="photo") return <div style={{paddingBottom:90}}>
    <div style={{padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${T.border}`}}>
      <button onClick={()=>nav("home")} style={{background:"none",border:"none",color:T.muted,fontSize:20}}>←</button>
      <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.dim,letterSpacing:1}}>录入新卡</span>
      <button onClick={()=>setStep("confirm")} style={{background:"none",border:"none",color:T.dim,fontSize:11}}>跳过</button>
    </div>
    {contCount>0&&<div style={{padding:"10px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(48,209,88,0.06)",borderBottom:`1px solid rgba(48,209,88,0.12)`}}>
      <span style={{fontSize:13,color:T.green,fontWeight:600}}>✓ 已录入 {contCount} 张</span>
      <button onClick={()=>nav("home")} style={{padding:"5px 14px",borderRadius:8,border:`1px solid ${T.border}`,background:"transparent",color:T.muted,fontSize:12,cursor:"pointer"}}>完成录入</button>
    </div>}
    <div style={{padding:"24px 20px"}}>
      <StepBar cur={0} />
      <div style={{fontFamily:"'Inter',sans-serif",fontSize:18,color:T.text,marginBottom:6}}>拍摄卡片正反面</div>
      <p style={{fontSize:12,color:T.muted,lineHeight:1.7,marginBottom:24}}>拍完正反面，AI 自动识别全部信息，确认后一键入库。</p>
      <div style={{display:"flex",gap:16,justifyContent:"center",marginBottom:24}}>
        <div style={{textAlign:"center"}}><PhotoBox label="正面" image={front} onCapture={setFront} /><div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,marginTop:8}}>FRONT</div></div>
        <div style={{textAlign:"center"}}><PhotoBox label="背面" image={back} onCapture={setBack} /><div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,marginTop:8}}>BACK</div></div>
      </div>
      {err&&<div style={{padding:"10px 14px",borderRadius:8,background:"rgba(212,80,80,0.08)",border:"1px solid rgba(212,80,80,0.2)",marginBottom:14,fontSize:12,color:T.red}}>⚠️ {err}</div>}
      <div style={{padding:"10px 14px",borderRadius:10,background:"rgba(201,168,76,0.06)",border:`1px solid ${T.borderGold}`,marginBottom:16,fontSize:11,color:T.muted,lineHeight:1.7}}>💡 <strong style={{color:T.gold}}>拍摄建议：</strong>卡背文字清晰识别率更高。</div>
      <button onClick={recognize} disabled={!front&&!back} style={{width:"100%",padding:"14px",borderRadius:14,border:"none",background:(front||back)?`linear-gradient(135deg,${T.gold},${T.goldDark})`:T.s3,color:(front||back)?"#000":T.dim,fontSize:15,fontWeight:700,boxShadow:(front||back)?`0 4px 20px rgba(201,168,76,0.25)`:"none",transition:"all 0.2s",marginBottom:12}}>
        {(front||back)?"🧠 AI识别卡片信息":"请先拍摄至少一张照片"}
      </button>
      <button onClick={()=>setStep("confirm")} style={{width:"100%",padding:"10px",borderRadius:12,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:13}}>跳过，手动填写 →</button>
    </div>
  </div>;

  if(step==="recognizing") return <div style={{paddingBottom:90}}>
    <div style={{padding:"16px 20px",borderBottom:`1px solid ${T.border}`}}><span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.dim,letterSpacing:1}}>AI识别中...</span></div>
    <div style={{padding:"24px 20px"}}>
      <StepBar cur={1} />
      <div style={{display:"flex",gap:12,marginBottom:20}}>
        {[front,back].filter(Boolean).map((img,i)=><div key={i} style={{width:72,height:101,borderRadius:9,overflow:"hidden",border:`1px solid ${T.border}`}}><img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"contain",background:"#0a0a14"}} /></div>)}
        <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",gap:8}}>
          <div style={{fontFamily:"'Inter',sans-serif",fontSize:15,color:T.text}}>正在识别卡片信息</div>
          <div style={{display:"flex",gap:5}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:T.gold,animation:`pulse 1s ease ${i*200}ms infinite`}} />)}</div>
        </div>
      </div>
      <div style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:14,padding:"14px 18px"}}>
        <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,letterSpacing:1,marginBottom:12}}>EXTRACTING CARD DATA</div>
        <AnimF fields={anim} />
      </div>
    </div>
  </div>;

  return <div style={{paddingBottom:90}}>
    <div style={{padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:T.bg,zIndex:10,borderBottom:`1px solid ${T.border}`}}>
      <button onClick={()=>setStep("photo")} style={{background:"none",border:"none",color:T.muted,fontSize:20}}>←</button>
      <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.dim}}>{rec?"确认识别信息":"手动录入"}</span>
      <button onClick={save} disabled={saving||!form.player} style={{padding:"7px 16px",borderRadius:8,border:"none",background:form.player?`linear-gradient(135deg,${T.gold},${T.goldDark})`:T.border,color:form.player?"#000":T.dim,fontSize:12,fontWeight:700}}>{saving?"保存...":"✓ 入库"}</button>
    </div>
    <div style={{padding:"16px 20px"}}>
      {(front||back)&&<div style={{display:"flex",gap:10,marginBottom:16,alignItems:"flex-start"}}>
        {[{img:front,l:"正面"},{img:back,l:"背面"}].filter(x=>x.img).map(({img,l},i)=>(
          <div key={i}><div style={{width:72,height:101,borderRadius:9,overflow:"hidden",border:`1px solid ${T.borderGold}`,background:"#0a0a14"}}><img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} /></div><div style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:T.dim,textAlign:"center",marginTop:3}}>{l}</div></div>
        ))}
        {rec&&<Chip label={rec.confidence==="high"?"识别准确":rec.confidence==="medium"?"需确认":"请核对"} color={rec.confidence==="high"?T.green:rec.confidence==="medium"?T.orange:T.red} style={{alignSelf:"flex-start",marginTop:4,fontSize:10,padding:"4px 10px"}} />}
      </div>}
      <VerificationBanner result={verifyResult} onApplySuggestion={(field, value) => set(field)(value)} />
      <CardFormFields form={form} set={set} tab={tab} setTab={setTab} />
      <button onClick={save} disabled={saving||!form.player} style={{width:"100%",padding:"14px",borderRadius:14,border:"none",marginTop:8,background:form.player?`linear-gradient(135deg,${T.gold},${T.goldDark})`:T.s3,color:form.player?"#000":T.dim,fontSize:15,fontWeight:700,boxShadow:form.player?`0 4px 20px rgba(201,168,76,0.25)`:"none"}}>
        {saving?"保存中...":"✓ 确认入库"}
      </button>
    </div>
  </div>;
}

function EditScreen() {
  const {sel:card,updCard,delCard,nav}=useApp();
  const [front,setFront]=useState(card?.front_image||null);
  const [back,setBack]=useState(card?.back_image||null);
  const [form,setForm]=useState(()=>card?{...EMPTY(),player:card.player||"",team:card.team||"",year:card.year||"",series:card.series||"",manufacturer:card.manufacturer||"",card_number:card.card_number||"",parallel:card.parallel||"",numbered:card.numbered||"",is_one_of_one:card.is_one_of_one||false,sub_series:card.sub_series||"",is_rc:card.is_rc||false,grade:card.grade||"RAW",grade_company:card.grade_company||"",grade_score:card.grade_score||"",category:card.category||"PC",status:card.status||"holding",price_currency:card.price_currency||"RMB",buy_price:card.buy_price||"",buy_date:card.buy_date||"",sell_price:card.sell_price||"",sell_date:card.sell_date||"",source:card.source||"",location:card.location||"",notes:card.notes||"",tags:Array.isArray(card.tags)?card.tags.join(", "):(card.tags||"")}:EMPTY());
  const [saving,setSaving]=useState(false); const [tab,setTab]=useState("card");
  if(!card){nav("home");return null;}
  const set=k=>v=>setForm(f=>({...f,[k]:v}));

  const save=async()=>{
    if(!form.player)return; setSaving(true);
    const tags=buildTags(form);
    let tf=front, tb=back;
    if(front&&front!==card.front_image)tf=await mkThumb(front);
    if(back&&back!==card.back_image)tb=await mkThumb(back);
    const status=form.sell_price?"sold":form.status;
    const updated=await updCard(card.id,{...form,buy_price:form.buy_price?parseFloat(form.buy_price):null,sell_price:form.sell_price?parseFloat(form.sell_price):null,is_one_of_one:!!form.is_one_of_one,is_rc:!!form.is_rc,numbered:form.numbered||null,sub_series:form.sub_series||null,grade_company:form.grade_company||null,grade_score:form.grade_score||null,front_image:tf,back_image:tb,tags,notes:form.notes||"",status});
    setSaving(false);
    if(updated)nav("detail",updated); else nav("home");
  };

  return <div style={{paddingBottom:90}}>
    <div style={{padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:T.bg,zIndex:10,borderBottom:`1px solid ${T.border}`}}>
      <button onClick={()=>nav("detail",card)} style={{background:"none",border:"none",color:T.muted,fontSize:20}}>←</button>
      <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.dim}}>编辑卡片</span>
      <button onClick={save} disabled={saving||!form.player} style={{padding:"7px 16px",borderRadius:8,border:"none",background:form.player?`linear-gradient(135deg,${T.gold},${T.goldDark})`:T.border,color:form.player?"#000":T.dim,fontSize:12,fontWeight:700}}>{saving?"保存...":"✓ 保存"}</button>
    </div>
    <div style={{padding:"16px 20px"}}>
      <div style={{marginBottom:20}}>
        <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,letterSpacing:1,marginBottom:10}}>照片（点击更换）</div>
        <div style={{display:"flex",gap:16}}>
          <div style={{textAlign:"center"}}><PhotoBox label="正面" image={front} onCapture={setFront} /><div style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:T.dim,marginTop:6}}>FRONT</div></div>
          <div style={{textAlign:"center"}}><PhotoBox label="背面" image={back} onCapture={setBack} /><div style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:T.dim,marginTop:6}}>BACK</div></div>
        </div>
      </div>
      <CardFormFields form={form} set={set} tab={tab} setTab={setTab} />
      <button onClick={save} disabled={saving||!form.player} style={{width:"100%",padding:"14px",borderRadius:14,border:"none",marginTop:8,background:form.player?`linear-gradient(135deg,${T.gold},${T.goldDark})`:T.s3,color:form.player?"#000":T.dim,fontSize:15,fontWeight:700,boxShadow:form.player?`0 4px 20px rgba(201,168,76,0.25)`:"none"}}>{saving?"保存中...":"✓ 保存修改"}</button>
      <button onClick={()=>{if(window.confirm("确认删除这张卡？")){delCard(card.id);nav("home");}}} style={{width:"100%",padding:"12px",borderRadius:12,border:`1px solid rgba(212,80,80,0.2)`,background:"rgba(212,80,80,0.06)",color:T.red,fontSize:13,marginTop:10}}>删除此卡</button>
    </div>
  </div>;
}

// ── 批量导入 ─────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

function BatchImportScreen() {
  const {nav,showToast,refreshCards}=useApp();
  const [step,setStep]=useState(1);
  const [loading,setLoading]=useState(false);
  const [cards,setCards]=useState([]);
  const [expandedIdx,setExpandedIdx]=useState(null);
  const [result,setResult]=useState(null);
  const [showTip,setShowTip]=useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const text = await new Promise((res,rej) => { const r = new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsText(file); });
      let parsed;
      if (file.name.endsWith('.json')) {
        parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) parsed = [parsed];
      } else {
        parsed = parseCSV(text);
      }
      if (!parsed.length) { showToast("文件为空或格式不对","warn"); setLoading(false); return; }
      const res = await apiBatchValidate(parsed);
      if (!res.success) { showToast(res.error||"校验失败","warn"); setLoading(false); return; }
      setCards(res.data.cards.map((c,i) => ({...c, _idx:i, _keep:true, _forceDup:false})));
      setStep(2);
    } catch(err) { showToast("文件解析失败: "+err.message,"warn"); }
    setLoading(false);
  };

  const removeCard = (idx) => setCards(cs => cs.filter(c => c._idx !== idx));
  const updateCard = (idx, field, value) => setCards(cs => cs.map(c => c._idx===idx ? {...c, [field]:value} : c));
  const toggleForceDup = (idx) => setCards(cs => cs.map(c => c._idx===idx ? {...c, _forceDup:!c._forceDup} : c));

  const doImport = async () => {
    setLoading(true);
    const toImport = cards.filter(c => c._keep).map(c => {
      const {_idx,_keep,_forceDup,status,...rest} = c;
      return rest;
    });
    const skipDups = cards.filter(c => c.status==="duplicate" && !c._forceDup).length > 0;
    const res = await apiBatchImport(toImport, skipDups);
    if (res.success) {
      setResult(res.data);
      setStep(3);
      refreshCards();
    } else {
      showToast(res.error||"导入失败","warn");
    }
    setLoading(false);
  };

  const summary = useMemo(() => {
    const ready = cards.filter(c => c.status==="ready").length;
    const dup = cards.filter(c => c.status==="duplicate").length;
    const err = cards.filter(c => c.status==="error").length;
    return {ready,dup,err};
  }, [cards]);

  // Step 1: Upload
  if (step===1) return <div style={{paddingBottom:90}}>
    <div style={{padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:T.bg,zIndex:10,borderBottom:`1px solid ${T.border}`}}>
      <button onClick={()=>nav("home")} style={{background:"none",border:"none",color:T.muted,fontSize:20}}>←</button>
      <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.dim}}>批量导入</span>
      <div style={{width:40}} />
    </div>
    <div style={{padding:"40px 20px",textAlign:"center"}}>
      <div style={{fontSize:48,marginBottom:16}}>📦</div>
      <h2 style={{fontSize:18,fontWeight:700,color:T.text,marginBottom:8}}>批量导入卡片</h2>
      <p style={{fontSize:13,color:T.muted,marginBottom:32}}>支持 JSON 和 CSV 格式文件</p>
      {loading ? (
        <div style={{padding:24}}>
          <div style={{display:"flex",justifyContent:"center",gap:6,marginBottom:12}}>
            {[0,1,2].map(i=><span key={i} style={{width:8,height:8,borderRadius:"50%",background:T.gold,display:"inline-block",animation:`pulse 0.8s ease ${i*150}ms infinite`}} />)}
          </div>
          <p style={{fontSize:12,color:T.dim}}>正在校验...</p>
        </div>
      ) : (
        <label style={{display:"inline-block",padding:"14px 32px",borderRadius:14,background:`linear-gradient(135deg,${T.gold},${T.goldDark})`,color:"#000",fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:`0 4px 20px rgba(201,168,76,0.25)`}}>
          选择文件
          <input type="file" accept=".json,.csv" onChange={handleFile} style={{display:"none"}} />
        </label>
      )}
      <p style={{fontSize:11,color:T.dim,marginTop:16}}>支持 .json 和 .csv 文件</p>
    </div>
    {/* Cowork Tip */}
    <div style={{padding:"0 20px"}}>
      <button onClick={()=>setShowTip(!showTip)} style={{width:"100%",padding:"12px 16px",borderRadius:12,border:`1px solid ${T.border}`,background:showTip?"rgba(201,168,76,0.06)":"transparent",color:T.muted,fontSize:13,textAlign:"left",cursor:"pointer"}}>
        ℹ️ 如何用 Cowork 生成导入文件 {showTip?"▲":"▼"}
      </button>
      {showTip && (
        <div style={{marginTop:8,padding:16,borderRadius:12,background:T.s2,border:`1px solid ${T.border}`,fontSize:12,color:T.muted,lineHeight:1.8,whiteSpace:"pre-wrap"}}>
{`将球星卡照片发给 Cowork，使用以下提示词：

"请识别这些球星卡照片，提取信息并输出 JSON 数组。每张卡一个对象，字段：
player_name（英文全名）, year（赛季如 2024-25）, brand（Panini/Topps/Upper Deck）,
set_name（系列如 Prizm）, card_number（卡号）, parallel（平行版本英文名）,
numbered（限量编号如 /99）, is_rc（是否新秀卡 true/false）,
purchase_price（购入价）, purchase_currency（RMB/USD）, notes（备注）
只输出纯 JSON 数组。"`}
        </div>
      )}
    </div>
  </div>;

  // Step 2: Preview
  if (step===2) return <div style={{paddingBottom:90}}>
    <div style={{padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:T.bg,zIndex:10,borderBottom:`1px solid ${T.border}`}}>
      <button onClick={()=>{setStep(1);setCards([]);}} style={{background:"none",border:"none",color:T.muted,fontSize:20}}>←</button>
      <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.dim}}>预览确认</span>
      <button onClick={doImport} disabled={loading||!cards.length} style={{padding:"7px 16px",borderRadius:8,border:"none",background:cards.length?`linear-gradient(135deg,${T.gold},${T.goldDark})`:T.border,color:cards.length?"#000":T.dim,fontSize:12,fontWeight:700}}>{loading?"导入中...":"确认导入"}</button>
    </div>
    {/* Summary bar */}
    <div style={{padding:"12px 20px",display:"flex",gap:12,borderBottom:`1px solid ${T.border}`}}>
      <span style={{fontSize:12,color:T.green}}>✅ {summary.ready} 就绪</span>
      <span style={{fontSize:12,color:T.orange}}>⚠️ {summary.dup} 疑似重复</span>
      <span style={{fontSize:12,color:T.red}}>🔴 {summary.err} 缺信息</span>
    </div>
    {/* Card list */}
    <div style={{padding:"12px 20px",overflowY:"auto",maxHeight:"calc(100vh - 180px)"}}>
      {cards.map((c,i) => {
        const bgColor = c.status==="duplicate"?"rgba(224,160,48,0.06)":c.status==="error"?"rgba(212,80,80,0.06)":"transparent";
        const borderColor = c.status==="duplicate"?T.orange:c.status==="error"?T.red:T.border;
        const icon = c.status==="ready"?"🟢":c.status==="duplicate"?"🟡":"🔴";
        const expanded = expandedIdx===c._idx;
        return <div key={c._idx} style={{marginBottom:8,borderRadius:12,border:`1px solid ${borderColor}`,background:bgColor,overflow:"hidden"}}>
          <div onClick={()=>setExpandedIdx(expanded?null:c._idx)} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",cursor:"pointer"}}>
            <span style={{fontSize:12,color:T.dim,fontFamily:"'Space Mono',monospace",minWidth:24}}>{i+1}</span>
            <span style={{fontSize:12}}>{icon}</span>
            <span style={{fontSize:13,fontWeight:600,color:T.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {c.player_name||c.player||"—"}
            </span>
            <span style={{fontSize:11,color:T.muted,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {c.year||""} {c.set_name||c.series||""} {c.parallel||""}
            </span>
            <span style={{fontSize:11,color:T.dim,fontFamily:"'Space Mono',monospace"}}>{c.card_number||""}</span>
            <button onClick={(e)=>{e.stopPropagation();removeCard(c._idx);}} style={{background:"none",border:"none",color:T.red,fontSize:14,cursor:"pointer",padding:"2px 6px"}}>✕</button>
          </div>
          {c.status==="duplicate" && !expanded && (
            <div style={{padding:"4px 12px 8px 48px",display:"flex",gap:8}}>
              <button onClick={(e)=>{e.stopPropagation();toggleForceDup(c._idx);}} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:`1px solid ${c._forceDup?T.gold:T.border}`,background:c._forceDup?"rgba(201,168,76,0.1)":"transparent",color:c._forceDup?T.gold:T.muted,cursor:"pointer"}}>
                {c._forceDup?"仍然导入 ✓":"仍然导入"}
              </button>
            </div>
          )}
          {expanded && (
            <div style={{padding:"8px 12px 12px",borderTop:`1px solid ${T.border}`,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[["player_name","球员名"],["year","赛季"],["brand","品牌"],["set_name","系列"],["card_number","卡号"],["parallel","平行"],["numbered","限量"],["purchase_price","购入价"],["purchase_currency","币种"],["notes","备注"]].map(([k,l])=>(
                <div key={k}>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:T.dim,marginBottom:3}}>{l}</div>
                  <input value={c[k]||""} onChange={e=>updateCard(c._idx,k,e.target.value)} style={{width:"100%",padding:"6px 8px",border:`1px solid ${T.border}`,borderRadius:6,background:T.s3,color:T.text,fontSize:12,outline:"none"}} onFocus={e=>e.target.style.borderColor=T.gold} onBlur={e=>e.target.style.borderColor=T.border} />
                </div>
              ))}
              {c.status==="duplicate" && (
                <div style={{gridColumn:"1/-1",paddingTop:4}}>
                  <button onClick={()=>toggleForceDup(c._idx)} style={{fontSize:11,padding:"6px 12px",borderRadius:6,border:`1px solid ${c._forceDup?T.gold:T.border}`,background:c._forceDup?"rgba(201,168,76,0.1)":"transparent",color:c._forceDup?T.gold:T.muted,cursor:"pointer"}}>
                    {c._forceDup?"仍然导入 ✓":"仍然导入（忽略重复）"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>;
      })}
      {cards.length===0 && <div style={{textAlign:"center",padding:"40px 0",color:T.dim,fontSize:13}}>没有可导入的卡片</div>}
    </div>
  </div>;

  // Step 3: Result
  return <div style={{paddingBottom:90}}>
    <div style={{padding:"16px 20px",display:"flex",justifyContent:"center",alignItems:"center",position:"sticky",top:0,background:T.bg,zIndex:10,borderBottom:`1px solid ${T.border}`}}>
      <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.dim}}>导入完成</span>
    </div>
    <div style={{padding:"48px 20px",textAlign:"center"}}>
      <div style={{fontSize:48,marginBottom:16}}>✅</div>
      <h2 style={{fontSize:18,fontWeight:700,color:T.text,marginBottom:24}}>导入完成</h2>
      <div style={{display:"flex",justifyContent:"center",gap:20,marginBottom:32}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:24,fontWeight:700,color:T.green,fontFamily:"'Space Mono',monospace"}}>{result?.imported||0}</div>
          <div style={{fontSize:11,color:T.muted,marginTop:4}}>成功导入</div>
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:24,fontWeight:700,color:T.orange,fontFamily:"'Space Mono',monospace"}}>{result?.skipped||0}</div>
          <div style={{fontSize:11,color:T.muted,marginTop:4}}>跳过</div>
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:24,fontWeight:700,color:T.red,fontFamily:"'Space Mono',monospace"}}>{result?.failed||0}</div>
          <div style={{fontSize:11,color:T.muted,marginTop:4}}>失败</div>
        </div>
      </div>
      <button onClick={()=>{nav("home");}} style={{padding:"14px 32px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${T.gold},${T.goldDark})`,color:"#000",fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:`0 4px 20px rgba(201,168,76,0.25)`}}>返回首页</button>
    </div>
  </div>;
}

function DailyCardFull({ card, players }) {
  const { nav, updCard } = useApp();
  const [story, setStory] = useState(card.story || null);
  const [loadingStory, setLoadingStory] = useState(false);

  useEffect(() => {
    if (!card.story && card.id) {
      setLoadingStory(true);
      apiCardStory(card).then(r => {
        if (r.success) { setStory(r.story); apiSaveStory(card.id, r.story); }
        setLoadingStory(false);
      });
    }
  }, [card.id]);

  const hasPhoto = !!card.front_image;
  const grad = cGrad(card.player, players);

  return (
    <div style={{borderRadius:20,overflow:"hidden",background:T.s2,boxShadow:"0 2px 24px rgba(0,0,0,0.5)",cursor:"pointer"}} onClick={()=>nav("detail",card)}>
      <div style={{display:"flex",gap:0}}>
        <div style={{width:"45%",flexShrink:0,position:"relative",background:hasPhoto?"#000":grad,minHeight:280,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
          {hasPhoto
            ? <img src={card.front_image} alt={card.player} style={{width:"100%",height:"100%",objectFit:"contain",display:"block"}} />
            : <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:16,gap:8}}><span style={{fontSize:56}}>{pEmoji(card.player,players)}</span><span style={{fontSize:11,color:"rgba(255,255,255,0.4)",textAlign:"center",fontWeight:500}}>{card.player}</span></div>
          }
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:"40%",background:"linear-gradient(to top, rgba(0,0,0,0.7), transparent)",pointerEvents:"none"}} />
          <div style={{position:"absolute",bottom:10,left:10,display:"flex",flexDirection:"column",gap:4}}>
            {card.numbered&&<span style={{padding:"2px 8px",borderRadius:20,background:"rgba(200,168,75,0.9)",color:"#000",fontSize:10,fontWeight:700}}>{card.numbered}</span>}
            {card.is_one_of_one&&<span style={{padding:"2px 8px",borderRadius:20,background:"rgba(255,215,0,0.9)",color:"#000",fontSize:10,fontWeight:700}}>1/1</span>}
            {card.is_rc&&<span style={{padding:"2px 8px",borderRadius:20,background:"rgba(48,209,88,0.85)",color:"#000",fontSize:10,fontWeight:700}}>RC</span>}
          </div>
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",padding:"16px 14px",minWidth:0,overflow:"hidden"}}>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,color:T.gold,fontWeight:600,marginBottom:4,letterSpacing:0.3}}>
              {players?.find(p=>p.name===card.player)?.emoji} {players?.find(p=>p.name===card.player)?.short || card.player.split(" ").pop()}
            </div>
            <div style={{fontSize:14,fontWeight:700,color:T.text,lineHeight:1.3,marginBottom:3}}>{card.parallel||card.series}</div>
            <div style={{fontSize:11,color:T.muted,lineHeight:1.4}}>{card.year}{card.sub_series?` · ${card.sub_series}`:""}</div>
          </div>
          <div style={{marginBottom:12}}>
            <span style={{fontSize:10,color:STATUS[card.status]?.color||T.green,background:STATUS[card.status]?.bg,padding:"3px 8px",borderRadius:20,fontWeight:600}}>{STATUS[card.status]?.label||"持有"}</span>
            {card.grade&&card.grade!=="RAW"&&<span style={{fontSize:10,color:"#FFD700",background:"rgba(255,215,0,0.1)",padding:"3px 8px",borderRadius:20,fontWeight:600,marginLeft:4}}>{card.grade}</span>}
          </div>
          <div style={{height:1,background:T.border,marginBottom:10}} />
          <div style={{flex:1,overflow:"hidden",position:"relative"}}>
            {loadingStory?(<div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:T.dim}}><span style={{animation:"pulse 1s ease infinite"}}>✨</span><span>生成故事中...</span></div>)
              :story?(<div onClick={e=>e.stopPropagation()} style={{maxHeight:140,overflowY:"auto",scrollbarWidth:"none"}}><p style={{fontSize:11,color:T.muted,lineHeight:1.75,margin:0}}>{story}</p></div>)
              :(<p style={{fontSize:11,color:T.dim,lineHeight:1.6,margin:0}}>暂无故事</p>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeScreen() {
  const {cards,pcP,stats,loading,daily,nav,refreshDaily,dc,toggleDC,rate}=useApp();
  const [investments, setInvestments] = useState([]);
  const [invLoading, setInvLoading] = useState(true);
  const [showAllCards, setShowAllCards] = useState(false);
  const [q, setQ] = useState("");
  const [cf, setCf] = useState("all");

  useEffect(() => {
    apiGetInvestments().then(d => { setInvestments(Array.isArray(d) ? d : []); setInvLoading(false); }).catch(() => setInvLoading(false));
  }, []);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthNew = cards.filter(c => c.created_at && new Date(c.created_at) >= monthStart).length;

  const signalInvestments = useMemo(() => investments.filter(i => {
    const s = i.action_score;
    if (s == null) return false;
    return s >= 60 || s < 40;
  }), [investments]);

  const pcCards = useMemo(() => pcP.map(p => ({
    ...p,
    cards: cards.filter(c => c.player === p.name && c.category === "PC"),
  })), [pcP, cards]);

  const filteredCards = useMemo(() => cards.filter(c => {
    if (cf !== "all" && c.category !== cf) return false;
    if (q) {
      const terms = expandQ(q);
      const fields = [c.player, c.series, c.parallel, c.card_number, c.numbered, c.grade, c.team, c.sub_series, c.year, ...(c.tags || [])].filter(Boolean).map(f => f.toLowerCase());
      return terms.some(t => fields.some(f => f.includes(t)));
    }
    return true;
  }), [cards, cf, q]);

  if (loading) return <div style={{padding:"20px"}}><Skel height={120} radius={16} style={{marginBottom:16}} /><Skel height={80} radius={14} style={{marginBottom:16}} /><Skel height={200} radius={14} style={{marginBottom:16}} /><Skel height={160} radius={14} /></div>;

  return (
    <div style={{paddingBottom:90}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 20px 12px"}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:700,color:T.text,letterSpacing:"-0.5px",lineHeight:1.1,fontFamily:"'Inter',sans-serif"}}>Card Vault</h1>
          <p style={{fontSize:12,color:T.muted,marginTop:3}}>{new Date().toLocaleDateString("zh-CN",{month:"long",day:"numeric",weekday:"short"})}</p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <CurrBtn />
          <button onClick={()=>nav("batchImport")} style={{width:38,height:38,borderRadius:"50%",border:"none",background:T.s2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,cursor:"pointer",flexShrink:0}}>📦</button>
          <button onClick={()=>nav("search")} style={{width:38,height:38,borderRadius:"50%",border:"none",background:T.s2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,cursor:"pointer",flexShrink:0}}>🔍</button>
          <button onClick={()=>nav("add")} style={{width:38,height:38,borderRadius:"50%",border:"none",background:T.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,cursor:"pointer",flexShrink:0}}>📷</button>
        </div>
      </div>

      {/* 1. Asset Overview Hero Card */}
      <div style={{margin:"0 16px 16px",padding:"20px",borderRadius:16,background:"linear-gradient(145deg, rgba(26,24,16,1), rgba(18,16,10,1))",border:"1px solid rgba(200,168,75,0.25)",animation:"fadeUp 0.5s ease both"}}>
        <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:T.dim,letterSpacing:2,marginBottom:10}}>TOTAL PORTFOLIO</div>
        <div style={{fontFamily:"'Space Mono',monospace",fontSize:36,fontWeight:700,color:T.gold,lineHeight:1}}>{fmtP(stats.cost,dc,rate)}</div>
        <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.dim,marginTop:4}}>≈ {dc==="RMB"?fmtDual(stats.cost,rate).usd:fmtDual(stats.cost,rate).rmb}</div>
        <div style={{display:"flex",gap:16,marginTop:16}}>
          <div style={{flex:1,padding:"10px 12px",borderRadius:10,background:"rgba(255,255,255,0.04)"}}>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:20,fontWeight:700,color:T.text}}>{stats.total}</div>
            <div style={{fontSize:10,color:T.dim,marginTop:2}}>总卡片</div>
          </div>
          <div style={{flex:1,padding:"10px 12px",borderRadius:10,background:"rgba(255,255,255,0.04)"}}>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:20,fontWeight:700,color:T.green}}>+{monthNew}</div>
            <div style={{fontSize:10,color:T.dim,marginTop:2}}>本月新增</div>
          </div>
          <div style={{flex:1,padding:"10px 12px",borderRadius:10,background:"rgba(255,255,255,0.04)"}}>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:20,fontWeight:700,color:stats.pnl>=0?T.green:T.red}}>{stats.pnl>=0?"+":""}{fmtP(Math.abs(stats.pnl),dc,rate)}</div>
            <div style={{fontSize:10,color:T.dim,marginTop:2}}>已实现盈亏</div>
          </div>
        </div>
      </div>

      {/* 2. Investment Signal Alerts */}
      <div style={{padding:"0 16px 16px",animation:"fadeUp 0.5s ease 80ms both"}}>
        {!invLoading && investments.length > 0 && signalInvestments.length > 0 ? (
          <div style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:14,padding:"14px 16px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <span style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,letterSpacing:1}}>INVESTMENT SIGNALS</span>
              <button onClick={()=>nav("invest")} style={{background:"none",border:"none",color:T.gold,fontSize:11,cursor:"pointer",padding:0,fontWeight:500}}>查看全部</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {signalInvestments.slice(0,5).map(inv => {
                const s = inv.action_score;
                const isGood = s >= 60;
                const color = s >= 75 ? T.green : s >= 60 ? T.gold : s < 40 ? T.red : T.orange;
                const icon = s >= 75 ? "🟢" : s >= 60 ? "🟡" : s < 40 ? "🔴" : "🟠";
                const advice = s >= 75 ? "可建仓" : s >= 60 ? "可吸纳" : s < 40 ? "建议清仓" : "观望";
                return (
                  <div key={inv.id} onClick={()=>nav("invest")} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:10,background:`${color}08`,border:`1px solid ${color}22`,cursor:"pointer"}}>
                    <span style={{fontSize:14}}>{icon}</span>
                    <span style={{fontSize:13,color:T.text,fontWeight:600,flex:1}}>{inv.player_name_cn || inv.player_name}</span>
                    <span style={{fontFamily:"'Space Mono',monospace",fontSize:12,fontWeight:700,color}}>{s}</span>
                    <span style={{fontSize:11,color,fontWeight:500}}>{advice}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : !invLoading && investments.length === 0 ? (
          <div onClick={()=>nav("invest")} style={{background:T.s2,border:`1px dashed ${T.borderGold}`,borderRadius:14,padding:"16px",cursor:"pointer",textAlign:"center"}}>
            <span style={{fontSize:13,color:T.muted}}>开始你的第一个投资追踪</span>
            <span style={{color:T.gold,fontWeight:600,marginLeft:6}}>→</span>
          </div>
        ) : null}
      </div>

      {/* 3. PC Player Progress */}
      {pcCards.some(p => p.cards.length > 0) && (
        <div style={{padding:"0 16px 16px",animation:"fadeUp 0.5s ease 120ms both"}}>
          <SHdr title="PC 球员" sub={`${pcCards.reduce((s,p)=>s+p.cards.length,0)} 张`} action="全部" onAction={()=>nav("pc")} />
          <div style={{display:"flex",gap:10,overflowX:"auto",scrollbarWidth:"none",paddingBottom:4}}>
            {pcCards.filter(p => p.cards.length > 0).map(p => (
              <div key={p.id} onClick={()=>nav("pc")} style={{flexShrink:0,width:130,borderRadius:14,overflow:"hidden",background:`linear-gradient(145deg,${p.color1}44,${p.color2}22)`,border:`1px solid ${T.border}`,cursor:"pointer"}}>
                <div style={{padding:"14px 12px",textAlign:"center"}}>
                  <div style={{fontSize:32,marginBottom:6}}>{p.emoji}</div>
                  <div style={{fontSize:13,fontWeight:600,color:T.text}}>{p.short}</div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.gold,marginTop:4}}>{p.cards.length} 张</div>
                </div>
                <div style={{display:"flex",gap:4,padding:"0 8px 10px",overflowX:"auto",scrollbarWidth:"none"}}>
                  {p.cards.slice(0,3).map(c => (
                    <div key={c.id} style={{width:32,height:44,borderRadius:4,overflow:"hidden",flexShrink:0,background:"#000",border:"1px solid rgba(255,255,255,0.1)"}}>
                      {c.front_image ? <img src={c.front_image} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} /> : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>{pEmoji(c.player,pcP)}</div>}
                    </div>
                  ))}
                  {p.cards.length > 3 && <div style={{width:32,height:44,borderRadius:4,flexShrink:0,background:"rgba(255,255,255,0.04)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:T.dim}}>+{p.cards.length-3}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Recent Cards (latest 5) */}
      <div style={{padding:"0 16px 16px",animation:"fadeUp 0.5s ease 160ms both"}}>
        <SHdr title="最近录入" sub="5 张" />
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {cards.slice(0,5).map(c=><CardRow key={c.id} card={c} ps={pcP} onClick={()=>nav("detail",c)} />)}
          {cards.length===0&&(<div style={{textAlign:"center",padding:"48px 0",color:T.dim}}><div style={{fontSize:48,marginBottom:12}}>🃏</div><div style={{fontSize:14}}>还没有卡片，点右上角📷开始录入</div></div>)}
        </div>
      </div>

      {/* 5. Full Card List (collapsible) */}
      {cards.length > 5 && (
        <div style={{padding:"0 16px",animation:"fadeUp 0.5s ease 200ms both"}}>
          <button onClick={()=>setShowAllCards(!showAllCards)} style={{width:"100%",padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,background:showAllCards?"rgba(200,168,75,0.06)":"transparent",color:showAllCards?T.gold:T.muted,fontSize:13,fontWeight:600,cursor:"pointer",marginBottom:showAllCards?14:0,transition:"all 0.2s"}}>
            {showAllCards ? "收起卡片列表 ↑" : `查看全部 ${cards.length} 张 ↓`}
          </button>
          {showAllCards && (
            <div style={{animation:"fadeUp 0.3s ease both"}}>
              {/* Filters */}
              <div style={{display:"flex",gap:8,marginBottom:12,overflowX:"auto",scrollbarWidth:"none"}}>
                {[["all","全部"],["PC","PC"],["investment","投资"],["longhold","长持"]].map(([v,l])=>(
                  <button key={v} onClick={()=>setCf(v)} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${cf===v?T.borderGold:T.border}`,background:cf===v?"rgba(201,168,76,0.1)":"transparent",color:cf===v?T.gold:T.muted,fontSize:12,whiteSpace:"nowrap",cursor:"pointer"}}>{l}</button>
                ))}
              </div>
              <div style={{position:"relative",marginBottom:12}}>
                <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:14,color:T.dim,pointerEvents:"none"}}>🔍</span>
                <input value={q} onChange={e=>setQ(e.target.value)} placeholder="搜索球星、系列..."
                  style={{width:"100%",padding:"10px 16px 10px 40px",border:`1px solid ${T.border}`,borderRadius:10,background:T.s2,color:T.text,fontSize:13,outline:"none"}}
                  onFocus={e=>e.target.style.borderColor=T.gold} onBlur={e=>e.target.style.borderColor=T.border} />
              </div>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,marginBottom:10}}>{filteredCards.length} 张</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {filteredCards.map(c=><CardRow key={c.id} card={c} ps={pcP} onClick={()=>nav("detail",c)} />)}
                {filteredCards.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:T.dim,fontSize:12}}>没有匹配的卡片</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Today's Pick (moved below) */}
      {daily&&(<div style={{padding:"16px 16px 0",animation:"fadeUp 0.5s ease 240ms both"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,padding:"0 4px"}}>
          <span style={{fontSize:17,fontWeight:600,color:T.text,letterSpacing:"-0.3px"}}>今日精选</span>
          <button onClick={e=>{e.stopPropagation();refreshDaily();}} style={{background:"none",border:"none",color:T.gold,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontWeight:500,padding:0}}>🔀 换一张</button>
        </div>
        <DailyCardFull card={daily} players={pcP} />
      </div>)}
    </div>
  );
}

function SearchScreen() {
  const {cards,pcP,nav}=useApp();
  const [q,setQ]=useState(""); const [cf,setCf]=useState("all"); const [pf,setPf]=useState("all"); const [yf,setYf]=useState("all");
  const ref=useRef(); useEffect(()=>{setTimeout(()=>ref.current?.focus(),100);},[]);
  const years = ["all",...[...new Set(cards.map(c=>c.year).filter(Boolean))].sort((a,b)=>b.localeCompare(a))];
  const list=useMemo(() => cards.filter(c=>{
    if(cf!=="all"&&c.category!==cf)return false;
    if(pf!=="all"&&c.player!==pf)return false;
    if(yf!=="all"&&c.year!==yf)return false;
    if(q){const terms=expandQ(q);const fields=[c.player,c.series,c.parallel,c.card_number,c.numbered,c.grade,c.team,c.sub_series,c.year,...(c.tags||[])].filter(Boolean).map(f=>f.toLowerCase());return terms.some(t=>fields.some(f=>f.includes(t)));}
    return true;
  }), [cards, cf, pf, yf, q]);
  return <div style={{paddingBottom:90}}>
    <div style={{padding:"16px 20px 12px",position:"sticky",top:0,background:T.bg,zIndex:10}}>
      <div style={{position:"relative"}}>
        <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:14,color:T.dim,pointerEvents:"none"}}>🔍</span>
        <input ref={ref} value={q} onChange={e=>setQ(e.target.value)} placeholder="球星、字母哥、勇士、金卡..."
          style={{width:"100%",padding:"12px 16px 12px 40px",border:`1px solid ${T.border}`,borderRadius:12,background:T.s2,color:T.text,fontSize:14,outline:"none"}}
          onFocus={e=>e.target.style.borderColor=T.gold} onBlur={e=>e.target.style.borderColor=T.border} />
      </div>
      <div style={{display:"flex",gap:8,marginTop:10,overflowX:"auto",scrollbarWidth:"none",paddingBottom:2}}>
        {[["all","全部"],["PC","PC"],["investment","投资"],["longhold","长持"]].map(([v,l])=>(
          <button key={v} onClick={()=>setCf(v)} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${cf===v?T.borderGold:T.border}`,background:cf===v?"rgba(201,168,76,0.1)":"transparent",color:cf===v?T.gold:T.muted,fontSize:12,whiteSpace:"nowrap"}}>{l}</button>
        ))}
        <div style={{width:1,background:T.border,margin:"4px 2px"}} />
        {[["all","全部球星"],...pcP.map(p=>[p.name,`${p.emoji} ${p.short}`])].map(([v,l])=>(
          <button key={v} onClick={()=>setPf(v)} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${pf===v?T.borderGold:T.border}`,background:pf===v?"rgba(201,168,76,0.1)":"transparent",color:pf===v?T.gold:T.muted,fontSize:12,whiteSpace:"nowrap"}}>{l}</button>
        ))}
      </div>
      {years.length>2&&<div style={{display:"flex",gap:8,marginTop:6,overflowX:"auto",scrollbarWidth:"none",paddingBottom:4}}>
        <span style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,alignSelf:"center",flexShrink:0,paddingLeft:4}}>📅</span>
        {years.map(v=>(
          <button key={v} onClick={()=>setYf(v)} style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${yf===v?T.borderGold:T.border}`,background:yf===v?"rgba(201,168,76,0.1)":"transparent",color:yf===v?T.gold:T.muted,fontSize:11,whiteSpace:"nowrap",fontFamily:"'Space Mono',monospace"}}>{v==="all"?"全部年份":v}</button>
        ))}
      </div>}
    </div>
    <div style={{padding:"0 20px"}}>
      <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,marginBottom:12}}>{list.length} 张卡片</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {list.map((c,i)=><CardRow key={c.id} card={c} ps={pcP} onClick={()=>nav("detail",c)} style={{animation:`fadeUp 0.3s ease ${i*40}ms both`}} />)}
        {list.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:T.dim}}><div style={{fontSize:32,marginBottom:8}}>🔍</div><div style={{fontSize:13}}>没有匹配的卡片</div></div>}
      </div>
    </div>
  </div>;
}

function MarketPricePanel({ card }) {
  const { rate } = useApp();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(false);
  const [customQ, setCustomQ] = useState("");
  const defaultQ = [card.player?.split(" ").pop(),card.year,card.series?.replace(/Basketball|NBA|Panini/gi,"").trim(),card.parallel,card.numbered,card.grade!=="RAW"?card.grade:null].filter(Boolean).join(" ");
  const query = async (useCustom) => {
    setLoading(true); setErr(null); setResult(null); setEditing(false);
    const r = await apiEbayPrice(card, useCustom?customQ:undefined);
    if(r.success){setResult(r);if(!customQ)setCustomQ(r.keyword||defaultQ);}
    else setErr(r.error);
    setLoading(false);
  };
  const fmtUSD=n=>n?`$${Number(n).toLocaleString("en-US",{maximumFractionDigits:0})}`:"—";
  const toRMB=n=>n?`¥${Math.round(Number(n)*rate).toLocaleString("zh-CN")}`:"—";
  return (
    <div style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:14,padding:16,marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div><div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,letterSpacing:1,marginBottom:2}}>EBAY · 真实成交价</div><div style={{fontSize:12,color:T.muted}}>近期 Sold Listings</div></div>
        <button onClick={()=>query(false)} disabled={loading} style={{padding:"8px 16px",borderRadius:10,border:"none",background:loading?T.s3:`linear-gradient(135deg,${T.gold},${T.goldDark})`,color:loading?T.dim:"#000",fontSize:12,fontWeight:700,cursor:loading?"not-allowed":"pointer",flexShrink:0}}>
          {loading?<span style={{display:"flex",alignItems:"center",gap:4}}>{[0,1,2].map(i=><span key={i} style={{width:4,height:4,borderRadius:"50%",background:T.dim,display:"inline-block",animation:`pulse 0.8s ease ${i*150}ms infinite`}}/>)}</span>:result?"重新查询":"🔍 查行情"}
        </button>
      </div>
      <div style={{marginBottom:12}}>
        {editing?(
          <div style={{display:"flex",gap:8}}>
            <input value={customQ||defaultQ} onChange={e=>setCustomQ(e.target.value)} style={{flex:1,padding:"8px 10px",border:`1px solid ${T.borderGold}`,borderRadius:8,background:T.s3,color:T.text,fontSize:12,outline:"none"}}/>
            <button onClick={()=>query(true)} style={{padding:"8px 14px",borderRadius:8,border:"none",background:T.gold,color:"#000",fontSize:12,fontWeight:700,cursor:"pointer"}}>搜索</button>
            <button onClick={()=>setEditing(false)} style={{padding:"8px 10px",borderRadius:8,border:`1px solid ${T.border}`,background:"transparent",color:T.dim,fontSize:12,cursor:"pointer"}}>✕</button>
          </div>
        ):(
          <div style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}} onClick={()=>{setCustomQ(customQ||defaultQ);setEditing(true);}}>
            <span style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{customQ||defaultQ}</span>
            <span style={{fontSize:10,color:T.gold,flexShrink:0}}>✎ 修改</span>
          </div>
        )}
      </div>
      {loading&&<div style={{padding:"8px 0",fontSize:12,color:T.muted,display:"flex",alignItems:"center",gap:8}}><span style={{animation:"pulse 1s ease infinite"}}>🔍</span>搜索 eBay 成交记录...</div>}
      {err&&<div style={{padding:"10px 12px",borderRadius:8,background:"rgba(212,80,80,0.08)",border:"1px solid rgba(212,80,80,0.2)",fontSize:12,color:T.red}}>{err}</div>}
      {result?.success&&(<div style={{animation:"fadeUp 0.4s ease both"}}>
        {!result.results?.length?(<div style={{fontSize:12,color:T.muted,padding:"8px 0"}}>未找到成交记录，建议点"✎ 修改"调整搜索词</div>):<>
          {result.stats&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
            {[{l:"均价",v:result.stats.avg},{l:"最低",v:result.stats.min},{l:"最高",v:result.stats.max}].map((s,i)=>(
              <div key={i} style={{background:T.s3,borderRadius:10,padding:"10px 8px",textAlign:"center"}}>
                <div style={{fontSize:10,color:T.dim,marginBottom:4}}>{s.l}</div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,fontWeight:700,color:T.gold}}>{fmtUSD(s.v)}</div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,marginTop:2}}>{toRMB(s.v)}</div>
              </div>
            ))}
          </div>}
          <div style={{fontSize:10,color:T.dim,fontFamily:"'Space Mono',monospace",letterSpacing:1,marginBottom:8}}>近期成交 · {result.stats?.count} 条</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {result.results?.slice(0,5).map((item,i)=>{
              const date=item.endTime?new Date(item.endTime).toLocaleDateString("zh-CN",{month:"numeric",day:"numeric"}):"";
              return <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",background:T.s3,borderRadius:8}}>
                <div style={{flex:1,minWidth:0,marginRight:8}}><div style={{fontSize:11,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div><div style={{fontSize:10,color:T.dim,marginTop:2}}>{date}{item.condition?` · ${item.condition}`:""}</div></div>
                <div style={{textAlign:"right",flexShrink:0}}><div style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,color:T.green}}>{fmtUSD(item.price)}</div><div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim}}>{toRMB(item.price)}</div></div>
              </div>;
            })}
          </div>
          <div style={{fontSize:10,color:T.dim,marginTop:8,textAlign:"right"}}>数据来源：eBay Completed Listings</div>
        </>}
      </div>)}
    </div>
  );
}

function DetailScreen() {
  const {sel:card,pcP,nav,dc,rate}=useApp();
  const [imgTab,setImgTab]=useState("front");
  if(!card){nav("home");return null;}
  const st=STATUS[card.status]||STATUS.holding;
  const dual=fmtDual(card.buy_price,rate,card.price_currency||"RMB");
  const sellDual=fmtDual(card.sell_price,rate,card.price_currency||"RMB");
  const pnl=card.sell_price?(parseFloat(card.sell_price)||0)-(parseFloat(card.buy_price)||0):null;

  return <div style={{paddingBottom:90}}>
    <div style={{padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:T.bg,zIndex:10,borderBottom:`1px solid ${T.border}`}}>
      <button onClick={()=>nav("search")} style={{background:"none",border:"none",color:T.muted,fontSize:20}}>←</button>
      <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.dim}}>CARD DETAIL</span>
      <button onClick={()=>nav("edit",card)} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${T.borderGold}`,background:`rgba(201,168,76,0.08)`,color:T.gold,fontSize:12,fontWeight:700}}>编辑</button>
    </div>
    <div style={{padding:"20px",animation:"fadeUp 0.4s ease both"}}>
      <div style={{display:"flex",justifyContent:"center",marginBottom:20}}>
        <div>
          <div style={{width:220,height:308,borderRadius:16,overflow:"hidden",background:card.front_image?"#0a0a14":cGrad(card.player,pcP),display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",border:"1px solid rgba(255,255,255,0.1)",boxShadow:"0 12px 40px rgba(0,0,0,0.5)",margin:"0 auto"}}>
            {imgTab==="front"&&card.front_image?<img src={card.front_image} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} />
             :imgTab==="back"&&card.back_image?<img src={card.back_image} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}} />
             :<><span style={{fontSize:64}}>{pEmoji(card.player,pcP)}</span><span style={{fontFamily:"'Space Mono',monospace",fontSize:12,color:"rgba(255,255,255,0.6)",marginTop:8}}>{card.card_number}</span>{card.numbered&&<span style={{fontFamily:"'Space Mono',monospace",fontSize:16,color:T.gold,fontWeight:700}}>{card.numbered}</span>}</>}
          </div>
          <div style={{display:"flex",gap:6,justifyContent:"center",marginTop:10}}>
            {[["front","正面"],["back","背面"]].map(([v,l])=>(
              <button key={v} onClick={()=>setImgTab(v)} style={{padding:"5px 14px",borderRadius:8,border:`1px solid ${imgTab===v?T.borderGold:T.border}`,background:imgTab===v?"rgba(201,168,76,0.1)":"transparent",color:imgTab===v?T.gold:T.dim,fontSize:11,fontFamily:"'Space Mono',monospace"}}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{textAlign:"center",marginBottom:20}}>
        <h2 style={{fontFamily:"'Inter',sans-serif",fontSize:22,color:T.text,marginBottom:6}}>{card.player}</h2>
        <p style={{fontSize:13,color:T.muted}}>{card.year} {card.series}{card.sub_series?` · ${card.sub_series}`:""}</p>
        <div style={{display:"flex",justifyContent:"center",flexWrap:"wrap",gap:6,marginTop:10}}>
          {card.numbered&&<Chip label={card.numbered} color={T.gold} />}
          {card.is_one_of_one&&<Chip label="1 OF 1" color="#FFD700" bg="rgba(255,215,0,0.15)" />}
          {card.is_rc&&<Chip label="RC" color={T.green} />}
          <Chip label={st.label} color={st.color} bg={st.bg} />
          <GChip grade={card.grade} />
          <Chip label={CAT[card.category]?.label} color={CAT[card.category]?.color} />
        </div>
      </div>
      {card.story&&(<div style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:14,padding:16,marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}><span style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,letterSpacing:1}}>PLAYER STORY</span><span style={{fontSize:10,color:T.dim}}>{card.back_image?"📷 来自卡背":"✨ AI生成"}</span></div>
        <p style={{fontSize:13,color:T.text,lineHeight:1.9,margin:0}}>{card.story}</p>
      </div>)}
      {card.buy_price&&<div style={{background:`linear-gradient(135deg,rgba(201,168,76,0.08),rgba(201,168,76,0.03))`,border:`1px solid ${T.borderGold}`,borderRadius:14,padding:"14px 16px",marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:4}}>买入价</div><div style={{fontFamily:"'Space Mono',monospace",fontSize:20,fontWeight:700,color:T.gold}}>{dual.rmb}</div><div style={{fontFamily:"'Space Mono',monospace",fontSize:12,color:T.dim,marginTop:2}}>≈ {dual.usd}</div></div>
          {card.sell_price&&<div style={{textAlign:"right"}}><div style={{fontSize:11,color:T.muted,marginBottom:4}}>出售价</div><div style={{fontFamily:"'Space Mono',monospace",fontSize:20,fontWeight:700,color:T.green}}>{sellDual.rmb}</div>{pnl!==null&&<div style={{fontFamily:"'Space Mono',monospace",fontSize:12,color:pnl>=0?T.green:T.red,marginTop:2}}>{pnl>=0?"▲ ":"▼ "}{fmtDual(Math.abs(pnl),rate,card.price_currency||"RMB").rmb}</div>}</div>}
        </div>
      </div>}
      <MarketPricePanel card={card} />
      {[
        {title:"卡片信息",rows:[["球星",card.player],["球队",card.team],["卡号",card.card_number],["年份",card.year],["系列",card.series],card.sub_series&&["子系列",card.sub_series],["平行",card.parallel],["编号",card.numbered||"无"],["评级",card.grade]].filter(Boolean)},
        {title:"入手信息",rows:[["买入价",`${dual.rmb} / ${dual.usd}`],["买入日期",card.buy_date||"—"],["来源",card.source||"—"],["📍 位置",card.location||"—"],["状态",st.label]]}
      ].map((blk,bi)=>(
        <div key={bi} style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:14,padding:"4px 16px",marginBottom:12}}>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,padding:"12px 0 4px",letterSpacing:1}}>{blk.title.toUpperCase()}</div>
          {blk.rows.map(([l,v],i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderTop:`1px solid ${T.border}`}}>
              <span style={{fontSize:13,color:T.muted}}>{l}</span>
              <span style={{fontFamily:l.includes("位置")?"'Space Mono',monospace":"sans-serif",fontSize:13,color:l.includes("位置")?T.gold:T.text,fontWeight:l.includes("位置")?700:500,textAlign:"right",maxWidth:"60%"}}>{v}</span>
            </div>
          ))}
        </div>
      ))}
      {card.tags?.length>0&&<div style={{marginBottom:12}}><div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,marginBottom:8,letterSpacing:1}}>TAGS</div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{card.tags.map(t=><span key={t} style={{padding:"4px 10px",borderRadius:6,background:T.s3,border:`1px solid ${T.border}`,color:T.muted,fontSize:11}}>#{t}</span>)}</div></div>}
      {card.notes&&<div style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:14,padding:16,marginBottom:12}}><div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,marginBottom:8,letterSpacing:1}}>NOTES</div><p style={{fontSize:13,color:T.muted,lineHeight:1.8}}>{card.notes}</p></div>}
    </div>
  </div>;
}

function PCScreen() {
  const {cards,pcP,nav,dc,rate}=useApp();
  const [sel,setSel]=useState(null);
  const pCards=sel?cards.filter(c=>c.player===sel&&c.category==="PC"):[];
  if(sel) return <div style={{paddingBottom:90}}>
    <div style={{padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${T.border}`}}>
      <button onClick={()=>setSel(null)} style={{background:"none",border:"none",color:T.muted,fontSize:20}}>←</button>
      <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.dim,letterSpacing:1}}>PC VAULT</span>
      <div style={{width:40}} />
    </div>
    <div style={{padding:"20px 20px 0"}}>
      {(()=>{const p=pcP.find(x=>x.name===sel);return p&&<div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}><span style={{fontSize:42}}>{p.emoji}</span><div><div style={{fontFamily:"'Inter',sans-serif",fontSize:20,color:T.text}}>{p.name}</div><div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.dim,marginTop:2}}>{pCards.length} 张 · {fmtP(pCards.reduce((s,c)=>s+(parseFloat(c.buy_price)||0),0),dc,rate)}</div></div></div>;})()}
    </div>
    <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:10,paddingBottom:90}}>
      {pCards.length>0?pCards.map(c=><CardRow key={c.id} card={c} ps={pcP} onClick={()=>nav("detail",c)} />):
      <div style={{textAlign:"center",padding:"48px 0",color:T.dim}}><div style={{fontSize:32,marginBottom:8}}>🃏</div><div style={{fontSize:13}}>还没有录入{sel}的卡</div></div>}
    </div>
  </div>;

  return <div style={{paddingBottom:90}}>
    <div style={{padding:"20px 20px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div><h2 style={{fontSize:22,fontWeight:700,color:T.text,letterSpacing:"-0.4px"}}>PC Vault</h2><p style={{fontSize:12,color:T.muted,marginTop:3}}>你热爱的球星</p></div>
      <button onClick={()=>nav("radar")} style={{padding:"8px 14px",borderRadius:12,border:`1px solid ${T.borderGold}`,background:`rgba(200,168,75,0.08)`,color:T.gold,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>🎯 雷达</button>
    </div>
    <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:14}}>
      {pcP.sort((a,b)=>a.display_order-b.display_order).map((player,i)=>{
        const pc=cards.filter(c=>c.player===player.name&&c.category==="PC");
        const val=pc.reduce((s,c)=>s+(parseFloat(c.buy_price)||0),0);
        const stC=Object.fromEntries(Object.keys(STATUS).map(k=>[k,pc.filter(c=>c.status===k).length]));
        return <div key={player.id} style={{borderRadius:18,overflow:"hidden",border:`1px solid ${T.border}`,animation:`fadeUp 0.4s ease ${i*80}ms both`,cursor:"pointer"}} onClick={()=>setSel(player.name)}>
          <div style={{padding:"18px 20px",background:`linear-gradient(135deg,${player.color1}30,${player.color2}20)`,borderBottom:pc.length>0?`1px solid ${T.border}`:"none",display:"flex",alignItems:"center",gap:14}}>
            <span style={{fontSize:36}}>{player.emoji}</span>
            <div style={{flex:1}}><div style={{fontFamily:"'Inter',sans-serif",fontSize:17,color:T.text}}>{player.name}</div><div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.dim,marginTop:2}}>{pc.length} 张 · {fmtP(val,dc,rate)}</div>
              {pc.length>0&&<div style={{display:"flex",gap:6,marginTop:6}}>{Object.entries(stC).filter(([,v])=>v>0).map(([k,v])=><Chip key={k} label={`${STATUS[k].label} ${v}`} color={STATUS[k].color} bg={STATUS[k].bg} style={{fontSize:9,padding:"2px 6px"}} />)}</div>}
            </div>
            <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.gold}}>→</span>
          </div>
          {pc.slice(0,3).map((c,ci)=>(
            <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 20px",background:T.surface,borderBottom:ci<Math.min(pc.length,3)-1?`1px solid ${T.border}`:"none"}}>
              <div><span style={{fontSize:12,color:T.muted}}>{c.parallel||c.series}</span>{c.numbered&&<span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.gold,marginLeft:6}}>{c.numbered}</span>}</div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>{c.buy_price&&<span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.gold}}>{fmtP(c.buy_price,dc,rate,c.price_currency||"RMB")}</span>}<Chip label={STATUS[c.status]?.label} color={STATUS[c.status]?.color} bg={STATUS[c.status]?.bg} style={{fontSize:9,padding:"2px 6px"}} /></div>
            </div>
          ))}
          {pc.length===0&&<div style={{padding:"14px 20px",background:T.surface,fontSize:12,color:T.dim}}>还没有录入卡片，开始建仓吧 →</div>}
        </div>;
      })}
    </div>
  </div>;
}

function StatsScreen() {
  const {cards,pcP,stats,dc,rate,nav}=useApp();
  const soldCards=cards.filter(c=>c.status==="sold"&&c.sell_price);
  const pnl=soldCards.reduce((s,c)=>s+(parseFloat(c.sell_price)||0)-(parseFloat(c.buy_price)||0),0);
  const holdCards=cards.filter(c=>c.status!=="sold");
  const holdCost=holdCards.reduce((s,c)=>s+(parseFloat(c.buy_price)||0),0);
  const totalValue=cards.reduce((s,c)=>s+(parseFloat(c.buy_price)||0),0);

  const playerGroups=holdCards.reduce((m,c)=>{const p=c.player||"Unknown";m[p]=(m[p]||0)+(parseFloat(c.buy_price)||0);return m;},{});
  const playerSlices=Object.entries(playerGroups).sort((a,b)=>b[1]-a[1]);
  const topPlayers=playerSlices.slice(0,6);
  const othersVal=playerSlices.slice(6).reduce((s,[,v])=>s+v,0);
  if(othersVal>0)topPlayers.push(["其他",othersVal]);
  const pieTotal=topPlayers.reduce((s,[,v])=>s+v,0);
  const pieColors=[T.gold,"#0A84FF","#30D158","#FF9F0A","#9B6DFF","#FF453A","#48484A"];
  let pieAngle=0;
  const pieSegments=topPlayers.map(([name,val],i)=>{const pct=pieTotal>0?val/pieTotal:0;const start=pieAngle;pieAngle+=pct*360;return{name,val,pct,start,end:pieAngle,color:pieColors[i%pieColors.length]};});
  const pieGrad=pieSegments.map(s=>`${s.color} ${s.start}deg ${s.end}deg`).join(",");

  const seriesGroups=holdCards.reduce((m,c)=>{const k=`${c.year||"?"} ${c.series||"Unknown"}`;m[k]=(m[k]||0)+1;return m;},{});
  const seriesBars=Object.entries(seriesGroups).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const barMax=seriesBars.length>0?Math.max(...seriesBars.map(([,v])=>v)):1;

  const top5=cards.filter(c=>c.buy_price).sort((a,b)=>(parseFloat(b.buy_price)||0)-(parseFloat(a.buy_price)||0)).slice(0,5);

  const now=new Date();const weekAgo=new Date(now.getTime()-7*24*60*60*1000);
  const recent7=cards.filter(c=>c.created_at&&new Date(c.created_at)>=weekAgo).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));

  const catData=[
    {key:"PC",label:"PC",color:T.gold,count:holdCards.filter(c=>c.category==="PC").length,val:holdCards.filter(c=>c.category==="PC").reduce((s,c)=>s+(parseFloat(c.buy_price)||0),0)},
    {key:"investment",label:"投资",color:T.blue,count:holdCards.filter(c=>c.category==="investment").length,val:holdCards.filter(c=>c.category==="investment").reduce((s,c)=>s+(parseFloat(c.buy_price)||0),0)},
    {key:"longhold",label:"长持",color:"#9B6DFF",count:holdCards.filter(c=>c.category==="longhold").length,val:holdCards.filter(c=>c.category==="longhold").reduce((s,c)=>s+(parseFloat(c.buy_price)||0),0)},
    {key:"other",label:"其他",color:T.muted,count:holdCards.filter(c=>c.category==="other"||!c.category).length,val:holdCards.filter(c=>c.category==="other"||!c.category).reduce((s,c)=>s+(parseFloat(c.buy_price)||0),0)},
  ];
  const catTotal=catData.reduce((s,c)=>s+c.val,0);

  const SM={fontFamily:"'Space Mono',monospace"};
  const secHead=(text)=>({...SM,fontSize:10,color:T.dim,letterSpacing:1,marginBottom:10});

  return <div style={{paddingBottom:90}}>
    <div style={{padding:"24px 20px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div><h2 style={{...SM,fontSize:18,fontWeight:700,color:T.gold}}>DASHBOARD</h2><p style={{fontSize:11,color:T.dim,marginTop:2}}>Portfolio Overview</p></div>
      <CurrBtn />
    </div>
    <div style={{padding:"0 20px"}}>

      {/* 总收藏价值 Hero */}
      <div style={{padding:"20px",borderRadius:16,background:`linear-gradient(135deg,rgba(200,168,75,0.12),rgba(200,168,75,0.03))`,border:`1px solid ${T.borderGold}`,marginBottom:16,textAlign:"center"}}>
        <div style={{...SM,fontSize:9,color:T.dim,letterSpacing:2,marginBottom:8}}>TOTAL PORTFOLIO VALUE</div>
        <div style={{...SM,fontSize:32,fontWeight:700,color:T.gold,lineHeight:1}}>{fmtP(totalValue,dc,rate)}</div>
        <div style={{...SM,fontSize:11,color:T.dim,marginTop:6}}>≈ {dc==="RMB"?fmtDual(totalValue,rate).usd:fmtDual(totalValue,rate).rmb}</div>
        <div style={{display:"flex",justifyContent:"center",gap:16,marginTop:12}}>
          <div><div style={{...SM,fontSize:9,color:T.dim,letterSpacing:1}}>持仓</div><div style={{...SM,fontSize:14,fontWeight:700,color:T.gold,marginTop:2}}>{fmtP(holdCost,dc,rate)}</div></div>
          <div style={{width:1,background:T.border}} />
          <div><div style={{...SM,fontSize:9,color:T.dim,letterSpacing:1}}>盈亏</div><div style={{...SM,fontSize:14,fontWeight:700,color:pnl>=0?T.green:T.red,marginTop:2}}>{pnl>=0?"+":""}{fmtP(Math.abs(pnl),dc,rate)}</div></div>
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}}>
        {[{icon:"🃏",v:stats.total,l:"总卡"},{icon:"❤️",v:stats.pc,l:"PC"},{icon:"📦",v:stats.grading,l:"送评"},{icon:"✨",v:stats.oneOfOnes,l:"1/1"}].map((s,i)=>(
          <div key={i} style={{padding:"12px 8px",borderRadius:12,textAlign:"center",background:T.s2,border:`1px solid ${T.border}`}}>
            <div style={{fontSize:16,marginBottom:4}}>{s.icon}</div>
            <div style={{...SM,fontSize:16,fontWeight:700,color:T.text}}>{s.v}</div>
            <div style={{fontSize:10,color:T.dim,marginTop:1}}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* 仓位占比 */}
      <div style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:14,padding:"14px 16px",marginBottom:16}}>
        <div style={secHead()}>CATEGORY ALLOCATION</div>
        <div style={{display:"flex",gap:12,alignItems:"center"}}>
          <div style={{flex:1}}>
            {catData.filter(c=>c.count>0).map(c=>{
              const pct=catTotal>0?(c.val/catTotal*100):0;
              return <div key={c.key} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:c.color}} />
                    <span style={{fontSize:12,color:T.text}}>{c.label}</span>
                    <span style={{...SM,fontSize:10,color:T.dim}}>{c.count}张</span>
                  </div>
                  <span style={{...SM,fontSize:11,color:c.color,fontWeight:700}}>{pct.toFixed(0)}%</span>
                </div>
                <div style={{height:4,borderRadius:2,background:T.s3}}>
                  <div style={{height:"100%",borderRadius:2,width:`${pct}%`,background:c.color,transition:"width 0.6s ease"}} />
                </div>
              </div>;
            })}
          </div>
          <div style={{textAlign:"right",minWidth:80}}>
            {catData.filter(c=>c.val>0).map(c=>(
              <div key={c.key} style={{...SM,fontSize:10,color:T.muted,marginBottom:6}}>{fmtP(c.val,dc,rate)}</div>
            ))}
          </div>
        </div>
      </div>

      {/* 球员持仓分布饼图 */}
      {pieTotal>0&&<div style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:14,padding:"14px 16px",marginBottom:16}}>
        <div style={secHead()}>PLAYER ALLOCATION</div>
        <div style={{display:"flex",gap:16,alignItems:"center"}}>
          <div style={{width:120,height:120,borderRadius:"50%",background:`conic-gradient(${pieGrad})`,flexShrink:0,position:"relative"}}>
            <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:56,height:56,borderRadius:"50%",background:T.s2,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{...SM,fontSize:10,color:T.dim}}>{topPlayers.length}人</span>
            </div>
          </div>
          <div style={{flex:1,minWidth:0}}>
            {pieSegments.map((s,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                <div style={{display:"flex",alignItems:"center",gap:5,minWidth:0}}>
                  <div style={{width:8,height:8,borderRadius:2,background:s.color,flexShrink:0}} />
                  <span style={{fontSize:11,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</span>
                </div>
                <span style={{...SM,fontSize:10,color:T.muted,flexShrink:0,marginLeft:6}}>{(s.pct*100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>}

      {/* 系列/年份分布柱状图 */}
      {seriesBars.length>0&&<div style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:14,padding:"14px 16px",marginBottom:16}}>
        <div style={secHead()}>SERIES DISTRIBUTION</div>
        {seriesBars.map(([label,count],i)=>(
          <div key={i} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
              <span style={{fontSize:11,color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"70%"}}>{label}</span>
              <span style={{...SM,fontSize:11,color:T.text,fontWeight:700}}>{count}</span>
            </div>
            <div style={{height:6,borderRadius:3,background:T.s3}}>
              <div style={{height:"100%",borderRadius:3,width:`${(count/barMax)*100}%`,background:`linear-gradient(90deg,${T.gold},${T.goldLight})`,transition:"width 0.6s ease"}} />
            </div>
          </div>
        ))}
      </div>}

      {/* TOP 5 最贵卡 */}
      {top5.length>0&&<div style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:14,padding:"4px 16px",marginBottom:16}}>
        <div style={{...SM,fontSize:10,color:T.dim,padding:"12px 0 4px",letterSpacing:1}}>TOP 5 MOST VALUABLE</div>
        {top5.map((c,i)=>(
          <div key={c.id} onClick={()=>nav("detail",c)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderTop:`1px solid ${T.border}`,cursor:"pointer"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{...SM,fontSize:14,fontWeight:700,color:i===0?T.gold:i<3?T.goldLight:T.dim,width:20,textAlign:"center"}}>{i+1}</div>
              <div>
                <div style={{fontSize:13,color:T.text}}>{c.player}</div>
                <div style={{fontSize:10,color:T.muted}}>{[c.year,c.series,c.parallel].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{...SM,fontSize:13,fontWeight:700,color:T.gold}}>{fmtP(c.buy_price,dc,rate,c.price_currency||"RMB")}</div>
              {c.numbered&&<div style={{...SM,fontSize:9,color:T.dim}}>/{c.numbered}</div>}
            </div>
          </div>
        ))}
      </div>}

      {/* 最近7天新增 */}
      <div style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:14,padding:"4px 16px",marginBottom:16}}>
        <div style={{...SM,fontSize:10,color:T.dim,padding:"12px 0 4px",letterSpacing:1}}>RECENT 7 DAYS · {recent7.length} 张新增</div>
        {recent7.length===0&&<div style={{padding:"16px 0",textAlign:"center",color:T.dim,fontSize:12}}>最近7天没有新卡入库</div>}
        {recent7.slice(0,8).map(c=>{
          const d=new Date(c.created_at);const ds=`${d.getMonth()+1}/${d.getDate()}`;
          return <div key={c.id} onClick={()=>nav("detail",c)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderTop:`1px solid ${T.border}`,cursor:"pointer"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{...SM,fontSize:10,color:T.dim,width:32}}>{ds}</span>
              <div>
                <div style={{fontSize:13,color:T.text}}>{c.player}</div>
                <div style={{fontSize:10,color:T.muted}}>{c.series}{c.parallel?` · ${c.parallel}`:""}</div>
              </div>
            </div>
            {c.buy_price&&<span style={{...SM,fontSize:11,color:T.gold}}>{fmtP(c.buy_price,dc,rate,c.price_currency||"RMB")}</span>}
          </div>;
        })}
        {recent7.length>8&&<div style={{padding:"8px 0",textAlign:"center",fontSize:11,color:T.dim}}>还有 {recent7.length-8} 张...</div>}
      </div>

      {/* STATUS BREAKDOWN */}
      <div style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:14,padding:"4px 16px",marginBottom:16}}>
        <div style={{...SM,fontSize:10,color:T.dim,padding:"12px 0 4px",letterSpacing:1}}>STATUS BREAKDOWN</div>
        {Object.entries(STATUS).map(([k,v])=>{
          const cs=cards.filter(c=>c.status===k);
          const val=cs.reduce((s,c)=>s+(parseFloat(c.buy_price)||0),0);
          return <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderTop:`1px solid ${T.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><Chip label={v.label} color={v.color} bg={v.bg} /><span style={{...SM,fontSize:13,color:T.text,fontWeight:700}}>{cs.length}</span></div>
            {val>0&&<span style={{...SM,fontSize:11,color:T.muted}}>{fmtP(val,dc,rate)}</span>}
          </div>;
        })}
      </div>

      {/* INVESTMENT P&L */}
      {soldCards.length>0&&<div style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:14,padding:"4px 16px",marginBottom:16}}>
        <div style={{...SM,fontSize:10,color:T.dim,padding:"12px 0 4px",letterSpacing:1}}>INVESTMENT P&L</div>
        {soldCards.slice(0,5).map(c=>{
          const p=(parseFloat(c.sell_price)||0)-(parseFloat(c.buy_price)||0);
          return <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderTop:`1px solid ${T.border}`}}>
            <div><div style={{fontSize:13,color:T.text}}>{c.player}</div><div style={{fontSize:10,color:T.muted}}>{c.parallel||c.series}</div></div>
            <span style={{...SM,fontSize:12,color:p>=0?T.green:T.red,fontWeight:700}}>{p>=0?"+":""}{fmtP(Math.abs(p),dc,rate,c.price_currency||"RMB")}</span>
          </div>;
        })}
      </div>}

      {/* PC BREAKDOWN */}
      <div style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:14,padding:"12px 16px"}}>
        <div style={{...SM,fontSize:10,color:T.dim,marginBottom:14,letterSpacing:1}}>PC BREAKDOWN</div>
        {pcP.map(player=>{
          const cs=cards.filter(c=>c.player===player.name);
          const pct=stats.total>0?(cs.length/stats.total)*100:0;
          const val=cs.reduce((s,c)=>s+(parseFloat(c.buy_price)||0),0);
          return <div key={player.id} style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:T.muted}}>{player.emoji} {player.short}</span><span style={{...SM,fontSize:11,color:T.gold}}>{cs.length}张 · {fmtP(val,dc,rate)}</span></div>
            <div style={{height:3,borderRadius:2,background:T.s3}}><div style={{height:"100%",borderRadius:2,width:`${pct}%`,background:`linear-gradient(90deg,${player.color1},${T.gold})`,transition:"width 0.6s ease"}} /></div>
          </div>;
        })}
      </div>
    </div>
  </div>;
}

// ── 雷达页面（完整新版）────────────────────────────────────────────────────────
function RadarScreen() {
  const { pcP, rate } = useApp();
  const [tab, setTab] = useState("scan");
  const [scanData, setScanData] = useState(null);
  const [goals, setGoals] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [loadingGoals, setLoadingGoals] = useState(false);
  const [scanErr, setScanErr] = useState(null);
  const [lastScanMsg, setLastScanMsg] = useState(null);
  const [showNewGoal, setShowNewGoal] = useState(false);

  useEffect(() => { loadScanResults(); loadGoals(); }, []);

  const loadScanResults = async () => { const d = await apiGetScanResults(); setScanData(d); };
  const loadGoals = async () => { setLoadingGoals(true); const d = await apiGetGoals(); setGoals(d); setLoadingGoals(false); };

  const runScan = async (goal_id = null) => {
    setScanning(true); setScanErr(null);
    const r = await apiRadarScan(goal_id);
    await loadScanResults();
    const msg = r.message || (r.success ? "扫描完成" : r.error || "扫描失败");
    setLastScanMsg(msg);
    if (!r.success || r.found === 0) setScanErr(msg);
    setScanning(false);
  };

  const fmtTime = iso => { if (!iso) return ""; const d = new Date(iso); return d.toLocaleString("zh-CN", { month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit" }); };
  const fmtPrice = (price, currency) => { if (!price) return "—"; if (currency === "USD") return `$${Number(price).toFixed(0)}  ≈ ¥${Math.round(price * rate).toLocaleString("zh-CN")}`; return `¥${Number(price).toLocaleString("zh-CN")}`; };

  const totalMissing = goals.reduce((s, g) => s + (g.missing_count || 0), 0);
  const hasResults = scanData && (scanData.mustWatch?.length > 0 || scanData.niceToHave?.length > 0);
  const summary = scanData?.summary;

  if (showNewGoal) return <NewGoalScreen pcP={pcP} onDone={() => { setShowNewGoal(false); loadGoals(); }} onBack={() => setShowNewGoal(false)} />;

  return (
    <div style={{ paddingBottom: 90 }}>
      <div style={{ padding:"20px 20px 0", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <h2 style={{ fontSize:24, fontWeight:700, color:T.text, letterSpacing:"-0.5px" }}>🎯 雷达</h2>
          <p style={{ fontSize:12, color:T.muted, marginTop:3 }}>
            {goals.length} 个目标 · {totalMissing} 张缺口
            {scanData?.lastScanned && <span style={{ marginLeft:6 }}>· 扫描于 {fmtTime(scanData.lastScanned)}</span>}
          </p>
        </div>
        <button onClick={runScan} disabled={scanning || goals.length === 0} style={{ padding:"10px 16px", borderRadius:12, border:"none", background: scanning || goals.length === 0 ? T.s2 : `linear-gradient(135deg,${T.gold},${T.goldDark})`, color: scanning || goals.length === 0 ? T.dim : "#000", fontSize:12, fontWeight:700, cursor: scanning || goals.length === 0 ? "not-allowed" : "pointer" }}>
          {scanning ? <span style={{ display:"flex", alignItems:"center", gap:5 }}>{[0,1,2].map(i=><span key={i} style={{ width:4,height:4,borderRadius:"50%",background:T.dim,display:"inline-block",animation:`pulse 0.8s ease ${i*150}ms infinite` }} />)}<span>扫描中</span></span> : "🔍 立即扫描"}
        </button>
      </div>

      <div style={{ display:"flex", gap:2, margin:"14px 16px 0", background:T.s2, borderRadius:10, padding:3 }}>
        {[["scan","今日发现"],["goals","收集目标"]].map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex:1, padding:"8px", borderRadius:8, border:"none", background: tab===id ? T.s3 : "transparent", color: tab===id ? T.gold : T.muted, fontSize:13, fontWeight: tab===id ? 700 : 400, transition:"all 0.2s" }}>{label}</button>
        ))}
      </div>

      <div style={{ padding:"14px 16px" }}>
        {scanErr && (
          <div style={{ padding:"10px 14px", borderRadius:10,
            background: scanErr.includes("完成") ? "rgba(255,159,10,0.08)" : "rgba(212,80,80,0.08)",
            border: `1px solid ${scanErr.includes("完成") ? "rgba(255,159,10,0.3)" : "rgba(212,80,80,0.2)"}`,
            fontSize:12, color: scanErr.includes("完成") ? T.orange : T.red, marginBottom:14 }}>
            {scanErr.includes("完成") ? "📡 " : "⚠️ "}{scanErr}
          </div>
        )}

        {tab === "scan" && (
          <div style={{ animation:"fadeUp 0.3s ease both" }}>

            {/* 最近一次扫描消息 */}
            {lastScanMsg && !hasResults && (
              <div style={{ padding:"12px 14px", borderRadius:12, marginBottom:14,
                background: lastScanMsg.includes("✅") ? "rgba(48,209,88,0.08)" : "rgba(255,159,10,0.08)",
                border: `1px solid ${lastScanMsg.includes("✅") ? "rgba(48,209,88,0.25)" : "rgba(255,159,10,0.25)"}`,
                fontSize:12, color: lastScanMsg.includes("✅") ? T.green : T.orange, lineHeight:1.7 }}>
                {lastScanMsg.includes("✅") ? "✅ " : "📡 "}{lastScanMsg}
              </div>
            )}

            {!hasResults && !scanning && (
              <div style={{ background:T.s2, borderRadius:16, padding:24, textAlign:"center" }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📡</div>
                <div style={{ fontSize:14, color:T.text, marginBottom:6 }}>{goals.length === 0 ? "先创建收集目标" : "点击右上角「立即扫描」"}</div>
                <div style={{ fontSize:12, color:T.muted, lineHeight:1.7 }}>{goals.length === 0 ? "在「收集目标」页面定义你要找的卡，雷达会每天帮你盯着市场" : "扫描会搜索 eBay 上所有你缺口卡片的在售 listing"}</div>
                {goals.length === 0 && <button onClick={() => setTab("goals")} style={{ marginTop:14, padding:"10px 20px", borderRadius:10, border:"none", background:T.gold, color:"#000", fontSize:13, fontWeight:700, cursor:"pointer" }}>去创建目标 →</button>}
              </div>
            )}
            {scanning && (
              <div style={{ background:T.s2, borderRadius:16, padding:24, textAlign:"center" }}>
                <div style={{ fontSize:32, marginBottom:12, animation:"pulse 1s ease infinite" }}>🔍</div>
                <div style={{ fontSize:14, color:T.text, marginBottom:4 }}>正在扫描 eBay</div>
                <div style={{ fontSize:12, color:T.muted }}>搜索 {totalMissing} 张缺口卡...</div>
              </div>
            )}
            {hasResults && !scanning && summary && (summary.buyOpportunities > 0 || summary.sellWindows > 0) && (
              <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                <div style={{ flex:1, padding:"12px", borderRadius:12, background:"rgba(48,209,88,0.06)", border:"1px solid rgba(48,209,88,0.2)", textAlign:"center" }}>
                  <div style={{ fontFamily:"'Space Mono',monospace", fontSize:20, fontWeight:700, color:T.green }}>{summary.buyOpportunities}</div>
                  <div style={{ fontSize:10, color:T.muted, marginTop:2 }}>🔥 买入机会</div>
                </div>
                <div style={{ flex:1, padding:"12px", borderRadius:12, background:"rgba(255,159,10,0.06)", border:"1px solid rgba(255,159,10,0.2)", textAlign:"center" }}>
                  <div style={{ fontFamily:"'Space Mono',monospace", fontSize:20, fontWeight:700, color:T.orange }}>{summary.sellWindows}</div>
                  <div style={{ fontSize:10, color:T.muted, marginTop:2 }}>💰 出货窗口</div>
                </div>
                <div style={{ flex:1, padding:"12px", borderRadius:12, background:T.s2, border:`1px solid ${T.border}`, textAlign:"center" }}>
                  <div style={{ fontFamily:"'Space Mono',monospace", fontSize:20, fontWeight:700, color:T.text }}>{summary.totalResults}</div>
                  <div style={{ fontSize:10, color:T.muted, marginTop:2 }}>总匹配</div>
                </div>
              </div>
            )}
            {hasResults && !scanning && <>
              {scanData.mustWatch?.length > 0 && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:T.red, background:"rgba(255,69,58,0.12)", padding:"3px 10px", borderRadius:20 }}>🔴 重点关注</span>
                    <span style={{ fontSize:11, color:T.dim }}>{scanData.mustWatch.length} 个</span>
                  </div>
                  {scanData.mustWatch.map((group, gi) => <ScanResultGroup key={gi} group={group} fmtPrice={fmtPrice} onDismiss={loadScanResults} />)}
                </div>
              )}
              {scanData.niceToHave?.length > 0 && (
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:T.orange, background:"rgba(255,159,10,0.12)", padding:"3px 10px", borderRadius:20 }}>🟡 可能感兴趣</span>
                    <span style={{ fontSize:11, color:T.dim }}>{scanData.niceToHave.length} 个</span>
                  </div>
                  {scanData.niceToHave.map((group, gi) => <ScanResultGroup key={gi} group={group} fmtPrice={fmtPrice} onDismiss={loadScanResults} />)}
                </div>
              )}
            </>}
          </div>
        )}

        {tab === "goals" && (
          <div style={{ animation:"fadeUp 0.3s ease both" }}>
            <button onClick={() => setShowNewGoal(true)} style={{ width:"100%", padding:"12px", borderRadius:12, border:`1px dashed ${T.borderGold}`, background:"rgba(200,168,75,0.06)", color:T.gold, fontSize:13, fontWeight:600, cursor:"pointer", marginBottom:14 }}>
              + 新建收集目标
            </button>
            {loadingGoals && [1,2,3].map(i => <Skel key={i} height={80} radius={14} style={{ marginBottom:10 }} />)}
            {!loadingGoals && goals.length === 0 && (
              <div style={{ textAlign:"center", padding:"32px 0", color:T.dim }}>
                <div style={{ fontSize:32, marginBottom:8 }}>🎯</div>
                <div style={{ fontSize:13 }}>还没有收集目标</div>
                <div style={{ fontSize:11, marginTop:4 }}>点上方按钮创建你的第一个目标</div>
              </div>
            )}
            {goals.map(goal => <GoalCard key={goal.id} goal={goal} onDelete={async () => { await apiDeleteGoal(goal.id); loadGoals(); }} onSync={async () => { await apiSyncGoal(goal.id); loadGoals(); }} onRefresh={loadGoals} onScanDone={(msg) => { loadScanResults(); setLastScanMsg(msg); if (!msg?.includes("✅")) setScanErr(msg); setTab("scan"); }} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ScanResultGroup({ group, fmtPrice, onDismiss }) {
  const [expanded, setExpanded] = useState(true); // 默认展开
  const wi = group.watch_item;
  const results = group.results || [];
  const best = results[0];
  const bestPrice = best ? (best.price_currency === 'RMB' ? `¥${Number(best.price).toFixed(0)}` : `$${Number(best.price).toFixed(0)}`) : null;

  return (
    <div style={{ background:T.s2, borderRadius:14, overflow:"hidden", marginBottom:12, border:`1px solid ${T.border}` }}>
      {/* 头部 */}
      <div onClick={() => setExpanded(e => !e)} style={{ padding:"12px 14px", cursor:"pointer" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:3 }}>{wi?.description}</div>
            <div style={{ fontSize:11, color:T.muted }}>
              {wi?.goal?.title || "—"} · {results.length} 个结果
              {best?.platform === 'katao' && <span style={{ marginLeft:6, color:T.blue, fontWeight:600 }}>卡淘</span>}
            </div>
          </div>
          <div style={{ textAlign:"right", flexShrink:0, marginLeft:10 }}>
            {bestPrice && <div style={{ fontSize:14, fontWeight:700, color:T.green }}>{bestPrice}</div>}
            <div style={{ fontSize:10, color:T.dim, marginTop:2 }}>{expanded ? "↑" : "↓"}</div>
          </div>
        </div>
      </div>

      {/* 展开：卡片列表 */}
      {expanded && (
        <div style={{ borderTop:`1px solid ${T.border}` }}>
          {results.map((r, i) => (
            <div key={r.id || i} style={{ display:"flex", gap:10, padding:"10px 14px", borderBottom: i < results.length - 1 ? `1px solid ${T.border}` : "none" }}>
              {/* 缩略图 */}
              {r.image_url && (
                <div style={{ width:52, height:72, borderRadius:6, overflow:"hidden", flexShrink:0, background:"#000" }}>
                  <img src={r.image_url} alt="" style={{ width:"100%", height:"100%", objectFit:"contain" }} />
                </div>
              )}
              {/* 信息 */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                  {r.investment_signal === 'buy_opportunity' && <span style={{ fontSize:9, fontWeight:700, color:T.green, background:"rgba(48,209,88,0.12)", padding:"2px 6px", borderRadius:4 }}>🔥 买入</span>}
                  {r.investment_signal === 'sell_window' && <span style={{ fontSize:9, fontWeight:700, color:T.orange, background:"rgba(255,159,10,0.12)", padding:"2px 6px", borderRadius:4 }}>💰 出货</span>}
                </div>
                <div style={{ fontSize:12, color:T.text, lineHeight:1.45, marginBottom:5, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{r.title}</div>
                <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                  <span style={{ fontSize:13, fontWeight:700, color:T.gold }}>
                    {r.price_currency === 'RMB' ? `¥${Number(r.price).toLocaleString('zh-CN')}` : `$${Number(r.price).toFixed(0)}`}
                  </span>
                  {r.listing_type === 'auction' && r.bid_count > 0 &&
                    <span style={{ fontSize:10, color:T.muted }}>{r.bid_count}次竞价</span>}
                  {r.time_remaining &&
                    <span style={{ fontSize:10, color: r.time_remaining.includes('分') ? T.red : T.muted }}>⏱ {r.time_remaining}</span>}
                  {r.platform === 'katao' &&
                    <span style={{ fontSize:9, fontWeight:700, color:T.blue, background:"rgba(10,132,255,0.1)", padding:"2px 6px", borderRadius:4 }}>卡淘</span>}
                  {r.matched_investment && <span style={{ fontSize:9, color:T.dim }}>行动分 {r.matched_investment.action_score}</span>}
                </div>
              </div>
              {/* 查看按钮 */}
              <div style={{ flexShrink:0, alignSelf:"center" }}>
                {r.listing_url
                  ? <a href={r.listing_url} target="_blank" rel="noreferrer" style={{ display:"block", padding:"7px 12px", borderRadius:8, background:`linear-gradient(135deg,${T.gold},${T.goldDark})`, color:"#000", fontSize:11, fontWeight:700, textDecoration:"none" }}>查看</a>
                  : <span style={{ fontSize:10, color:T.dim }}>无链接</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GoalCard({ goal, onDelete, onSync, onRefresh, onScanDone }) {
  const [syncing, setSyncing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addKw, setAddKw] = useState("");
  const [adding, setAdding] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [removingItem, setRemovingItem] = useState(null);
  const [soldResults, setSoldResults] = useState(null);
  const [loadingSold, setLoadingSold] = useState(false);

  const doScan = async e => {
    e.stopPropagation();
    setScanning(true); setScanMsg("");
    const r = await apiRadarScan(goal.id);
    const msg = r.message || (r.success ? "扫描完成" : r.error || "扫描失败");
    setScanMsg(msg);
    setScanning(false);
    if (onScanDone) onScanDone(msg);
  };

  const doAdd = async () => {
    if (!addName.trim()) return;
    setAdding(true);
    await apiAddWatchItem({
      goal_id: goal.id,
      description: addName.trim(),
      search_keywords_ebay: addKw.trim() || addName.trim(),
      search_keywords_katao: addKw.trim() || addName.trim(),
    });
    setAddName(""); setAddKw(""); setShowAddForm(false); setAdding(false);
    if (onRefresh) onRefresh();
  };

  const doRemoveItem = async (itemName) => {
    setRemovingItem(itemName);
    await apiRemoveGoalItem(goal.id, itemName);
    setRemovingItem(null);
    if (onRefresh) onRefresh();
  };

  const doLoadSold = async (e) => {
    e.stopPropagation();
    setLoadingSold(true); setSoldResults(null);
    const r = await apiRadarScanSold(goal.id);
    setSoldResults(r.results || []);
    setLoadingSold(false);
  };

  const TIER_COLOR = { common:T.muted, numbered:T.blue, premium:T.gold, ultra:T.orange, "1of1":T.red };
  const doSync = async e => { e.stopPropagation(); setSyncing(true); await onSync(); setSyncing(false); };
  const pct = goal.progress_pct || 0;
  const missing = goal.missing_items || [];
  const owned = goal.owned_items || [];
  const isComplete = pct === 100;

  return (
    <div style={{ background:T.s2, borderRadius:14, overflow:"hidden", marginBottom:10, border:`1px solid ${isComplete ? T.borderGold : T.border}` }}>
      <div onClick={() => setExpanded(e => !e)} style={{ padding:"14px", cursor:"pointer" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:14, fontWeight:600, color:T.text, marginBottom:3 }}>
              {isComplete && <span style={{ marginRight:6 }}>✅</span>}{goal.title}
            </div>
            <div style={{ fontSize:11, color:T.muted }}>
              {goal.checklist?.set_name || "—"} · {goal.owned_count}/{goal.total_items} 已有 ·{" "}
              {missing.length > 0
                ? <span style={{ color:T.orange }}>{missing.length} 缺口</span>
                : <span style={{ color:T.green }}>已集齐</span>}
            </div>
          </div>
          <div style={{ display:"flex", gap:6, alignItems:"center", marginLeft:10 }}>
            <button onClick={doScan} disabled={scanning || syncing} style={{ padding:"5px 10px", borderRadius:8, border:"none", background: scanning ? T.s3 : `linear-gradient(135deg,${T.gold},${T.goldDark})`, color: scanning ? T.dim : "#000", fontSize:11, fontWeight:700, cursor:"pointer" }}>
              {scanning ? "扫描中..." : "🔍 扫描"}
            </button>
            <span style={{ fontSize:14, color:T.dim }}>{expanded ? "↑" : "↓"}</span>
          </div>
        </div>
        <div style={{ height:4, borderRadius:2, background:T.s3 }}>
          <div style={{ height:"100%", borderRadius:2, width:`${pct}%`, background: isComplete ? `linear-gradient(90deg,${T.green},${T.goldLight})` : `linear-gradient(90deg,${T.gold},${T.goldLight})`, transition:"width 0.6s ease" }} />
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
          <span style={{ fontSize:10, color:T.dim }}>收集进度</span>
          <span style={{ fontSize:10, color: isComplete ? T.green : T.gold, fontFamily:"monospace", fontWeight:700 }}>{pct}%</span>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop:`1px solid ${T.border}`, padding:"10px 14px" }}>
          {(owned.length > 0 || missing.length > 0) && (
            <div style={{ marginBottom:12 }}>
              <div style={{ display:"flex", gap:10, marginBottom:8, alignItems:"center" }}>
                <span style={{ fontSize:10, color:T.dim, fontFamily:"'Space Mono',monospace", letterSpacing:1 }}>全部版本</span>
                <span style={{ fontSize:10, color:T.green }}>✓ {owned.length} 已有</span>
                {missing.length > 0 && <span style={{ fontSize:10, color:T.orange }}>○ {missing.length} 缺口</span>}
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, maxHeight:200, overflowY:"auto" }}>
                {owned.map((item, i) => (
                  <span key={"o"+i} style={{ padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:600, color:"#000", background:T.green, opacity:0.9 }}>
                    ✓ {item.name}{item.print_run ? ` /${item.print_run}` : ""}
                  </span>
                ))}
                {missing.map((item, i) => (
                  <span key={"m"+i} style={{ position:"relative", padding: editMode ? "4px 24px 4px 10px" : "4px 10px", borderRadius:20, fontSize:11, fontWeight:600, color:TIER_COLOR[item.tier]||T.muted, background:`${TIER_COLOR[item.tier]||T.muted}15`, border:`1px solid ${TIER_COLOR[item.tier]||T.muted}40`, transition:"padding 0.15s" }}>
                    {item.name}{item.print_run ? ` /${item.print_run}` : ""}
                    {editMode && (
                      <span onClick={e => { e.stopPropagation(); doRemoveItem(item.name); }}
                        style={{ position:"absolute", top:1, right:4, fontSize:12, color:T.red, cursor:"pointer", fontWeight:700, lineHeight:1, opacity: removingItem === item.name ? 0.4 : 1 }}>×</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {showAddForm && (
            <div style={{ marginBottom:10, padding:"10px 12px", borderRadius:10, background:T.s3, border:`1px solid ${T.borderGold}` }}>
              <div style={{ fontSize:10, color:T.dim, fontFamily:"'Space Mono',monospace", marginBottom:8 }}>手动添加监控版本</div>
              <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="版本名称，如 Gold Cracked Ice /50"
                style={{ width:"100%", padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.s2, color:T.text, fontSize:12, outline:"none", marginBottom:6 }} />
              <input value={addKw} onChange={e => setAddKw(e.target.value)} placeholder="eBay搜索词（留空自动用名称）"
                style={{ width:"100%", padding:"8px 10px", border:`1px solid ${T.border}`, borderRadius:8, background:T.s2, color:T.text, fontSize:12, outline:"none", marginBottom:8 }} />
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={doAdd} disabled={adding||!addName.trim()} style={{ flex:1, padding:"8px", borderRadius:8, border:"none", background:addName.trim()?T.gold:T.s2, color:addName.trim()?"#000":T.dim, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  {adding ? "添加中..." : "✓ 添加"}
                </button>
                <button onClick={() => { setShowAddForm(false); setAddName(""); setAddKw(""); }} style={{ padding:"8px 12px", borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.dim, fontSize:12, cursor:"pointer" }}>取消</button>
              </div>
            </div>
          )}

          {soldResults !== null && (
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:10, color:T.dim, fontFamily:"'Space Mono',monospace", letterSpacing:1, marginBottom:8 }}>SOLD · 近期成交</div>
              {soldResults.length === 0 && <div style={{ fontSize:12, color:T.muted, padding:"8px 0" }}>暂无已售记录</div>}
              {soldResults.map((r, i) => (
                <div key={i} style={{ display:"flex", gap:8, padding:"8px 0", borderBottom: i < soldResults.length - 1 ? `1px solid ${T.border}` : "none", alignItems:"center" }}>
                  {r.image_url && <img src={r.image_url} alt="" style={{ width:36, height:50, objectFit:"contain", borderRadius:4, flexShrink:0 }} />}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:11, color:T.text, lineHeight:1.4, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{r.title}</div>
                    <span style={{ fontSize:12, fontWeight:700, color:T.muted }}>¥{Number(r.price).toLocaleString('zh-CN')}</span>
                  </div>
                  {r.listing_url && <a href={r.listing_url} target="_blank" rel="noreferrer" style={{ fontSize:10, padding:"5px 8px", borderRadius:6, background:T.s3, color:T.blue, textDecoration:"none", flexShrink:0 }}>查看</a>}
                </div>
              ))}
            </div>
          )}

          {scanMsg && (
            <div style={{ padding:"8px 12px", borderRadius:8, marginBottom:8,
              background: scanMsg.includes("✅") ? "rgba(48,209,88,0.08)" : scanMsg.includes("失败") ? "rgba(212,80,80,0.08)" : "rgba(255,159,10,0.08)",
              border: `1px solid ${scanMsg.includes("✅") ? "rgba(48,209,88,0.2)" : scanMsg.includes("失败") ? "rgba(212,80,80,0.2)" : "rgba(255,159,10,0.2)"}`,
              fontSize:11, color: scanMsg.includes("✅") ? T.green : scanMsg.includes("失败") ? T.red : T.orange, lineHeight:1.6 }}>
              {scanMsg}
            </div>
          )}

          <div style={{ display:"flex", gap:6, marginTop:4, flexWrap:"wrap" }}>
            <button onClick={e => { e.stopPropagation(); setEditMode(m => !m); setShowAddForm(false); }} style={{ padding:"8px 10px", borderRadius:10, border:`1px solid ${editMode ? T.borderGold : T.border}`, background: editMode ? "rgba(200,168,75,0.1)" : "transparent", color: editMode ? T.gold : T.muted, fontSize:12, cursor:"pointer" }}>
              {editMode ? "✓ 完成编辑" : "✏️ 编辑"}
            </button>
            <button onClick={e => { e.stopPropagation(); setShowAddForm(f => !f); setEditMode(false); }} style={{ padding:"8px 10px", borderRadius:10, border:`1px solid ${T.borderGold}`, background:"rgba(200,168,75,0.06)", color:T.gold, fontSize:12, cursor:"pointer" }}>
              + 添加
            </button>
            <button onClick={doLoadSold} disabled={loadingSold} style={{ padding:"8px 10px", borderRadius:10, border:`1px solid ${T.border}`, background:"transparent", color:T.muted, fontSize:12, cursor:"pointer" }}>
              {loadingSold ? "查询中..." : "📋 已售"}
            </button>
            <button onClick={doSync} disabled={syncing} style={{ flex:1, padding:"8px", borderRadius:10, border:`1px solid ${T.border}`, background:"transparent", color:T.blue, fontSize:12, cursor:"pointer" }}>
              {syncing ? "同步中..." : "↻ 同步"}
            </button>
            <button onClick={() => { if (window.confirm(`删除目标「${goal.title}」？`)) onDelete(); }} style={{ padding:"8px 10px", borderRadius:10, border:"1px solid rgba(212,80,80,0.2)", background:"rgba(212,80,80,0.05)", color:T.red, fontSize:12, cursor:"pointer" }}>
              🗑
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function NewGoalScreen({ pcP, onDone, onBack }) {
  const [step, setStep] = useState("mode");
  const [mode, setMode] = useState("");
  const [title, setTitle] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [playerNameCn, setPlayerNameCn] = useState("");
  const [checklists, setChecklists] = useState([]);
  const [selectedCL, setSelectedCL] = useState(null);
  const [clSearch, setClSearch] = useState("");
  const [filterCond, setFilterCond] = useState({ color:"", max_print_run:"", base_only:true, include_autos:false });
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { if (step === "checklist") loadChecklists(""); }, [step]);

  const loadChecklists = async (search) => { const data = await apiGetChecklists(search); setChecklists(data); };

  const generateChecklist = async () => {
    if (!clSearch) return;
    setGenerating(true); setErr("");
    const r = await apiGenerateChecklist({ set_name:clSearch, checklist_type: mode === "full_players" ? "player_set" : mode === "full_parallels" ? "full_parallels" : "parallels", use_ai:true });
    if (r.success) { setSelectedCL(r.data); setChecklists(prev => [r.data, ...prev.filter(c => c.id !== r.data.id)]); }
    else setErr(r.error || "AI生成失败");
    setGenerating(false);
  };

  const save = async () => {
    if (!title || !mode || !selectedCL) { setErr("请填写完整信息"); return; }
    setSaving(true); setErr("");
    const filter = (mode === "filtered_parallels" || mode === "full_parallels") ? {
      ...(filterCond.color ? { color:filterCond.color } : {}),
      ...(filterCond.max_print_run ? { max_print_run:parseInt(filterCond.max_print_run) } : {}),
      base_only: filterCond.base_only !== false,
      include_autos: filterCond.include_autos === true,
    } : undefined;
    const r = await apiCreateGoal({
      title, mode,
      checklist_id: selectedCL.id,
      set_name: selectedCL.set_name,
      set_year: selectedCL.set_year,
      brand: selectedCL.brand,
      subset: selectedCL.subset,
      player_name: playerName || undefined,
      player_name_cn: playerNameCn || undefined,
      filter_condition: filter,
    });
    setSaving(false);
    if (r.success) onDone(); else setErr(r.error || "创建失败");
  };

  const MODE_OPTIONS = [
    { id:"full_parallels", icon:"🌈", label:"彩虹全平行", desc:"一个球员×一个系列，收集所有平行版本" },
    { id:"full_players", icon:"👥", label:"子集全球员", desc:"一个子集（如NOTG），收集所有球员卡" },
    { id:"filtered_parallels", icon:"🎯", label:"条件筛选", desc:"按颜色或指定编号筛选（如所有 /50 的平行版本）" },
  ];

  return (
    <div style={{ paddingBottom:90 }}>
      <div style={{ padding:"16px 20px", display:"flex", alignItems:"center", gap:14, borderBottom:`1px solid ${T.border}`, position:"sticky", top:0, background:T.bg, zIndex:10 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:T.muted, fontSize:20 }}>←</button>
        <span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:T.dim }}>新建收集目标</span>
      </div>
      <div style={{ padding:"20px" }}>
        {err && <div style={{ padding:"10px 14px", borderRadius:10, background:"rgba(212,80,80,0.08)", border:"1px solid rgba(212,80,80,0.2)", fontSize:12, color:T.red, marginBottom:14 }}>{err}</div>}

        {step === "mode" && (
          <div style={{ animation:"fadeUp 0.3s ease both" }}>
            <div style={{ fontSize:16, fontWeight:600, color:T.text, marginBottom:4 }}>选择收集模式</div>
            <div style={{ fontSize:12, color:T.muted, marginBottom:20 }}>根据你的收集逻辑选择</div>
            {MODE_OPTIONS.map(opt => (
              <div key={opt.id} onClick={() => { setMode(opt.id); setStep("config"); }} style={{ display:"flex", gap:14, padding:"16px", borderRadius:14, border:`1px solid ${mode===opt.id?T.borderGold:T.border}`, background: mode===opt.id ? "rgba(200,168,75,0.06)" : T.s2, marginBottom:10, cursor:"pointer", transition:"all 0.2s" }}>
                <span style={{ fontSize:28 }}>{opt.icon}</span>
                <div><div style={{ fontSize:14, fontWeight:600, color:T.text, marginBottom:3 }}>{opt.label}</div><div style={{ fontSize:12, color:T.muted, lineHeight:1.6 }}>{opt.desc}</div></div>
              </div>
            ))}
          </div>
        )}

        {step === "config" && (
          <div style={{ animation:"fadeUp 0.3s ease both" }}>
            <div style={{ fontSize:16, fontWeight:600, color:T.text, marginBottom:16 }}>填写目标信息</div>
            <FF label="目标名称" required><Inp value={title} onChange={setTitle} placeholder="如：KG 21-22 Prizm 彩虹" /></FF>
            {(mode === "full_parallels" || mode === "filtered_parallels") && <>
              <FF label="球员英文名"><Inp value={playerName} onChange={setPlayerName} placeholder="如 Kevin Garnett" /></FF>
              <FF label="球员中文名"><Inp value={playerNameCn} onChange={setPlayerNameCn} placeholder="如 加内特" /></FF>
            </>}
            {mode === "filtered_parallels" && <>
              <FF label="颜色筛选（可选，留空=所有颜色）"><Inp value={filterCond.color} onChange={v=>setFilterCond(f=>({...f,color:v}))} placeholder="如 Gold，留空则不限颜色" /></FF>
              <FF label="指定编号（可选）"><Inp value={filterCond.max_print_run} onChange={v=>setFilterCond(f=>({...f,max_print_run:v}))} placeholder="如 50（精确匹配所有 /50 版本）" type="number" /></FF>
            </>}
            {(mode === "filtered_parallels" || mode === "full_parallels") && (
              <div style={{ display:"flex", gap:10, marginBottom:14 }}>
                <div onClick={() => setFilterCond(f=>({...f,base_only:!f.base_only}))} style={{ flex:1, display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:10, border:`1px solid ${filterCond.base_only ? T.borderGold : T.border}`, background: filterCond.base_only ? "rgba(200,168,75,0.08)" : T.s3, cursor:"pointer" }}>
                  <span style={{ fontSize:16 }}>{filterCond.base_only ? "✅" : "⬜"}</span>
                  <div><div style={{ fontSize:12, color:T.text, fontWeight:600 }}>仅 Base Set</div><div style={{ fontSize:10, color:T.muted }}>排除 Insert 特卡</div></div>
                </div>
                <div onClick={() => setFilterCond(f=>({...f,include_autos:!f.include_autos}))} style={{ flex:1, display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:10, border:`1px solid ${filterCond.include_autos ? T.borderGold : T.border}`, background: filterCond.include_autos ? "rgba(200,168,75,0.08)" : T.s3, cursor:"pointer" }}>
                  <span style={{ fontSize:16 }}>{filterCond.include_autos ? "✅" : "⬜"}</span>
                  <div><div style={{ fontSize:12, color:T.text, fontWeight:600 }}>包含签字卡</div><div style={{ fontSize:10, color:T.muted }}>Autograph 也列入</div></div>
                </div>
              </div>
            )}
            <button onClick={() => setStep("checklist")} disabled={!title} style={{ width:"100%", padding:"13px", borderRadius:12, border:"none", background: title ? `linear-gradient(135deg,${T.gold},${T.goldDark})` : T.s3, color: title ? "#000" : T.dim, fontSize:14, fontWeight:700, marginTop:8 }}>下一步：选择系列清单 →</button>
          </div>
        )}

        {step === "checklist" && (
          <div style={{ animation:"fadeUp 0.3s ease both" }}>
            <div style={{ fontSize:16, fontWeight:600, color:T.text, marginBottom:4 }}>关联系列清单</div>
            <div style={{ fontSize:12, color:T.muted, marginBottom:14 }}>选择已有清单，或让 AI 生成</div>
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              <input value={clSearch} onChange={e => { setClSearch(e.target.value); loadChecklists(e.target.value); }} placeholder="搜索或输入系列名，如 2021-22 Prizm..."
                style={{ flex:1, padding:"10px 12px", border:`1px solid ${T.border}`, borderRadius:10, background:T.s3, color:T.text, fontSize:13, outline:"none" }}
                onFocus={e=>e.target.style.borderColor=T.gold} onBlur={e=>e.target.style.borderColor=T.border} />
              <button onClick={generateChecklist} disabled={!clSearch || generating} style={{ padding:"10px 14px", borderRadius:10, border:"none", background: clSearch ? T.gold : T.s3, color: clSearch ? "#000" : T.dim, fontSize:12, fontWeight:700, cursor: clSearch ? "pointer" : "not-allowed", flexShrink:0 }}>
                {generating ? "..." : "✨ AI生成"}
              </button>
            </div>
            {checklists.length === 0 && <div style={{ padding:"20px", textAlign:"center", color:T.dim, fontSize:12 }}>输入系列名后点"AI生成"，Claude 会生成完整平行清单</div>}
            {checklists.map(cl => (
              <div key={cl.id} onClick={() => setSelectedCL(cl)} style={{ padding:"12px 14px", borderRadius:12, border:`1px solid ${selectedCL?.id===cl.id?T.borderGold:T.border}`, background: selectedCL?.id===cl.id ? "rgba(200,168,75,0.08)" : T.s2, marginBottom:8, cursor:"pointer", transition:"all 0.2s" }}>
                <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{cl.set_name}</div>
                <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{cl.subset||"Base"} · {cl.checklist_type==="parallels"?"平行版本清单":"球员名单"}</div>
              </div>
            ))}
            {selectedCL && <button onClick={() => setStep("confirm")} style={{ width:"100%", padding:"13px", borderRadius:12, border:"none", background:`linear-gradient(135deg,${T.gold},${T.goldDark})`, color:"#000", fontSize:14, fontWeight:700, marginTop:8 }}>下一步：确认创建 →</button>}
          </div>
        )}

        {step === "confirm" && (
          <div style={{ animation:"fadeUp 0.3s ease both" }}>
            <div style={{ fontSize:16, fontWeight:600, color:T.text, marginBottom:16 }}>确认创建</div>
            <div style={{ background:T.s2, borderRadius:14, padding:16, marginBottom:16 }}>
              {[
                ["目标名称", title],
                ["收集模式", { full_parallels:"🌈 彩虹全平行", full_players:"👥 子集全球员", filtered_parallels:"🎯 条件筛选" }[mode]],
                playerName && ["球员", playerName],
                ["系列清单", selectedCL?.set_name],
                mode==="filtered_parallels" && filterCond.color && ["颜色筛选", filterCond.color],
                mode==="filtered_parallels" && filterCond.max_print_run && ["指定编号", `/${filterCond.max_print_run}`],
              ].filter(Boolean).map(([l,v],i)=>(
                <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:`1px solid ${T.border}` }}>
                  <span style={{ fontSize:12, color:T.muted }}>{l}</span>
                  <span style={{ fontSize:12, color:T.text, fontWeight:600 }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ padding:"10px 14px", borderRadius:10, background:"rgba(200,168,75,0.06)", border:`1px solid ${T.borderGold}`, fontSize:12, color:T.muted, lineHeight:1.7, marginBottom:16 }}>
              💡 创建后自动生成缺口监控条目。点"同步"可对比你的现有卡片更新已拥有状态。
            </div>
            <button onClick={save} disabled={saving} style={{ width:"100%", padding:"14px", borderRadius:14, border:"none", background: saving ? T.s3 : `linear-gradient(135deg,${T.gold},${T.goldDark})`, color: saving ? T.dim : "#000", fontSize:15, fontWeight:700 }}>
              {saving ? "创建中..." : "✓ 创建目标"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 投资分析模块 ───────────────────────────────────────────────────────────────
const cny = (n) => `¥${Math.round(Number(n) || 0).toLocaleString("zh-CN")}`;

// 行动分数字（带颜色编码）
function ScoreNum({ label, value, big, color }) {
  const c = color || T.gold;
  return (
    <div style={{ textAlign:"center", flex:1 }}>
      <div style={{ fontFamily:"'Space Mono',monospace", fontSize: big ? 40 : 18, fontWeight:700, color: value == null ? T.dim : c, lineHeight:1 }}>{value == null ? "—" : value}</div>
      <div style={{ fontFamily:"'Space Mono',monospace", fontSize:9, color:T.dim, letterSpacing:1, marginTop: big ? 8 : 4 }}>{label}</div>
    </div>
  );
}

// 0-100 滑块
function ScoreSlider({ label, value, onChange, color }) {
  const c = color || T.gold;
  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8 }}>
        <span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:T.muted, letterSpacing:0.5 }}>{label}</span>
        <span style={{ fontFamily:"'Space Mono',monospace", fontSize:22, fontWeight:700, color:c }}>{value}</span>
      </div>
      <input type="range" min={0} max={100} value={value} onChange={e => onChange(parseInt(e.target.value))}
        style={{ width:"100%", accentColor:c, cursor:"pointer", height:6 }} />
    </div>
  );
}

function InvestmentScreen() {
  const { cards, showToast } = useApp();
  const [view, setView] = useState("list");
  const [detailId, setDetailId] = useState(null);
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const [recommendations, setRecommendations] = useState(null);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState("");
  const [recCachedAt, setRecCachedAt] = useState(null);

  const [batchRefreshing, setBatchRefreshing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current:0, total:0 });
  const [batchResult, setBatchResult] = useState(null);

  const load = async () => { setLoading(true); const d = await apiGetInvestments(); setInvestments(Array.isArray(d) ? d : []); setLoading(false); };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const cached = localStorage.getItem("cv_rec");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const age = Date.now() - new Date(parsed.generated_at).getTime();
        if (age < 7 * 24 * 60 * 60 * 1000) {
          setRecommendations(parsed.recommendations);
          setRecCachedAt(parsed.generated_at);
        }
      } catch {}
    }
  }, []);

  const fetchRecommendations = async () => {
    setRecLoading(true); setRecError("");
    try {
      const r = await fetch("/api/investment-recommend", { method:"POST", headers:{"Content-Type":"application/json"}, body:"{}" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "推荐失败");
      setRecommendations(d.recommendations || []);
      setRecCachedAt(d.generated_at);
      localStorage.setItem("cv_rec", JSON.stringify(d));
    } catch (e) { setRecError(e.message); }
    setRecLoading(false);
  };

  const batchRefresh = async () => {
    const active = investments.filter(i => i.status === "active");
    if (!active.length) return;
    setBatchRefreshing(true);
    setBatchProgress({ current:0, total:active.length });
    setBatchResult(null);
    const changes = [];
    for (let i = 0; i < active.length; i++) {
      setBatchProgress({ current:i+1, total:active.length });
      const inv = active[i];
      try {
        const r = await fetch("/api/investment-analyze", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ player_name: inv.player_name }) });
        const d = await r.json();
        if (r.ok && d.q_score != null && d.t_score != null) {
          const oldAction = inv.action_score;
          const newAction = Math.min(d.q_score, d.t_score);
          const delta = oldAction != null ? newAction - oldAction : null;
          await fetch(`/api/investments?id=${inv.id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ q_score:d.q_score, t_score:d.t_score, q_breakdown:d.q_breakdown, t_breakdown:d.t_breakdown }) });
          if (delta != null && (Math.abs(delta) > 10 || (oldAction >= 40 && newAction < 40) || (oldAction < 60 && newAction >= 60))) {
            await fetch(`/api/investments/${inv.id}?action=checkpoint`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ trigger_type:"batch_refresh", title:"批量刷新评分变化", description:`Q ${inv.q_score ?? "—"}→${d.q_score}, T ${inv.t_score ?? "—"}→${d.t_score}, 行动分 ${oldAction ?? "—"}→${newAction}`, q_score_snapshot:d.q_score, t_score_snapshot:d.t_score, action_score_snapshot:newAction }) });
            changes.push({ name:inv.player_name_cn||inv.player_name, oldAction, newAction, delta });
          }
        }
      } catch (e) { console.error(`Batch refresh ${inv.player_name}:`, e); }
    }
    setBatchRefreshing(false);
    setBatchResult({ total:active.length, changes });
    await load();
    if (changes.length > 0) showToast(`${changes.length}个球员分数变化`);
    else showToast("所有分数已更新");
  };

  const createFromRec = (rec) => {
    setView("new_from_rec");
    setDetailId(rec);
  };

  if (view === "new") return <NewInvestmentScreen onBack={() => setView("list")} onDone={() => { setView("list"); load(); }} />;
  if (view === "new_from_rec" && detailId) return <NewInvestmentScreen onBack={() => setView("list")} onDone={() => { setView("list"); load(); }} prefill={detailId} />;
  if (view === "detail" && detailId) return <InvestmentDetailScreen id={detailId} cards={cards} onBack={() => { setView("list"); load(); }} />;

  const dist = { strong:0, mid:0, weak:0, avoid:0 };
  const signals = { buy:0, accumulate:0, hold:0, reduce:0 };
  const staleInvestments = [];
  const now = Date.now();
  investments.forEach(i => {
    const s = i.action_score;
    if (s != null) { if (s >= 75) dist.strong++; else if (s >= 60) dist.mid++; else if (s >= 40) dist.weak++; else dist.avoid++; }
    const sig = i.status_signal || "hold";
    if (sig in signals) signals[sig]++;
    if (i.updated_at) {
      const days = Math.floor((now - new Date(i.updated_at).getTime()) / (1000*60*60*24));
      if (days > 30) staleInvestments.push({ ...i, staleDays: days, level: days > 90 ? "red" : "orange" });
    }
  });
  const totalPositions = investments.reduce((s, i) => s + (i.position_count || 0), 0);

  const sorted = [...investments].sort((a, b) => (b.action_score ?? -1) - (a.action_score ?? -1));
  const filtered = filter === "all" ? sorted : sorted.filter(i => i.investment_type === filter);

  return (
    <div style={{ paddingBottom:90 }}>
      <div style={{ padding:"20px 20px 0", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <h2 style={{ fontSize:24, fontWeight:700, color:T.text, letterSpacing:"-0.5px" }}>📈 投资分析</h2>
          <p style={{ fontSize:12, color:T.muted, marginTop:3 }}>{investments.length} 个活跃追踪 · THESIS-CHECK-EXIT</p>
        </div>
        <button onClick={() => setView("new")} style={{ width:38, height:38, borderRadius:"50%", border:"none", background:`linear-gradient(135deg,${T.gold},${T.goldDark})`, color:"#000", fontSize:20, fontWeight:700, cursor:"pointer", flexShrink:0 }}>+</button>
      </div>

      <div style={{ padding:"16px 20px 0" }}>
        {/* AI Discovery Section */}
        <div style={{ background:"linear-gradient(135deg,rgba(100,210,255,0.05),rgba(155,109,255,0.04))", border:"1px solid rgba(100,210,255,0.15)", borderRadius:16, padding:"16px", marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:18 }}>🤖</span>
              <span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, fontWeight:700, color:T.text, letterSpacing:0.5 }}>AI 发现</span>
            </div>
            <button onClick={fetchRecommendations} disabled={recLoading} style={{ padding:"6px 12px", borderRadius:8, border:`1px solid rgba(100,210,255,0.3)`, background:"rgba(100,210,255,0.08)", color:"#64D2FF", fontSize:11, fontWeight:600, cursor:recLoading?"not-allowed":"pointer" }}>
              {recLoading ? "分析中..." : recCachedAt ? "刷新" : "获取推荐"}
            </button>
          </div>

          {recLoading && (
            <div style={{ textAlign:"center", padding:"20px 0" }}>
              <div style={{ fontSize:24, marginBottom:8, animation:"pulse 1.5s ease infinite" }}>🤖</div>
              <div style={{ fontSize:12, color:T.muted }}>AI 正在分析市场...</div>
            </div>
          )}

          {recError && <div style={{ fontSize:12, color:T.red, marginBottom:8 }}>{recError}</div>}

          {!recLoading && recommendations && recommendations.length > 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {recommendations.map((rec, i) => (
                <div key={i} style={{ background:T.s2, border:`1px solid ${T.border}`, borderRadius:12, padding:"12px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:T.text }}>{rec.player_name_cn || rec.player_name}</div>
                      {rec.player_name_cn && <div style={{ fontSize:11, color:T.dim, marginTop:1 }}>{rec.player_name}</div>}
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontFamily:"'Space Mono',monospace", fontSize:16, fontWeight:700, color:actionColor(rec.estimated_action) }}>{rec.estimated_action}</span>
                    </div>
                  </div>
                  <div style={{ fontSize:12, color:T.muted, lineHeight:1.5, marginBottom:8 }}>{rec.reason}</div>
                  <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                    <span style={{ fontSize:10, color:T.blue }}>Q:{rec.estimated_q}</span>
                    <span style={{ fontSize:10, color:T.gold }}>T:{rec.estimated_t}</span>
                    {rec.catalyst && <span style={{ fontSize:10, color:T.muted }}>催化：{rec.catalyst}</span>}
                  </div>
                  <button onClick={() => createFromRec(rec)} style={{ marginTop:8, width:"100%", padding:"8px", borderRadius:8, border:`1px solid ${T.borderGold}`, background:"rgba(200,168,75,0.06)", color:T.gold, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                    创建追踪
                  </button>
                </div>
              ))}
              {recCachedAt && <div style={{ fontSize:10, color:T.dim, textAlign:"right" }}>生成于 {new Date(recCachedAt).toLocaleDateString("zh-CN")}</div>}
            </div>
          )}

          {!recLoading && !recommendations && !recError && (
            <div style={{ textAlign:"center", padding:"12px 0", fontSize:12, color:T.dim }}>点击「获取推荐」让 AI 分析市场热点</div>
          )}
        </div>

        {/* Batch Refresh + Staleness Alerts */}
        {investments.length > 0 && (
          <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"stretch" }}>
            <button onClick={batchRefresh} disabled={batchRefreshing} style={{ flex:1, padding:"12px 16px", borderRadius:12, border:"none", background:batchRefreshing?T.s2:`linear-gradient(135deg,${T.gold},${T.goldDark})`, color:batchRefreshing?T.dim:"#000", fontSize:13, fontWeight:700, cursor:batchRefreshing?"not-allowed":"pointer" }}>
              {batchRefreshing ? `正在评估 ${batchProgress.current}/${batchProgress.total}...` : "🔄 全部刷新"}
            </button>
          </div>
        )}

        {batchResult && (
          <div style={{ padding:"10px 14px", borderRadius:12, background:"rgba(48,209,88,0.06)", border:"1px solid rgba(48,209,88,0.2)", marginBottom:14, animation:"fadeUp 0.3s ease both" }}>
            <div style={{ fontSize:12, color:T.green, fontWeight:600, marginBottom:4 }}>刷新完成</div>
            {batchResult.changes.length > 0 ? (
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {batchResult.changes.map((c, i) => (
                  <div key={i} style={{ fontSize:11, color:T.muted }}>
                    {c.name}: {c.oldAction ?? "—"} → <span style={{ fontWeight:700, color:actionColor(c.newAction) }}>{c.newAction}</span>
                    <span style={{ color:c.delta>0?T.green:T.red, marginLeft:4 }}>({c.delta>0?"+":""}{c.delta})</span>
                  </div>
                ))}
              </div>
            ) : <div style={{ fontSize:11, color:T.muted }}>所有球员分数无显著变化</div>}
          </div>
        )}

        {/* Staleness Alerts */}
        {staleInvestments.length > 0 && (
          <div style={{ marginBottom:14 }}>
            {staleInvestments.map(inv => (
              <div key={inv.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderRadius:10, background:inv.level==="red"?"rgba(255,69,58,0.06)":"rgba(255,159,10,0.06)", border:`1px solid ${inv.level==="red"?"rgba(255,69,58,0.2)":"rgba(255,159,10,0.2)"}`, marginBottom:6, cursor:"pointer" }}
                onClick={() => { setDetailId(inv.id); setView("detail"); }}>
                <span style={{ fontSize:12 }}>{inv.level==="red"?"🔴":"🟠"}</span>
                <span style={{ fontSize:12, color:inv.level==="red"?T.red:T.orange, flex:1 }}>
                  {inv.player_name_cn||inv.player_name} — {inv.staleDays}天未评估
                </span>
                <span style={{ fontSize:10, color:T.dim }}>{inv.level==="red"?"建议立即刷新":"建议刷新"}</span>
              </div>
            ))}
          </div>
        )}

        {/* Portfolio 概览 */}
        <div style={{ background:`linear-gradient(135deg,rgba(201,168,76,0.08),rgba(201,168,76,0.03))`, border:`1px solid ${T.borderGold}`, borderRadius:16, padding:"16px", marginBottom:16 }}>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, letterSpacing:1, marginBottom:12 }}>PORTFOLIO OVERVIEW</div>
          <div style={{ display:"flex", marginBottom:14 }}>
            <ScoreNum label="追踪球员" value={investments.length} />
            <ScoreNum label="持仓卡片" value={totalPositions} />
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:9, color:T.dim, letterSpacing:0.5, marginBottom:8 }}>ACTION SCORE DISTRIBUTION</div>
            <div style={{ display:"flex", gap:6 }}>
              {[[">=75", dist.strong, T.green],["60-74", dist.mid, T.gold],["40-59", dist.weak, T.orange],["<40", dist.avoid, T.red]].map(([l, v, c], i) => (
                <div key={i} style={{ flex:1, textAlign:"center", padding:"8px 0", borderRadius:10, background:`${c}12`, border:`1px solid ${c}33` }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:c }} />
                    <span style={{ fontFamily:"'Space Mono',monospace", fontSize:16, fontWeight:700, color:c }}>{v}</span>
                  </div>
                  <div style={{ fontSize:8, color:T.dim, marginTop:2 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:9, color:T.dim, letterSpacing:0.5, marginBottom:8 }}>SIGNAL DISTRIBUTION</div>
            <div style={{ display:"flex", gap:6 }}>
              {[["buy","买入",T.green],["accumulate","吸纳","#64D2FF"],["hold","持有",T.gold],["reduce","减仓",T.red]].map(([k, l, c]) => (
                <div key={k} style={{ flex:1, textAlign:"center", padding:"6px 0", borderRadius:8, background:`${c}12`, border:`1px solid ${c}33` }}>
                  <span style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, color:c }}>{signals[k] || 0}</span>
                  <span style={{ fontSize:9, color:T.dim, marginLeft:3 }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 筛选 */}
        <div style={{ display:"flex", gap:8, marginBottom:14, overflowX:"auto" }}>
          {[["all","全部"],["pc","PC"],["investment","投资"],["speculation","投机"]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} style={{ padding:"6px 14px", borderRadius:20, border:`1px solid ${filter === k ? T.borderGold : T.border}`, background: filter === k ? "rgba(201,168,76,0.1)" : "transparent", color: filter === k ? T.gold : T.muted, fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.2s" }}>{l}</button>
          ))}
        </div>

        {loading && [1, 2].map(i => <Skel key={i} height={92} radius={14} style={{ marginBottom:10 }} />)}
        {!loading && investments.length === 0 && (
          <div style={{ background:T.s2, borderRadius:16, padding:28, textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
            <div style={{ fontSize:14, color:T.text, marginBottom:6 }}>还没有投资追踪</div>
            <div style={{ fontSize:12, color:T.muted, lineHeight:1.7 }}>用 THESIS-CHECK-EXIT 框架记录你的建仓逻辑，给球员打 Q/T 双分，系统帮你算出行动分</div>
            <button onClick={() => setView("new")} style={{ marginTop:16, padding:"10px 20px", borderRadius:10, border:"none", background:`linear-gradient(135deg,${T.gold},${T.goldDark})`, color:"#000", fontSize:13, fontWeight:700, cursor:"pointer" }}>+ 新建投资追踪</button>
          </div>
        )}
        {!loading && filtered.map(inv => (
          <InvestmentCard key={inv.id} inv={inv} onClick={() => { setDetailId(inv.id); setView("detail"); }} />
        ))}
      </div>
    </div>
  );
}

const InvestmentCard = memo(function InvestmentCard({ inv, onClick }) {
  const ty = INV_TYPE[inv.investment_type] || INV_TYPE.investment;
  const ac = actionColor(inv.action_score);
  const sig = SIGNAL_MAP[inv.status_signal] || SIGNAL_MAP.hold;
  return (
    <div onClick={onClick} style={{ background:T.s2, border:`1px solid ${T.border}`, borderRadius:14, padding:"14px", marginBottom:10, cursor:"pointer", transition:"all 0.15s" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = T.borderGold} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
        <div style={{ minWidth:0, flex:1 }}>
          <div style={{ fontSize:15, fontWeight:700, color:T.text }}>{inv.player_name_cn || inv.player_name}</div>
          <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{inv.player_name_cn ? inv.player_name : ""}</div>
        </div>
        <div style={{ display:"flex", gap:6, flexShrink:0 }}>
          <Chip label={sig.label} color={sig.color} bg={sig.bg} />
          <Chip label={`${ty.emoji} ${ty.short}`} color={ty.color} />
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:4, padding:"10px 0", borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}` }}>
        <ScoreNum label="Q 质量" value={inv.q_score} color={T.blue} />
        <span style={{ color:T.dim, fontSize:14 }}>·</span>
        <ScoreNum label="T 时机" value={inv.t_score} color={T.gold} />
        <span style={{ color:T.dim, fontSize:14 }}>=</span>
        <ScoreNum label="行动分" value={inv.action_score} color={ac} />
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:10, fontSize:11, color:T.muted }}>
        <span>🃏 {inv.position_count || 0} 张持仓</span>
        <span style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, color:ac }}>{actionAdvice(inv.action_score)}</span>
      </div>
    </div>
  );
});

function NewInvestmentScreen({ onBack, onDone, prefill }) {
  const [step, setStep] = useState(prefill ? 2 : 1);
  const [playerName, setPlayerName] = useState(prefill?.player_name || "");
  const [playerNameCn, setPlayerNameCn] = useState(prefill?.player_name_cn || "");
  const [type, setType] = useState(prefill ? "investment" : "");
  const [thesis, setThesis] = useState("");
  const [exitRules, setExitRules] = useState({ profit_target:"", stop_loss:"", time_stop_months:"" });
  const [q, setQ] = useState(50);
  const [t, setT] = useState(50);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiApplied, setAiApplied] = useState(false);

  const action = Math.min(q, t);
  const ac = actionColor(action);
  const needExit = type === "investment";

  const fetchAiAnalysis = async () => {
    const name = playerName || playerNameCn;
    if (!name) return;
    setAiLoading(true); setAiError(""); setAiAnalysis(null); setAiApplied(false);
    try {
      const r = await fetch("/api/investment-analyze", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ player_name: name }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "分析失败");
      setAiAnalysis(d);
      setQ(d.q_score); setT(d.t_score); setAiApplied(true);
    } catch (e) { setAiError(e.message); }
    setAiLoading(false);
  };

  const next = () => {
    setErr("");
    if (step === 1) { if (!playerName && !playerNameCn) { setErr("请填写球员名"); return; } if (!type) { setErr("请选择投资类型"); return; } }
    if (step === 2) { if (!thesis.trim()) { setErr("请写下你的建仓逻辑（THESIS）"); return; } }
    if (step === 3 && needExit) {
      if (!exitRules.profit_target && !exitRules.stop_loss && !exitRules.time_stop_months) { setErr("投资类型必须填写 EXIT 规则"); return; }
    }
    const nextStep = step + 1;
    if (nextStep === 4 && !aiAnalysis && !aiLoading) fetchAiAnalysis();
    setStep(s => s + 1);
  };

  const save = async () => {
    setSaving(true); setErr("");
    const exit = (needExit || exitRules.profit_target || exitRules.stop_loss || exitRules.time_stop_months) ? {
      ...(exitRules.profit_target ? { profit_target: parseFloat(exitRules.profit_target) } : {}),
      ...(exitRules.stop_loss ? { stop_loss: parseFloat(exitRules.stop_loss) } : {}),
      ...(exitRules.time_stop_months ? { time_stop_months: parseInt(exitRules.time_stop_months) } : {}),
    } : [];
    try {
      await apiCreateInvestment({
        player_name: playerName || playerNameCn,
        player_name_cn: playerNameCn || null,
        investment_type: type,
        thesis_text: thesis.trim(),
        exit_rules: exit,
        q_score: q,
        t_score: t,
        q_breakdown: aiAnalysis?.q_breakdown || null,
        t_breakdown: aiAnalysis?.t_breakdown || null,
      });
      onDone();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const STEPS = ["球员", "THESIS", "EXIT", "评分"];

  return (
    <div style={{ paddingBottom:90 }}>
      <div style={{ padding:"16px 20px", display:"flex", alignItems:"center", gap:14, borderBottom:`1px solid ${T.border}`, position:"sticky", top:0, background:T.bg, zIndex:10 }}>
        <button onClick={() => step === 1 ? onBack() : setStep(s => s - 1)} style={{ background:"none", border:"none", color:T.muted, fontSize:20, cursor:"pointer" }}>←</button>
        <span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:T.dim, letterSpacing:1 }}>新建投资追踪</span>
      </div>

      <div style={{ padding:"20px" }}>
        {/* 步骤指示 */}
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:24 }}>
          {STEPS.map((l, i) => {
            const n = i + 1, done = n < step, act = n === step;
            return <div key={l} style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:26, height:26, borderRadius:"50%", background: act ? "linear-gradient(135deg,#C9A84C,#8B6914)" : done ? "rgba(48,209,88,0.2)" : T.s2, border:`1px solid ${act ? T.borderGold : done ? "rgba(48,209,88,0.4)" : T.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Space Mono',monospace", fontSize:10, fontWeight:700, color: act ? "#000" : done ? T.green : T.dim }}>{done ? "✓" : n}</div>
              <span style={{ fontSize:11, color: act ? T.gold : T.dim }}>{l}</span>
              {i < STEPS.length - 1 && <div style={{ width:14, height:1, background:T.border }} />}
            </div>;
          })}
        </div>

        {err && <div style={{ padding:"10px 14px", borderRadius:10, background:"rgba(212,80,80,0.08)", border:"1px solid rgba(212,80,80,0.2)", fontSize:12, color:T.red, marginBottom:14 }}>{err}</div>}

        {/* Step 1：球员 + 类型 */}
        {step === 1 && (
          <div style={{ animation:"fadeUp 0.3s ease both" }}>
            <div style={{ fontSize:16, fontWeight:600, color:T.text, marginBottom:16 }}>追踪哪位球员？</div>
            <FF label="球员中文名"><Inp value={playerNameCn} onChange={setPlayerNameCn} placeholder="如 文班亚马" /></FF>
            <FF label="球员英文名"><Inp value={playerName} onChange={setPlayerName} placeholder="如 Victor Wembanyama" /></FF>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, letterSpacing:0.8, margin:"10px 0 8px" }}>投资类型 *</div>
            {Object.entries(INV_TYPE).map(([k, v]) => (
              <div key={k} onClick={() => setType(k)} style={{ display:"flex", gap:12, alignItems:"center", padding:"14px", borderRadius:12, border:`1px solid ${type === k ? T.borderGold : T.border}`, background: type === k ? "rgba(200,168,75,0.06)" : T.s2, marginBottom:10, cursor:"pointer", transition:"all 0.2s" }}>
                <span style={{ fontSize:24 }}>{v.emoji}</span>
                <div><div style={{ fontSize:14, fontWeight:600, color:T.text }}>{v.label}</div>
                  <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{k === "pc" ? "永久收藏，不为卖出，可跳过 EXIT" : k === "investment" ? "为获利建仓，必须设定 EXIT 纪律" : "高风险博弈，赌叙事爆发"}</div></div>
              </div>
            ))}
            <button onClick={next} style={{ width:"100%", padding:"13px", borderRadius:12, border:"none", background:`linear-gradient(135deg,${T.gold},${T.goldDark})`, color:"#000", fontSize:14, fontWeight:700, marginTop:8, cursor:"pointer" }}>下一步：写 THESIS →</button>
          </div>
        )}

        {/* Step 2：THESIS */}
        {step === 2 && (
          <div style={{ animation:"fadeUp 0.3s ease both" }}>
            <div style={{ fontSize:16, fontWeight:600, color:T.text, marginBottom:4 }}>建仓逻辑 THESIS</div>
            <div style={{ fontSize:12, color:T.muted, marginBottom:14, lineHeight:1.6 }}>写下你的建仓逻辑：为什么看好这个球员？基本面、叙事面、卡市面各有什么支撑？</div>
            <textarea value={thesis} onChange={e => setThesis(e.target.value)} placeholder="例：文班是十年一遇的天赋模板，防守端历史级，进攻持续进化（基本面）；联盟力捧的门面级新星，话题度拉满（叙事面）；新秀卡价格已从峰值回落，RC 窗口仍在（卡市面）……"
              rows={9} style={{ width:"100%", padding:"12px", border:`1px solid ${T.border}`, borderRadius:10, background:T.s3, color:T.text, fontSize:13, lineHeight:1.7, outline:"none", resize:"vertical", fontFamily:"'Inter','Noto Sans SC',sans-serif" }}
              onFocus={e => e.target.style.borderColor = T.gold} onBlur={e => e.target.style.borderColor = T.border} />
            <button onClick={next} style={{ width:"100%", padding:"13px", borderRadius:12, border:"none", background:`linear-gradient(135deg,${T.gold},${T.goldDark})`, color:"#000", fontSize:14, fontWeight:700, marginTop:12, cursor:"pointer" }}>下一步：设定 EXIT →</button>
          </div>
        )}

        {/* Step 3：EXIT */}
        {step === 3 && (
          <div style={{ animation:"fadeUp 0.3s ease both" }}>
            <div style={{ fontSize:16, fontWeight:600, color:T.text, marginBottom:4 }}>EXIT 退出纪律</div>
            <div style={{ fontSize:12, color:T.muted, marginBottom:16, lineHeight:1.6 }}>
              {needExit ? "投资类型必须预设退出规则，避免被情绪绑架。" : "PC / 投机可跳过，但建议也设一道防线。"}
            </div>
            <FF label="获利目标 %" required={needExit}><Inp value={exitRules.profit_target} onChange={v => setExitRules(r => ({ ...r, profit_target:v }))} placeholder="如 50（涨 50% 考虑止盈）" type="number" /></FF>
            <FF label="止损线 %" required={needExit}><Inp value={exitRules.stop_loss} onChange={v => setExitRules(r => ({ ...r, stop_loss:v }))} placeholder="如 30（跌 30% 止损）" type="number" /></FF>
            <FF label="时间止损（月）" required={needExit}><Inp value={exitRules.time_stop_months} onChange={v => setExitRules(r => ({ ...r, time_stop_months:v }))} placeholder="如 18（持有满 18 个月重新评估）" type="number" /></FF>
            <div style={{ display:"flex", gap:10, marginTop:8 }}>
              {!needExit && <button onClick={() => setStep(4)} style={{ flex:1, padding:"13px", borderRadius:12, border:`1px solid ${T.border}`, background:T.s2, color:T.muted, fontSize:14, fontWeight:600, cursor:"pointer" }}>跳过</button>}
              <button onClick={next} style={{ flex:2, padding:"13px", borderRadius:12, border:"none", background:`linear-gradient(135deg,${T.gold},${T.goldDark})`, color:"#000", fontSize:14, fontWeight:700, cursor:"pointer" }}>下一步：打分 →</button>
            </div>
          </div>
        )}

        {/* Step 4：Q/T 评分 */}
        {step === 4 && (
          <div style={{ animation:"fadeUp 0.3s ease both" }}>
            <div style={{ fontSize:16, fontWeight:600, color:T.text, marginBottom:4 }}>Q / T 双分制</div>
            <div style={{ fontSize:12, color:T.muted, marginBottom:20, lineHeight:1.6 }}>Q = 资产质量（球员基本面 + 卡的稀有度）；T = 入场时机（当前价格 vs 价值）。行动分 = min(Q, T)，短板决定上限。</div>

            {/* AI 分析区域 */}
            {aiLoading && (
              <div style={{ background:"linear-gradient(135deg,rgba(100,210,255,0.06),rgba(100,210,255,0.02))", border:`1px solid rgba(100,210,255,0.2)`, borderRadius:16, padding:"24px", textAlign:"center", marginBottom:20 }}>
                <div style={{ fontSize:28, marginBottom:10, animation:"pulse 1.5s ease infinite" }}>🤖</div>
                <div style={{ fontSize:14, fontWeight:600, color:T.text, marginBottom:4 }}>AI 正在分析 {playerNameCn || playerName}...</div>
                <div style={{ fontSize:11, color:T.muted }}>联网搜索球员数据、卡市行情，预计 15-30 秒</div>
              </div>
            )}

            {aiError && (
              <div style={{ background:"rgba(212,80,80,0.06)", border:"1px solid rgba(212,80,80,0.2)", borderRadius:14, padding:"14px", marginBottom:16 }}>
                <div style={{ fontSize:12, color:T.red, marginBottom:8 }}>AI 分析失败：{aiError}</div>
                <button onClick={fetchAiAnalysis} style={{ fontSize:12, color:T.gold, background:"none", border:`1px solid ${T.borderGold}`, borderRadius:8, padding:"6px 14px", cursor:"pointer" }}>重试</button>
              </div>
            )}

            {aiAnalysis && (() => {
              const qb = aiAnalysis.q_breakdown;
              const tb = aiAnalysis.t_breakdown;
              const QDim = ({ label, max, item }) => (
                <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:`1px solid ${T.border}22` }}>
                  <div style={{ flex:1, fontSize:12, color:T.muted }}>{label}</div>
                  <div style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, color:T.blue, minWidth:40, textAlign:"right" }}>{item.score}/{max}</div>
                  <div style={{ flex:2, fontSize:11, color:T.dim, lineHeight:1.4 }}>{item.reason}</div>
                </div>
              );
              const TDim = ({ label, item }) => (
                <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:`1px solid ${T.border}22` }}>
                  <div style={{ flex:1, fontSize:12, color:T.muted }}>{label}</div>
                  <div style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, color:T.gold, minWidth:40, textAlign:"right" }}>{item.score}/{item.max}</div>
                  <div style={{ flex:2, fontSize:11, color:T.dim, lineHeight:1.4 }}>{item.reason}</div>
                </div>
              );
              const SectionHeader = ({ title, total, max, color }) => (
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0 4px", marginTop:6 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:T.text }}>{title}</span>
                  <span style={{ fontFamily:"'Space Mono',monospace", fontSize:14, fontWeight:700, color }}>{total}/{max}</span>
                </div>
              );
              return (
                <div style={{ background:"linear-gradient(135deg,rgba(100,210,255,0.04),rgba(201,168,76,0.04))", border:`1px solid rgba(100,210,255,0.15)`, borderRadius:16, padding:"16px", marginBottom:20 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                    <span style={{ fontSize:18 }}>🤖</span>
                    <span style={{ fontSize:13, fontWeight:700, color:T.text }}>AI 分析结果</span>
                    <span style={{ fontSize:10, color:T.dim, marginLeft:"auto" }}>可手动调整</span>
                  </div>

                  {aiAnalysis.summary && (
                    <div style={{ fontSize:12, color:T.muted, lineHeight:1.6, padding:"8px 10px", background:`${T.s2}88`, borderRadius:10, marginBottom:14 }}>{aiAnalysis.summary}</div>
                  )}

                  {/* Q 分拆解 */}
                  <div style={{ background:`rgba(100,210,255,0.06)`, border:`1px solid rgba(100,210,255,0.12)`, borderRadius:12, padding:"12px", marginBottom:12 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                      <span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, fontWeight:700, color:T.blue, letterSpacing:1 }}>Q 资产质量</span>
                      <span style={{ fontFamily:"'Space Mono',monospace", fontSize:22, fontWeight:700, color:T.blue }}>{aiAnalysis.q_score}</span>
                    </div>
                    {qb && <>
                      <SectionHeader title="天花板" total={qb.ceiling?.total} max={35} color={T.blue} />
                      {qb.ceiling?.age_window && <QDim label="年龄窗口" max={8} item={qb.ceiling.age_window} />}
                      {qb.ceiling?.offense && <QDim label="进攻能力" max={12} item={qb.ceiling.offense} />}
                      {qb.ceiling?.defense && <QDim label="防守能力" max={5} item={qb.ceiling.defense} />}
                      {qb.ceiling?.role_certainty && <QDim label="角色确定性" max={10} item={qb.ceiling.role_certainty} />}

                      <SectionHeader title="叙事面" total={qb.narrative?.total} max={25} color={T.blue} />
                      {qb.narrative?.market_appeal && <QDim label="市场号召力" max={8} item={qb.narrative.market_appeal} />}
                      {qb.narrative?.entertainment && <QDim label="观赏性" max={7} item={qb.narrative.entertainment} />}
                      {qb.narrative?.cultural_impact && <QDim label="文化穿透力" max={5} item={qb.narrative.cultural_impact} />}
                      {qb.narrative?.playoff_narrative && <QDim label="季后赛叙事" max={5} item={qb.narrative.playoff_narrative} />}

                      <SectionHeader title="卡市面" total={qb.card_market?.total} max={25} color={T.blue} />
                      {qb.card_market?.rc_products && <QDim label="RC 产品线" max={8} item={qb.card_market.rc_products} />}
                      {qb.card_market?.draft_class_competition && <QDim label="同届竞争" max={7} item={qb.card_market.draft_class_competition} />}
                      {qb.card_market?.product_cycle && <QDim label="产品周期" max={5} item={qb.card_market.product_cycle} />}
                      {qb.card_market?.liquidity && <QDim label="流动性" max={5} item={qb.card_market.liquidity} />}

                      <SectionHeader title="修正系数" total={qb.modifier?.total} max="±15" color={qb.modifier?.total >= 0 ? T.green : T.red} />
                      {qb.modifier?.injury_risk && <QDim label="伤病风险" max={-10} item={qb.modifier.injury_risk} />}
                      {qb.modifier?.positive_catalyst && <QDim label="正面催化" max={10} item={qb.modifier.positive_catalyst} />}
                      {qb.modifier?.negative_risk && <QDim label="负面风险" max={-5} item={qb.modifier.negative_risk} />}
                    </>}
                  </div>

                  {/* T 分拆解 */}
                  <div style={{ background:`rgba(201,168,76,0.06)`, border:`1px solid rgba(201,168,76,0.12)`, borderRadius:12, padding:"12px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                      <span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, fontWeight:700, color:T.gold, letterSpacing:1 }}>T 入场时机</span>
                      <span style={{ fontFamily:"'Space Mono',monospace", fontSize:22, fontWeight:700, color:T.gold }}>{aiAnalysis.t_score}</span>
                    </div>
                    {tb && <>
                      {tb.price_position && <TDim label="价格位置" item={tb.price_position} />}
                      {tb.catalyst_distance && <TDim label="催化剂距离" item={tb.catalyst_distance} />}
                      {tb.supply_pressure && <TDim label="供给压力" item={tb.supply_pressure} />}
                      {tb.season_cycle && <TDim label="赛季周期" item={tb.season_cycle} />}
                      {tb.buyer_pool && <TDim label="买家池深度" item={tb.buyer_pool} />}
                    </>}
                  </div>

                  {aiAnalysis.holder_perspective && (
                    <div style={{ background:"rgba(255,159,10,0.06)", border:"1px solid rgba(255,159,10,0.2)", borderRadius:12, padding:"12px", marginTop:12 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                        <span style={{ fontSize:14 }}>👤</span>
                        <span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, fontWeight:700, color:T.orange, letterSpacing:1 }}>持有者视角</span>
                      </div>
                      <div style={{ fontSize:12, color:T.muted, lineHeight:1.6 }}>{aiAnalysis.holder_perspective}</div>
                    </div>
                  )}

                  {!aiApplied && (
                    <button onClick={() => { setQ(aiAnalysis.q_score); setT(aiAnalysis.t_score); setAiApplied(true); }}
                      style={{ width:"100%", marginTop:12, padding:"10px", borderRadius:10, border:`1px solid ${T.borderGold}`, background:"rgba(201,168,76,0.08)", color:T.gold, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                      采用 AI 建议分数
                    </button>
                  )}
                </div>
              );
            })()}

            <ScoreSlider label="Q 资产质量" value={q} onChange={v => { setQ(v); setAiApplied(false); }} color={T.blue} />
            <ScoreSlider label="T 入场时机" value={t} onChange={v => { setT(v); setAiApplied(false); }} color={T.gold} />
            <div style={{ background:`linear-gradient(135deg,${ac}18,transparent)`, border:`1px solid ${ac}55`, borderRadius:16, padding:"20px", textAlign:"center", margin:"16px 0" }}>
              <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, letterSpacing:1, marginBottom:8 }}>ACTION SCORE = min(Q, T)</div>
              <div style={{ fontFamily:"'Space Mono',monospace", fontSize:48, fontWeight:700, color:ac, lineHeight:1 }}>{action}</div>
              <div style={{ fontSize:14, fontWeight:700, color:ac, marginTop:8 }}>{actionAdvice(action)}</div>
            </div>
            <button onClick={save} disabled={saving} style={{ width:"100%", padding:"14px", borderRadius:14, border:"none", background: saving ? T.s3 : `linear-gradient(135deg,${T.gold},${T.goldDark})`, color: saving ? T.dim : "#000", fontSize:15, fontWeight:700, cursor: saving ? "default" : "pointer" }}>{saving ? "创建中..." : "✓ 创建投资追踪"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreRing({ value, max, size, color, label, thick }) {
  const s = size || 90;
  const t = thick || 6;
  const r = (s - t) / 2;
  const circ = 2 * Math.PI * r;
  const pct = value != null ? Math.min(value / (max || 100), 1) : 0;
  const offset = circ * (1 - pct);
  return (
    <div style={{ textAlign:"center", flex:1 }}>
      <svg width={s} height={s} style={{ display:"block", margin:"0 auto" }}>
        <circle cx={s/2} cy={s/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={t} />
        {value != null && <circle cx={s/2} cy={s/2} r={r} fill="none" stroke={color} strokeWidth={t} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset} transform={`rotate(-90 ${s/2} ${s/2})`} style={{ transition:"stroke-dashoffset 0.8s ease" }} />}
        <text x={s/2} y={s/2 - 2} textAnchor="middle" dominantBaseline="central" fill={value != null ? color : T.dim}
          fontFamily="'Space Mono',monospace" fontSize={s > 80 ? 24 : 18} fontWeight="700">{value != null ? value : "—"}</text>
        {label && <text x={s/2} y={s/2 + 16} textAnchor="middle" fill={T.dim} fontFamily="'Space Mono',monospace" fontSize="8" letterSpacing="0.5">{label}</text>}
      </svg>
    </div>
  );
}

function InvestmentDetailScreen({ id, cards, onBack }) {
  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [thesisOpen, setThesisOpen] = useState(false);
  const [qOpen, setQOpen] = useState(false);
  const [tOpen, setTOpen] = useState(false);

  const [cpTitle, setCpTitle] = useState("");
  const [cpDesc, setCpDesc] = useState("");
  const [cpDecision, setCpDecision] = useState("");
  const [cpReasoning, setCpReasoning] = useState("");
  const [cpTrigger, setCpTrigger] = useState("manual");
  const [cpWindow, setCpWindow] = useState("");
  const [sq, setSq] = useState(50);
  const [st, setSt] = useState(50);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);

  const load = async () => { setLoading(true); const d = await apiGetInvestment(id); setInv(d); if (d) { setSq(d.q_score ?? 50); setSt(d.t_score ?? 50); } setLoading(false); };
  useEffect(() => { load(); }, [id]);

  if (loading) return <div style={{ padding:"60px 20px", textAlign:"center", color:T.dim }}>加载中...</div>;
  if (!inv) return <div style={{ padding:"60px 20px", textAlign:"center", color:T.dim }}>未找到该投资 <button onClick={onBack} style={{ display:"block", margin:"16px auto 0", color:T.gold, background:"none", border:"none", cursor:"pointer" }}>← 返回</button></div>;

  const ty = INV_TYPE[inv.investment_type] || INV_TYPE.investment;
  const ac = actionColor(inv.action_score);
  const exit = inv.exit_rules && !Array.isArray(inv.exit_rules) ? inv.exit_rules : null;
  const myCards = (cards || []).filter(c => c.player && (c.player === inv.player_name || (inv.player_name_cn && c.player.includes(inv.player_name_cn))));
  const linkedIds = new Set((inv.positions || []).map(p => p.card_id).filter(Boolean));
  const heldPositions = (inv.positions || []).filter(p => p.status === "held");
  const isHolder = heldPositions.length > 0;
  const saction = Math.min(sq, st);
  const sig = SIGNAL_MAP[inv.status_signal] || SIGNAL_MAP.hold;

  const addCheckpoint = async () => {
    if (!cpTitle.trim()) return;
    setBusy(true);
    try {
      await apiAddCheckpoint(id, { title:cpTitle.trim(), description:cpDesc.trim() || null, decision:cpDecision.trim() || null, decision_reasoning:cpReasoning.trim() || null, trigger_type:cpTrigger, window_type:cpWindow || null });
      setCpTitle(""); setCpDesc(""); setCpDecision(""); setCpReasoning(""); setCpTrigger("manual"); setCpWindow(""); setPanel(null); await load();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };
  const updateScore = async () => {
    setBusy(true);
    try { await apiUpdateInvestment(id, { q_score:sq, t_score:st }); setPanel(null); await load(); }
    catch (e) { alert(e.message); }
    setBusy(false);
  };
  const refreshScore = async () => {
    setRefreshing(true); setRefreshResult(null);
    try {
      const r = await fetch("/api/investment-analyze", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ player_name: inv.player_name }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "分析失败");
      setRefreshResult({ newQ: d.q_score, newT: d.t_score, oldQ: inv.q_score, oldT: inv.t_score, q_breakdown: d.q_breakdown, t_breakdown: d.t_breakdown, summary: d.summary });
    } catch (e) { alert("刷新失败：" + e.message); }
    setRefreshing(false);
  };
  const applyRefresh = async () => {
    if (!refreshResult) return;
    setBusy(true);
    try {
      await apiUpdateInvestment(id, { q_score: refreshResult.newQ, t_score: refreshResult.newT, q_breakdown: refreshResult.q_breakdown, t_breakdown: refreshResult.t_breakdown });
      const oldAction = refreshResult.oldQ != null && refreshResult.oldT != null ? Math.min(refreshResult.oldQ, refreshResult.oldT) : null;
      const newAction = Math.min(refreshResult.newQ, refreshResult.newT);
      await apiAddCheckpoint(id, {
        trigger_type: "score_refresh", title: "Q/T分数更新",
        description: `AI重新评估：Q ${refreshResult.oldQ ?? "—"}→${refreshResult.newQ}, T ${refreshResult.oldT ?? "—"}→${refreshResult.newT}, 行动分 ${oldAction ?? "—"}→${newAction}`,
        q_score_snapshot: refreshResult.newQ, t_score_snapshot: refreshResult.newT, action_score_snapshot: newAction,
      });
      setRefreshResult(null); await load();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  const linkCard = async (c) => {
    setBusy(true);
    const desc = [c.year, c.series, c.parallel, c.numbered].filter(Boolean).join(" ") || c.player;
    try { await apiLinkCard(id, { card_id:c.id, card_description:desc, card_tier:c.parallel || null, cost_basis:c.buy_price ?? null, current_value:c.sell_price ?? null, purchase_date:c.buy_date || null }); await load(); }
    catch (e) { alert(e.message); }
    setBusy(false);
  };
  const closeInv = async () => {
    if (!window.confirm("确认关闭这个投资追踪？")) return;
    setBusy(true);
    try { await apiCloseInvestment(id); onBack(); }
    catch (e) { alert(e.message); setBusy(false); }
  };

  const fmtDate = iso => { if (!iso) return ""; const d = new Date(iso); return d.toLocaleDateString("zh-CN", { year:"numeric", month:"numeric", day:"numeric" }); };

  const exitProgress = (exit) => {
    if (!exit) return [];
    const items = [];
    const created = new Date(inv.created_at);
    const now = new Date();
    if (exit.profit_target != null) items.push({ label:"获利目标", target:`+${exit.profit_target}%`, pct:0, color:T.green });
    if (exit.stop_loss != null) items.push({ label:"止损线", target:`-${exit.stop_loss}%`, pct:0, color:T.red });
    if (exit.time_stop_months != null) {
      const months = (now - created) / (1000*60*60*24*30.44);
      const pct = Math.min(months / exit.time_stop_months, 1);
      items.push({ label:"时间止损", target:`${exit.time_stop_months}月`, pct, color:T.gold, detail:`已持有 ${Math.round(months)} 月` });
    }
    return items;
  };

  const qb = inv.q_breakdown;
  const tb = inv.t_breakdown;

  const QItem = ({ label, score, max, reason }) => (
    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderBottom:`1px solid rgba(10,132,255,0.08)` }}>
      <div style={{ flex:"0 0 70px", fontSize:11, color:T.muted }}>{label}</div>
      <div style={{ flex:"0 0 45px", fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, color:T.blue, textAlign:"right" }}>{score}/{max}</div>
      <div style={{ flex:1, fontSize:11, color:T.dim, lineHeight:1.4 }}>{reason}</div>
    </div>
  );
  const TItem = ({ label, score, max, reason }) => (
    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderBottom:`1px solid rgba(201,168,76,0.08)` }}>
      <div style={{ flex:"0 0 70px", fontSize:11, color:T.muted }}>{label}</div>
      <div style={{ flex:"0 0 45px", fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, color:T.gold, textAlign:"right" }}>{score}/{max}</div>
      <div style={{ flex:1, fontSize:11, color:T.dim, lineHeight:1.4 }}>{reason}</div>
    </div>
  );

  return (
    <div style={{ paddingBottom:120 }}>
      <div style={{ padding:"16px 20px", display:"flex", alignItems:"center", gap:14, borderBottom:`1px solid ${T.border}`, position:"sticky", top:0, background:T.bg, zIndex:10 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:T.muted, fontSize:20, cursor:"pointer" }}>←</button>
        <span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:T.dim, letterSpacing:1 }}>投资详情</span>
      </div>

      <div style={{ padding:"20px" }}>
        {/* 1. 顶部：球员名+类型+信号 */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:24, fontWeight:700, color:T.text }}>{inv.player_name_cn || inv.player_name}</div>
            <div style={{ fontSize:12, color:T.muted, marginTop:3 }}>{inv.player_name_cn ? inv.player_name : ""}</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end" }}>
            <Chip label={`${ty.emoji} ${ty.label}`} color={ty.color} />
            <Chip label={sig.label} color={sig.color} bg={sig.bg} style={{ fontSize:11, padding:"4px 12px", fontWeight:700 }} />
          </div>
        </div>

        {/* 2. Q/T/行动分 三圆环 */}
        <div style={{ background:`linear-gradient(135deg,${ac}10,transparent)`, border:`1px solid ${ac}33`, borderRadius:16, padding:"20px 8px 12px", marginBottom:16, position:"relative" }}>
          <button onClick={refreshScore} disabled={refreshing || busy} style={{ position:"absolute", top:12, right:12, background:"none", border:`1px solid ${T.border}`, borderRadius:8, padding:"5px 8px", cursor:"pointer", color:T.muted, fontSize:14, lineHeight:1, transition:"all 0.2s" }}>
            <span style={{ display:"inline-block", animation: refreshing ? "spin 1s linear infinite" : "none" }}>🔄</span>
          </button>
          {refreshing && (
            <div style={{ textAlign:"center", padding:"30px 0", animation:"fadeUp 0.2s ease both" }}>
              <div style={{ fontSize:13, color:T.gold, marginBottom:6 }}>正在重新评估...</div>
              <div style={{ fontSize:11, color:T.dim }}>AI 正在搜索最新数据并重新打分</div>
            </div>
          )}
          {!refreshing && !refreshResult && <>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center" }}>
              <ScoreRing value={inv.q_score} max={100} size={85} color={T.blue} label="Q 质量" thick={5} />
              <ScoreRing value={inv.t_score} max={100} size={85} color={T.gold} label="T 时机" thick={5} />
              <ScoreRing value={inv.action_score} max={100} size={95} color={ac} label="行动分" thick={6} />
            </div>
            <div style={{ textAlign:"center", marginTop:10, fontSize:13, fontWeight:700, color:ac }}>{actionAdvice(inv.action_score)}</div>
            {inv.t_score != null && (
              <div style={{ textAlign:"center", marginTop:6, fontSize:12, color:T.muted }}>{holderAdvice(inv.t_score, isHolder)}</div>
            )}
          </>}
          {!refreshing && refreshResult && (() => {
            const dq = refreshResult.newQ - (refreshResult.oldQ ?? 0);
            const dt = refreshResult.newT - (refreshResult.oldT ?? 0);
            const oldA = refreshResult.oldQ != null && refreshResult.oldT != null ? Math.min(refreshResult.oldQ, refreshResult.oldT) : null;
            const newA = Math.min(refreshResult.newQ, refreshResult.newT);
            const da = oldA != null ? newA - oldA : null;
            const crossedZone = oldA != null && (
              (oldA >= 60 && newA < 40) || (oldA >= 40 && newA < 40) || (oldA < 60 && newA >= 75) || (oldA >= 75 && newA < 60)
            );
            const arrow = (d) => d > 0 ? `↑${d}` : d < 0 ? `↓${Math.abs(d)}` : "—";
            const arrowColor = (d) => d > 0 ? T.green : d < 0 ? T.red : T.dim;
            return (
              <div style={{ animation:"fadeUp 0.2s ease both" }}>
                <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, letterSpacing:1, textAlign:"center", marginBottom:12 }}>新旧分数对比</div>
                <div style={{ display:"flex", justifyContent:"center", gap:20 }}>
                  {[{ label:"Q 质量", oldV:refreshResult.oldQ, newV:refreshResult.newQ, d:dq, color:T.blue },
                    { label:"T 时机", oldV:refreshResult.oldT, newV:refreshResult.newT, d:dt, color:T.gold },
                    { label:"行动分", oldV:oldA, newV:newA, d:da, color:actionColor(newA) }
                  ].map(item => (
                    <div key={item.label} style={{ textAlign:"center", flex:1 }}>
                      <div style={{ fontSize:9, color:T.dim, marginBottom:4 }}>{item.label}</div>
                      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"center", gap:4 }}>
                        <span style={{ fontFamily:"'Space Mono',monospace", fontSize:12, color:T.dim }}>{item.oldV ?? "—"}</span>
                        <span style={{ fontSize:10, color:T.dim }}>→</span>
                        <span style={{ fontFamily:"'Space Mono',monospace", fontSize:22, fontWeight:700, color:item.color }}>{item.newV}</span>
                      </div>
                      {item.d != null && <div style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:arrowColor(item.d), marginTop:2 }}>({arrow(item.d)})</div>}
                    </div>
                  ))}
                </div>
                {crossedZone && (
                  <div style={{ textAlign:"center", marginTop:10, padding:"6px 12px", background:"rgba(255,69,58,0.1)", border:"1px solid rgba(255,69,58,0.3)", borderRadius:8, fontSize:12, color:T.red, fontWeight:600 }}>
                    ⚠️ 行动分跨越决策区间！{oldA != null && newA < oldA ? "风险升高，请重新评估策略" : "机会改善，可考虑调整仓位"}
                  </div>
                )}
                {refreshResult.summary && <div style={{ fontSize:11, color:T.muted, textAlign:"center", marginTop:8, lineHeight:1.5 }}>{refreshResult.summary}</div>}
                <div style={{ display:"flex", gap:8, marginTop:14 }}>
                  <button onClick={() => setRefreshResult(null)} style={{ flex:1, padding:"10px", borderRadius:10, border:`1px solid ${T.border}`, background:"transparent", color:T.muted, fontSize:12, fontWeight:600, cursor:"pointer" }}>保持原分数</button>
                  <button onClick={applyRefresh} disabled={busy} style={{ flex:1, padding:"10px", borderRadius:10, border:"none", background: busy ? T.s3 : `linear-gradient(135deg,${T.gold},${T.goldDark})`, color: busy ? T.dim : "#000", fontSize:12, fontWeight:700, cursor:"pointer" }}>{busy ? "应用中..." : "应用新分数"}</button>
                </div>
              </div>
            );
          })()}
          {!refreshing && !refreshResult && (() => {
            const hist = Array.isArray(inv.score_history) ? inv.score_history : [];
            const lastEntry = hist.length > 0 ? hist[hist.length - 1] : null;
            const lastDate = lastEntry?.at ? new Date(lastEntry.at) : (inv.updated_at ? new Date(inv.updated_at) : null);
            if (!lastDate) return null;
            const daysAgo = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
            const stale = daysAgo > 30;
            return (
              <div style={{ textAlign:"center", marginTop:8, fontSize:10, color: stale ? T.orange : T.dim }}>
                上次评估：{daysAgo === 0 ? "今天" : `${daysAgo}天前`}{stale ? " ⚠️ 建议重新评估" : ""}
              </div>
            );
          })()}
        </div>

        {/* 3. THESIS 全文卡片（可展开） */}
        <div style={{ background:T.s2, border:`1px solid ${T.border}`, borderRadius:14, padding:"16px", marginBottom:14 }}>
          <div onClick={() => setThesisOpen(!thesisOpen)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer" }}>
            <span style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, letterSpacing:1 }}>THESIS · 建仓逻辑</span>
            <span style={{ fontSize:12, color:T.dim, transition:"transform 0.2s", transform:thesisOpen?"rotate(180deg)":"rotate(0)" }}>▾</span>
          </div>
          {thesisOpen && (
            <div style={{ fontSize:13, color:T.text, lineHeight:1.8, whiteSpace:"pre-wrap", marginTop:12, animation:"fadeUp 0.2s ease both" }}>{inv.thesis_text || "—"}</div>
          )}
          {!thesisOpen && inv.thesis_text && (
            <div style={{ fontSize:12, color:T.muted, marginTop:8, lineHeight:1.5, overflow:"hidden", textOverflow:"ellipsis", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{inv.thesis_text}</div>
          )}
        </div>

        {/* 4. EXIT 规则卡片（带进度条） */}
        {exit && (
          <div style={{ background:T.s2, border:`1px solid ${T.border}`, borderRadius:14, padding:"16px", marginBottom:14 }}>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, letterSpacing:1, marginBottom:12 }}>EXIT · 退出纪律</div>
            {exitProgress(exit).map((ep, i) => (
              <div key={i} style={{ marginBottom: i < exitProgress(exit).length - 1 ? 14 : 0 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6 }}>
                  <span style={{ fontSize:12, color:T.muted }}>{ep.label}</span>
                  <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                    {ep.detail && <span style={{ fontSize:10, color:T.dim }}>{ep.detail}</span>}
                    <span style={{ fontFamily:"'Space Mono',monospace", fontSize:14, fontWeight:700, color:ep.color }}>{ep.target}</span>
                  </div>
                </div>
                <div style={{ height:6, borderRadius:3, background:T.s3, overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:3, background:ep.color, width:`${Math.round(ep.pct * 100)}%`, transition:"width 0.5s ease" }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 5. Q分详细拆分卡片 */}
        {qb && (
          <div style={{ background:`rgba(10,132,255,0.04)`, border:`1px solid rgba(10,132,255,0.12)`, borderRadius:14, padding:"16px", marginBottom:14 }}>
            <div onClick={() => setQOpen(!qOpen)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer" }}>
              <span style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.blue, letterSpacing:1 }}>Q 资产质量拆分</span>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontFamily:"'Space Mono',monospace", fontSize:20, fontWeight:700, color:T.blue }}>{inv.q_score}</span>
                <span style={{ fontSize:12, color:T.dim, transition:"transform 0.2s", transform:qOpen?"rotate(180deg)":"rotate(0)" }}>▾</span>
              </div>
            </div>
            {qOpen && (
              <div style={{ marginTop:12, animation:"fadeUp 0.2s ease both" }}>
                {qb.ceiling && <>
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0 4px", marginTop:4 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:T.text }}>天花板维度</span>
                    <span style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, color:T.blue }}>{qb.ceiling.total}/35</span>
                  </div>
                  {qb.ceiling.age_window && <QItem label="年龄窗口" score={qb.ceiling.age_window.score} max={8} reason={qb.ceiling.age_window.reason} />}
                  {qb.ceiling.offense && <QItem label="进攻已证明" score={qb.ceiling.offense.score} max={12} reason={qb.ceiling.offense.reason} />}
                  {qb.ceiling.defense && <QItem label="防守能力" score={qb.ceiling.defense.score} max={5} reason={qb.ceiling.defense.reason} />}
                  {qb.ceiling.role_certainty && <QItem label="角色确定性" score={qb.ceiling.role_certainty.score} max={10} reason={qb.ceiling.role_certainty.reason} />}
                </>}
                {qb.narrative && <>
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0 4px", marginTop:8 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:T.text }}>叙事面维度</span>
                    <span style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, color:T.blue }}>{qb.narrative.total}/25</span>
                  </div>
                  {qb.narrative.market_appeal && <QItem label="城市市场" score={qb.narrative.market_appeal.score} max={8} reason={qb.narrative.market_appeal.reason} />}
                  {qb.narrative.entertainment && <QItem label="打法观赏性" score={qb.narrative.entertainment.score} max={7} reason={qb.narrative.entertainment.reason} />}
                  {qb.narrative.cultural_impact && <QItem label="文化穿透力" score={qb.narrative.cultural_impact.score} max={5} reason={qb.narrative.cultural_impact.reason} />}
                  {qb.narrative.playoff_narrative && <QItem label="季后赛叙事" score={qb.narrative.playoff_narrative.score} max={5} reason={qb.narrative.playoff_narrative.reason} />}
                </>}
                {qb.card_market && <>
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0 4px", marginTop:8 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:T.text }}>卡市面维度</span>
                    <span style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, color:T.blue }}>{qb.card_market.total}/25</span>
                  </div>
                  {qb.card_market.rc_products && <QItem label="RC产品线" score={qb.card_market.rc_products.score} max={8} reason={qb.card_market.rc_products.reason} />}
                  {qb.card_market.draft_class_competition && <QItem label="同届竞争" score={qb.card_market.draft_class_competition.score} max={7} reason={qb.card_market.draft_class_competition.reason} />}
                  {qb.card_market.product_cycle && <QItem label="产品周期" score={qb.card_market.product_cycle.score} max={5} reason={qb.card_market.product_cycle.reason} />}
                  {qb.card_market.liquidity && <QItem label="流动性" score={qb.card_market.liquidity.score} max={5} reason={qb.card_market.liquidity.reason} />}
                </>}
                {qb.modifier && (
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0 4px", marginTop:8, borderTop:`1px solid rgba(10,132,255,0.1)` }}>
                    <span style={{ fontSize:12, fontWeight:700, color:T.text }}>修正系数</span>
                    <span style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, color:qb.modifier.total >= 0 ? T.green : T.red }}>{qb.modifier.total > 0 ? "+" : ""}{qb.modifier.total}</span>
                  </div>
                )}
                {qb.modifier?.detail && <div style={{ fontSize:11, color:T.dim, lineHeight:1.5, marginTop:4 }}>{qb.modifier.detail}</div>}
                {qb.modifier?.injury_risk && <QItem label="伤病风险" score={qb.modifier.injury_risk.score} max={-10} reason={qb.modifier.injury_risk.reason} />}
                {qb.modifier?.positive_catalyst && <QItem label="正面催化" score={qb.modifier.positive_catalyst.score} max={10} reason={qb.modifier.positive_catalyst.reason} />}
                {qb.modifier?.negative_risk && <QItem label="负面风险" score={qb.modifier.negative_risk.score} max={-5} reason={qb.modifier.negative_risk.reason} />}
              </div>
            )}
          </div>
        )}

        {/* 6. T分详细拆分卡片（金色主题） */}
        {tb && (
          <div style={{ background:`rgba(201,168,76,0.04)`, border:`1px solid rgba(201,168,76,0.12)`, borderRadius:14, padding:"16px", marginBottom:14 }}>
            <div onClick={() => setTOpen(!tOpen)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer" }}>
              <span style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.gold, letterSpacing:1 }}>T 入场时机拆分</span>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontFamily:"'Space Mono',monospace", fontSize:20, fontWeight:700, color:T.gold }}>{inv.t_score}</span>
                <span style={{ fontSize:12, color:T.dim, transition:"transform 0.2s", transform:tOpen?"rotate(180deg)":"rotate(0)" }}>▾</span>
              </div>
            </div>
            {tOpen && (
              <div style={{ marginTop:12, animation:"fadeUp 0.2s ease both" }}>
                {tb.price_position && <TItem label="价格位置" score={tb.price_position.score} max={tb.price_position.max || 30} reason={tb.price_position.reason} />}
                {tb.catalyst_distance && <TItem label="催化剂距离" score={tb.catalyst_distance.score} max={tb.catalyst_distance.max || 25} reason={tb.catalyst_distance.reason} />}
                {tb.supply_pressure && <TItem label="供给压力" score={tb.supply_pressure.score} max={tb.supply_pressure.max || 15} reason={tb.supply_pressure.reason} />}
                {tb.season_cycle && <TItem label="赛季周期" score={tb.season_cycle.score} max={tb.season_cycle.max || 15} reason={tb.season_cycle.reason} />}
                {tb.buyer_pool && <TItem label="买家池深度" score={tb.buyer_pool.score} max={tb.buyer_pool.max || 15} reason={tb.buyer_pool.reason} />}
              </div>
            )}
          </div>
        )}

        {/* 7. 关联持仓列表 */}
        <div style={{ background:T.s2, border:`1px solid ${T.border}`, borderRadius:14, padding:"16px", marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, letterSpacing:1 }}>持仓 · {(inv.positions || []).length} 张</span>
            <button onClick={() => setPanel(panel === "link" ? null : "link")} style={{ background:"none", border:"none", color:T.gold, fontSize:12, fontWeight:600, cursor:"pointer" }}>{panel === "link" ? "收起" : "+ 关联卡片"}</button>
          </div>
          {(inv.positions || []).length === 0 && panel !== "link" && <div style={{ fontSize:12, color:T.dim, textAlign:"center", padding:"8px 0" }}>还没有关联持仓</div>}
          {(inv.positions || []).map(p => (
            <div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderTop:`1px solid ${T.border}` }}>
              <div style={{ minWidth:0, flex:1 }}>
                <div style={{ fontSize:13, color:T.text }}>{p.card_description}</div>
                <div style={{ display:"flex", gap:8, marginTop:3 }}>
                  {p.card_tier && <span style={{ fontSize:10, color:T.muted }}>{p.card_tier}</span>}
                  <span style={{ fontSize:10, color: p.status === "held" ? T.green : T.muted }}>{p.status === "held" ? "持有中" : "已售出"}</span>
                </div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0, marginLeft:10 }}>
                {p.cost_basis != null && <div style={{ fontFamily:"'Space Mono',monospace", fontSize:12, color:T.gold }}>{cny(p.cost_basis)}</div>}
                {p.current_value != null && <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, marginTop:2 }}>现值 {cny(p.current_value)}</div>}
              </div>
            </div>
          ))}
          {panel === "link" && (
            <div style={{ marginTop:12, borderTop:`1px solid ${T.border}`, paddingTop:12, animation:"fadeUp 0.2s ease both" }}>
              <div style={{ fontSize:11, color:T.muted, marginBottom:10 }}>从你的收藏中选择 {inv.player_name_cn || inv.player_name} 的卡片：</div>
              {myCards.length === 0 && <div style={{ fontSize:12, color:T.dim, textAlign:"center", padding:"8px 0" }}>收藏里没有匹配该球员的卡片</div>}
              {myCards.map(c => {
                const linked = linkedIds.has(c.id);
                return <div key={c.id} onClick={() => !linked && !busy && linkCard(c)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", borderRadius:10, background:T.s3, marginBottom:8, cursor: linked ? "default" : "pointer", opacity: linked ? 0.5 : 1 }}>
                  <div style={{ minWidth:0, flex:1 }}><div style={{ fontSize:12, color:T.text }}>{[c.year, c.series, c.parallel, c.numbered].filter(Boolean).join(" ")}</div></div>
                  <span style={{ fontSize:11, color: linked ? T.muted : T.gold, fontWeight:700, flexShrink:0, marginLeft:10 }}>{linked ? "已关联" : "+ 关联"}</span>
                </div>;
              })}
            </div>
          )}
        </div>

        {/* 8. 检查点时间线 */}
        <div style={{ background:T.s2, border:`1px solid ${T.border}`, borderRadius:14, padding:"16px", marginBottom:14 }}>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, letterSpacing:1, marginBottom:12 }}>CHECK · 检查点时间线</div>
          {(inv.checkpoints || []).length === 0 && <div style={{ fontSize:12, color:T.dim, textAlign:"center", padding:"8px 0" }}>还没有检查点</div>}
          {(inv.checkpoints || []).map((cp, i) => (
            <div key={cp.id} style={{ display:"flex", gap:12, paddingBottom: i < inv.checkpoints.length - 1 ? 16 : 0 }}>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                <div style={{ width:12, height:12, borderRadius:"50%", background:T.gold, marginTop:4, flexShrink:0, border:"2px solid rgba(201,168,76,0.3)" }} />
                {i < inv.checkpoints.length - 1 && <div style={{ width:1, flex:1, background:`linear-gradient(${T.gold}44, ${T.border})`, marginTop:4 }} />}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{cp.title}</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:3 }}>
                  <span style={{ fontSize:10, color:T.dim }}>{fmtDate(cp.created_at)}</span>
                  {cp.trigger_type && cp.trigger_type !== "manual" && <Chip label={cp.trigger_type} color={T.blue} style={{ fontSize:8, padding:"1px 6px" }} />}
                  {cp.window_type && <Chip label={cp.window_type} color="#9B6DFF" style={{ fontSize:8, padding:"1px 6px" }} />}
                </div>
                {(cp.q_score_snapshot != null || cp.t_score_snapshot != null) && (
                  <div style={{ display:"flex", gap:12, marginTop:6, padding:"4px 8px", background:T.s3, borderRadius:8, width:"fit-content" }}>
                    {cp.q_score_snapshot != null && <span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:T.blue }}>Q:{cp.q_score_snapshot}</span>}
                    {cp.t_score_snapshot != null && <span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:T.gold }}>T:{cp.t_score_snapshot}</span>}
                    {cp.action_score_snapshot != null && <span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, fontWeight:700, color:actionColor(cp.action_score_snapshot) }}>A:{cp.action_score_snapshot}</span>}
                  </div>
                )}
                {cp.description && <div style={{ fontSize:12, color:T.muted, marginTop:6, lineHeight:1.6 }}>{cp.description}</div>}
                {cp.decision && <div style={{ fontSize:12, color:T.gold, marginTop:6 }}>决策：{cp.decision}</div>}
                {cp.decision_reasoning && <div style={{ fontSize:11, color:T.dim, marginTop:4, lineHeight:1.5 }}>理由：{cp.decision_reasoning}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* 操作面板 */}
        {panel === "checkpoint" && (
          <div style={{ background:T.s2, border:`1px solid ${T.borderGold}`, borderRadius:14, padding:"16px", marginBottom:14, animation:"fadeUp 0.2s ease both" }}>
            <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:12 }}>添加检查点</div>
            <FF label="标题" required><Inp value={cpTitle} onChange={setCpTitle} placeholder="如 季后赛表现复盘" /></FF>
            <FF label="触发类型">
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {[["manual","手动"],["time","定时"],["event","事件"],["price","价格"],["health","健康"]].map(([k,l]) => (
                  <button key={k} onClick={() => setCpTrigger(k)} style={{ padding:"5px 12px", borderRadius:8, border:`1px solid ${cpTrigger === k ? T.borderGold : T.border}`, background: cpTrigger === k ? "rgba(201,168,76,0.1)" : "transparent", color: cpTrigger === k ? T.gold : T.muted, fontSize:11, cursor:"pointer" }}>{l}</button>
                ))}
              </div>
            </FF>
            <FF label="描述"><textarea value={cpDesc} onChange={e => setCpDesc(e.target.value)} rows={3} placeholder="发生了什么？数据/叙事/价格有何变化？" style={{ width:"100%", padding:"10px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.s3, color:T.text, fontSize:13, outline:"none", resize:"vertical", fontFamily:"'Inter','Noto Sans SC',sans-serif" }} /></FF>
            <FF label="决策"><Inp value={cpDecision} onChange={setCpDecision} placeholder="如 继续持有 / 加仓 / 减仓" /></FF>
            <FF label="决策理由"><Inp value={cpReasoning} onChange={setCpReasoning} placeholder="为什么做这个决策？" /></FF>
            <FF label="窗口类型（可选）">
              <div style={{ display:"flex", gap:6 }}>
                {[["","无"],["structural","结构性"],["event","事件型"],["sentiment","情绪型"]].map(([k,l]) => (
                  <button key={k} onClick={() => setCpWindow(k)} style={{ padding:"5px 12px", borderRadius:8, border:`1px solid ${cpWindow === k ? T.borderGold : T.border}`, background: cpWindow === k ? "rgba(201,168,76,0.1)" : "transparent", color: cpWindow === k ? T.gold : T.muted, fontSize:11, cursor:"pointer" }}>{l}</button>
                ))}
              </div>
            </FF>
            <button onClick={addCheckpoint} disabled={busy || !cpTitle.trim()} style={{ width:"100%", padding:"12px", borderRadius:10, border:"none", background: busy || !cpTitle.trim() ? T.s3 : `linear-gradient(135deg,${T.gold},${T.goldDark})`, color: busy || !cpTitle.trim() ? T.dim : "#000", fontSize:13, fontWeight:700, cursor:"pointer" }}>{busy ? "保存中..." : "保存检查点"}</button>
          </div>
        )}
        {panel === "score" && (
          <div style={{ background:T.s2, border:`1px solid ${T.borderGold}`, borderRadius:14, padding:"16px", marginBottom:14, animation:"fadeUp 0.2s ease both" }}>
            <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:16 }}>更新 Q / T 分数</div>
            <ScoreSlider label="Q 资产质量" value={sq} onChange={setSq} color={T.blue} />
            <ScoreSlider label="T 入场时机" value={st} onChange={setSt} color={T.gold} />
            <div style={{ textAlign:"center", margin:"4px 0 16px" }}>
              <span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:T.dim }}>新行动分 = </span>
              <span style={{ fontFamily:"'Space Mono',monospace", fontSize:20, fontWeight:700, color:actionColor(saction) }}>{saction}</span>
            </div>
            <button onClick={updateScore} disabled={busy} style={{ width:"100%", padding:"12px", borderRadius:10, border:"none", background: busy ? T.s3 : `linear-gradient(135deg,${T.gold},${T.goldDark})`, color: busy ? T.dim : "#000", fontSize:13, fontWeight:700, cursor:"pointer" }}>{busy ? "更新中..." : "保存分数"}</button>
          </div>
        )}
      </div>

      {/* 9. 底部固定操作栏 */}
      <div style={{ position:"fixed", bottom:60, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, padding:"12px 20px", background:"rgba(0,0,0,0.92)", backdropFilter:"blur(20px)", borderTop:`1px solid ${T.border}`, zIndex:20 }}>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={() => setPanel(panel === "score" ? null : "score")} style={{ flex:1, padding:"11px", borderRadius:12, border:`1px solid ${panel === "score" ? T.borderGold : T.border}`, background: panel === "score" ? "rgba(200,168,75,0.08)" : "transparent", color: panel === "score" ? T.gold : T.muted, fontSize:11, fontWeight:600, cursor:"pointer" }}>🎚 更新评分</button>
          <button onClick={() => setPanel(panel === "checkpoint" ? null : "checkpoint")} style={{ flex:1, padding:"11px", borderRadius:12, border:`1px solid ${panel === "checkpoint" ? T.borderGold : T.border}`, background: panel === "checkpoint" ? "rgba(200,168,75,0.08)" : "transparent", color: panel === "checkpoint" ? T.gold : T.muted, fontSize:11, fontWeight:600, cursor:"pointer" }}>📍 检查点</button>
          <button onClick={() => setPanel(panel === "link" ? null : "link")} style={{ flex:1, padding:"11px", borderRadius:12, border:`1px solid ${panel === "link" ? T.borderGold : T.border}`, background: panel === "link" ? "rgba(200,168,75,0.08)" : "transparent", color: panel === "link" ? T.gold : T.muted, fontSize:11, fontWeight:600, cursor:"pointer" }}>🃏 关联卡片</button>
          <button onClick={closeInv} disabled={busy} style={{ flex:0, padding:"11px 14px", borderRadius:12, border:`1px solid rgba(255,69,58,0.2)`, background:"rgba(255,69,58,0.06)", color:T.red, fontSize:11, fontWeight:600, cursor:"pointer" }}>✕</button>
        </div>
      </div>
    </div>
  );
}

function TabBar() {
  const {screen,nav}=useApp();
  return <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,display:"flex",justifyContent:"space-around",padding:"10px 0 max(18px, env(safe-area-inset-bottom))",background:"rgba(0,0,0,0.92)",backdropFilter:"blur(30px) saturate(180%)",borderTop:"1px solid rgba(255,255,255,0.08)",zIndex:100}}>
    {[{id:"home",l:"首页",i:"⬜"},{id:"search",l:"搜索",i:"🔍"},{id:"add"},{id:"pc",l:"PC",i:"❤️"},{id:"invest",l:"投资",i:"📈"},{id:"stats",l:"统计",i:"📊"}].map(tab=>{
      if(tab.id==="add") return <button key="add" onClick={()=>nav("add")} style={{position:"relative",background:"none",border:"none",padding:0,marginTop:-18}}>
        <div style={{width:56,height:56,borderRadius:"50%",background:T.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,boxShadow:`0 4px 24px rgba(200,168,75,0.5)`}}>📷</div>
      </button>;
      const active=screen===tab.id||((tab.id==="home")&&["detail","add","edit"].includes(screen));
      return <button key={tab.id} onClick={()=>nav(tab.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",padding:"4px 12px",color:active?T.gold:T.dim,transition:"color 0.2s"}}>
        <span style={{fontSize:22}}>{tab.i}</span>
        <span style={{fontFamily:"'Noto Sans SC',sans-serif",fontSize:10,fontWeight:active?700:400}}>{tab.l}</span>
      </button>;
    })}
  </div>;
}

function Router() {
  const {screen}=useApp();
  switch(screen){
    case "home":   return <HomeScreen />;
    case "search": return <SearchScreen />;
    case "add":    return <AddScreen />;
    case "edit":   return <EditScreen />;
    case "batchImport": return <BatchImportScreen />;
    case "pc":     return <PCScreen />;
    case "stats":  return <StatsScreen />;
    case "invest": return <InvestmentScreen />;
    case "detail": return <DetailScreen />;
    case "radar":  return <RadarScreen />;
    default:       return <HomeScreen />;
  }
}

export default function CardVault() {
  return <>
    <Head>
      <title>Card Vault</title>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="theme-color" content="#080810" />
      <link rel="manifest" href="/manifest.json" />
    </Head>
    <AppProvider>
      <div style={{minHeight:"100vh",background:T.bg,maxWidth:480,margin:"0 auto",position:"relative",overflowX:"hidden",fontFamily:"'Inter','Noto Sans SC',sans-serif",color:T.text}}>
        <Router />
        <TabBar />
        <TL />
      </div>
    </AppProvider>
  </>;
}
function TL(){ const {toast}=useApp(); return <ToastView toast={toast} />; }
