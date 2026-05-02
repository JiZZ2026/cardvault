// pages/api/radar-scan.js
// GET  /api/radar-scan  获取扫描结果
// POST /api/radar-scan  触发扫描

import { supabase } from '../../lib/supabase';

const EBAY_APP_ID = process.env.EBAY_APP_ID;

export default async function handler(req, res) {

  // GET：返回最新扫描结果
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('scan_results')
      .select(`
        *,
        watch_item:watch_items(
          id, description, tier, search_keywords_ebay,
          goal:collection_goals(id, title, player_name)
        )
      `)
      .eq('dismissed', false)
      .order('scanned_at', { ascending: false })
      .limit(200);

    if (error) return res.status(500).json({ error: error.message });

    const grouped = {};
    for (const r of (data || [])) {
      const wid = r.watch_item_id;
      if (!grouped[wid]) grouped[wid] = { watch_item: r.watch_item, results: [] };
      if (grouped[wid].results.length < 5) grouped[wid].results.push(r);
    }

    const items = Object.values(grouped);
    return res.status(200).json({
      mustWatch: items.filter(i => i.watch_item?.tier === 'must_watch'),
      niceToHave: items.filter(i => i.watch_item?.tier === 'nice_to_have'),
      lastScanned: data?.[0]?.scanned_at || null,
      total: data?.length || 0,
    });
  }

  // POST：触发扫描
  if (req.method === 'POST') {
    if (!EBAY_APP_ID) return res.status(500).json({ error: 'eBay API 未配置（缺少 EBAY_APP_ID）' });

    // 获取所有 active watch_items
    const { data: watchItems, error: we } = await supabase
      .from('watch_items')
      .select('*')
      .eq('status', 'active')
      .limit(50);

    if (we) return res.status(500).json({ error: 'DB错误: ' + we.message });

    if (!watchItems?.length) {
      return res.status(200).json({
        success: true, scanned: 0, found: 0,
        message: '没有活跃的监控条目，请先创建收集目标'
      });
    }

    let scanned = 0, found = 0, errors = 0;
    const newResults = [];
    const scanLog = [];

    for (const item of watchItems) {
      const keyword = item.search_keywords_ebay;
      if (!keyword) continue;

      try {
        const results = await searchEbay(keyword);
        scanned++;

        if (results.length > 0) {
          found += results.length;
          for (const r of results.slice(0, 5)) {
            newResults.push({
              watch_item_id: item.id,
              platform: 'ebay',
              title: r.title,
              price: r.price,
              price_currency: r.currency || 'USD',
              listing_url: r.url,
              listing_type: r.listingType || 'Auction',
              is_new: true,
              dismissed: false,
            });
          }
          scanLog.push({ keyword, found: results.length });
        } else {
          scanLog.push({ keyword, found: 0 });
        }

        await supabase.from('watch_items')
          .update({ last_scanned: new Date().toISOString() })
          .eq('id', item.id);

        await sleep(300);

      } catch (e) {
        errors++;
        console.error(`Scan failed for "${keyword}":`, e.message);
        scanLog.push({ keyword, error: e.message });
      }
    }

    // 写入新结果（先清除旧的，再写新的）
    if (newResults.length > 0) {
      await supabase.from('scan_results')
        .delete()
        .in('watch_item_id', watchItems.map(i => i.id));
      await supabase.from('scan_results').insert(newResults);
    }

    return res.status(200).json({
      success: true,
      scanned,
      found,
      errors,
      total_watch_items: watchItems.length,
      log: scanLog,
      message: found > 0
        ? `扫描完成：${scanned} 个条目，找到 ${found} 个结果`
        : `扫描完成：${scanned} 个条目，暂无匹配结果`,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function searchEbay(keyword) {
  const base = 'https://svcs.ebay.com/services/search/FindingService/v1';
  const queryStr = [
    'OPERATION-NAME=findItemsByKeywords',
    'SERVICE-VERSION=1.0.0',
    `SECURITY-APPNAME=${encodeURIComponent(EBAY_APP_ID)}`,
    'RESPONSE-DATA-FORMAT=JSON',
    `keywords=${encodeURIComponent(keyword)}`,
    'itemFilter%280%29.name=ListingType',
    'itemFilter%280%29.value%280%29=Auction',
    'itemFilter%280%29.value%281%29=AuctionWithBIN',
    'itemFilter%280%29.value%282%29=FixedPrice',
    'categoryId=214',
    'sortOrder=EndTimeSoonest',
    'paginationInput.entriesPerPage=8',
  ].join('&');

  const response = await fetch(`${base}?${queryStr}`);
  const text = await response.text();

  let data;
  try { data = JSON.parse(text); }
  catch (e) { throw new Error('eBay返回非JSON: ' + text.slice(0, 100)); }

  const root = data?.findItemsByKeywordsResponse?.[0];
  if (!root) throw new Error('eBay响应格式异常');

  const ack = root.ack?.[0];
  if (ack !== 'Success') {
    const errMsg = root?.errorMessage?.[0]?.error?.[0]?.message?.[0] || `eBay ack: ${ack}`;
    throw new Error(errMsg);
  }

  const items = root?.searchResult?.[0]?.item || [];
  return items.map(item => ({
    title:       item?.title?.[0] || '',
    price:       parseFloat(item?.sellingStatus?.[0]?.currentPrice?.[0]?.['__value__'] || '0'),
    currency:    item?.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || 'USD',
    url:         item?.viewItemURL?.[0] || '',
    listingType: item?.listingInfo?.[0]?.listingType?.[0] || 'Auction',
    endTime:     item?.listingInfo?.[0]?.endTime?.[0] || '',
  })).filter(r => r.price > 0);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
