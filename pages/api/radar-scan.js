// pages/api/radar-scan.js
// 雷达扫描 — 只用卡淘，eBay 不再用于盯梢

import { supabase } from '../../lib/supabase';
import { searchKatao } from './katao-search';

const AUTO_KEYWORDS = ['autograph', ' auto ', 'auto/', '签字', '签名', 'inscription'];
function isAutoCard(title) {
  const t = title.toLowerCase();
  return AUTO_KEYWORDS.some(kw => t.includes(kw));
}

export default async function handler(req, res) {

  // GET：返回最新在售扫描结果
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('scan_results')
      .select(`*, watch_item:watch_items(
        id, description, tier, search_keywords_katao,
        goal:collection_goals(id, title, player_name)
      )`)
      .eq('dismissed', false)
      .order('scanned_at', { ascending: false })
      .limit(200);

    if (error) return res.status(500).json({ error: error.message });

    // Load active investments for signal tagging
    let investMap = {};
    try {
      const { data: investments } = await supabase
        .from('player_investments')
        .select('id, player_name, player_name_cn, exit_rules, action_score, status_signal')
        .eq('status', 'active');
      (investments || []).forEach(inv => {
        const names = [inv.player_name, inv.player_name_cn].filter(Boolean).map(n => n.toLowerCase());
        names.forEach(n => { investMap[n] = inv; });
      });
    } catch (e) { console.error('Investment load for signals:', e.message); }

    const grouped = {};
    for (const r of (data || [])) {
      const wid = r.watch_item_id;
      if (!grouped[wid]) grouped[wid] = { watch_item: r.watch_item, results: [] };
      if (grouped[wid].results.length < 10) {
        // Tag results with investment signals
        let signal = null;
        const wi = r.watch_item;
        const playerName = wi?.goal?.player_name || wi?.description?.replace('INV: ', '') || '';
        const matchedInv = investMap[playerName.toLowerCase()];
        if (matchedInv && r.price) {
          const price = Number(r.price);
          const exit = matchedInv.exit_rules && !Array.isArray(matchedInv.exit_rules) ? matchedInv.exit_rules : null;
          if (exit) {
            if (exit.stop_loss && price > 0) signal = 'normal';
            if (exit.profit_target && price > 0) signal = 'normal';
          }
          if (matchedInv.action_score != null) {
            if (matchedInv.action_score >= 60) signal = 'buy_opportunity';
            else if (matchedInv.action_score < 40) signal = 'sell_window';
          }
        }
        grouped[wid].results.push({ ...r, investment_signal: signal, matched_investment: matchedInv ? { action_score: matchedInv.action_score, status_signal: matchedInv.status_signal } : null });
      }
    }
    const items = Object.values(grouped);

    // Count signals for summary
    let buyOpportunities = 0, sellWindows = 0;
    items.forEach(g => g.results.forEach(r => {
      if (r.investment_signal === 'buy_opportunity') buyOpportunities++;
      if (r.investment_signal === 'sell_window') sellWindows++;
    }));

    // Sort: buy opportunities first, then sell windows, then normal
    const sortKey = (g) => {
      const hasBuy = g.results.some(r => r.investment_signal === 'buy_opportunity');
      const hasSell = g.results.some(r => r.investment_signal === 'sell_window');
      if (hasBuy) return 0;
      if (hasSell) return 1;
      return 2;
    };
    items.sort((a, b) => sortKey(a) - sortKey(b));

    return res.status(200).json({
      mustWatch: items.filter(i => i.watch_item?.tier === 'must_watch'),
      niceToHave: items.filter(i => i.watch_item?.tier === 'nice_to_have'),
      lastScanned: data?.[0]?.scanned_at || null,
      total: data?.length || 0,
      summary: { buyOpportunities, sellWindows, totalResults: data?.length || 0 },
    });
  }

  // POST：触发扫描 或 查询已售
  if (req.method === 'POST') {
    const { goal_id, action } = req.body || {};

    // ── 已售查询：不写 DB，直接返回搜索结果 ─────────────────────────────────
    if (action === 'sold') {
      const watchItems = await getActiveWatchItems(goal_id || null);
      if (!watchItems.length) {
        return res.status(200).json({ success: false, results: [], message: '无监控条目，请先同步目标' });
      }

      // 查目标的 filter_condition，决定是否过滤签字卡
      let includeAutos = false;
      if (goal_id) {
        const { data: goalData } = await supabase
          .from('collection_goals')
          .select('filter_condition')
          .eq('id', goal_id)
          .single();
        includeAutos = goalData?.filter_condition?.include_autos === true;
      }

      const results = [];
      const seen = new Set();
      for (const item of watchItems) {
        const kw = (item.search_keywords_katao || '').trim();
        if (!kw || seen.has(kw)) continue;
        seen.add(kw);
        try {
          const hits = await searchKatao(kw, true); // sold=true
          for (const r of hits) {
            // 根据目标的 include_autos 设置决定是否过滤
            if (!includeAutos && isAutoCard(r.title)) continue;
            results.push({
              id: r.id,
              title: r.title,
              price: r.price,
              price_currency: 'RMB',
              listing_url: r.url,
              image_url: r.image || null,
              listing_type: r.listingType || 'buy_now',
              platform: 'katao',
              watch_item_description: item.description,
            });
          }
        } catch (e) {
          console.error(`已售搜索失败 "${kw}":`, e.message);
        }
        await sleep(300);
      }

      return res.status(200).json({
        success: true,
        results,
        total: results.length,
        message: results.length > 0 ? `找到 ${results.length} 条已售记录` : '暂无已售记录',
      });
    }

    // ── 在售扫描 ──────────────────────────────────────────────────────────────
    let watchItems = await getActiveWatchItems(goal_id || null);

    if (watchItems.length === 0 && !goal_id) {
      const rebuilt = await rebuildWatchItems();
      const investRebuilt = await rebuildInvestmentWatchItems();
      if (rebuilt === 0 && investRebuilt === 0) {
        return res.status(200).json({
          success: false, scanned: 0, found: 0,
          message: '没有收集目标或投资追踪，请先创建',
        });
      }
      watchItems = await getActiveWatchItems(null);
    }

    if (watchItems.length === 0) {
      return res.status(200).json({
        success: false, scanned: 0, found: 0,
        message: goal_id ? '该目标暂无监控条目，请先同步' : '监控条目重建失败，请重新同步目标',
      });
    }

    const BATCH = goal_id ? watchItems.length : 20;
    const batch = watchItems.slice(0, BATCH);

    let found = 0, scanned = 0;
    const newResults = [];
    const seenKw = new Set();

    for (const item of batch) {
      const kw = (item.search_keywords_katao || '').trim();
      if (!kw) continue;

      if (seenKw.has(kw)) {
        console.log(`[radar-scan] 跳过重复关键词: "${kw}"`);
        continue;
      }
      seenKw.add(kw);
      scanned++;

      try {
        const results = await searchKatao(kw, false);
        found += results.length;
        for (const r of results.slice(0, 10)) {
          newResults.push({
            watch_item_id: item.id,
            platform: 'katao',
            title: r.title,
            price: r.price,
            price_currency: 'RMB',
            listing_url: r.url || '',
            image_url: r.image || null,
            listing_type: r.listingType || 'auction',
            bid_count: r.bidCount || 0,
            time_remaining: r.timeLeft || '',
            is_new: true,
            dismissed: false,
          });
        }
      } catch (e) {
        console.error(`卡淘搜索失败 "${kw}":`, e.message);
        if (e.message.includes('超时') || e.message.includes('fetch') || e.name === 'AbortError') {
          return res.status(200).json({
            success: false, scanned, found: 0,
            message: `卡淘访问失败：${e.message}`,
          });
        }
      }

      await supabase.from('watch_items')
        .update({ last_scanned: new Date().toISOString() })
        .eq('id', item.id);

      await sleep(500);
    }

    if (newResults.length > 0) {
      const affectedIds = [...new Set(newResults.map(r => r.watch_item_id))];
      await supabase.from('scan_results').delete().in('watch_item_id', affectedIds);
      await supabase.from('scan_results').insert(newResults);
    }

    const remaining = watchItems.length - BATCH;
    let message;
    if (found > 0) {
      message = `✅ 找到 ${found} 个结果（搜索了 ${scanned} 个关键词）${remaining > 0 ? `，还有 ${remaining} 条待下次` : ''}`;
    } else {
      message = `扫描完成（${scanned} 个关键词）：卡淘暂无匹配在售卡片`;
    }

    return res.status(200).json({ success: true, scanned, found, message });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function getActiveWatchItems(goal_id = null) {
  let q = supabase.from('watch_items').select('*').eq('status', 'active');
  if (goal_id) q = q.eq('goal_id', goal_id);
  q = q.limit(goal_id ? 200 : 50);
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
    if (goal.mode === 'full_players') continue;

    const cl = goal.checklist || {};
    const playerCn = goal.player_name_cn || (goal.player_name || '').split(' ').pop() || '';
    const setName = cl.set_name || '';
    const yearParts = (cl.set_year || '').split('-');
    const yearShort = yearParts.length >= 2
      ? yearParts[0].slice(-2) + '-' + yearParts[1].slice(-2)
      : yearParts[0] || '';
    const seriesEn = setName.includes('Prizm') ? 'Prizm'
      : setName.includes('Chrome') ? 'Chrome'
      : setName.includes('Select') ? 'Select'
      : (cl.brand || '');
    const seriesCn = seriesEn.toLowerCase();
    const yearStart = yearParts[0] || '';

    const fc = goal.filter_condition || {};
    const numStr = fc.max_print_run ? ('/' + fc.max_print_run) : '';

    const kataoKw = [playerCn, yearShort, seriesCn, numStr].filter(Boolean).join(' ').trim();
    const ebayKw = [(goal.player_name || '').split(' ').pop(), yearStart, seriesEn, numStr].filter(Boolean).join(' ');

    if (!kataoKw) continue;

    const { data: existing } = await supabase.from('watch_items')
      .select('id').eq('goal_id', goal.id).limit(1);
    if (existing?.length) continue;

    const { error } = await supabase.from('watch_items').insert([{
      source: 'collection_goal',
      goal_id: goal.id,
      description: goal.title || kataoKw,
      search_keywords_ebay: ebayKw,
      search_keywords_katao: kataoKw,
      tier: 'must_watch',
      status: 'active',
    }]);
    if (!error) total++;
  }
  return total;
}

