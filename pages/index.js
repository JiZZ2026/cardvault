import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import Head from "next/head";

// ─── Design Tokens ────────────────────────────────────────
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
const CAT = {
  PC:         { label:"PC",   color:T.gold  },
  investment: { label:"投资", color:T.blue  },
  other:      { label:"其他", color:T.muted },
};
const PC_PLAYERS_DEFAULT = [
  { id:"p_kg", name:"Kevin Garnett",         short:"KG",     emoji:"🐺", color1:"#1D6B3F", color2:"#0E3D23", display_order:1 },
  { id:"p_sc", name:"Stephen Curry",          short:"Curry",  emoji:"🎯", color1:"#1D428A", color2:"#FFC72C", display_order:2 },
  { id:"p_ga", name:"Giannis Antetokounmpo",  short:"Giannis",emoji:"🦌", color1:"#00471B", color2:"#EEE1C6", display_order:3 },
  { id:"p_vw", name:"Victor Wembanyama",      short:"Wemby",  emoji:"👽", color1:"#C4CED4", color2:"#000000", display_order:4 },
];
const LOCATIONS = ["PC-KG-01","PC-KG-02","PC-SC-01","PC-SC-02","PC-GA-01","PC-GA-02","PC-VW-01","INV-A01","INV-A02","INV-B01","SLAB-01","SLAB-02","SLAB-03","送评中"];
const SOURCES   = ["eBay","拍卡淘","自拆","StockX","朋友购入","线下卡展"];

function cGrad(player, players) {
  const p = players?.find(x => x.name === player);
  if (p) return `linear-gradient(145deg,${p.color1}CC,${p.color2}CC)`;
  const fb = ["#1a1a3e","#2a1a3e","#1a2a3e","#3e1a2a","#1a3e2a"];
  return `linear-gradient(145deg,${fb[(player?.charCodeAt(0)||0)%fb.length]},#0a0a18)`;
}
const pEmoji   = (name, ps) => ps?.find(p => p.name === name)?.emoji || "🏀";
const fmtPrice = n => n ? `$${Number(n).toLocaleString()}` : "—";

// ─── Image compression helper ──────────────────────────────
function compressImage(dataUrl, maxDim = 1200, quality = 0.82) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      const ratio = Math.min(maxDim / w, maxDim / h, 1);
      if (ratio < 1) { w = Math.round(w * ratio); h = Math.round(h * ratio); }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Smaller thumbnail for storage
function makeThumbnail(dataUrl) {
  return compressImage(dataUrl, 400, 0.65);
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ─── API helpers ──────────────────────────────────────────
async function apiRecognize(frontImage, backImage) {
  const res = await fetch("/api/recognize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frontImage, backImage }),
  });
  const data = await res.json();
  if (!res.ok) return { success: false, error: data.error || "识别失败" };
  return { success: true, data: data.data };
}

async function apiGetCards() {
  const res = await fetch("/api/cards");
  if (!res.ok) return [];
  return res.json();
}

