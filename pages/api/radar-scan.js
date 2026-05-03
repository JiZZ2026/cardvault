// pages/api/radar-scan.js

import { supabase } from '../../lib/supabase';

const EBAY_APP_ID = process.env.EBAY_APP_ID;

export default async function handler(req, res) {

  // GET：返回最新扫描结果
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('scan_results')
      .select(`*, watch_item:watch_items(id, description, tier, search_keywords_ebay, goal:collection_goals(id, title, player_name))`)
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
    if (!EBAY_APP_ID) {
      return res.status(500).json({ success: false, error: 'eBay API 未配置（缺少 EBAY_APP_ID）' });
    }

    // ── Step 1: 获取 watch_items，为空则自动重建 ──────────────────────────────
    let watchItems = await getActiveWatchItems();

    if (watchItems.length === 0) {
      console.log('watch_items empty, rebuilding from goals...');
      const rebuilt = await rebuildWatchItems();
      if (rebuilt === 0) {
        return res.status(200).json({
          success: false,
          scanned: 0, found: 0,
          message: '没有收集目标或缺口为空，请先创建收集目标并确认有缺口卡片',
        });
      }
      watchItems = await getActiveWatchItems();
      if (watchItems.length === 0) {
        return res.status(200).json({
          success: false,
          scanned: 0, found: 0,
          message: `重建了 ${rebuilt} 个监控条目但读取失败，请刷新重试`,
        });
      }
    }

    // ── Step 2: 逐条搜索 eBay ─────────────────────────────────────────────────
    let scanned = 0, found = 0, errors = 0;
    const newResults = [];
    const errorLog = [];

    for (const item of watchItems) {
      const keyword = (item.search_keywords_ebay || '').trim();
      if (!keyword) continue;

      try {
        const results = await searchEbay(keyword);
        scanned++;

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
        found += results.length;

        await supabase.from('watch_items')
          .update({ last_scanned: new Date().toISOString() })
          .eq('id', item.id);

      } catch (e) {
        errors++;
        errorLog.push(`"${keyword}": ${e.message}`);
        console.error(`Scan failed for "${keyword}":`, e.message);
      }

      await sleep(300);
    }

    // ── Step 3: 写入扫描结果 ──────────────────────────────────────────────────
    if (newResults.length > 0) {
      const watchIds = watchItems.map(i => i.id);
      await supabase.from('scan_results').delete().in('watch_item_id', watchIds);
      const { error: insertErr } = await supabase.from('scan_results').insert(newResults);
      if (insertErr) console.error('insert scan_results failed:', insertErr.message);
    }

    // ── Step 4: 返回详细结果 ──────────────────────────────────────────────────
    let message;
    if (errors > 0 && scanned === 0) {
      message = `扫描失败（${errors} 个错误）：${errorLog[0] || ''}`;
    } else if (found > 0) {
      message = `✅ 扫描完成：搜索了 ${scanned} 个条目，找到 ${found} 个在售结果`;
    } else if (scanned > 0) {
      message = `扫描完成：搜索了 ${scanned} 个条目，eBay 暂无匹配在售卡片`;
    } else {
      message = `扫描完成：共 ${watchItems.length} 个条目，关键词全部为空`;
    }

    return res.status(200).json({
      success: true,
      scanned,
      found,
      errors,
      total_watch_items: watchItems.length,
      error_log: errorLog,
      message,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

async function getActiveWatchItems() {
  const { data, error } = await supabase
    .from('watch_items')
    .select('*')
    .eq('status', 'active')
    .limit(50);
  if (error) { console.error('getActiveWatchItems:', error.message); return []; }
  return data || [];
}

async function rebuildWatchItems() {
  const { data: goals, error } = await supabase
    .from('collection_goals')
    .select('*, checklist:checklists(id, set_name, set_year, brand)')
    .eq('status', 'active');

  if (error || !goals?.length) return 0;

  let total = 0;
  for (const goal of goals) {
    const missing = goal.missing_items || [];
    if (!missing.length) continue;

    const cl = goal.checklist || {};
    const playerLast = (goal.player_name || '').split(' ').pop() || '';
    const playerCn   = goal.player_name_cn || playerLast;
    const yearStart  = (cl.set_year || '').split('-')[0] || '';
    const setName    = cl.set_name || '';
    const seriesEn   = setName.includes('Prizm') ? 'Prizm'
                     : setName.includes('Chrome') ? 'Chrome'
                     : setName.includes('Select') ? 'Select'
                     : (cl.brand || '');
    const seriesCn   = setName.includes('Prizm') ? 'prizm'
                     : setName.includes('Chrome') ? 'chrome'
                     : seriesEn.toLowerCase();

    const items = missing.map(item => {
      const name    = item.name || '';
      const nameCn  = item.name_cn || name.toLowerCase();
      const numStr  = item.print_run ? `/${item.print_run}` : '';

      const ebayKw  = [playerLast, yearStart, seriesEn, name, numStr]
        .filter(Boolean).join(' ').trim();
      const kataoKw = [playerCn, seriesCn, nameCn, numStr]
        .filter(Boolean).join(' ').trim();
      const desc    = [playerLast, name, numStr].filter(Boolean).join(' ').trim();

      return {
        source: 'collection_goal',
        goal_id: goal.id,
        description: desc,
        search_keywords_ebay: ebayKw,
        search_keywords_katao: kataoKw,
        tier: 'must_watch',
        status: 'active',
      };
    });

    for (let i = 0; i < items.length; i += 50) {
      const { error: ie } = await supabase.from('watch_items').insert(items.slice(i, i + 50));
      if (ie) console.error('insert watch_items failed:', ie.message);
      else total += items.slice(i, i + 50).length;
    }
  }
  console.log(`rebuildWatchItems: inserted ${total} items from ${goals.length} goals`);
  return total;
}

async function searchEbay(keyword) {
  const base = 'https://svcs.ebay.com/services/search/FindingService/v1';
  const params = [
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

  const resp = await fetch(`${base}?${params}`);
  const text = await resp.text();

  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error('eBay非JSON响应: ' + text.slice(0, 80)); }

  const root = data?.findItemsByKeywordsResponse?.[0];
  if (!root) {
    // 检查是否是顶层错误（如限流）
    const topErr = data?.errorMessage?.[0]?.error?.[0];
    if (topErr) {
      const eid = topErr.errorId?.[0];
      const emsg = topErr.message?.[0] || '';
      if (eid === '10001' || emsg.includes('exceeded')) {
        throw new Error('eBay API 今日调用次数超限');
      }
      throw new Error(`eBay错误 ${eid}: ${emsg}`);
    }
    throw new Error('eBay响应结构异常: ' + JSON.stringify(data).slice(0, 120));
  }

  const ack = root.ack?.[0];
  if (ack !== 'Success') {
    const errMsg = root?.errorMessage?.[0]?.error?.[0]?.message?.[0] || `eBay ack=${ack}`;
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
