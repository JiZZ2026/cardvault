import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import Head from "next/head";

const T = {
  gold:"#C9A84C", goldLight:"#E8C97A", goldDark:"#8B6914",
  bg:"#080810", surface:"#0E0E1A", s2:"#141422", s3:"#1C1C2E",
  border:"rgba(255,255,255,0.06)", borderGold:"rgba(201,168,76,0.25)",
  text:"#F0EEE8", muted:"#7A7A8C", dim:"#4A4A5E",
  green:"#3DAA6A", blue:"#4A9EFF", orange:"#E07830", red:"#D45050",
};
const STATUS = {
  holding:  { label:"持有",   color:T.green,  bg:"rgba(61,170,106,0.1)"  },
  for_sale: { label:"待出",   color:T.orange, bg:"rgba(224,120,48,0.1)"  },
  grading:  { label:"送评中", color:T.blue,   bg:"rgba(74,158,255,0.1)"  },
  sold:     { label:"已出",   color:T.muted,  bg:"rgba(122,122,140,0.1)" },
};
const CAT = { PC:{label:"PC",color:T.gold}, investment:{label:"投资",color:T.blue}, other:{label:"其他",color:T.muted} };
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
  "旗手":"Cooper Flagg","弗拉格":"Cooper Flagg",
  "勇士":"Golden State Warriors","湖人":"Los Angeles Lakers","凯尔特人":"Boston Celtics","绿军":"Boston Celtics",
  "火箭":"Houston Rockets","雄鹿":"Milwaukee Bucks","马刺":"San Antonio Spurs","尼克斯":"New York Knicks",
  "公牛":"Chicago Bulls","热火":"Miami Heat","快船":"Los Angeles Clippers","森林狼":"Minnesota Timberwolves",
  "雷霆":"Oklahoma City Thunder","独行侠":"Dallas Mavericks","小牛":"Dallas Mavericks","太阳":"Phoenix Suns",
  "步行者":"Indiana Pacers","猛龙":"Toronto Raptors","老鹰":"Atlanta Hawks","篮网":"Brooklyn Nets",
  "奇才":"Washington Wizards","骑士":"Cleveland Cavaliers","活塞":"Detroit Pistons","爵士":"Utah Jazz",
  "国王":"Sacramento Kings","鹈鹕":"New Orleans Pelicans","灰熊":"Memphis Grizzlies","魔术":"Orlando Magic",
  "开拓者":"Portland Trail Blazers","掘金":"Denver Nuggets","76人":"Philadelphia 76ers",
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
  if (!n || isNaN(Number(n))) return "—";
  const v = Number(n);
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