async function apiSaveCard(card) {
  const res = await fetch("/api/cards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
  return res.json();
}

async function apiUpdateCard(id, card) {
  const res = await fetch(`/api/cards/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
  return res.json();
}

async function apiDeleteCard(id) {
  const res = await fetch(`/api/cards/${id}`, { method: "DELETE" });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
}

// ─── App Context ──────────────────────────────────────────
const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

function AppProvider({ children }) {
  const [cards, setCards]       = useState([]);
  const [pcPlayers]             = useState(PC_PLAYERS_DEFAULT);
  const [loading, setLoading]   = useState(true);
  const [dailyCard, setDailyCard] = useState(null);
  const [screen, setScreen]     = useState("home");
  const [selected, setSelected] = useState(null);
  const [toast, setToast]       = useState(null);

  useEffect(() => {
    apiGetCards().then(data => {
      setCards(data);
      if (data.length > 0) setDailyCard(data[Math.floor(Math.random() * data.length)]);
      setLoading(false);
    });
  }, []);

  const showToast = useCallback((msg, type = "ok") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 2800);
  }, []);

  const addCard = useCallback(async (cardData) => {
    try {
      const saved = await apiSaveCard(cardData);
      setCards(p => [saved, ...p]);
      showToast("✓ 已入库");
      return saved;
    } catch(e) { showToast(e.message, "warn"); return null; }
  }, [showToast]);

  const updateCard = useCallback(async (id, cardData) => {
    try {
      const saved = await apiUpdateCard(id, cardData);
      setCards(p => p.map(c => c.id === saved.id ? saved : c));
      showToast("✓ 已更新");
      return saved;
    } catch(e) { showToast(e.message, "warn"); return null; }
  }, [showToast]);

  const deleteCard = useCallback(async (id) => {
    try {
      await apiDeleteCard(id);
      setCards(p => p.filter(c => c.id !== id));
      showToast("已删除", "warn");
    } catch(e) { showToast(e.message, "warn"); }
  }, [showToast]);

  const navigate = useCallback((s, card = null) => {
    setSelected(card); setScreen(s);
  }, []);

  const stats = {
    total:    cards.length,
    pc:       cards.filter(c => c.category === "PC").length,
    inv:      cards.filter(c => c.category === "investment").length,
    grading:  cards.filter(c => c.status === "grading").length,
    oneOfOnes:cards.filter(c => c.is_one_of_one).length,
    cost:     cards.reduce((s, c) => s + (parseFloat(c.buy_price) || 0), 0),
  };

  return (
    <AppCtx.Provider value={{ cards, pcPlayers, loading, dailyCard, screen, selected, stats, toast, navigate, addCard, updateCard, deleteCard, showToast }}>
      {children}
    </AppCtx.Provider>
  );
}

// ─── Shared Components ─────────────────────────────────────
function Chip({ label, color, bg, style = {} }) {
  return <span style={{ display:"inline-flex", alignItems:"center", padding:"3px 8px", borderRadius:5, background:bg||`${color}18`, color, fontSize:10, fontWeight:700, fontFamily:"'Space Mono',monospace", letterSpacing:0.3, flexShrink:0, ...style }}>{label}</span>;
}
function GChip({ grade }) {
  if (!grade || grade === "RAW") return null;
  const isPSA10 = grade === "PSA 10", isBGS = grade.startsWith("BGS");
  return <Chip label={grade} color={isPSA10?"#FFD700":isBGS?"#C0C0C0":T.muted} bg={isPSA10?"rgba(255,215,0,0.12)":isBGS?"rgba(192,192,192,0.1)":"rgba(122,122,140,0.1)"} />;
}
function Thumb({ card, size = 56, players }) {
  const img = card?.front_image;
  return (
    <div style={{ width:size, height:size*1.4, borderRadius:size*0.12, background:img?"transparent":cGrad(card?.player, players), display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, overflow:"hidden", border:`1px solid rgba(255,255,255,0.08)`, boxShadow:"0 4px 16px rgba(0,0,0,0.4)", position:"relative" }}>
      {img ? <img src={img} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> :
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:size*0.45 }}>{pEmoji(card?.player, players)}</div>
          {card?.numbered && <div style={{ fontFamily:"'Space Mono',monospace", fontSize:size*0.12, color:T.gold, fontWeight:700, marginTop:2 }}>{card.numbered}</div>}
        </div>}
      {card?.is_one_of_one && <div style={{ position:"absolute", top:3, right:3, width:8, height:8, borderRadius:"50%", background:T.gold, boxShadow:`0 0 6px ${T.gold}` }} />}
    </div>
  );
}
function CardRow({ card, onClick, players, style = {} }) {
  const st = STATUS[card.status] || STATUS.holding;
  return (
    <div onClick={onClick} style={{ display:"flex", gap:14, padding:"14px 16px", borderRadius:14, cursor:"pointer", alignItems:"center", background:T.s2, border:`1px solid ${T.border}`, transition:"all 0.2s", ...style }}
      onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderGold;e.currentTarget.style.transform="translateY(-1px)"}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform="none"}}>
      <Thumb card={card} size={52} players={players} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
          <span style={{ fontFamily:"'DM Serif Display',serif", fontSize:14, fontWeight:700, color:T.text }}>{card.player}</span>
          {card.is_rc && <Chip label="RC" color={T.green} style={{ fontSize:9, padding:"2px 5px" }} />}
        </div>
        <div style={{ fontSize:11, color:T.muted, marginBottom:5, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
          {card.year} {card.series}{card.parallel ? ` · ${card.parallel}` : ""}
        </div>
        <div style={{ display:"flex", gap:5, overflow:"hidden" }}>
          {card.numbered && <Chip label={card.numbered} color={T.gold} style={{ fontSize:9, padding:"2px 5px" }} />}
          <Chip label={st.label} color={st.color} bg={st.bg} style={{ fontSize:9, padding:"2px 5px" }} />
          <GChip grade={card.grade} />
        </div>
      </div>
      <div style={{ textAlign:"right", flexShrink:0 }}>
        {card.buy_price && <div style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, color:T.gold }}>{fmtPrice(card.buy_price)}</div>}
        <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, marginTop:3 }}>📍{card.location || "—"}</div>
      </div>
    </div>
  );
}
function SectionHdr({ title, sub, action, onAction }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:14 }}>
      <div>
        <span style={{ fontFamily:"'DM Serif Display',serif", fontSize:15, color:T.text }}>{title}</span>
        {sub && <span style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, marginLeft:8 }}>{sub}</span>}
      </div>
      {action && <button onClick={onAction} style={{ background:"none", border:"none", color:T.gold, fontSize:11, cursor:"pointer", padding:0 }}>{action} →</button>}
    </div>
  );
}
function Skel({ width = "100%", height = 16, radius = 6, style = {} }) {
  return <div style={{ width, height, borderRadius:radius, background:`linear-gradient(90deg,${T.s2} 25%,${T.s3} 50%,${T.s2} 75%)`, backgroundSize:"200% 100%", animation:"shimmer 1.5s infinite", ...style }} />;
}
function Toast({ toast }) {
  if (!toast) return null;
  return <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", padding:"10px 20px", borderRadius:10, zIndex:999, background:toast.type==="warn"?"rgba(224,120,48,0.9)":"rgba(61,170,106,0.9)", color:"#fff", fontSize:13, fontWeight:600, boxShadow:"0 4px 20px rgba(0,0,0,0.4)", backdropFilter:"blur(8px)", animation:"fadeUp 0.3s ease both", whiteSpace:"nowrap" }}>{toast.msg}</div>;
}
function FF({ label, required, children }) {
  return <div style={{ marginBottom:14 }}><label style={{ display:"block", fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, letterSpacing:0.8, marginBottom:6 }}>{label.toUpperCase()} {required && <span style={{ color:T.gold }}>*</span>}</label>{children}</div>;
}
function Inp({ value, onChange, placeholder, type = "text" }) {
  return <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    style={{ width:"100%", padding:"10px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.s3, color:T.text, fontSize:13, outline:"none", transition:"border-color 0.2s" }}
    onFocus={e=>e.target.style.borderColor=T.gold} onBlur={e=>e.target.style.borderColor=T.border} />;
}
function Sl({ value, onChange, options }) {
  return <select value={value||""} onChange={e=>onChange(e.target.value)}
    style={{ width:"100%", padding:"10px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.s3, color:value?T.text:T.muted, fontSize:13, outline:"none", appearance:"none", cursor:"pointer" }}>
    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>;
}
function Tog({ label, value, onChange }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.s3, cursor:"pointer" }} onClick={()=>onChange(!value)}>
      <span style={{ fontSize:13, color:T.muted }}>{label}</span>
      <div style={{ width:36, height:20, borderRadius:10, background:value?T.gold:T.border, position:"relative", transition:"background 0.2s", flexShrink:0 }}>
        <div style={{ position:"absolute", top:2, left:value?16:2, width:16, height:16, borderRadius:"50%", background:"#fff", transition:"left 0.2s" }} />
      </div>
    </div>
  );
}

// ─── ADD SCREEN ───────────────────────────────────────────
const EMPTY = {
  player:"", team:"", year:"", series:"", manufacturer:"", card_number:"",
  parallel:"", numbered:"", is_one_of_one:false, sub_series:"", is_rc:false,
  grade:"RAW", grade_company:"", grade_score:"",
  category:"PC", status:"holding",
  buy_price:"", buy_date:"", source:"", location:"", notes:"", tags:[],
};

function PhotoBox({ label, image, onCapture }) {
  const ref = useRef();
  const handle = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const b64 = await fileToBase64(file);
    onCapture(b64);
  };
  return (
    <div onClick={()=>ref.current?.click()} style={{ width:145, height:200, borderRadius:14, cursor:"pointer", background:image?"transparent":T.s2, border:`2px dashed ${image?T.borderGold:T.border}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", overflow:"hidden", position:"relative", transition:"all 0.2s" }}>
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={handle} style={{ display:"none" }} />
      {image ? (
        <>
          <img src={image} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
          <div style={{ position:"absolute", top:8, right:8, padding:"3px 8px", background:"rgba(61,170,106,0.9)", borderRadius:6, fontFamily:"'Space Mono',monospace", fontSize:10, color:"#fff", fontWeight:700 }}>✓</div>
        </>
      ) : (
        <><div style={{ fontSize:32, marginBottom:8 }}>📷</div><div style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:T.dim, fontWeight:700 }}>{label}</div><div style={{ fontSize:10, color:T.dim, marginTop:4 }}>点击拍摄</div></>
      )}
    </div>
  );
}

