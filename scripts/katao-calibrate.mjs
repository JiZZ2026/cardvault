// scripts/katao-calibrate.mjs
// 卡淘关键词实证校准 — 本地脚本,从 GitHub main 拉的 searchKatao 是正确源。
//
// 用法:  node scripts/katao-calibrate.mjs
// 前提:  Node 18+(内置 fetch),根目录 .env.local 含
//        NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//
// 行为:
//   1. 从 Supabase 拉 active watch_items + active player_investments
//   2. 对每个标的,系统试多种关键词写法,各查卡淘"在售/成交"命中数
//   3. 选出"成交数最大"的写法作为推荐(成交是真实流动性指标)
//   4. 输出 calibration-results.json + 控制台报告(不写库)
//
// 不会做的:不会 update watch_items.search_keywords_katao(那是另一个脚本的事)。
//          不会改卡片/价格/目标/投资行。不会改 schema。
//
// 节流:每次卡淘调用之间 ≥1.6s,3 次指数退避(1.6/3.2/6.4s)。
//
// 球员 year_short 来源(优先级):
//   player_meta.year_short  →  本脚本顶部 YEAR_FALLBACK 映射  →  ''(留空)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

// ── 读 .env.local(简易解析,不依赖 dotenv 包) ──
function loadEnvLocal() {
  const p = path.join(ROOT, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
loadEnvLocal();

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) {
  console.error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY,请检查 .env.local");
  process.exit(1);
}
const supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

// ── 球员 → year_short 兜底(player_meta.year_short 优先) ──
// 来源:NBA 公开新秀年份;只为校准默认值,不会写库
const YEAR_FALLBACK = {
  "Victor Wembanyama": "23-24",
  "Brandon Miller":    "23-24",
  "Zaccharie Risacher":"24-25",
  "Cooper Flagg":      "25-26",
  "Dylan Harper":      "25-26",
  "Kon Knueppel":      "25-26",
};

// ── 卡淘单次查询(带退避) ──
const SLEEP_MS = 1700;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function queryKatao(keyword, sold) {
  const sj = sold ? '[{"Key":"Status","Value":-2}]' : '[{"Key":"Status","Value":1}]';
  // 严格 URL-encode 大括号方括号,Node fetch 兼容,curl 也兼容
  const sjEnc = encodeURIComponent(sj);
  const kwEnc = encodeURIComponent(keyword);
  const url = `https://www.cardhobby.com.cn/NewCommodity/SearchCommodity`
    + `?userId=&pageIndex=1&pageSize=20`
    + `&searchKey=${kwEnc}`
    + `&searchJson=${sjEnc}`
    + `&sort=EffectiveTimeStamp&sortType=desc`;

  let backoff = SLEEP_MS;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ctl = new AbortController();
      const tid = setTimeout(() => ctl.abort(), 20000);
      const resp = await fetch(url, {
        signal: ctl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "zh-CN,zh;q=0.9",
          "Referer": "https://www.cardhobby.com.cn/",
        },
      });
      clearTimeout(tid);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const dd = data?.data || {};
      const list = dd.PagedMarketItemList || [];
      return {
        total: typeof dd.TotalCount === "number" ? dd.TotalCount : -1,
        items: list.length,
        firstTitle: list[0]?.Title?.slice(0, 80) || "",
      };
    } catch (e) {
      if (attempt === 3) {
        console.error(`  [katao FAILED] kw="${keyword}" sold=${sold}: ${e.message}`);
        return { total: -1, items: 0, firstTitle: "", error: e.message };
      }
      await sleep(backoff);
      backoff *= 2;
    }
  }
  return { total: -1, items: 0, firstTitle: "" };
}

// ── 候选关键词生成 ──
function lastSegmentByDot(cn) {
  if (!cn) return "";
  const parts = cn.split(/[·•・]/).map(s => s.trim()).filter(Boolean);
  return parts[parts.length - 1] || cn;
}
function lastEnSurname(en) {
  return (en || "").trim().split(/\s+/).pop() || "";
}

function generateCandidates({ cn, en, yearShort }) {
  const cnLast = lastSegmentByDot(cn);
  const enLast = lastEnSurname(en);
  const ys = yearShort || "";
  const out = [];
  const seen = new Set();
  const push = (label, kw) => {
    const trimmed = kw.replace(/\s+/g, " ").trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push({ label, kw: trimmed });
  };
  if (cn) push("A_cn_full",        `${cn} prizm`);
  if (cnLast && cnLast !== cn) push("B_cn_last", `${cnLast} prizm`);
  if (cnLast && ys) push("C_cn_last_year", `${cnLast} ${ys} prizm`);
  if (cn && ys)     push("D_cn_full_year", `${cn} ${ys} prizm`);
  if (enLast)       push("E_en_last",      `${enLast} prizm`);
  if (enLast && ys) push("F_en_last_year", `${enLast} ${ys} prizm`);
  if (cnLast)       push("G_cn_last_rc",   `${cnLast} rc prizm`);
  return out;
}