async function rebuildInvestmentWatchItems() {
  const { data: investments } = await supabase
    .from('player_investments')
    .select('*')
    .eq('status', 'active');

  if (!investments?.length) return 0;
  let total = 0;

  for (const inv of investments) {
    const { data: existing } = await supabase.from('watch_items')
      .select('id').eq('source', 'investment').eq('description', `INV: ${inv.player_name_cn || inv.player_name}`).limit(1);
    if (existing?.length) continue;

    const playerCn = inv.player_name_cn || '';
    const playerEn = inv.player_name || '';
    const meta = inv.player_meta || {};
    const yearShort = meta.year_short || '';
    const brand = meta.brand || 'prizm';

    const kataoKw = [playerCn, yearShort, brand.toLowerCase()].filter(Boolean).join(' ').trim();
    if (!kataoKw) continue;

    const ebayKw = [playerEn.split(' ').pop(), yearShort, brand].filter(Boolean).join(' ');

    const { error } = await supabase.from('watch_items').insert([{
      source: 'investment',
      goal_id: null,
      description: `INV: ${inv.player_name_cn || inv.player_name}`,
      search_keywords_ebay: ebayKw,
      search_keywords_katao: kataoKw,
      tier: 'must_watch',
      status: 'active',
      meta: { investment_id: inv.id, player_name: inv.player_name, exit_rules: inv.exit_rules },
    }]);
    if (!error) total++;
  }
  return total;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