function AnimFields({ fields }) {
  const [n, setN] = useState(0);
  useEffect(() => { if (n < fields.length) { const t = setTimeout(() => setN(x=>x+1), 200); return () => clearTimeout(t); } }, [n, fields.length]);
  return (
    <div>
      {fields.slice(0, n).map((f, i) => (
        <div key={i} style={{ display:"flex", gap:8, padding:"4px 0", animation:"fadeUp 0.2s ease both", fontFamily:"'Space Mono',monospace", fontSize:12 }}>
          <span style={{ color:T.green }}>✓</span>
          <span style={{ color:T.muted }}>{f.l}：</span>
          <span style={{ color:T.text, fontWeight:700 }}>{f.v}</span>
        </div>
      ))}
      {n < fields.length && <div style={{ display:"flex", gap:6, padding:"4px 0", fontFamily:"'Space Mono',monospace", fontSize:12, color:T.dim }}><span style={{ animation:"pulse 0.8s ease infinite" }}>◆</span><span>提取中...</span></div>}
    </div>
  );
}

function StepBar({ cur }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:24 }}>
      {[["1","拍照"],["2","识别"],["3","入库"]].map(([n, l], i) => {
        const done = i < cur, act = i === cur;
        return (
          <div key={n} style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:26, height:26, borderRadius:"50%", background:act?"linear-gradient(135deg,#C9A84C,#8B6914)":done?"rgba(61,170,106,0.2)":T.s2, border:`1px solid ${act?T.borderGold:done?"rgba(61,170,106,0.4)":T.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Space Mono',monospace", fontSize:10, fontWeight:700, color:act?"#000":done?T.green:T.dim }}>{done?"✓":n}</div>
            <span style={{ fontSize:11, color:act?T.gold:T.dim }}>{l}</span>
            {i < 2 && <div style={{ width:16, height:1, background:T.border }} />}
          </div>
        );
      })}
    </div>
  );
}

function AddScreen() {
  const { addCard, navigate, pcPlayers } = useApp();
  const [step, setStep] = useState("photo");
  const [front, setFront] = useState(null);
  const [back, setBack] = useState(null);
  const [recognizing, setRecognizing] = useState(false);
  const [animFields, setAnimFields] = useState([]);
  const [recognized, setRecognized] = useState(null);
  const [aiErr, setAiErr] = useState(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("card");

  const set = k => v => setForm(f => ({ ...f, [k]:v }));

  const startRecognition = async () => {
    if (!front && !back) return;
    setStep("recognizing");
    setAiErr(null);
    setAnimFields([]);
    setRecognizing(true);

    try {
      // Compress images before sending
      const [compFront, compBack] = await Promise.all([
        front ? compressImage(front, 1400, 0.88) : Promise.resolve(null),
        back  ? compressImage(back,  1400, 0.88) : Promise.resolve(null),
      ]);

      const result = await apiRecognize(compFront, compBack);

      if (result.success) {
        const d = result.data;
        const fields = [
          d.player     && { l:"球星",   v:d.player },
          d.team       && { l:"球队",   v:d.team },
          d.year       && { l:"赛季",   v:d.year },
          d.series     && { l:"系列",   v:d.series },
          d.cardNumber && { l:"卡号",   v:d.cardNumber },
          d.parallel   && { l:"平行",   v:d.parallel },
          d.numbered   && { l:"编号",   v:d.numbered },
          d.isOneOfOne && { l:"稀有",   v:"1 OF 1 🔥" },
          d.isRC       && { l:"身份",   v:"RC 新秀" },
          d.subSeries  && { l:"子系列", v:d.subSeries },
          (d.grade && d.grade !== "RAW") && { l:"评级", v:d.grade },
        ].filter(Boolean);

        setAnimFields(fields);
        setRecognized(d);

        const isPC = pcPlayers.some(p => p.name === d.player);
        setForm({
          ...EMPTY,
          player:      d.player || "",
          team:        d.team || "",
          year:        d.year || "",
          series:      d.series || "",
          manufacturer:d.manufacturer || "",
          card_number: d.cardNumber || "",
          parallel:    d.parallel || "",
          numbered:    d.numbered || "",
          is_one_of_one: d.isOneOfOne || false,
          sub_series:  d.subSeries || "",
          is_rc:       d.isRC || false,
          grade:       d.grade || "RAW",
          grade_company: d.gradeCompany || "",
          grade_score: d.gradeScore || "",
          category:    isPC ? "PC" : "investment",
          status:      "holding",
          buy_date:    new Date().toISOString().slice(0, 10),
        });

        setTimeout(() => { setRecognizing(false); setStep("confirm"); }, fields.length * 200 + 600);
      } else {
        setAiErr(result.error);
        setRecognizing(false);
        setStep("photo");
      }
    } catch(e) {
      setAiErr(e?.message || "识别失败");
      setRecognizing(false);
      setStep("photo");
    }
  };

  const save = async () => {
    if (!form.player) return;
    setSaving(true);

    const tags = typeof form.tags === "string"
      ? form.tags.split(/[,，\s]+/).filter(Boolean)
      : form.tags || [];
    if (form.numbered) tags.push(form.numbered);
    if (form.is_rc) tags.push("RC");
    if (form.is_one_of_one) tags.push("1/1");
    if (form.category === "PC") tags.push("PC");

    // Make thumbnails for storage
    const [thumbFront, thumbBack] = await Promise.all([
      front ? makeThumbnail(front) : Promise.resolve(null),
      back  ? makeThumbnail(back)  : Promise.resolve(null),
    ]);

    await addCard({
      ...form,
      buy_price:    form.buy_price ? parseFloat(form.buy_price) : null,
      is_one_of_one: !!form.is_one_of_one,
      is_rc:         !!form.is_rc,
      numbered:      form.numbered   || null,
      sub_series:    form.sub_series || null,
      grade_company: form.grade_company || null,
      grade_score:   form.grade_score   || null,
      pc_player:     form.category === "PC" ? form.player : null,
      front_image:   thumbFront,
      back_image:    thumbBack,
      tags:          [...new Set(tags)],
      notes:         form.notes || "",
    });

    setSaving(false);
    navigate("home");
  };

  const Hdr = ({ title, onBack, right }) => (
    <div style={{ padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`1px solid ${T.border}` }}>
      <button onClick={onBack} style={{ background:"none", border:"none", color:T.muted, fontSize:20 }}>←</button>
      <span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:T.dim, letterSpacing:1 }}>{title}</span>
      {right || <div style={{ width:40 }} />}
    </div>
  );

  // PHOTO STEP
  if (step === "photo") return (
    <div style={{ paddingBottom:90 }}>
      <Hdr title="录入新卡" onBack={()=>navigate("home")} right={<button onClick={()=>setStep("confirm")} style={{ background:"none", border:"none", color:T.dim, fontSize:11 }}>跳过</button>} />
      <div style={{ padding:"24px 20px" }}>
        <StepBar cur={0} />
        <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:18, color:T.text, marginBottom:6 }}>拍摄卡片正反面</div>
        <p style={{ fontSize:12, color:T.muted, lineHeight:1.7, marginBottom:24 }}>
          拍完正反面，AI 自动识别球星、系列、卡号、平行类型、编号等全部信息，你确认后一键入库。
        </p>
        <div style={{ display:"flex", gap:16, justifyContent:"center", marginBottom:24 }}>
          <div style={{ textAlign:"center" }}><PhotoBox label="正面" image={front} onCapture={setFront} /><div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, marginTop:8 }}>FRONT</div></div>
          <div style={{ textAlign:"center" }}><PhotoBox label="背面" image={back} onCapture={setBack} /><div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, marginTop:8 }}>BACK</div></div>
        </div>
        {aiErr && <div style={{ padding:"10px 14px", borderRadius:8, background:"rgba(212,80,80,0.08)", border:"1px solid rgba(212,80,80,0.2)", marginBottom:14, fontSize:12, color:T.red }}>⚠️ {aiErr}</div>}
        <div style={{ padding:"10px 14px", borderRadius:10, background:"rgba(201,168,76,0.06)", border:`1px solid ${T.borderGold}`, marginBottom:16, fontSize:11, color:T.muted, lineHeight:1.7 }}>
          💡 <strong style={{ color:T.gold }}>拍摄建议：</strong>卡背文字清晰识别率更高，确保光线充足，卡面平整。
        </div>
        <button onClick={startRecognition} disabled={!front && !back} style={{ width:"100%", padding:"14px", borderRadius:14, border:"none", background:(front||back)?`linear-gradient(135deg,${T.gold},${T.goldDark})`:T.s3, color:(front||back)?"#000":T.dim, fontSize:15, fontWeight:700, boxShadow:(front||back)?`0 4px 20px rgba(201,168,76,0.25)`:"none", transition:"all 0.2s", marginBottom:12 }}>
          {(front||back) ? "🧠 AI识别卡片信息" : "请先拍摄至少一张照片"}
        </button>
        <button onClick={()=>setStep("confirm")} style={{ width:"100%", padding:"10px", borderRadius:12, border:`1px solid ${T.border}`, background:"transparent", color:T.dim, fontSize:13 }}>
          跳过，手动填写 →
        </button>
      </div>
    </div>
  );

  // RECOGNIZING STEP
  if (step === "recognizing") return (
    <div style={{ paddingBottom:90 }}>
      <div style={{ padding:"16px 20px", borderBottom:`1px solid ${T.border}` }}>
        <span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:T.dim, letterSpacing:1 }}>AI识别中...</span>
      </div>
      <div style={{ padding:"24px 20px" }}>
        <StepBar cur={1} />
        <div style={{ display:"flex", gap:12, marginBottom:20 }}>
          {[front, back].filter(Boolean).map((img, i) => (
            <div key={i} style={{ width:72, height:101, borderRadius:9, overflow:"hidden", border:`1px solid ${T.border}`, boxShadow:"0 4px 16px rgba(0,0,0,0.4)" }}>
              <img src={img} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            </div>
          ))}
          <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", gap:8 }}>
            <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:15, color:T.text }}>正在识别卡片信息</div>
            <div style={{ display:"flex", gap:5 }}>
              {[0,1,2].map(i => <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:T.gold, animation:`pulse 1s ease ${i*200}ms infinite` }} />)}
            </div>
          </div>
        </div>
        <div style={{ background:T.s2, border:`1px solid ${T.border}`, borderRadius:14, padding:"14px 18px" }}>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, letterSpacing:1, marginBottom:12 }}>EXTRACTING CARD DATA</div>
          <AnimFields fields={animFields} />
        </div>
      </div>
    </div>
  );

  // CONFIRM STEP
  return (
    <div style={{ paddingBottom:90 }}>
      <div style={{ padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:T.bg, zIndex:10, borderBottom:`1px solid ${T.border}` }}>
        <button onClick={()=>setStep("photo")} style={{ background:"none", border:"none", color:T.muted, fontSize:20 }}>←</button>
        <span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:T.dim }}>{recognized ? "确认识别信息" : "手动录入"}</span>
        <button onClick={save} disabled={saving || !form.player} style={{ padding:"7px 16px", borderRadius:8, border:"none", background:form.player?`linear-gradient(135deg,${T.gold},${T.goldDark})`:T.border, color:form.player?"#000":T.dim, fontSize:12, fontWeight:700, transition:"all 0.2s" }}>
          {saving ? "保存..." : "✓ 入库"}
        </button>
      </div>
      <div style={{ padding:"16px 20px" }}>
        {(front || back) && (
          <div style={{ display:"flex", gap:10, marginBottom:16, alignItems:"flex-start" }}>
            {[{img:front,l:"正面"},{img:back,l:"背面"}].filter(x=>x.img).map(({img,l},i)=>(
              <div key={i}><div style={{ width:72, height:101, borderRadius:9, overflow:"hidden", border:`1px solid ${T.borderGold}` }}><img src={img} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /></div><div style={{ fontFamily:"'Space Mono',monospace", fontSize:9, color:T.dim, textAlign:"center", marginTop:3 }}>{l}</div></div>
            ))}
            {recognized && <Chip label={recognized.confidence==="high"?"识别准确":recognized.confidence==="medium"?"需确认":"请核对"} color={recognized.confidence==="high"?T.green:recognized.confidence==="medium"?T.orange:T.red} style={{ alignSelf:"flex-start", marginTop:4, fontSize:10, padding:"4px 10px" }} />}
          </div>
        )}

        <div style={{ display:"flex", gap:2, marginBottom:18, background:T.s2, borderRadius:10, padding:3 }}>
          {[["card","🃏 卡片"],["purchase","💰 入手"]].map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)} style={{ flex:1, padding:"8px", borderRadius:8, border:"none", background:tab===id?T.s3:"transparent", color:tab===id?T.gold:T.muted, fontSize:12, fontWeight:tab===id?700:400, transition:"all 0.2s" }}>{label}</button>
          ))}
        </div>

        {tab === "card" && (
          <div style={{ animation:"fadeUp 0.3s ease both" }}>
            <FF label="球星" required><Inp value={form.player} onChange={set("player")} placeholder="如 Kevin Garnett" /></FF>
            <FF label="球队"><Inp value={form.team} onChange={set("team")} placeholder="如 Boston Celtics" /></FF>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              <FF label="赛季" required><Inp value={form.year} onChange={set("year")} placeholder="2025-26" /></FF>
              <FF label="卡号"><Inp value={form.card_number} onChange={set("card_number")} placeholder="#247" /></FF>
            </div>
            <FF label="系列" required><Inp value={form.series} onChange={set("series")} placeholder="如 Topps Chrome" /></FF>
            <FF label="厂商"><Sl value={form.manufacturer} onChange={set("manufacturer")} options={[["","选择"],["Topps","Topps"],["Panini","Panini"],["Upper Deck","Upper Deck"],["其他","其他"]]} /></FF>
            <FF label="平行类型"><Inp value={form.parallel} onChange={set("parallel")} placeholder="如 Gold Geometric Refractor" /></FF>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              <FF label="编号"><Inp value={form.numbered} onChange={set("numbered")} placeholder="/50" /></FF>
              <FF label="子系列"><Inp value={form.sub_series} onChange={set("sub_series")} placeholder="City Edition" /></FF>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              <FF label="评级"><Sl value={form.grade} onChange={v=>{set("grade")(v);if(v!=="RAW"){set("grade_company")(v.split(" ")[0]);set("grade_score")(v.split(" ")[1]||"");}}} options={[["RAW","RAW"],["PSA 10","PSA 10"],["PSA 9","PSA 9"],["BGS 9.5","BGS 9.5"],["BGS 9","BGS 9"],["SGC 10","SGC 10"],["SGC 9.5","SGC 9.5"]]} /></FF>
              <FF label="分类"><Sl value={form.category} onChange={set("category")} options={[["PC","PC（热爱）"],["investment","投资"],["other","其他"]]} /></FF>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              <Tog label="新秀卡 RC" value={form.is_rc} onChange={set("is_rc")} />
              <Tog label="1 of 1" value={form.is_one_of_one} onChange={v=>{set("is_one_of_one")(v);if(v)set("numbered")("1/1");}} />
            </div>
          </div>
        )}

        {tab === "purchase" && (
          <div style={{ animation:"fadeUp 0.3s ease both" }}>
            <FF label="持有状态"><Sl value={form.status} onChange={set("status")} options={[["holding","持有"],["for_sale","待出"],["grading","送评中"],["sold","已出"]]} /></FF>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              <FF label="买入价($)"><Inp value={form.buy_price} onChange={set("buy_price")} type="number" placeholder="0" /></FF>
              <FF label="买入日期"><Inp value={form.buy_date} onChange={set("buy_date")} type="date" /></FF>
            </div>
            <FF label="渠道"><Sl value={form.source} onChange={set("source")} options={[["","选择渠道"],...SOURCES.map(s=>[s,s])]} /></FF>
            <FF label="存放位置 📍"><Sl value={form.location} onChange={set("location")} options={[["","选择位置"],...LOCATIONS.map(l=>[l,l])]} /></FF>
            <FF label="标签 (逗号分隔)"><Inp value={Array.isArray(form.tags)?form.tags.join(", "):form.tags} onChange={v=>set("tags")(v)} placeholder="Gold, /50, KG..." /></FF>
            <FF label="备注">
              <textarea value={form.notes||""} onChange={e=>set("notes")(e.target.value)} placeholder="备注..."
                style={{ width:"100%", padding:"10px 12px", border:`1px solid ${T.border}`, borderRadius:8, background:T.s3, color:T.text, fontSize:13, outline:"none", resize:"vertical", minHeight:80, lineHeight:1.6 }}
                onFocus={e=>e.target.style.borderColor=T.gold} onBlur={e=>e.target.style.borderColor=T.border}
              />
            </FF>
          </div>
        )}

        <button onClick={save} disabled={saving || !form.player} style={{ width:"100%", padding:"14px", borderRadius:14, border:"none", marginTop:8, background:form.player?`linear-gradient(135deg,${T.gold},${T.goldDark})`:T.s3, color:form.player?"#000":T.dim, fontSize:15, fontWeight:700, boxShadow:form.player?`0 4px 20px rgba(201,168,76,0.25)`:"none" }}>
          {saving ? "保存中..." : "✓ 确认入库"}
        </button>
      </div>
    </div>
  );
}

// ─── HOME SCREEN ──────────────────────────────────────────
const STORIES = {
  default: card => `${card.year}年，${card.player}在${card.team}的征途中留下了这张${card.parallel||""}${card.numbered?` ${card.numbered}`:""}的珍藏印记。${card.category==="PC"?"这是你PC收藏中的重要一员，代表着真诚的热爱与执着。":"作为投资持有卡，时机是最大的艺术。"}`,
};

function DailyCard({ card, players }) {
  const [exp, setExp] = useState(false);
  const grad = cGrad(card.player, players);
  return (
    <div onClick={()=>setExp(!exp)} style={{ borderRadius:20, overflow:"hidden", cursor:"pointer", background:T.surface, border:`1px solid ${T.borderGold}`, boxShadow:`0 12px 40px rgba(0,0,0,0.4)`, position:"relative" }}>
      <div style={{ position:"absolute", inset:0, pointerEvents:"none", background:`radial-gradient(ellipse at 30% 50%,rgba(201,168,76,0.04) 0%,transparent 70%)` }} />
      <div style={{ display:"flex", gap:18, padding:"20px 20px 16px" }}>
        <div style={{ position:"relative", flexShrink:0 }}>
          <div style={{ width:100, height:140, borderRadius:10, background:grad, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", border:"1px solid rgba(255,255,255,0.12)", boxShadow:"0 8px 32px rgba(0,0,0,0.5)", animation:"cardFloat 5s ease-in-out infinite", overflow:"hidden" }}>
            {card.front_image ? <img src={card.front_image} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : (
              <><div style={{ fontSize:40 }}>{pEmoji(card.player, players)}</div><div style={{ fontFamily:"'Space Mono',monospace", fontSize:9, color:"rgba(255,255,255,0.6)", marginTop:4 }}>{card.card_number}</div>{card.numbered&&<div style={{ fontFamily:"'Space Mono',monospace", fontSize:12, color:T.goldLight, fontWeight:700 }}>{card.numbered}</div>}</>
            )}
          </div>
          {card.is_one_of_one && <div style={{ position:"absolute", bottom:-6, left:"50%", transform:"translateX(-50%)", padding:"3px 8px", borderRadius:4, background:T.gold, color:"#000", fontFamily:"'Space Mono',monospace", fontSize:8, fontWeight:700, whiteSpace:"nowrap" }}>1 OF 1</div>}
        </div>
        <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.gold, letterSpacing:1.5, marginBottom:4 }}>{pEmoji(card.player,players)} {players?.find(p=>p.name===card.player)?.short||card.player.split(" ").pop().toUpperCase()}</div>
            <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:17, color:T.text, lineHeight:1.25, marginBottom:6 }}>{card.parallel||card.series}</div>
            <div style={{ fontSize:11, color:T.muted, lineHeight:1.5 }}>{card.year} {card.series}{card.sub_series&&` · ${card.sub_series}`}</div>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:8 }}>
            {card.numbered && <Chip label={card.numbered} color={T.gold} />}
            <Chip label={STATUS[card.status]?.label||"持有"} color={STATUS[card.status]?.color||T.green} bg={STATUS[card.status]?.bg} />
            <GChip grade={card.grade} />
            {card.is_rc && <Chip label="RC" color={T.green} />}
          </div>
        </div>
      </div>
      <div style={{ padding:"0 20px 20px", maxHeight:exp?200:64, overflow:"hidden", transition:"max-height 0.4s ease" }}>
        <p style={{ fontSize:12, color:T.muted, lineHeight:1.8 }}>{STORIES.default(card)}</p>
      </div>
      <div style={{ textAlign:"center", paddingBottom:12, fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim }}>{exp?"收起 ↑":"展开故事 ↓"}</div>
    </div>
  );
}

function HomeScreen() {
  const { cards, pcPlayers, stats, loading, dailyCard, navigate } = useApp();
  if (loading) return <div style={{ padding:"20px" }}><Skel height={24} width={160} style={{ marginBottom:8 }} /><Skel height={14} width={120} style={{ marginBottom:24 }} /><Skel height={220} radius={20} style={{ marginBottom:20 }} /><Skel height={80} radius={12} /></div>;
  return (
    <div style={{ paddingBottom:90 }}>
      <div style={{ padding:"24px 20px 16px", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div><div style={{ display:"flex", alignItems:"center", gap:8 }}><span style={{ fontSize:20 }}>🃏</span><h1 style={{ fontFamily:"'Space Mono',monospace", fontSize:18, fontWeight:700, color:T.gold, letterSpacing:"-0.5px" }}>CARD VAULT</h1></div>
        <p style={{ fontSize:11, color:T.dim, marginTop:2, paddingLeft:28 }}>{new Date().toLocaleDateString("zh-CN",{month:"long",day:"numeric",weekday:"short"})}</p></div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={()=>navigate("search")} style={{ width:38, height:38, borderRadius:10, border:`1px solid ${T.border}`, background:T.s2, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>🔍</button>
          <button onClick={()=>navigate("add")} style={{ width:38, height:38, borderRadius:10, border:`1px solid ${T.borderGold}`, background:`rgba(201,168,76,0.1)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>📷</button>
        </div>
      </div>
      <div style={{ padding:"0 20px" }}>
        {dailyCard && <div style={{ marginBottom:20, animation:"fadeUp 0.5s ease both" }}><SectionHdr title="今日精选" sub="FROM YOUR VAULT" /><DailyCard card={dailyCard} players={pcPlayers} /></div>}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:16, animation:"fadeUp 0.5s ease 100ms both" }}>
          {[{icon:"🃏",v:stats.total,l:"总卡数"},{icon:"❤️",v:stats.pc,l:"PC"},{icon:"📈",v:stats.inv,l:"投资"},{icon:"✨",v:stats.oneOfOnes,l:"1/1"}].map((s,i)=>(
            <div key={i} style={{ padding:"12px 8px", borderRadius:12, textAlign:"center", background:T.s2, border:`1px solid ${T.border}` }}>
              <div style={{ fontSize:16, marginBottom:4 }}>{s.icon}</div>
              <div style={{ fontFamily:"'Space Mono',monospace", fontSize:18, fontWeight:700, color:T.text }}>{s.v}</div>
              <div style={{ fontSize:10, color:T.dim, marginTop:1 }}>{s.l}</div>
            </div>
          ))}
        </div>
        {stats.cost > 0 && <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderRadius:12, marginBottom:20, background:`linear-gradient(135deg,rgba(201,168,76,0.08),rgba(201,168,76,0.03))`, border:`1px solid ${T.borderGold}`, animation:"fadeUp 0.5s ease 150ms both" }}>
          <span style={{ fontSize:12, color:T.muted }}>当前持仓总成本</span>
          <span style={{ fontFamily:"'Space Mono',monospace", fontSize:16, fontWeight:700, color:T.gold }}>{fmtPrice(stats.cost)}</span>
        </div>}
        <div style={{ animation:"fadeUp 0.5s ease 250ms both" }}>
          <SectionHdr title="最近入库" sub={`共 ${cards.length} 张`} action="全部" onAction={()=>navigate("search")} />
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {cards.slice(0, 5).map(card => <CardRow key={card.id} card={card} players={pcPlayers} onClick={()=>navigate("detail", card)} />)}
            {cards.length === 0 && <div style={{ textAlign:"center", padding:"48px 0", color:T.dim }}><div style={{ fontSize:48, marginBottom:12 }}>🃏</div><div style={{ fontSize:14 }}>还没有卡片，点右上角📷开始录入</div></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SEARCH SCREEN ────────────────────────────────────────
function SearchScreen() {
  const { cards, pcPlayers, navigate } = useApp();
  const [q, setQ] = useState("");
  const [cf, setCf] = useState("all");
  const [pf, setPf] = useState("all");
  const ref = useRef();
  useEffect(() => { setTimeout(() => ref.current?.focus(), 100); }, []);
  const list = cards.filter(c => {
    if (cf !== "all" && c.category !== cf) return false;
    if (pf !== "all" && c.player !== pf) return false;
    if (q) { const ql = q.toLowerCase(); return [c.player,c.series,c.parallel,c.card_number,c.numbered,c.grade,c.team,c.sub_series,...(c.tags||[])].filter(Boolean).some(f=>f.toLowerCase().includes(ql)); }
    return true;
  });
  return (
    <div style={{ paddingBottom:90 }}>
      <div style={{ padding:"16px 20px 12px", position:"sticky", top:0, background:T.bg, zIndex:10 }}>
        <div style={{ position:"relative" }}>
          <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:14, color:T.dim, pointerEvents:"none" }}>🔍</span>
          <input ref={ref} value={q} onChange={e=>setQ(e.target.value)} placeholder="球星、系列、卡号、标签..."
            style={{ width:"100%", padding:"12px 16px 12px 40px", border:`1px solid ${T.border}`, borderRadius:12, background:T.s2, color:T.text, fontSize:14, outline:"none" }}
            onFocus={e=>e.target.style.borderColor=T.gold} onBlur={e=>e.target.style.borderColor=T.border} />
        </div>
        <div style={{ display:"flex", gap:8, marginTop:10, overflowX:"auto", scrollbarWidth:"none", paddingBottom:2 }}>
          {[["all","全部"],["PC","PC"],["investment","投资"]].map(([v,l])=>(
            <button key={v} onClick={()=>setCf(v)} style={{ padding:"6px 14px", borderRadius:8, border:`1px solid ${cf===v?T.borderGold:T.border}`, background:cf===v?"rgba(201,168,76,0.1)":"transparent", color:cf===v?T.gold:T.muted, fontSize:12, whiteSpace:"nowrap" }}>{l}</button>
          ))}
          <div style={{ width:1, background:T.border, margin:"4px 2px" }} />
          {[["all","全部"], ...pcPlayers.map(p=>[p.name,`${p.emoji} ${p.short}`])].map(([v,l])=>(
            <button key={v} onClick={()=>setPf(v)} style={{ padding:"6px 14px", borderRadius:8, border:`1px solid ${pf===v?T.borderGold:T.border}`, background:pf===v?"rgba(201,168,76,0.1)":"transparent", color:pf===v?T.gold:T.muted, fontSize:12, whiteSpace:"nowrap" }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ padding:"0 20px" }}>
        <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, marginBottom:12 }}>{list.length} 张卡片</div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {list.map((card,i) => <CardRow key={card.id} card={card} players={pcPlayers} onClick={()=>navigate("detail",card)} style={{ animation:`fadeUp 0.3s ease ${i*40}ms both` }} />)}
          {list.length===0 && <div style={{ textAlign:"center", padding:"48px 0", color:T.dim }}><div style={{ fontSize:32, marginBottom:8 }}>🔍</div><div style={{ fontSize:13 }}>没有匹配的卡片</div></div>}
        </div>
      </div>
    </div>
  );
}

