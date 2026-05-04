// pages/api/radar-scan.js
// 雷达扫描 — 只用卡淘，eBay 不再用于盯梢

import { supabase } from '../../lib/supabase';
import { searchKatao } from './katao-search';

export default async function handler(req, res) {

  // GET：返回最新扫描结果
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
    const { goal_id } = req.body || {};

    // Step 1: 获取监控条目
    let watchItems = await getActiveWatchItems(goal_id || null);

    if (watchItems.length === 0 && !goal_id) {
      const rebuilt = await rebuildWatchItems();
      if (rebuilt === 0) {
        return res.status(200).json({
          success: false, scanned: 0, found: 0,
          message: '没有收集目标或缺口为空，请先创建收集目标',
        });
      }
      watchItems = await getActiveWatchItems(null);
    }

    if (watchItems.length === 0) {
      return res.status(200).json({
        success: false, scanned: 0, found: 0,
        message: goal_id ? '该目标暂无缺口监控条目，请先同步' : '监控条目重建失败，请重新同步目标',
      });
    }

    // Step 2: 单目标扫全部，全量扫描每次取前 20 条
    const BATCH = goal_id ? watchItems.length : 20;
    const batch = watchItems.slice(0, BATCH);

    let found = 0, scanned = 0, kataoFailed = false;
    const newResults = [];

    for (const item of batch) {
      const kw = (item.search_keywords_katao || '').trim();
      if (!kw) continue;

      scanned++;
      try {
        const results = await searchKatao(kw);
        found += results.length;
        for (const r of results.slice(0, 5)) {
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
      } catch (e) {
        kataoFailed = true;
        console.error(`卡淘搜索失败 "${kw}":`, e.message);
        // 如果是网络错误（Vercel 访问不到卡淘），提前终止
        if (e.message.includes('超时') || e.message.includes('fetch') || e.name === 'AbortError') {
          return res.status(200).json({
            success: false, scanned, found: 0,
            message: `卡淘访问失败（可能被 Vercel 服务器屏蔽）：${e.message}\n请查看 /api/katao-debug?keyword=加内特+prizm 确认网络连通性`,
          });
        }
      }

      await supabase.from('watch_items')
        .update({ last_scanned: new Date().toISOString() })
        .eq('id', item.id);

      await sleep(500);
    }

    // Step 3: 写入结果
    if (newResults.length > 0) {
      await supabase.from('scan_results')
        .delete().in('watch_item_id', batch.map(i => i.id));
      await supabase.from('scan_results').insert(newResults);
    }

    const remaining = watchItems.length - BATCH;
    let message;
    if (found > 0) {
      message = `✅ 找到 ${found} 个结果（扫描了 ${scanned} 条）${remaining > 0 ? `，还有 ${remaining} 条待下次扫描` : ''}`;
    } else {
      message = `扫描完成（${scanned} 条）：卡淘暂无匹配在售卡片${remaining > 0 ? `，还有 ${remaining} 条待下次` : ''}`;
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
    const missing = goal.missing_items || [];
    if (!missing.length) continue;

    const cl = goal.checklist || {};
    const playerLast = (goal.player_name || '').split(' ').pop() || '';
    const playerCn   = goal.player_name_cn || playerLast;
    const yearStr    = (cl.set_year || '').replace('-', '-').split('-').join('-');
    const setName    = cl.set_name || '';
    const seriesCn   = setName.toLowerCase().includes('prizm') ? 'prizm'
                     : setName.toLowerCase().includes('chrome') ? 'chrome'
                     : setName.toLowerCase().includes('select') ? 'select'
                     : (cl.brand || '').toLowerCase();

    const items = missing.map(item => {
      const nameCn = item.name_cn || item.name || '';
      const numStr = item.print_run ? `/${item.print_run}` : '';
      // 卡淘搜索词：中文球员名 + 系列 + 版本中文名 + 编号 + 年份
      const kataoKw = [playerCn, seriesCn, nameCn, numStr, yearStr]
        .filter(Boolean).join(' ').trim();
      const desc = [playerLast, item.name || nameCn, numStr].filter(Boolean).join(' ');

      return {
        source: 'collection_goal',
        goal_id: goal.id,
        description: desc,
        search_keywords_ebay: [playerLast, (cl.set_year||'').split('-')[0], seriesCn, item.name||'', numStr].filter(Boolean).join(' '),
        search_keywords_katao: kataoKw,
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