// API
const apiRecognize = async (f,b) => { const r=await fetch("/api/recognize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({frontImage:f,backImage:b})}); const d=await r.json(); if(!r.ok) return{success:false,error:d.error||"识别失败"}; return{success:true,data:d.data}; };
const apiGet = async () => { const r=await fetch("/api/cards"); if(!r.ok) return[]; return r.json(); };
const apiAdd = async c => { const r=await fetch("/api/cards",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(c)}); if(!r.ok){const e=await r.json();throw new Error(e.error);} return r.json(); };
const apiPut = async (id,c) => { const r=await fetch(`/api/cards/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(c)}); if(!r.ok){const e=await r.json();throw new Error(e.error);} return r.json(); };
const apiDel = async id => { const r=await fetch(`/api/cards/${id}`,{method:"DELETE"}); if(!r.ok){const e=await r.json();throw new Error(e.error);} };


// Market price API
const apiMarketPrice = async (card) => {
  const r = await fetch("/api/market-price", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player: card.player,
      series: card.series,
      parallel: card.parallel,
      numbered: card.numbered,
      grade: card.grade,
      year: card.year,
    }),
  });
  const d = await r.json();
  if (!r.ok) return { success: false, error: d.error || "查询失败" };
  return d;
};


const apiCardStory = async (card) => {
  const r = await fetch("/api/card-story", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      backImage: card.back_image,
      player: card.player,
      year: card.year,
      series: card.series,
      cardNumber: card.card_number,
    }),
  });
  const d = await r.json();
  if (!r.ok) return { success: false, error: d.error };
  return d;
};

// Context
const Ctx = createContext(null);
const useApp = () => useContext(Ctx);

function AppProvider({children}) {
  const [cards,setCards]     = useState([]);
  const [pcP]                = useState(PC_DEF);
  const [loading,setLoading] = useState(true);
  const [daily,setDaily]     = useState(null);
  const [screen,setScreen]   = useState("home");
  const [sel,setSel]         = useState(null);
  const [toast,setToast]     = useState(null);
  const [dc,setDC]           = useState("RMB");
  const [rate,setRate]       = useState(DEF_RATE);

  useEffect(() => {
    const sc=localStorage.getItem("cv_c"); const sr=localStorage.getItem("cv_r");
    if(sc)setDC(sc); if(sr)setRate(parseFloat(sr));
    apiGet().then(d=>{ setCards(d); if(d.length>0)setDaily(d[Math.floor(Math.random()*d.length)]); setLoading(false); });
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

  const stats = {
    total:cards.length, pc:cards.filter(c=>c.category==="PC").length,
    inv:cards.filter(c=>c.category==="investment").length,
    grading:cards.filter(c=>c.status==="grading").length,
    forSale:cards.filter(c=>c.status==="for_sale").length,
    oneOfOnes:cards.filter(c=>c.is_one_of_one).length,
    cost:cards.reduce((s,c)=>s+(parseFloat(c.buy_price)||0),0),
    pnl:cards.filter(c=>c.status==="sold"&&c.sell_price).reduce((s,c)=>s+(parseFloat(c.sell_price)||0)-(parseFloat(c.buy_price)||0),0),
  };

  return <Ctx.Provider value={{cards,pcP,loading,daily,screen,sel,stats,toast,dc,rate,toggleDC,nav,addCard,updCard,delCard,showToast}}>{children}</Ctx.Provider>;
}

// Shared UI
function Chip({label,color,bg,style={}}) { return <span style={{display:"inline-flex",alignItems:"center",padding:"3px 8px",borderRadius:5,background:bg||`${color}18`,color,fontSize:10,fontWeight:700,fontFamily:"'Space Mono',monospace",letterSpacing:0.3,flexShrink:0,...style}}>{label}</span>; }
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
  return <div onClick={onClick} style={{display:"flex",gap:14,padding:"14px 16px",borderRadius:14,cursor:"pointer",alignItems:"center",background:T.s2,border:`1px solid ${T.border}`,transition:"all 0.2s",...style}}
    onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGold;e.currentTarget.style.transform="translateY(-1px)"}}
    onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform="none"}}>
    <Thumb card={card} size={52} ps={ps} />
    <div style={{flex:1,minWidth:0}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
        <span style={{fontFamily:"'DM Serif Display',serif",fontSize:14,fontWeight:700,color:T.text}}>{card.player}</span>
        {card.is_rc&&<Chip label="RC" color={T.green} style={{fontSize:9,padding:"2px 5px"}} />}
      </div>
      <div style={{fontSize:11,color:T.muted,marginBottom:5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{card.year} {card.series}{card.parallel?` · ${card.parallel}`:""}</div>
      <div style={{display:"flex",gap:5,overflow:"hidden"}}>
        {card.numbered&&<Chip label={card.numbered} color={T.gold} style={{fontSize:9,padding:"2px 5px"}} />}
        <Chip label={st.label} color={st.color} bg={st.bg} style={{fontSize:9,padding:"2px 5px"}} />
        <GChip grade={card.grade} />
      </div>
    </div>
    <div style={{textAlign:"right",flexShrink:0}}>
      {card.buy_price&&<div style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,color:T.gold}}>{fmtP(card.buy_price,dc,rate,card.price_currency||"RMB")}</div>}
      <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,marginTop:3}}>📍{card.location||"—"}</div>
    </div>
  </div>;
}
function SHdr({title,sub,action,onAction}) { return <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:14}}><div><span style={{fontFamily:"'DM Serif Display',serif",fontSize:15,color:T.text}}>{title}</span>{sub&&<span style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,marginLeft:8}}>{sub}</span>}</div>{action&&<button onClick={onAction} style={{background:"none",border:"none",color:T.gold,fontSize:11,cursor:"pointer",padding:0}}>{action} →</button>}</div>; }
function Skel({width="100%",height=16,radius=6,style={}}) { return <div style={{width,height,borderRadius:radius,background:`linear-gradient(90deg,${T.s2} 25%,${T.s3} 50%,${T.s2} 75%)`,backgroundSize:"200% 100%",animation:"shimmer 1.5s infinite",...style}} />; }
function ToastView({toast}) { if(!toast)return null; return <div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",padding:"10px 20px",borderRadius:10,zIndex:999,background:toast.type==="warn"?"rgba(224,120,48,0.9)":"rgba(61,170,106,0.9)",color:"#fff",fontSize:13,fontWeight:600,boxShadow:"0 4px 20px rgba(0,0,0,0.4)",backdropFilter:"blur(8px)",animation:"fadeUp 0.3s ease both",whiteSpace:"nowrap"}}>{toast.msg}</div>; }
function CurrBtn() { const {dc,toggleDC}=useApp(); return <button onClick={toggleDC} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${T.borderGold}`,background:`rgba(201,168,76,0.08)`,color:T.gold,fontFamily:"'Space Mono',monospace",fontSize:11,fontWeight:700,cursor:"pointer"}}>{dc==="RMB"?"¥ RMB":"$ USD"}</button>; }