// ── 主流程 ──
async function main() {
  console.log("=== 卡淘关键词实证校准 ===");
  console.log(`时间: ${new Date().toISOString()}`);

  // 1. 拉 active watch_items + active investments
  const { data: watchItems, error: wiErr } = await supabase
    .from("watch_items").select("*").eq("status", "active");
  if (wiErr) { console.error("watch_items 拉取失败:", wiErr.message); process.exit(1); }

  const { data: invs, error: ivErr } = await supabase
    .from("player_investments").select("*").eq("status", "active");
  if (ivErr) { console.error("player_investments 拉取失败:", ivErr.message); process.exit(1); }

  // 2. 拼校准目标
  const targets = [];
  for (const inv of (invs || [])) {
    const cn = inv.player_name_cn || "";
    const en = inv.player_name || "";
    const meta = inv.player_meta || {};
    const ys = meta.year_short || YEAR_FALLBACK[en] || "";
    const wi = (watchItems || []).find(w => (w.meta?.investment_id) === inv.id);
    targets.push({
      kind: "investment",
      pid: inv.id, wid: wi?.id || null,
      cn, en, ys,
      currentKw: wi?.search_keywords_katao || "",
    });
  }
  // 收集 goal 来源的 watch_items(KG /50 金 这类)
  for (const wi of (watchItems || [])) {
    if (wi.source === "investment") continue;  // 已上面收
    targets.push({
      kind: "goal",
      pid: null, wid: wi.id,
      cn: "", en: "", ys: "",
      currentKw: wi.search_keywords_katao || "",
      description: wi.description,
    });
  }

  console.log(`\n校准目标: ${targets.length} 个`);
  for (const t of targets) console.log(`  [${t.kind}] cn="${t.cn}" en="${t.en}" ys="${t.ys}" current="${t.currentKw}"`);

  // 3. 对每个 target 跑 candidates
  const results = [];
  for (const t of targets) {
    let candidates;
    if (t.kind === "investment") {
      candidates = generateCandidates({ cn: t.cn, en: t.en, yearShort: t.ys });
    } else {
      // goal 已是手工配的,只测当前写法 baseline
      candidates = [{ label: "current", kw: t.currentKw }];
    }
    const probed = [];
    for (const c of candidates) {
      const onSale = await queryKatao(c.kw, false);
      await sleep(SLEEP_MS);
      const sold   = await queryKatao(c.kw, true);
      await sleep(SLEEP_MS);
      probed.push({ ...c, onSale, sold });
      console.log(`  [${t.cn || t.description || "?"}/${c.label}] "${c.kw}" 在售=${onSale.total} 成交=${sold.total}`);
    }
    // 推荐:成交数最大的写法(成交是真实流动性);并列时优先在售也较大的
    const ranked = [...probed].sort((a, b) => {
      const ka = a.sold.total < 0 ? -1 : a.sold.total;
      const kb = b.sold.total < 0 ? -1 : b.sold.total;
      if (kb !== ka) return kb - ka;
      const ia = a.onSale.total < 0 ? -1 : a.onSale.total;
      const ib = b.onSale.total < 0 ? -1 : b.onSale.total;
      return ib - ia;
    });
    const best = ranked[0];
    const currentSold = probed.find(p => p.kw === t.currentKw)?.sold?.total ?? null;
    const improved = (best?.sold?.total ?? 0) > (currentSold ?? 0);
    results.push({ ...t, probed, recommended: best, currentSold, improved });
  }

  // 4. 写结果
  const outPath = path.join(ROOT, "scripts/katao-calibration-results.json");
  fs.writeFileSync(outPath, JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
  console.log(`\n结果写入: ${outPath}`);

  // 5. 控制台总结
  console.log("\n=== 推荐 ===");
  for (const r of results) {
    const tag = r.improved ? "✅ 改进" : "= 现状或无改进";
    console.log(`  [${r.cn || r.description}] ${tag}: "${r.currentKw}" (成交=${r.currentSold ?? '?'}) → "${r.recommended?.kw}" (成交=${r.recommended?.sold?.total ?? '?'})`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
