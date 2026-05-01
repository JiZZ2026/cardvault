import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
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
const apiRadarScan = async () => {
  const r = await fetch("/api/radar-scan", { method:"POST" });
  const d = await r.json();
  return r.ok ? { success:true, ...d } : { success:false, error:d.error };
};
const apiGetScanResults = async () => {
  const r = await fetch("/api/radar-scan");
  const d = await r.json();
  return r.ok ? d : { mustWatch:[], niceToHave:[], lastScanned:null };
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

  const refreshDaily = useCallback((allCards) => {
    const pool = (allCards||cards).filter(c => !dailyHistory.includes(c.id));
    const src = pool.length > 0 ? pool : (allCards||cards);
    if (src.length === 0) return;
    const pick = src[Math.floor(Math.random()*src.length)];
    setDaily(pick);
    setDailyHistory(h => [...h.slice(-10), pick.id]);
  }, [cards, dailyHistory]);

  const stats = {
    total:cards.length, pc:cards.filter(c=>c.category==="PC").length,
    inv:cards.filter(c=>c.category==="investment").length,
    grading:cards.filter(c=>c.status==="grading").length,
    forSale:cards.filter(c=>c.status==="for_sale").length,
    oneOfOnes:cards.filter(c=>c.is_one_of_one).length,
    longhold:cards.filter(c=>c.category==="longhold").length,
    cost:cards.reduce((s,c)=>s+(parseFloat(c.buy_price)||0),0),
    pnl:cards.filter(c=>c.status==="sold"&&c.sell_price).reduce((s,c)=>s+(parseFloat(c.sell_price)||0)-(parseFloat(c.buy_price)||0),0),
  };

  return <Ctx.Provider value={{cards,pcP,loading,daily,screen,sel,stats,toast,dc,rate,toggleDC,nav,refreshDaily,addCard,updCard,delCard,showToast}}>{children}</Ctx.Provider>;
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
function CardRow({card,onClick,ps,style={}}) {
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
}
function SHdr({title,sub,action,onAction}) { return <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div><span style={{fontSize:17,fontWeight:600,color:T.text,letterSpacing:"-0.3px"}}>{title}</span>{sub&&<span style={{fontSize:12,color:T.muted,marginLeft:6}}>{sub}</span>}</div>{action&&<button onClick={onAction} style={{background:"none",border:"none",color:T.gold,fontSize:13,cursor:"pointer",padding:0,fontWeight:500}}>{action}</button>}</div>; }
function Skel({width="100%",height=16,radius=6,style={}}) { return <div style={{width,height,borderRadius:radius,background:`linear-gradient(90deg,${T.s2} 25%,${T.s3} 50%,${T.s2} 75%)`,backgroundSize:"200% 100%",animation:"shimmer 1.5s infinite",...style}} />; }
function ToastView({toast}) { if(!toast)return null; return <div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",padding:"10px 20px",borderRadius:10,zIndex:999,background:toast.type==="warn"?"rgba(224,120,48,0.9)":"rgba(61,170,106,0.9)",color:"#fff",fontSize:13,fontWeight:600,boxShadow:"0 4px 20px rgba(0,0,0,0.4)",backdropFilter:"blur(8px)",animation:"fadeUp 0.3s ease both",whiteSpace:"nowrap"}}>{toast.msg}</div>; }
function CurrBtn() { const {dc,toggleDC}=useApp(); return <button onClick={toggleDC} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${T.borderGold}`,background:`rgba(201,168,76,0.08)`,color:T.gold,fontFamily:"'Space Mono',monospace",fontSize:11,fontWeight:700,cursor:"pointer"}}>{dc==="RMB"?"¥ RMB":"$ USD"}</button>; }

function FF({label,required,children}) { return <div style={{marginBottom:14}}><label style={{display:"block",fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,letterSpacing:0.8,marginBottom:6}}>{label.toUpperCase()} {required&&<span style={{color:T.gold}}>*</span>}</label>{children}</div>; }
function Inp({value,onChange,placeholder,type="text"}) { return <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:8,background:T.s3,color:T.text,fontSize:13,outline:"none",transition:"border-color 0.2s"}} onFocus={e=>e.target.style.borderColor=T.gold} onBlur={e=>e.target.style.borderColor=T.border} />; }
function Sl({value,onChange,options}) { return <select value={value||""} onChange={e=>onChange(e.target.value)} style={{width:"100%",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:8,background:T.s3,color:value?T.text:T.muted,fontSize:13,outline:"none",appearance:"none",cursor:"pointer"}}>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>; }
function Tog({label,value,onChange}) { return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:8,background:T.s3,cursor:"pointer"}} onClick={()=>onChange(!value)}><span style={{fontSize:13,color:T.muted}}>{label}</span><div style={{width:36,height:20,borderRadius:10,background:value?T.gold:T.border,position:"relative",transition:"background 0.2s",flexShrink:0}}><div style={{position:"absolute",top:2,left:value?16:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}} /></div></div>; }

const EMPTY = () => ({ player:"",team:"",year:"",series:"",manufacturer:"",card_number:"",parallel:"",numbered:"",is_one_of_one:false,sub_series:"",is_rc:false,grade:"RAW",grade_company:"",grade_score:"",category:"PC",status:"holding",price_currency:"RMB",buy_price:"",buy_date:"",sell_price:"",sell_date:"",source:"",location:"",notes:"",tags:[] });

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
      <FF label="平行类型"><Inp value={form.parallel} onChange={set("parallel")} placeholder="如 Gold Geometric Refractor" /></FF>
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
    await addCard({...form,buy_price:form.buy_price?parseFloat(form.buy_price):null,sell_price:form.sell_price?parseFloat(form.sell_price):null,is_one_of_one:!!form.is_one_of_one,is_rc:!!form.is_rc,numbered:form.numbered||null,sub_series:form.sub_series||null,grade_company:form.grade_company||null,grade_score:form.grade_score||null,pc_player:form.category==="PC"?form.player:null,front_image:tf,back_image:tb,tags,notes:form.notes||"",status});
    setSaving(false); nav("home");
  };

  if(step==="photo") return <div style={{paddingBottom:90}}>
    <div style={{padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${T.border}`}}>
      <button onClick={()=>nav("home")} style={{background:"none",border:"none",color:T.muted,fontSize:20}}>←</button>
      <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.dim,letterSpacing:1}}>录入新卡</span>
      <button onClick={()=>setStep("confirm")} style={{background:"none",border:"none",color:T.dim,fontSize:11}}>跳过</button>
    </div>
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
  if(loading) return <div style={{padding:"20px"}}><Skel height={24} width={140} style={{marginBottom:6}} /><Skel height={12} width={100} style={{marginBottom:28}} /><Skel height={320} radius={20} style={{marginBottom:20}} /><Skel height={100} radius={16} style={{marginBottom:16}} /><Skel height={160} radius={14} /></div>;
  return (
    <div style={{paddingBottom:90}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 20px 12px"}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:700,color:T.text,letterSpacing:"-0.5px",lineHeight:1.1,fontFamily:"'Inter',sans-serif"}}>Card Vault</h1>
          <p style={{fontSize:12,color:T.muted,marginTop:3}}>{new Date().toLocaleDateString("zh-CN",{month:"long",day:"numeric",weekday:"short"})}</p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <CurrBtn />
          <button onClick={()=>nav("search")} style={{width:38,height:38,borderRadius:"50%",border:"none",background:T.s2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,cursor:"pointer",flexShrink:0}}>🔍</button>
          <button onClick={()=>nav("add")} style={{width:38,height:38,borderRadius:"50%",border:"none",background:T.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,cursor:"pointer",flexShrink:0}}>📷</button>
        </div>
      </div>
      {daily&&(<div style={{padding:"0 16px 20px",animation:"fadeUp 0.5s ease both"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,padding:"0 4px"}}>
          <span style={{fontSize:17,fontWeight:600,color:T.text,letterSpacing:"-0.3px"}}>今日精选</span>
          <button onClick={e=>{e.stopPropagation();refreshDaily();}} style={{background:"none",border:"none",color:T.gold,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontWeight:500,padding:0}}>🔀 换一张</button>
        </div>
        <DailyCardFull card={daily} players={pcP} />
      </div>)}
      <div style={{padding:"0 16px 16px",animation:"fadeUp 0.5s ease 80ms both"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
          {[{icon:"🃏",v:stats.total,l:"总卡数",go:"search"},{icon:"❤️",v:stats.pc,l:"PC",go:"pc"},{icon:"📈",v:stats.inv,l:"投资",go:"search"},{icon:"💎",v:stats.longhold,l:"长持",go:"search"}].map((s,i)=>(
            <div key={i} onClick={()=>nav(s.go)} style={{padding:"14px 6px",borderRadius:16,textAlign:"center",background:T.s2,cursor:"pointer",transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.s3} onMouseLeave={e=>e.currentTarget.style.background=T.s2}>
              <div style={{fontSize:18,marginBottom:6}}>{s.icon}</div>
              <div style={{fontSize:22,fontWeight:700,color:T.text,letterSpacing:"-0.5px",lineHeight:1}}>{s.v}</div>
              <div style={{fontSize:10,color:T.muted,marginTop:4}}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
      {(stats.cost!==null&&stats.cost>0)&&(<div style={{margin:"0 16px 16px",padding:"14px 16px",borderRadius:16,background:`linear-gradient(135deg,rgba(200,168,75,0.1),rgba(200,168,75,0.04))`,border:`1px solid rgba(200,168,75,0.2)`,animation:"fadeUp 0.5s ease 120ms both"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,color:T.muted}}>持仓总成本</span>
          <span style={{fontSize:18,fontWeight:700,color:T.gold,fontFamily:"monospace"}}>{fmtP(stats.cost,dc,rate)}</span>
        </div>
        <div style={{textAlign:"right",marginTop:2}}><span style={{fontSize:11,color:T.dim}}>≈ {dc==="RMB"?fmtDual(stats.cost,rate).usd:fmtDual(stats.cost,rate).rmb}</span></div>
      </div>)}
      <div style={{padding:"0 16px",animation:"fadeUp 0.5s ease 160ms both"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:17,fontWeight:600,color:T.text,letterSpacing:"-0.3px"}}>最近入库</span>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:12,color:T.muted}}>{cards.length} 张</span>
            <button onClick={()=>nav("search")} style={{background:"none",border:"none",color:T.gold,fontSize:13,cursor:"pointer",padding:0,fontWeight:500}}>全部</button>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {cards.slice(0,5).map(c=><CardRow key={c.id} card={c} ps={pcP} onClick={()=>nav("detail",c)} />)}
          {cards.length===0&&(<div style={{textAlign:"center",padding:"48px 0",color:T.dim}}><div style={{fontSize:48,marginBottom:12}}>🃏</div><div style={{fontSize:14}}>还没有卡片，点右上角📷开始录入</div></div>)}
        </div>
      </div>
    </div>
  );
}

function SearchScreen() {
  const {cards,pcP,nav}=useApp();
  const [q,setQ]=useState(""); const [cf,setCf]=useState("all"); const [pf,setPf]=useState("all"); const [yf,setYf]=useState("all");
  const ref=useRef(); useEffect(()=>{setTimeout(()=>ref.current?.focus(),100);},[]);
  const years = ["all",...[...new Set(cards.map(c=>c.year).filter(Boolean))].sort((a,b)=>b.localeCompare(a))];
  const list=cards.filter(c=>{
    if(cf!=="all"&&c.category!==cf)return false;
    if(pf!=="all"&&c.player!==pf)return false;
    if(yf!=="all"&&c.year!==yf)return false;
    if(q){const terms=expandQ(q);const fields=[c.player,c.series,c.parallel,c.card_number,c.numbered,c.grade,c.team,c.sub_series,c.year,...(c.tags||[])].filter(Boolean).map(f=>f.toLowerCase());return terms.some(t=>fields.some(f=>f.includes(t)));}
    return true;
  });
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
  const {cards,pcP,stats,dc,rate}=useApp();
  const soldCards=cards.filter(c=>c.status==="sold"&&c.sell_price);
  const pnl=soldCards.reduce((s,c)=>s+(parseFloat(c.sell_price)||0)-(parseFloat(c.buy_price)||0),0);
  const holdCost=cards.filter(c=>c.status!=="sold").reduce((s,c)=>s+(parseFloat(c.buy_price)||0),0);
  return <div style={{paddingBottom:90}}>
    <div style={{padding:"24px 20px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div><h2 style={{fontFamily:"'Space Mono',monospace",fontSize:18,fontWeight:700,color:T.gold}}>DASHBOARD</h2><p style={{fontSize:11,color:T.dim,marginTop:2}}>收藏总览</p></div>
      <CurrBtn />
    </div>
    <div style={{padding:"0 20px"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <div style={{padding:"16px",borderRadius:14,background:`linear-gradient(135deg,rgba(201,168,76,0.08),rgba(201,168,76,0.03))`,border:`1px solid ${T.borderGold}`}}>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:T.dim,letterSpacing:1,marginBottom:6}}>持仓成本</div>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:20,fontWeight:700,color:T.gold}}>{fmtP(holdCost,dc,rate)}</div>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,marginTop:3}}>≈ {dc==="RMB"?fmtDual(holdCost,rate).usd:fmtDual(holdCost,rate).rmb}</div>
        </div>
        <div style={{padding:"16px",borderRadius:14,background:`linear-gradient(135deg,${pnl>=0?"rgba(61,170,106,0.08)":"rgba(212,80,80,0.06)"},transparent)`,border:`1px solid ${pnl>=0?"rgba(61,170,106,0.2)":"rgba(212,80,80,0.2)"}`}}>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:T.dim,letterSpacing:1,marginBottom:6}}>已实现盈亏</div>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:20,fontWeight:700,color:pnl>=0?T.green:T.red}}>{pnl>=0?"+":""}{fmtP(Math.abs(pnl),dc,rate)}</div>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,marginTop:3}}>{soldCards.length} 张已出</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}}>
        {[{icon:"🃏",v:stats.total,l:"总卡"},{icon:"❤️",v:stats.pc,l:"PC"},{icon:"📦",v:stats.grading,l:"送评"},{icon:"✨",v:stats.oneOfOnes,l:"1/1"}].map((s,i)=>(
          <div key={i} style={{padding:"12px 8px",borderRadius:12,textAlign:"center",background:T.s2,border:`1px solid ${T.border}`}}>
            <div style={{fontSize:16,marginBottom:4}}>{s.icon}</div>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:16,fontWeight:700,color:T.text}}>{s.v}</div>
            <div style={{fontSize:10,color:T.dim,marginTop:1}}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:14,padding:"4px 16px",marginBottom:16}}>
        <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,padding:"12px 0 4px",letterSpacing:1}}>STATUS BREAKDOWN</div>
        {Object.entries(STATUS).map(([k,v])=>{
          const cs=cards.filter(c=>c.status===k);
          const val=cs.reduce((s,c)=>s+(parseFloat(c.buy_price)||0),0);
          return <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderTop:`1px solid ${T.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><Chip label={v.label} color={v.color} bg={v.bg} /><span style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:T.text,fontWeight:700}}>{cs.length}</span></div>
            {val>0&&<span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.muted}}>{fmtP(val,dc,rate)}</span>}
          </div>;
        })}
      </div>
      {soldCards.length>0&&<div style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:14,padding:"4px 16px",marginBottom:16}}>
        <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,padding:"12px 0 4px",letterSpacing:1}}>INVESTMENT P&L</div>
        {soldCards.slice(0,5).map(c=>{
          const p=(parseFloat(c.sell_price)||0)-(parseFloat(c.buy_price)||0);
          return <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderTop:`1px solid ${T.border}`}}>
            <div><div style={{fontSize:13,color:T.text}}>{c.player}</div><div style={{fontSize:10,color:T.muted}}>{c.parallel||c.series}</div></div>
            <span style={{fontFamily:"'Space Mono',monospace",fontSize:12,color:p>=0?T.green:T.red,fontWeight:700}}>{p>=0?"+":""}{fmtP(Math.abs(p),dc,rate,c.price_currency||"RMB")}</span>
          </div>;
        })}
      </div>}
      <div style={{background:T.s2,border:`1px solid ${T.border}`,borderRadius:14,padding:"12px 16px"}}>
        <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,marginBottom:14,letterSpacing:1}}>PC BREAKDOWN</div>
        {pcP.map(player=>{
          const cs=cards.filter(c=>c.player===player.name);
          const pct=stats.total>0?(cs.length/stats.total)*100:0;
          const val=cs.reduce((s,c)=>s+(parseFloat(c.buy_price)||0),0);
          return <div key={player.id} style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:T.muted}}>{player.emoji} {player.short}</span><span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.gold}}>{cs.length}张 · {fmtP(val,dc,rate)}</span></div>
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
  const [showNewGoal, setShowNewGoal] = useState(false);

  useEffect(() => { loadScanResults(); loadGoals(); }, []);

  const loadScanResults = async () => { const d = await apiGetScanResults(); setScanData(d); };
  const loadGoals = async () => { setLoadingGoals(true); const d = await apiGetGoals(); setGoals(d); setLoadingGoals(false); };

  const runScan = async () => {
    setScanning(true); setScanErr(null);
    const r = await apiRadarScan();
    if (r.success) await loadScanResults(); else setScanErr(r.error || "扫描失败");
    setScanning(false);
  };

  const fmtTime = iso => { if (!iso) return ""; const d = new Date(iso); return d.toLocaleString("zh-CN", { month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit" }); };
  const fmtPrice = (price, currency) => { if (!price) return "—"; if (currency === "USD") return `$${Number(price).toFixed(0)}  ≈ ¥${Math.round(price * rate).toLocaleString("zh-CN")}`; return `¥${Number(price).toLocaleString("zh-CN")}`; };

  const totalMissing = goals.reduce((s, g) => s + (g.missing_count || 0), 0);
  const hasResults = scanData && (scanData.mustWatch?.length > 0 || scanData.niceToHave?.length > 0);

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
        {scanErr && <div style={{ padding:"10px 14px", borderRadius:10, background:"rgba(212,80,80,0.08)", border:"1px solid rgba(212,80,80,0.2)", fontSize:12, color:T.red, marginBottom:14 }}>⚠️ {scanErr}</div>}

        {tab === "scan" && (
          <div style={{ animation:"fadeUp 0.3s ease both" }}>
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
            {goals.map(goal => <GoalCard key={goal.id} goal={goal} onDelete={async () => { await apiDeleteGoal(goal.id); loadGoals(); }} onSync={async () => { await apiSyncGoal(goal.id); loadGoals(); }} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ScanResultGroup({ group, fmtPrice, onDismiss }) {
  const [expanded, setExpanded] = useState(false);
  const wi = group.watch_item;
  const results = group.results || [];
  const best = results[0];

  return (
    <div style={{ background:T.s2, borderRadius:14, overflow:"hidden", marginBottom:10, border:`1px solid ${T.border}` }}>
      <div onClick={() => setExpanded(e => !e)} style={{ padding:"12px 14px", cursor:"pointer" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:3 }}>{wi?.description}</div>
            <div style={{ fontSize:11, color:T.muted }}>来自：{wi?.goal?.title || "—"} · {results.length} 个结果</div>
          </div>
          <div style={{ textAlign:"right", flexShrink:0, marginLeft:10 }}>
            {best && <div style={{ fontSize:13, fontWeight:700, color:T.green, fontFamily:"monospace" }}>${Number(best.price).toFixed(0)}</div>}
            <div style={{ fontSize:10, color:T.dim, marginTop:2 }}>{expanded ? "↑" : "↓"}</div>
          </div>
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop:`1px solid ${T.border}` }}>
          {results.map((r, i) => (
            <div key={r.id} style={{ display:"flex", gap:10, padding:"10px 14px", borderBottom: i < results.length - 1 ? `1px solid ${T.border}` : "none", alignItems:"flex-start" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, color:T.text, lineHeight:1.4, marginBottom:4, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{r.title}</div>
                <div style={{ fontSize:12, fontWeight:700, color:T.gold, fontFamily:"monospace" }}>{fmtPrice(r.price, r.price_currency)}</div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6, flexShrink:0 }}>
                <a href={r.listing_url} target="_blank" rel="noreferrer" style={{ padding:"5px 10px", borderRadius:8, background:T.gold, color:"#000", fontSize:11, fontWeight:700, textDecoration:"none", textAlign:"center" }}>查看</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GoalCard({ goal, onDelete, onSync }) {
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const TIER_COLOR = { common:T.muted, numbered:T.blue, premium:T.gold, ultra:T.orange, "1of1":T.red };
  const doSync = async e => { e.stopPropagation(); setSyncing(true); await onSync(); setSyncing(false); };
  const pct = goal.progress_pct || 0;
  const missing = goal.missing_items || [];

  return (
    <div style={{ background:T.s2, borderRadius:14, overflow:"hidden", marginBottom:10, border:`1px solid ${T.border}` }}>
      <div onClick={() => setExpanded(e => !e)} style={{ padding:"14px", cursor:"pointer" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:14, fontWeight:600, color:T.text, marginBottom:3 }}>{goal.title}</div>
            <div style={{ fontSize:11, color:T.muted }}>{goal.checklist?.set_name || "—"} · {goal.owned_count}/{goal.total_items} 已有 · <span style={{ color:T.orange }}>{goal.missing_count} 缺口</span></div>
          </div>
          <div style={{ display:"flex", gap:6, alignItems:"center", marginLeft:10 }}>
            <button onClick={doSync} disabled={syncing} style={{ padding:"5px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.blue, fontSize:11, cursor:"pointer" }}>{syncing ? "同步..." : "↻ 同步"}</button>
            <span style={{ fontSize:14, color:T.dim }}>{expanded ? "↑" : "↓"}</span>
          </div>
        </div>
        <div style={{ height:4, borderRadius:2, background:T.s3 }}>
          <div style={{ height:"100%", borderRadius:2, width:`${pct}%`, background:`linear-gradient(90deg,${T.gold},${T.goldLight})`, transition:"width 0.6s ease" }} />
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
          <span style={{ fontSize:10, color:T.dim }}>收集进度</span>
          <span style={{ fontSize:10, color:T.gold, fontFamily:"monospace", fontWeight:700 }}>{pct}%</span>
        </div>
      </div>
      {expanded && missing.length > 0 && (
        <div style={{ borderTop:`1px solid ${T.border}`, padding:"10px 14px", maxHeight:260, overflowY:"auto" }}>
          <div style={{ fontSize:10, color:T.dim, fontFamily:"'Space Mono',monospace", letterSpacing:1, marginBottom:8 }}>缺口清单（{missing.length} 项）</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {missing.map((item, i) => (
              <span key={i} style={{ padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:600, color:TIER_COLOR[item.tier]||T.muted, background:`${TIER_COLOR[item.tier]||T.muted}15`, border:`1px solid ${TIER_COLOR[item.tier]||T.muted}30` }}>
                {item.name_cn || item.name}{item.numbered && item.print_run ? ` /${item.print_run}` : ""}
              </span>
            ))}
          </div>
          <button onClick={() => { if (window.confirm(`删除目标"${goal.title}"？`)) onDelete(); }} style={{ width:"100%", marginTop:12, padding:"8px", borderRadius:10, border:"1px solid rgba(212,80,80,0.2)", background:"rgba(212,80,80,0.05)", color:T.red, fontSize:12, cursor:"pointer" }}>删除此目标</button>
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
  const [filterCond, setFilterCond] = useState({ color:"", max_print_run:"" });
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { if (step === "checklist") loadChecklists(""); }, [step]);

  const loadChecklists = async (search) => { const data = await apiGetChecklists(search); setChecklists(data); };

  const generateChecklist = async () => {
    if (!clSearch) return;
    setGenerating(true); setErr("");
    const r = await apiGenerateChecklist({ set_name:clSearch, checklist_type: mode === "full_players" ? "player_set" : "parallels", use_ai:true });
    if (r.success) { setSelectedCL(r.data); setChecklists(prev => [r.data, ...prev.filter(c => c.id !== r.data.id)]); }
    else setErr(r.error || "AI生成失败");
    setGenerating(false);
  };

  const save = async () => {
    if (!title || !mode || !selectedCL) { setErr("请填写完整信息"); return; }
    setSaving(true); setErr("");
    const filter = mode === "filtered_parallels" ? {
      ...(filterCond.color ? { color:filterCond.color } : {}),
      ...(filterCond.max_print_run ? { max_print_run:parseInt(filterCond.max_print_run) } : {}),
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
    { id:"filtered_parallels", icon:"🎯", label:"条件筛选", desc:"按颜色或编号范围筛选平行（如全部/50金折）" },
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
              <FF label="颜色关键词（可选）"><Inp value={filterCond.color} onChange={v=>setFilterCond(f=>({...f,color:v}))} placeholder="如 Gold" /></FF>
              <FF label="最大编号（可选）"><Inp value={filterCond.max_print_run} onChange={v=>setFilterCond(f=>({...f,max_print_run:v}))} placeholder="如 50（只看 /50 以下）" type="number" /></FF>
            </>}
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
                mode==="filtered_parallels" && filterCond.max_print_run && ["最大编号", `/${filterCond.max_print_run}`],
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

function TabBar() {
  const {screen,nav}=useApp();
  return <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,display:"flex",justifyContent:"space-around",padding:"10px 0 max(18px, env(safe-area-inset-bottom))",background:"rgba(0,0,0,0.92)",backdropFilter:"blur(30px) saturate(180%)",borderTop:"1px solid rgba(255,255,255,0.08)",zIndex:100}}>
    {[{id:"home",l:"首页",i:"⬜"},{id:"search",l:"搜索",i:"🔍"},{id:"add"},{id:"pc",l:"PC",i:"❤️"},{id:"stats",l:"统计",i:"📊"}].map(tab=>{
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
    case "pc":     return <PCScreen />;
    case "stats":  return <StatsScreen />;
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