// Form primitives
function FF({label,required,children}) { return <div style={{marginBottom:14}}><label style={{display:"block",fontFamily:"'Space Mono',monospace",fontSize:10,color:T.dim,letterSpacing:0.8,marginBottom:6}}>{label.toUpperCase()} {required&&<span style={{color:T.gold}}>*</span>}</label>{children}</div>; }
function Inp({value,onChange,placeholder,type="text"}) { return <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:8,background:T.s3,color:T.text,fontSize:13,outline:"none",transition:"border-color 0.2s"}} onFocus={e=>e.target.style.borderColor=T.gold} onBlur={e=>e.target.style.borderColor=T.border} />; }
function Sl({value,onChange,options}) { return <select value={value||""} onChange={e=>onChange(e.target.value)} style={{width:"100%",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:8,background:T.s3,color:value?T.text:T.muted,fontSize:13,outline:"none",appearance:"none",cursor:"pointer"}}>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>; }
function Tog({label,value,onChange}) { return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:8,background:T.s3,cursor:"pointer"}} onClick={()=>onChange(!value)}><span style={{fontSize:13,color:T.muted}}>{label}</span><div style={{width:36,height:20,borderRadius:10,background:value?T.gold:T.border,position:"relative",transition:"background 0.2s",flexShrink:0}}><div style={{position:"absolute",top:2,left:value?16:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}} /></div></div>; }

// EMPTY factory — always fresh array for tags
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
        <FF label="分类"><Sl value={form.category} onChange={set("category")} options={[["PC","PC（热爱）"],["investment","投资"],["other","其他"]]} /></FF>
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

