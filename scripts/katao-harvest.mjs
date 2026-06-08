// scripts/katao-harvest.mjs
// 卡淘本地采集 — 读 active watch_items → 抓在售+成交 → 写 scan_results
//
// 用法:  node scripts/katao-harvest.mjs
// 前提:  Node 18+(内置 fetch),根目录 .env.local 含
//        NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//
// 行为:
//   1. 拉 active watch_items(status='active')
//   2. 对每条:searchKatao(kw) 在售 + searchKatao(kw, true) 成交
//   3. 在售前 5 条写 scan_results(参照 radar-scan.js 现有映射)
//   4. 检测 scan_results 是否有 listing_status 列:
//      - 有:成交也写入(标 listing_status='sold')
//      - 无:成交只统计数量(留给迁移后跑)
//   5. 更新 watch_item.last_scanned
//   6. 节流:每次卡淘调用之间 ≥1.6s
//   7. 错误重试退避:1.6/3.2/6.4s
//
// 安全约束(与 brief 一致):
//   - 不删/不改任何卡片、价格、目标、投资行
//   - 只 INSERT scan_results(失败 INSERT 单条不阻塞)
//   - 只 UPDATE watch_items.last_scanned(此一字段)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

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

const SLEEP_MS = 1700;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 复用 pages/api/katao-search.js 的 searchKatao 完整实现(原样拷贝) ──
async function searchKatao(keyword, sold = false) {
  const searchJsonRaw = '[{"Key":"Status","Value":' + (sold ? '-2' : '1') + '}]';
  const keywordEncoded = encodeURIComponent(keyword);
  const searchJsonEncoded = encodeURIComponent(searchJsonRaw);

  const url = "https://www.cardhobby.com.cn/NewCommodity/SearchCommodity"
    + "?userId="
    + "&pageIndex=1"
    + "&pageSize=20"
    + "&searchKey=" + keywordEncoded
    + "&searchJson=" + searchJsonEncoded
    + "&sort=EffectiveTimeStamp&sortType=desc";

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
      const data = await resp.json();
      if (!data || data.result !== 1) {
        throw new Error("卡淘返回错误: " + (data?.msg || JSON.stringify(data).slice(0,100)));
      }
      const items = data.data?.PagedMarketItemList || [];
      const total = data.data?.TotalCount ?? items.length;
      const mapped = items.map(item => {
        const price = item.LowestPrice || parseFloat(item.Price) || 0;
        const priceUSD = item.USD_LowestPrice ? parseFloat(item.USD_LowestPrice) : null;
        const listingType = item.ByWay === 2 ? "auction" : "buy_now";
        return {
          id: item.ID,
          title: item.Title,
          image: item.TitImg || null,
          price,
          priceUSD,
          currency: "RMB",
          url: "https://www.cardhobby.com.cn/market/item/" + item.ID,
          bidCount: item.PriceCount || 0,
          timeLeft: item.EffectiveDate ? calcTimeLeft(item.EffectiveDate) : "",
          listingType,
          seller: item.SellRealName || "",
          isGuarantee: item.IsGuarantee === 1,
          platform: "katao",
        };
      });
      return { items: mapped, total };
    } catch (e) {
      if (attempt === 3) {
        console.error(`  [katao FAILED] kw="${keyword}" sold=${sold}: ${e.message}`);
        return { items: [], total: 0, error: e.message };
      }
      await sleep(backoff);
      backoff *= 2;
    }
  }
  return { items: [], total: 0 };
}
function calcTimeLeft(dateStr) {
  try {
    const end = new Date(dateStr);
    const diff = end - Date.now();
    if (diff <= 0) return "已结束";
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return days + "天" + hours + "时";
    if (hours > 0) return hours + "时" + mins + "分";
    return mins + "分钟";
  } catch (e) { return ""; }
}

// ── 检测 scan_results 是否有 listing_status 列 ───────────────────────
async function hasListingStatusColumn() {
  // 试 select 该列;若返回 PGRST204(unknown column)说明没有
  const { error } = await supabase
    .from("scan_results")
    .select("listing_status")
    .limit(1);
  if (!error) return true;
  if ((error.code || "").startsWith("PGRST") || /column .* does not exist/i.test(error.message || "")) {
    return false;
  }
  // 其他错误当作没有,安全
  console.warn("listing_status 探测异常,按无处理:", error.message);
  return false;
}