// ─── DETAIL SCREEN ────────────────────────────────────────
function DetailScreen() {
  const { selected: card, pcPlayers, navigate, deleteCard } = useApp();
  const [imgTab, setImgTab] = useState("front");
  if (!card) { navigate("home"); return null; }
  const st = STATUS[card.status] || STATUS.holding;
  return (
    <div style={{ paddingBottom:90 }}>
      <div style={{ padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:T.bg, zIndex:10, borderBottom:`1px solid ${T.border}` }}>
        <button onClick={()=>navigate("search")} style={{ background:"none", border:"none", color:T.muted, fontSize:20 }}>←</button>
        <span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:T.dim }}>CARD DETAIL</span>
        <div style={{ width:40 }} />
      </div>
      <div style={{ padding:"20px", animation:"fadeUp 0.4s ease both" }}>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:20 }}>
          <div>
            <div style={{ width:200, height:280, borderRadius:16, overflow:"hidden", background:cGrad(card.player,pcPlayers), display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", border:"1px solid rgba(255,255,255,0.1)", boxShadow:"0 12px 40px rgba(0,0,0,0.5)", margin:"0 auto" }}>
              {imgTab==="front"&&card.front_image ? <img src={card.front_image} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
               :imgTab==="back"&&card.back_image  ? <img src={card.back_image}  alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
               : <><span style={{ fontSize:64 }}>{pEmoji(card.player,pcPlayers)}</span><span style={{ fontFamily:"'Space Mono',monospace", fontSize:12, color:"rgba(255,255,255,0.6)", marginTop:8 }}>{card.card_number}</span>{card.numbered&&<span style={{ fontFamily:"'Space Mono',monospace", fontSize:16, color:T.gold, fontWeight:700 }}>{card.numbered}</span>}</>}
            </div>
            <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:10 }}>
              {[["front","正面"],["back","背面"]].map(([v,l])=>(
                <button key={v} onClick={()=>setImgTab(v)} style={{ padding:"5px 14px", borderRadius:8, border:`1px solid ${imgTab===v?T.borderGold:T.border}`, background:imgTab===v?"rgba(201,168,76,0.1)":"transparent", color:imgTab===v?T.gold:T.dim, fontSize:11, fontFamily:"'Space Mono',monospace" }}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, color:T.text, marginBottom:6 }}>{card.player}</h2>
          <p style={{ fontSize:13, color:T.muted }}>{card.year} {card.series}{card.sub_series?` · ${card.sub_series}`:""}</p>
          <div style={{ display:"flex", justifyContent:"center", flexWrap:"wrap", gap:6, marginTop:10 }}>
            {card.numbered && <Chip label={card.numbered} color={T.gold} />}
            {card.is_one_of_one && <Chip label="1 OF 1" color="#FFD700" bg="rgba(255,215,0,0.15)" />}
            {card.is_rc && <Chip label="RC" color={T.green} />}
            <Chip label={st.label} color={st.color} bg={st.bg} />
            <GChip grade={card.grade} />
            <Chip label={CAT[card.category]?.label} color={CAT[card.category]?.color} />
          </div>
        </div>
        {[
          { title:"卡片信息", rows:[["球星",card.player],["球队",card.team],["卡号",card.card_number],["年份",card.year],["系列",card.series],card.sub_series&&["子系列",card.sub_series],["平行",card.parallel],["编号",card.numbered||"无"],["评级",card.grade]].filter(Boolean) },
          { title:"入手信息", rows:[["买入价",fmtPrice(card.buy_price)],["买入日期",card.buy_date||"—"],["来源",card.source||"—"],["📍 位置",card.location||"—"],["状态",st.label]] }
        ].map((blk,bi) => (
          <div key={bi} style={{ background:T.s2, border:`1px solid ${T.border}`, borderRadius:14, padding:"4px 16px", marginBottom:12 }}>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, padding:"12px 0 4px", letterSpacing:1 }}>{blk.title.toUpperCase()}</div>
            {blk.rows.map(([l,v],i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderTop:`1px solid ${T.border}` }}>
                <span style={{ fontSize:13, color:T.muted }}>{l}</span>
                <span style={{ fontFamily:l.includes("位置")?"'Space Mono',monospace":"sans-serif", fontSize:13, color:l.includes("位置")?T.gold:T.text, fontWeight:l.includes("位置")?700:500, textAlign:"right", maxWidth:"60%" }}>{v}</span>
              </div>
            ))}
          </div>
        ))}
        {card.tags?.length>0 && <div style={{ marginBottom:12 }}><div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, marginBottom:8, letterSpacing:1 }}>TAGS</div><div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>{card.tags.map(t=><span key={t} style={{ padding:"4px 10px", borderRadius:6, background:T.s3, border:`1px solid ${T.border}`, color:T.muted, fontSize:11 }}>#{t}</span>)}</div></div>}
        {card.notes && <div style={{ background:T.s2, border:`1px solid ${T.border}`, borderRadius:14, padding:16, marginBottom:12 }}><div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, marginBottom:8, letterSpacing:1 }}>NOTES</div><p style={{ fontSize:13, color:T.muted, lineHeight:1.8 }}>{card.notes}</p></div>}
        <button onClick={()=>{if(window.confirm("确认删除这张卡？")){deleteCard(card.id);navigate("home");}}} style={{ width:"100%", padding:"12px", borderRadius:12, border:`1px solid rgba(212,80,80,0.2)`, background:"rgba(212,80,80,0.06)", color:T.red, fontSize:13 }}>删除此卡</button>
      </div>
    </div>
  );
}