function PhotoBox({label,image,onCapture}) {
  const ref=useRef();
  const handle=async e=>{ const f=e.target.files?.[0]; if(!f)return; onCapture(await toB64(f)); };
  return <div onClick={()=>ref.current?.click()} style={{width:145,height:200,borderRadius:14,cursor:"pointer",background:image?"#0a0a14":T.s2,border:`2px dashed ${image?T.borderGold:T.border}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",overflow:"hidden",position:"relative",transition:"all 0.2s"}}>
    <input ref={ref} type="file" accept="image/*" capture="environment" onChange={handle} style={{display:"none"}} />
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
  const set=k=>v=>setForm(f=>({...f,[k]:v}));

  const recognize=async()=>{
    if(!front&&!back)return;
    setStep("recognizing"); setErr(null); setAnim([]);
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
      <div style={{fontFamily:"'DM Serif Display',serif",fontSize:18,color:T.text,marginBottom:6}}>拍摄卡片正反面</div>
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
          <div style={{fontFamily:"'DM Serif Display',serif",fontSize:15,color:T.text}}>正在识别卡片信息</div>
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

// ─── Daily Card with Story ────────────────────────────────
function DailyCardFull({ card, players }) {
  const { nav } = useApp();
  const [story, setStory] = useState(null);
  const [loadingStory, setLoadingStory] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loadStory = async () => {
    if (story) { setExpanded(e=>!e); return; }
    setExpanded(true);
    setLoadingStory(true);
    const r = await apiCardStory(card);
    if (r.success) setStory(r.story);
    else setStory("暂时无法加载故事，请稍后重试。");
    setLoadingStory(false);
  };

  return (
    <div style={{ borderRadius:20, overflow:"hidden", background:T.surface, border:`1px solid ${T.borderGold}`, boxShadow:`0 12px 40px rgba(0,0,0,0.4)`, position:"relative" }}>
      <div style={{ position:"absolute", inset:0, pointerEvents:"none", background:`radial-gradient(ellipse at 30% 50%,rgba(201,168,76,0.04) 0%,transparent 70%)` }} />
      {/* Card content */}
      <div style={{ display:"flex", gap:18, padding:"20px 20px 16px", cursor:"pointer" }} onClick={()=>nav("detail", card)}>
        <div style={{ position:"relative", flexShrink:0 }}>
          <div style={{ width:100, height:140, borderRadius:10, background:card.front_image?"#0a0a14":cGrad(card.player,players), display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", border:"1px solid rgba(255,255,255,0.12)", boxShadow:"0 8px 32px rgba(0,0,0,0.5)", animation:"cardFloat 5s ease-in-out infinite", overflow:"hidden" }}>
            {card.front_image
              ? <img src={card.front_image} alt="" style={{ width:"100%", height:"100%", objectFit:"contain" }} />
              : <><div style={{ fontSize:40 }}>{pEmoji(card.player,players)}</div><div style={{ fontFamily:"'Space Mono',monospace", fontSize:9, color:"rgba(255,255,255,0.6)", marginTop:4 }}>{card.card_number}</div>{card.numbered&&<div style={{ fontFamily:"'Space Mono',monospace", fontSize:12, color:T.goldLight, fontWeight:700 }}>{card.numbered}</div>}</>}
          </div>
          {card.is_one_of_one&&<div style={{ position:"absolute", bottom:-6, left:"50%", transform:"translateX(-50%)", padding:"3px 8px", borderRadius:4, background:T.gold, color:"#000", fontFamily:"'Space Mono',monospace", fontSize:8, fontWeight:700, whiteSpace:"nowrap" }}>1 OF 1</div>}
        </div>
        <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.gold, letterSpacing:1.5, marginBottom:4 }}>{pEmoji(card.player,players)} {players?.find(p=>p.name===card.player)?.short||card.player.split(" ").pop().toUpperCase()}</div>
            <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:17, color:T.text, lineHeight:1.25, marginBottom:6 }}>{card.parallel||card.series}</div>
            <div style={{ fontSize:11, color:T.muted, lineHeight:1.5 }}>{card.year} {card.series}{card.sub_series&&` · ${card.sub_series}`}</div>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:8 }}>
            {card.numbered&&<Chip label={card.numbered} color={T.gold} />}
            <Chip label={STATUS[card.status]?.label||"持有"} color={STATUS[card.status]?.color||T.green} bg={STATUS[card.status]?.bg} />
            <GChip grade={card.grade} />
            {card.is_rc&&<Chip label="RC" color={T.green} />}
          </div>
        </div>
      </div>
      {/* Story section */}
      <div style={{ borderTop:`1px solid ${T.border}`, margin:"0 16px" }} />
      <div style={{ padding:"12px 20px" }}>
        {!expanded ? (
          <button onClick={loadStory} style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"none", color:T.gold, fontSize:12, cursor:"pointer", padding:0 }}>
            <span>📖</span>
            <span>查看球员故事{card.back_image?"（来自卡背）":"（AI生成）"}</span>
            <span style={{ fontSize:10 }}>↓</span>
          </button>
        ) : (
          <div style={{ animation:"fadeUp 0.4s ease both" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <span style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, letterSpacing:1 }}>
                {card.back_image ? "📷 卡背故事（中文翻译）" : "✨ AI 生成故事"}
              </span>
              <button onClick={()=>setExpanded(false)} style={{ background:"none", border:"none", color:T.dim, fontSize:12, cursor:"pointer" }}>收起 ↑</button>
            </div>
            {loadingStory ? (
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", fontSize:12, color:T.muted }}>
                <span style={{ animation:"pulse 1s ease infinite" }}>✨</span>
                {card.back_image ? "正在读取卡背并翻译..." : "正在生成球员故事..."}
              </div>
            ) : (
              <p style={{ fontSize:13, color:T.text, lineHeight:1.9, margin:0 }}>{story}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HomeScreen() {
  const {cards,pcP,stats,loading,daily,nav,dc,toggleDC,rate}=useApp();
  if(loading)return <div style={{padding:"20px"}}><Skel height={24} width={160} style={{marginBottom:8}} /><Skel height={14} width={120} style={{marginBottom:24}} /><Skel height={220} radius={20} style={{marginBottom:20}} /><Skel height={80} radius={12} /></div>;
  return <div style={{paddingBottom:90}}>
    <div style={{padding:"24px 20px 16px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>🃏</span><h1 style={{fontFamily:"'Space Mono',monospace",fontSize:18,fontWeight:700,color:T.gold,letterSpacing:"-0.5px"}}>CARD VAULT</h1></div>
      <p style={{fontSize:11,color:T.dim,marginTop:2,paddingLeft:28}}>{new Date().toLocaleDateString("zh-CN",{month:"long",day:"numeric",weekday:"short"})}</p></div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <CurrBtn />
        <button onClick={()=>nav("search")} style={{width:38,height:38,borderRadius:10,border:`1px solid ${T.border}`,background:T.s2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🔍</button>
        <button onClick={()=>nav("add")} style={{width:38,height:38,borderRadius:10,border:`1px solid ${T.borderGold}`,background:`rgba(201,168,76,0.1)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📷</button>
      </div>
    </div>
    <div style={{padding:"0 20px"}}>
      {daily&&<div style={{marginBottom:20,animation:"fadeUp 0.5s ease both"}}>
        <SHdr title="今日精选" sub="FROM YOUR VAULT" />
        <DailyCardFull card={daily} players={pcP} />
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16,animation:"fadeUp 0.5s ease 100ms both"}}>
        {[{icon:"🃏",v:stats.total,l:"总卡数"},{icon:"❤️",v:stats.pc,l:"PC"},{icon:"📈",v:stats.inv,l:"投资"},{icon:"✨",v:stats.oneOfOnes,l:"1/1"}].map((s,i)=>(
          <div key={i} style={{padding:"12px 8px",borderRadius:12,textAlign:"center",background:T.s2,border:`1px solid ${T.border}`}}>
            <div style={{fontSize:16,marginBottom:4}}>{s.icon}</div>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:18,fontWeight:700,color:T.text}}>{s.v}</div>
            <div style={{fontSize:10,color:T.dim,marginTop:1}}>{s.l}</div>
          </div>
        ))}
      </div>
      {stats.cost>0&&<div style={{padding:"12px 16px",borderRadius:12,marginBottom:20,background:`linear-gradient(135deg,rgba(201,168,76,0.08),rgba(201,168,76,0.03))`,border:`1px solid ${T.borderGold}`,animation:"fadeUp 0.5s ease 150ms both"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:12,color:T.muted}}>持仓总成本</span>
          <span style={{fontFamily:"'Space Mono',monospace",fontSize:16,fontWeight:700,color:T.gold}}>{fmtP(stats.cost,dc,rate)}</span>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",marginTop:3}}>
          <span style={{fontSize:10,color:T.dim}}>≈ {dc==="RMB"?fmtDual(stats.cost,rate).usd:fmtDual(stats.cost,rate).rmb}</span>
        </div>
      </div>}
      <div style={{animation:"fadeUp 0.5s ease 250ms both"}}>
        <SHdr title="最近入库" sub={`共 ${cards.length} 张`} action="全部" onAction={()=>nav("search")} />
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {cards.slice(0,5).map(c=><CardRow key={c.id} card={c} ps={pcP} onClick={()=>nav("detail",c)} />)}
          {cards.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:T.dim}}><div style={{fontSize:48,marginBottom:12}}>🃏</div><div style={{fontSize:14}}>还没有卡片，点右上角📷开始录入</div></div>}
        </div>
      </div>
    </div>
  </div>;
}

