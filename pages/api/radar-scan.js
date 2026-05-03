// pages/api/radar-scan.js

import { supabase } from '../../lib/supabase';
import { searchKatao } from './katao-search';

const EBAY_APP_ID = process.env.EBAY_APP_ID;

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('scan_results')
      .select(`*, watch_item:watch_items(id, description, tier, search_keywords_ebay, search_keywords_katao, goal:collection_goals(id, title, player_name))`)
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

  if (req.method === 'POST') {
    const { goal_id } = req.body || {};

    // ── Step 1: 获取 watch_items（可指定单个目标）────────────────────────────
    let watchItems = await getActiveWatchItems(goal_id || null);

    if (watchItems.length === 0 && !goal_id) {
      // 全量扫描时，watch_items 为空则自动重建
      const rebuilt = await rebuildWatchItems();
      if (rebuilt === 0) {
        return res.status(200).json({ success: false, scanned: 0, found: 0, message: '没有收集目标或缺口为空，请先创建收集目标' });
      }
      watchItems = await getActiveWatchItems(null);
    }

    if (watchItems.length === 0) {
      return res.status(200).json({ success: false, scanned: 0, found: 0, message: goal_id ? '该目标暂无缺口监控条目，请先同步' : '监控条目重建失败，请重新同步目标' });
    }

    // ── Step 2: 单目标扫全部，全量扫描每次只取 10 条 ─────────────────────────
    const BATCH_SIZE = goal_id ? watchItems.length : 10;
    const batchItems = watchItems.slice(0, BATCH_SIZE);

    let ebayRateLimited = false;
    let scanned = 0, found = 0, errors = 0;
    const newResults = [];
    const messages = [];

    for (const item of batchItems) {
      // ── 卡淘搜索（优先，不受限流影响）────────────────────────────────────────
      const kataoKw = (item.search_keywords_katao || item.search_keywords_ebay || '').trim();
      if (kataoKw) {
        try {
          const kataoResults = await searchKatao(kataoKw, false);
          for (const r of kataoResults.slice(0, 5)) {
            newResults.push({
              watch_item_id: item.id,
              platform: 'katao',
              title: r.title,
              price: r.price,
              price_currency: 'RMB',
              listing_url: r.url || '',
              listing_type: 'auction',
              is_new: true,
              dismissed: false,
            });
          }
          found += kataoResults.length;
          if (kataoResults.length > 0) {
            messages.push(`卡淘「${item.description}」: ${kataoResults.length} 条`);
          }
        } catch (e) {
          // 卡淘失败不影响 eBay（可能是网络问题）
          console.error(`卡淘搜索失败 "${kataoKw}":`, e.message);
        }
      }

      // ── eBay 搜索（遇限流立即停止）───────────────────────────────────────────
      if (!ebayRateLimited && EBAY_APP_ID) {
        const ebayKw = (item.search_keywords_ebay || '').trim();
        if (ebayKw) {
          try {
            const ebayResults = await searchEbay(ebayKw);
            scanned++;
            for (const r of ebayResults.slice(0, 5)) {
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
            found += ebayResults.length;
          } catch (e) {
            if (e.message.includes('超限') || e.message.includes('exceeded') || e.message.includes('RateLimit')) {
              ebayRateLimited = true;
              messages.push('eBay 今日调用次数超限，已停止 eBay 搜索，卡淘搜索继续');
            } else {
              errors++;
              console.error(`eBay搜索失败 "${ebayKw}":`, e.message);
            }
          }
          await sleep(1000); // eBay 之间间隔 1 秒，比之前的 300ms 更保守
        }
      }

      await supabase.from('watch_items')
        .update({ last_scanned: new Date().toISOString() })
        .eq('id', item.id);
    }

    // ── Step 3: 写入结果 ──────────────────────────────────────────────────────
    if (newResults.length > 0) {
      await supabase.from('scan_results')
        .delete()
        .in('watch_item_id', batchItems.map(i => i.id));
      await supabase.from('scan_results').insert(newResults);
    }

    // ── Step 4: 汇总消息 ──────────────────────────────────────────────────────
    const remaining = watchItems.length - BATCH_SIZE;
    let summary;
    if (found > 0) {
      summary = `✅ 找到 ${found} 个结果（本批 ${batchItems.length} 条）${remaining > 0 ? `，还有 ${remaining} 条待下次扫描` : ''}`;
    } else if (ebayRateLimited) {
      summary = `卡淘已扫描 ${batchItems.length} 条，eBay 超限暂停。${found === 0 ? '暂无匹配在售卡片' : ''}`;
    } else {
      summary = `扫描完成（本批 ${batchItems.length} 条）：eBay + 卡淘均暂无匹配结果`;
    }

    if (messages.length > 0) summary += '\n' + messages.join('\n');

    return res.status(200).json({
      success: true,
      scanned,
      found,
      errors,
      total_watch_items: watchItems.length,
      ebay_rate_limited: ebayRateLimited,
      message: summary,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

async function getActiveWatchItems(goal_id = null) {
  let q = supabase.from('watch_items').select('*').eq('status', 'active');
  if (goal_id) q = q.eq('goal_id', goal_id);
  q = q.limit(goal_id ? 200 : 50); // 单目标不限条数
  const { data, error } = await q;
  if (error) { console.error('getActiveWatchItems:', error.message); return []; }
  return data || [];
}

async function rebuildWatchItems() {
  const { data: goals } = await supabase
    .from('collection_goals')
    .select('*, checklist:checklists(id, set_name, set_year, brand)')
    .eq('status', 'active');

  if (!goals?.length) return 0;

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
    const seriesCn   = seriesEn.toLowerCase();

    const items = missing.map(item => {
      const name   = item.name || '';
      const nameCn = item.name_cn || name.toLowerCase();
      const numStr = item.print_run ? `/${item.print_run}` : '';
      return {
        source: 'collection_goal',
        goal_id: goal.id,
        description: [playerLast, name, numStr].filter(Boolean).join(' '),
        search_keywords_ebay:  [playerLast, yearStart, seriesEn, name, numStr].filter(Boolean).join(' '),
        search_keywords_katao: [playerCn, seriesCn, nameCn, numStr].filter(Boolean).join(' '),
        tier: 'must_watch',
        status: 'active',
      };
    });

    for (let i = 0; i < items.length; i += 50) {
      const { error } = await supabase.from('watch_items').insert(items.slice(i, i + 50));
      if (!error) total += items.slice(i, i + 50).length;
    }
  }
  return total;
}

async function searchEbay(keyword) {
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

  const resp = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${params}`);
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('eBay非JSON响应'); }

  const root = data?.findItemsByKeywordsResponse?.[0];
  if (!root) {
    const topErr = data?.errorMessage?.[0]?.error?.[0];
    if (topErr) {
      const eid = topErr.errorId?.[0];
      const emsg = topErr.message?.[0] || '';
      if (eid === '10001' || emsg.includes('exceeded')) throw new Error('eBay API 今日调用次数超限');
      throw new Error(`eBay错误 ${eid}: ${emsg}`);
    }
    throw new Error('eBay响应结构异常');
  }

  const ack = root.ack?.[0];
  if (ack !== 'Success') {
    const errMsg = root?.errorMessage?.[0]?.error?.[0]?.message?.[0] || `ack=${ack}`;
    if (errMsg.includes('exceeded') || errMsg.includes('RateLimit')) throw new Error('eBay API 今日调用次数超限');
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