// ── 主流程 ──
async function main() {
  console.log("=== 卡淘本地采集 ===");
  console.log(`时间: ${new Date().toISOString()}`);

  const hasSoldColumn = await hasListingStatusColumn();
  console.log(`scan_results.listing_status 列: ${hasSoldColumn ? "存在,成交也写入" : "不存在,成交只统计数量"}`);

  const { data: watchItems, error } = await supabase
    .from("watch_items").select("*").eq("status", "active");
  if (error) { console.error("拉取 watch_items 失败:", error.message); process.exit(1); }
  console.log(`active watch_items: ${watchItems?.length || 0}`);

  let scanned = 0, totalOnSale = 0, totalSold = 0, wroteOnSale = 0, wroteSold = 0;
  const perItem = [];

  for (const wi of (watchItems || [])) {
    const kw = (wi.search_keywords_katao || "").trim();
    if (!kw) {
      console.log(`  [跳过] ${wi.description}: 无 kw`);
      continue;
    }
    scanned++;
    console.log(`\n[${scanned}/${watchItems.length}] ${wi.description}  kw="${kw}"`);

    // ── 在售 ──
    const onSaleRes = await searchKatao(kw, false);
    await sleep(SLEEP_MS);
    const top5 = (onSaleRes.items || []).slice(0, 5);
    totalOnSale += onSaleRes.total || 0;
    console.log(`  在售: total=${onSaleRes.total}, 准备写入前 ${top5.length} 条`);

    if (top5.length) {
      // 删该 watch_item 已有的 scan_results(在售口径,如果有 listing_status 就只删 on_sale)
      let delQ = supabase.from("scan_results").delete().eq("watch_item_id", wi.id);
      if (hasSoldColumn) delQ = delQ.eq("listing_status", "on_sale");
      await delQ;

      const rows = top5.map(r => ({
        watch_item_id: wi.id,
        platform: "katao",
        title: r.title,
        price: r.price,
        price_currency: "RMB",
        listing_url: r.url || "",
        image_url: r.image || null,
        listing_type: r.listingType || "auction",
        bid_count: r.bidCount || 0,
        time_remaining: r.timeLeft || "",
        is_new: true,
        dismissed: false,
        ...(hasSoldColumn ? { listing_status: "on_sale" } : {}),
      }));
      const { error: insErr } = await supabase.from("scan_results").insert(rows);
      if (insErr) console.error(`  在售写入失败: ${insErr.message}`);
      else wroteOnSale += rows.length;
    }

    // ── 成交 ──
    const soldRes = await searchKatao(kw, true);
    await sleep(SLEEP_MS);
    const sold5 = (soldRes.items || []).slice(0, 5);
    totalSold += soldRes.total || 0;
    console.log(`  成交: total=${soldRes.total}`);

    if (hasSoldColumn && sold5.length) {
      const rows = sold5.map(r => ({
        watch_item_id: wi.id,
        platform: "katao",
        title: r.title,
        price: r.price,
        price_currency: "RMB",
        listing_url: r.url || "",
        image_url: r.image || null,
        listing_type: r.listingType || "auction",
        bid_count: r.bidCount || 0,
        time_remaining: r.timeLeft || "",
        is_new: true,
        dismissed: false,
        listing_status: "sold",
      }));
      // 删已有的 sold,避免重复
      await supabase.from("scan_results")
        .delete()
        .eq("watch_item_id", wi.id)
        .eq("listing_status", "sold");
      const { error: insErr } = await supabase.from("scan_results").insert(rows);
      if (insErr) console.error(`  成交写入失败: ${insErr.message}`);
      else wroteSold += rows.length;
    }

    // 更新 last_scanned(仅此字段)
    await supabase.from("watch_items")
      .update({ last_scanned: new Date().toISOString() })
      .eq("id", wi.id);

    perItem.push({
      wid: wi.id, desc: wi.description, kw,
      on_sale_total: onSaleRes.total, sold_total: soldRes.total,
    });
  }

  console.log("\n=== 汇总 ===");
  console.log(`扫描 watch_items: ${scanned}`);
  console.log(`在售 lifetime total: ${totalOnSale}`);
  console.log(`成交 lifetime total: ${totalSold}`);
  console.log(`写入 scan_results 在售: ${wroteOnSale}`);
  console.log(`写入 scan_results 成交: ${wroteSold}${hasSoldColumn ? "" : "(列不存在,跳过)"}`);
  console.log("");
  perItem.sort((a, b) => (b.sold_total || 0) - (a.sold_total || 0));
  console.log("成交数据最丰富的(TOP 10):");
  for (const r of perItem.slice(0, 10)) {
    console.log(`  ${r.desc}  在售=${r.on_sale_total} 成交=${r.sold_total}`);
  }

  // 写汇总 JSON 供报告引用
  const outPath = path.join(ROOT, "scripts/katao-harvest-summary.json");
  fs.writeFileSync(outPath, JSON.stringify({
    ran_at: new Date().toISOString(),
    has_listing_status_column: hasSoldColumn,
    scanned, total_on_sale: totalOnSale, total_sold: totalSold,
    wrote_on_sale: wroteOnSale, wrote_sold: wroteSold,
    per_item: perItem,
  }, null, 2));
  console.log(`\n汇总写入: ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