function SearchScreen() {
  const {cards,pcP,nav}=useApp();
  const [q,setQ]=useState(""); const [cf,setCf]=useState("all"); const [pf,setPf]=useState("all");
  const ref=useRef(); useEffect(()=>{setTimeout(()=>ref.current?.focus(),100);},[]);
  const list=cards.filter(c=>{
    if(cf!=="all"&&c.category!==cf)return false;
    if(pf!=="all"&&c.player!==pf)return false;
    if(q){const terms=expandQ(q);const fields=[c.player,c.series,c.parallel,c.card_number,c.numbered,c.grade,c.team,c.sub_series,...(c.tags||[])].filter(Boolean).map(f=>f.toLowerCase());return terms.some(t=>fields.some(f=>f.includes(t)));}
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
        {[["all","全部"],["PC","PC"],["investment","投资"]].map(([v,l])=>(
          <button key={v} onClick={()=>setCf(v)} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${cf===v?T.borderGold:T.border}`,background:cf===v?"rgba(201,168,76,0.1)":"transparent",color:cf===v?T.gold:T.muted,fontSize:12,whiteSpace:"nowrap"}}>{l}</button>
        ))}
        <div style={{width:1,background:T.border,margin:"4px 2px"}} />
        {[["all","全部"],...pcP.map(p=>[p.name,`${p.emoji} ${p.short}`])].map(([v,l])=>(
          <button key={v} onClick={()=>setPf(v)} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${pf===v?T.borderGold:T.border}`,background:pf===v?"rgba(201,168,76,0.1)":"transparent",color:pf===v?T.gold:T.muted,fontSize:12,whiteSpace:"nowrap"}}>{l}</button>
        ))}
      </div>
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


// ─── Market Price Panel ───────────────────────────────────
function MarketPricePanel({ card }) {
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [err, setErr]           = useState(null);
  const [editing, setEditing]   = useState(false);
  const [customQ, setCustomQ]   = useState("");

  // Build default search query
  const parts = [card.player, card.year, card.series, card.parallel, card.numbered];
  if (card.grade && card.grade !== "RAW") parts.push(card.grade);
  const defaultQ = parts.filter(Boolean).join(" ");

  const query = async (useCustom) => {
    setLoading(true); setErr(null); setResult(null); setEditing(false);
    const r = await apiMarketPrice({ ...card, customQuery: useCustom ? customQ : undefined });
    if (r.success) { setResult(r); if (!customQ) setCustomQ(r.autoDesc || defaultQ); }
    else setErr(r.error);
    setLoading(false);
  };

  return (
    <div style={{ background:T.s2, border:`1px solid ${T.border}`, borderRadius:14, padding:16, marginBottom:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, letterSpacing:1, marginBottom:2 }}>MARKET PRICE</div>
          <div style={{ fontSize:12, color:T.muted }}>实时市场参考价</div>
        </div>
        <button onClick={()=>query(false)} disabled={loading} style={{
          padding:"8px 16px", borderRadius:10, border:"none",
          background:loading?T.s3:`linear-gradient(135deg,${T.gold},${T.goldDark})`,
          color:loading?T.dim:"#000", fontSize:12, fontWeight:700, cursor:loading?"not-allowed":"pointer",
          transition:"all 0.2s", minWidth:80, flexShrink:0,
        }}>
          {loading
            ? <span style={{display:"flex",alignItems:"center",gap:4}}>{[0,1,2].map(i=><span key={i} style={{width:4,height:4,borderRadius:"50%",background:T.dim,display:"inline-block",animation:`pulse 0.8s ease ${i*150}ms infinite`}} />)}</span>
            : result ? "重新查询" : "🔍 查行情"}
        </button>
      </div>

      {/* Search query display + edit */}
      <div style={{ marginBottom:12 }}>
        {editing ? (
          <div style={{ display:"flex", gap:8 }}>
            <input value={customQ||defaultQ} onChange={e=>setCustomQ(e.target.value)}
              style={{ flex:1, padding:"8px 10px", border:`1px solid ${T.borderGold}`, borderRadius:8, background:T.s3, color:T.text, fontSize:12, outline:"none" }} />
            <button onClick={()=>query(true)} style={{ padding:"8px 14px", borderRadius:8, border:"none", background:T.gold, color:"#000", fontSize:12, fontWeight:700, cursor:"pointer" }}>搜索</button>
            <button onClick={()=>setEditing(false)} style={{ padding:"8px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.dim, fontSize:12, cursor:"pointer" }}>✕</button>
          </div>
        ) : (
          <div style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }} onClick={()=>{ setCustomQ(customQ||defaultQ); setEditing(true); }}>
            <span style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {customQ || defaultQ}
            </span>
            <span style={{ fontSize:10, color:T.gold, flexShrink:0 }}>✎ 修改搜索词</span>
          </div>
        )}
      </div>

      {loading && <div style={{ padding:"8px 0", fontSize:12, color:T.muted, display:"flex", alignItems:"center", gap:8 }}><span style={{animation:"pulse 1s ease infinite"}}>🌐</span>正在搜索 eBay 及市场数据...</div>}
      {err && <div style={{ padding:"10px 12px", borderRadius:8, background:"rgba(212,80,80,0.08)", border:"1px solid rgba(212,80,80,0.2)", fontSize:12, color:T.red }}>⚠️ {err}</div>}

      {result && (
        <div style={{ animation:"fadeUp 0.4s ease both" }}>
          <div style={{ fontSize:11, color:T.dim, marginBottom:8, fontFamily:"'Space Mono',monospace" }}>
            {result.searchUsed ? "🌐 基于实时搜索" : "📚 基于历史数据（仅供参考）"} · {new Date(result.timestamp).toLocaleTimeString("zh-CN")}
          </div>
          <div style={{ fontSize:13, color:T.text, lineHeight:1.9, whiteSpace:"pre-wrap", background:T.s3, padding:"12px 14px", borderRadius:10, borderLeft:`3px solid ${T.gold}` }}>
            {result.analysis}
          </div>
        </div>
      )}
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
        <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:22,color:T.text,marginBottom:6}}>{card.player}</h2>
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
      {card.buy_price&&<div style={{background:`linear-gradient(135deg,rgba(201,168,76,0.08),rgba(201,168,76,0.03))`,border:`1px solid ${T.borderGold}`,borderRadius:14,padding:"14px 16px",marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:4}}>买入价</div><div style={{fontFamily:"'Space Mono',monospace",fontSize:20,fontWeight:700,color:T.gold}}>{dual.rmb}</div><div style={{fontFamily:"'Space Mono',monospace",fontSize:12,color:T.dim,marginTop:2}}>≈ {dual.usd}</div></div>
          {card.sell_price&&<div style={{textAlign:"right"}}>
            <div style={{fontSize:11,color:T.muted,marginBottom:4}}>出售价</div>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:20,fontWeight:700,color:T.green}}>{sellDual.rmb}</div>
            {pnl!==null&&<div style={{fontFamily:"'Space Mono',monospace",fontSize:12,color:pnl>=0?T.green:T.red,marginTop:2}}>{pnl>=0?"▲ ":"▼ "}{fmtDual(Math.abs(pnl),rate,card.price_currency||"RMB").rmb}</div>}
          </div>}
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
      {(()=>{const p=pcP.find(x=>x.name===sel);return p&&<div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}>
        <span style={{fontSize:42}}>{p.emoji}</span>
        <div><div style={{fontFamily:"'DM Serif Display',serif",fontSize:20,color:T.text}}>{p.name}</div>
        <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.dim,marginTop:2}}>{pCards.length} 张 · {fmtP(pCards.reduce((s,c)=>s+(parseFloat(c.buy_price)||0),0),dc,rate)}</div></div>
      </div>;})()}
    </div>
    <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:10,paddingBottom:90}}>
      {pCards.length>0?pCards.map(c=><CardRow key={c.id} card={c} ps={pcP} onClick={()=>nav("detail",c)} />):
      <div style={{textAlign:"center",padding:"48px 0",color:T.dim}}><div style={{fontSize:32,marginBottom:8}}>🃏</div><div style={{fontSize:13}}>还没有录入{sel}的卡</div></div>}
    </div>
  </div>;

  return <div style={{paddingBottom:90}}>
    <div style={{padding:"24px 20px 16px"}}><h2 style={{fontFamily:"'Space Mono',monospace",fontSize:18,fontWeight:700,color:T.gold}}>PC VAULT</h2><p style={{fontSize:11,color:T.dim,marginTop:2}}>你热爱的球星</p></div>
    <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:14}}>
      {pcP.sort((a,b)=>a.display_order-b.display_order).map((player,i)=>{
        const pc=cards.filter(c=>c.player===player.name&&c.category==="PC");
        const val=pc.reduce((s,c)=>s+(parseFloat(c.buy_price)||0),0);
        const stC=Object.fromEntries(Object.keys(STATUS).map(k=>[k,pc.filter(c=>c.status===k).length]));
        return <div key={player.id} style={{borderRadius:18,overflow:"hidden",border:`1px solid ${T.border}`,animation:`fadeUp 0.4s ease ${i*80}ms both`,cursor:"pointer"}} onClick={()=>setSel(player.name)}>
          <div style={{padding:"18px 20px",background:`linear-gradient(135deg,${player.color1}30,${player.color2}20)`,borderBottom:pc.length>0?`1px solid ${T.border}`:"none",display:"flex",alignItems:"center",gap:14}}>
            <span style={{fontSize:36}}>{player.emoji}</span>
            <div style={{flex:1}}>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:17,color:T.text}}>{player.name}</div>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.dim,marginTop:2}}>{pc.length} 张 · {fmtP(val,dc,rate)}</div>
              {pc.length>0&&<div style={{display:"flex",gap:6,marginTop:6}}>
                {Object.entries(stC).filter(([,v])=>v>0).map(([k,v])=><Chip key={k} label={`${STATUS[k].label} ${v}`} color={STATUS[k].color} bg={STATUS[k].bg} style={{fontSize:9,padding:"2px 6px"}} />)}
              </div>}
            </div>
            <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.gold}}>→</span>
          </div>
          {pc.slice(0,3).map((c,ci)=>(
            <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 20px",background:T.surface,borderBottom:ci<Math.min(pc.length,3)-1?`1px solid ${T.border}`:"none"}}>
              <div><span style={{fontSize:12,color:T.muted}}>{c.parallel||c.series}</span>{c.numbered&&<span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.gold,marginLeft:6}}>{c.numbered}</span>}</div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                {c.buy_price&&<span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.gold}}>{fmtP(c.buy_price,dc,rate,c.price_currency||"RMB")}</span>}
                <Chip label={STATUS[c.status]?.label} color={STATUS[c.status]?.color} bg={STATUS[c.status]?.bg} style={{fontSize:9,padding:"2px 6px"}} />
              </div>
            </div>
          ))}
          {pc.length===0&&<div style={{padding:"14px 20px",background:T.surface,fontSize:12,color:T.dim}}>还没有录入卡片，开始建仓吧 →</div>}
        </div>;
      })}
    </div>
  </div>;
}