// ─── PC SCREEN ────────────────────────────────────────────
function PCScreen() {
  const { cards, pcPlayers, navigate } = useApp();
  return (
    <div style={{ paddingBottom:90 }}>
      <div style={{ padding:"24px 20px 16px" }}><h2 style={{ fontFamily:"'Space Mono',monospace", fontSize:18, fontWeight:700, color:T.gold }}>PC VAULT</h2><p style={{ fontSize:11, color:T.dim, marginTop:2 }}>你热爱的球星</p></div>
      <div style={{ padding:"0 20px", display:"flex", flexDirection:"column", gap:14 }}>
        {pcPlayers.sort((a,b)=>a.display_order-b.display_order).map((player,i) => {
          const pc = cards.filter(c => c.player===player.name && c.category==="PC");
          const val = pc.reduce((s,c)=>s+(parseFloat(c.buy_price)||0), 0);
          return (
            <div key={player.id} style={{ borderRadius:18, overflow:"hidden", border:`1px solid ${T.border}`, animation:`fadeUp 0.4s ease ${i*80}ms both`, cursor:"pointer" }} onClick={()=>navigate("search")}>
              <div style={{ padding:"18px 20px", background:`linear-gradient(135deg,${player.color1}30,${player.color2}20)`, borderBottom:pc.length>0?`1px solid ${T.border}`:"none", display:"flex", alignItems:"center", gap:14 }}>
                <span style={{ fontSize:36 }}>{player.emoji}</span>
                <div style={{ flex:1 }}><div style={{ fontFamily:"'DM Serif Display',serif", fontSize:17, color:T.text }}>{player.name}</div><div style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:T.dim, marginTop:2 }}>{pc.length} 张 · {fmtPrice(val)}</div></div>
                {pc.length>0 && <div style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:T.gold }}>→</div>}
              </div>
              {pc.slice(0,3).map((c,ci) => (
                <div key={c.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 20px", background:T.surface, borderBottom:ci<Math.min(pc.length,3)-1?`1px solid ${T.border}`:"none" }}>
                  <div><span style={{ fontSize:12, color:T.muted }}>{c.parallel}</span>{c.numbered&&<span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:T.gold, marginLeft:6 }}>{c.numbered}</span>}</div>
                  <Chip label={STATUS[c.status]?.label} color={STATUS[c.status]?.color} bg={STATUS[c.status]?.bg} style={{ fontSize:9, padding:"2px 6px" }} />
                </div>
              ))}
              {pc.length===0 && <div style={{ padding:"14px 20px", background:T.surface, fontSize:12, color:T.dim }}>还没有录入卡片，开始建仓吧 →</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── STATS SCREEN ─────────────────────────────────────────
function StatsScreen() {
  const { cards, pcPlayers, stats } = useApp();
  return (
    <div style={{ paddingBottom:90 }}>
      <div style={{ padding:"24px 20px 16px" }}><h2 style={{ fontFamily:"'Space Mono',monospace", fontSize:18, fontWeight:700, color:T.gold }}>DASHBOARD</h2><p style={{ fontSize:11, color:T.dim, marginTop:2 }}>收藏总览</p></div>
      <div style={{ padding:"0 20px" }}>
        <div style={{ textAlign:"center", padding:"24px 0", background:`linear-gradient(135deg,rgba(201,168,76,0.06),transparent)`, border:`1px solid ${T.borderGold}`, borderRadius:16, marginBottom:16 }}>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, letterSpacing:2, marginBottom:8 }}>TOTAL COST BASIS</div>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:36, fontWeight:700, color:T.gold }}>{fmtPrice(stats.cost)}</div>
          <div style={{ fontSize:12, color:T.dim, marginTop:4 }}>{stats.total} 张卡片</div>
        </div>
        <div style={{ background:T.s2, border:`1px solid ${T.border}`, borderRadius:14, padding:"4px 16px", marginBottom:16 }}>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, padding:"12px 0 4px", letterSpacing:1 }}>STATUS</div>
          {Object.entries(STATUS).map(([key,val]) => {
            const count = cards.filter(c=>c.status===key).length;
            return <div key={key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderTop:`1px solid ${T.border}` }}><Chip label={val.label} color={val.color} bg={val.bg} /><span style={{ fontFamily:"'Space Mono',monospace", fontSize:14, color:T.text, fontWeight:700 }}>{count}</span></div>;
          })}
        </div>
        <div style={{ background:T.s2, border:`1px solid ${T.border}`, borderRadius:14, padding:"12px 16px" }}>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:T.dim, marginBottom:14, letterSpacing:1 }}>PC BREAKDOWN</div>
          {pcPlayers.map(player => {
            const count = cards.filter(c=>c.player===player.name).length;
            const pct = stats.total>0?(count/stats.total)*100:0;
            const val = cards.filter(c=>c.player===player.name).reduce((s,c)=>s+(parseFloat(c.buy_price)||0),0);
            return (
              <div key={player.id} style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                  <span style={{ fontSize:12, color:T.muted }}>{player.emoji} {player.short}</span>
                  <span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:T.gold }}>{count}张 · {fmtPrice(val)}</span>
                </div>
                <div style={{ height:3, borderRadius:2, background:T.s3 }}>
                  <div style={{ height:"100%", borderRadius:2, width:`${pct}%`, background:`linear-gradient(90deg,${player.color1},${T.gold})`, transition:"width 0.6s ease" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── TAB BAR + ROOT ───────────────────────────────────────
function TabBar() {
  const { screen, navigate } = useApp();
  const tabs = [{id:"home",l:"首页"},{id:"search",l:"搜索"},{id:"add",l:""},{id:"pc",l:"PC"},{id:"stats",l:"统计"}];
  const icons = { home:"⬜", search:"🔍", pc:"❤️", stats:"📊" };
  return (
    <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, display:"flex", justifyContent:"space-around", padding:"8px 0 max(16px, env(safe-area-inset-bottom))", background:"rgba(8,8,16,0.96)", backdropFilter:"blur(20px)", borderTop:`1px solid ${T.border}`, zIndex:100 }}>
      {tabs.map(tab => {
        const active = screen===tab.id || (tab.id==="home"&&(screen==="detail"||screen==="add"));
        if (tab.id === "add") return (
          <button key="add" onClick={()=>navigate("add")} style={{ position:"relative", background:"none", border:"none", padding:0, marginTop:-18 }}>
            <div style={{ width:52, height:52, borderRadius:16, background:`linear-gradient(135deg,${T.gold},${T.goldDark})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, boxShadow:`0 4px 20px rgba(201,168,76,0.4)`, border:`2px solid rgba(201,168,76,0.3)` }}>📷</div>
          </button>
        );
        return (
          <button key={tab.id} onClick={()=>navigate(tab.id)} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, background:"none", border:"none", padding:"4px 12px", color:active?T.gold:T.dim, transition:"color 0.2s" }}>
            <span style={{ fontSize:22 }}>{icons[tab.id]}</span>
            <span style={{ fontFamily:"'Noto Sans SC',sans-serif", fontSize:10, fontWeight:active?700:400 }}>{tab.l}</span>
          </button>
        );
      })}
    </div>
  );
}

function Router() {
  const { screen } = useApp();
  switch(screen) {
    case "home":   return <HomeScreen />;
    case "search": return <SearchScreen />;
    case "add":    return <AddScreen />;
    case "pc":     return <PCScreen />;
    case "stats":  return <StatsScreen />;
    case "detail": return <DetailScreen />;
    default:       return <HomeScreen />;
  }
}

export default function CardVault() {
  return (
    <>
      <Head>
        <title>Card Vault</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#080810" />
        <link rel="manifest" href="/manifest.json" />
      </Head>
      <AppProvider>
        <div style={{ minHeight:"100vh", background:T.bg, maxWidth:480, margin:"0 auto", position:"relative", overflowX:"hidden", fontFamily:"'Noto Sans SC',sans-serif", color:T.text }}>
          <Router />
          <TabBar />
          <ToastLayer />
        </div>
      </AppProvider>
    </>
  );
}
function ToastLayer() { const { toast } = useApp(); return <Toast toast={toast} />; }
