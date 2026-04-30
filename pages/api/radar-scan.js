// pages/api/radar-scan.js
// POST /api/radar-scan          — 触发扫描（全量）
// GET  /api/radar-scan          — 获取最新扫描结果（按 goal 分组）
// POST /api/radar-scan?dismiss=id — 标记"不感兴趣"

import { supabase } from '../../lib/supabase';

const EBAY_APP_ID = process.env.EBAY_APP_ID;

export default async function handler(req, res) {

  // ── 标记不感兴趣 ────────────────────────────────────────────────────────
  if (req.method === 'POST' && req.query.dismiss) {
    const { error } = await supabase
      .from('scan_results')
      .update({ dismissed: true })
      .eq('id', req.query.dismiss);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  // ── 获取最新结果 ────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    // 获取最近48小时内、未被 dismiss 的扫描结果，关联 watch_item 和 goal
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('scan_results')
      .select(`
        *,
        watch_item:watch_items(
          id, description, tier, goal_id,
          goal:collection_goals(id, title, player_name, mode)
        )
      `)
      .eq('dismissed', false)
      .gte('scanned_at', since)
      .order('scanned_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // 按 goal 分组，同一 watch_item 只保留最新的3条
    const grouped = {};
    for (const result of (data || [])) {
      const goalId = result.watch_item?.goal_id || 'manual';
      const goalTitle = result.watch_item?.goal?.title || '手动监控';
      if (!grouped[goalId]) {
        grouped[goalId] = {
          goal_id: goalId,
          goal_title: goalTitle,
          player_name: result.watch_item?.goal?.player_name || '',
          results: [],
        };
      }
      // 每个 watch_item 最多3条结果
      const existingForItem = grouped[goalId].results.filter(
        r => r.watch_item_id === result.watch_item_id
      );
      if (existingForItem.length < 3) {
        grouped[goalId].results.push(result);
      }
    }

    const lastScan = data?.[0]?.scanned_at || null;

    return res.status(200).json({
      last_scanned: lastScan,
      total_found: (data || []).length,
      groups: Object.values(grouped),
    });
  }

  // ── 触发扫描 ─────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    if (!EBAY_APP_ID) return res.status(500).json({ error: 'eBay API 未配置' });

    // 获取所有 active watch_items
    const { data: watchItems, error: wiErr } = await supabase
      .from('watch_items')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: true });

    if (wiErr) return res.status(500).json({ error: wiErr.message });
    if (!watchItems?.length) return res.status(200).json({ success: true, scanned: 0, found: 0 });

    let totalFound = 0;
    const newResults = [];

    // 逐个搜索，加延迟避免限流
    for (let i = 0; i < watchItems.length; i++) {
      const item = watchItems[i];
      if (!item.search_keywords_ebay) continue;

      try {
        const results = await searchEbay(item.search_keywords_ebay);
        if (results.length > 0) {
          totalFound += results.length;
          for (const r of results.slice(0, 3)) {
            newResults.push({
              watch_item_id: item.id,
              platform: 'ebay',
              title: r.title,
              price: r.price,
              price_currency: r.currency || 'USD',
              listing_url: r.url,
              listing_type: r.listingType || 'auction',
              is_new: true,
              dismissed: false,
            });
          }
        }
        // 更新 last_scanned
        await supabase
          .from('watch_items')
          .update({ last_scanned: new Date().toISOString() })
          .eq('id', item.id);

        // 每10个暂停一下，避免触发限流
        if (i > 0 && i % 10 === 0) {
          await sleep(1000);
        }
      } catch (e) {
        console.error(`扫描失败 [${item.description}]:`, e.message);
      }
    }

    // 先把旧的 is_new 全部标为 false
    await supabase
      .from('scan_results')
      .update({ is_new: false })
      .eq('is_new', true);

    // 批量插入新结果
    if (newResults.length > 0) {
      for (let i = 0; i < newResults.length; i += 50) {
        await supabase.from('scan_results').insert(newResults.slice(i, i + 50));
      }
    }

    // 清理7天前的旧结果
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('scan_results').delete().lt('scanned_at', cutoff);

    return res.status(200).json({
      success: true,
      scanned: watchItems.length,
      found: totalFound,
      new_results: newResults.length,
    });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

// ── eBay 搜索（复用 ebay-price.js 的逻辑，改为搜索当前在售 + 已成交） ─────────

async function searchEbay(keyword) {
  // 搜索当前在售 listing（不过滤已成交，这样能找到可以竞拍的卡）
  const base = 'https://svcs.ebay.com/services/search/FindingService/v1';
  const queryStr = [
    `OPERATION-NAME=findItemsByKeywords`,
    `SERVICE-VERSION=1.0.0`,
    `SECURITY-APPNAME=${encodeURIComponent(EBAY_APP_ID)}`,
    `RESPONSE-DATA-FORMAT=JSON`,
    `keywords=${encodeURIComponent(keyword)}`,
    `itemFilter%280%29.name=ListingType`,
    `itemFilter%280%29.value%280%29=Auction`,
    `itemFilter%280%29.value%281%29=AuctionWithBIN`,
    `itemFilter%280%29.value%282%29=FixedPrice`,
    `itemFilter%281%29.name=Condition`,
    `itemFilter%281%29.value=Used`,
    `sortOrder=EndTimeSoonest`,
    `paginationInput.entriesPerPage=5`,
  ].join('&');

  const url = `${base}?${queryStr}`;
  const response = await fetch(url);
  const text = await response.text();

  let data;
  try { data = JSON.parse(text); } catch { return []; }

  const root = data?.findItemsByKeywordsResponse?.[0];
  if (!root || root.ack?.[0] !== 'Success') return [];

  const items = root?.searchResult?.[0]?.item || [];
  return items.map(item => ({
    title: item?.title?.[0] || '',
    price: parseFloat(item?.sellingStatus?.[0]?.currentPrice?.[0]?.['__value__'] || '0'),
    currency: item?.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || 'USD',
    url: item?.viewItemURL?.[0] || '',
    listingType: item?.listingInfo?.[0]?.listingType?.[0] || 'Auction',
    endTime: item?.listingInfo?.[0]?.endTime?.[0] || '',
    bidCount: parseInt(item?.sellingStatus?.[0]?.bidCount?.[0] || '0'),
  })).filter(r => r.price > 0);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