function StatsScreen() {
  const {cards,pcP,stats,dc,rate,toggleDC}=useApp();
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
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
              <span style={{fontSize:12,color:T.muted}}>{player.emoji} {player.short}</span>
              <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:T.gold}}>{cs.length}张 · {fmtP(val,dc,rate)}</span>
            </div>
            <div style={{height:3,borderRadius:2,background:T.s3}}>
              <div style={{height:"100%",borderRadius:2,width:`${pct}%`,background:`linear-gradient(90deg,${player.color1},${T.gold})`,transition:"width 0.6s ease"}} />
            </div>
          </div>;
        })}
      </div>
    </div>
  </div>;
}

function TabBar() {
  const {screen,nav}=useApp();
  return <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,display:"flex",justifyContent:"space-around",padding:"8px 0 max(16px, env(safe-area-inset-bottom))",background:"rgba(8,8,16,0.96)",backdropFilter:"blur(20px)",borderTop:`1px solid ${T.border}`,zIndex:100}}>
    {[{id:"home",l:"首页",i:"⬜"},{id:"search",l:"搜索",i:"🔍"},{id:"add"},{id:"pc",l:"PC",i:"❤️"},{id:"stats",l:"统计",i:"📊"}].map(tab=>{
      if(tab.id==="add") return <button key="add" onClick={()=>nav("add")} style={{position:"relative",background:"none",border:"none",padding:0,marginTop:-18}}>
        <div style={{width:52,height:52,borderRadius:16,background:`linear-gradient(135deg,${T.gold},${T.goldDark})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,boxShadow:`0 4px 20px rgba(201,168,76,0.4)`,border:`2px solid rgba(201,168,76,0.3)`}}>📷</div>
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
    case "home": return <HomeScreen />;
    case "search": return <SearchScreen />;
    case "add": return <AddScreen />;
    case "edit": return <EditScreen />;
    case "pc": return <PCScreen />;
    case "stats": return <StatsScreen />;
    case "detail": return <DetailScreen />;
    default: return <HomeScreen />;
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
      <div style={{minHeight:"100vh",background:T.bg,maxWidth:480,margin:"0 auto",position:"relative",overflowX:"hidden",fontFamily:"'Noto Sans SC',sans-serif",color:T.text}}>
        <Router />
        <TabBar />
        <TL />
      </div>
    </AppProvider>
  </>;
}
function TL(){ const {toast}=useApp(); return <ToastView toast={toast} />; }
