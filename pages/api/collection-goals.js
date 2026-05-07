// pages/api/collection-goals.js

import { supabase } from '../../lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('collection_goals')
      .select('*, checklist:checklists(id,set_name,set_year,brand,subset,checklist_type,items)')
      .eq('status', 'active')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json((data || []).map(g => ({
      ...g,
      owned_count: (g.owned_items || []).length,
      missing_count: (g.missing_items || []).length,
      progress_pct: g.total_items > 0
        ? Math.round(((g.owned_items || []).length / g.total_items) * 100)
        : 0,
    })));
  }

  if (req.method === 'POST') {
    const { action, id } = req.query;
    if (action === 'sync' && id) return syncOwnedCards(id, res);

    const { title, mode, player_name, player_name_cn, set_name, set_year, brand, subset, filter_condition, checklist_id } = req.body;
    if (!title || !mode || !set_name) {
      return res.status(400).json({ error: '缺少必填字段：title, mode, set_name' });
    }

    // ── 1. 获取或生成 checklist ────────────────────────────────────────────
    let checklist = null;

    if (mode === 'filtered_parallels') {
      let generated;
      try { generated = await generateChecklistWithAI(set_name, set_year, brand, subset, mode, filter_condition); }
      catch (e) { return res.status(500).json({ error: 'AI生成清单失败: ' + e.message }); }
      const filterKey = [filter_condition && filter_condition.color ? filter_condition.color : '', filter_condition && filter_condition.max_print_run ? ('pr' + filter_condition.max_print_run) : ''].filter(Boolean).join('_') || 'custom';
      const { data: newCL, error: clErr } = await supabase.from('checklists')
        .insert([{ set_name, set_year: set_year || '', brand: brand || '', subset: 'Filtered_' + filterKey, checklist_type: 'parallels', items: generated }])
        .select().single();
      if (clErr) return res.status(500).json({ error: '清单保存失败: ' + clErr.message });
      checklist = newCL;
    } else {
      if (checklist_id) {
        const { data: existing } = await supabase.from('checklists').select('*').eq('id', checklist_id).maybeSingle();
        if (existing) checklist = existing;
      }
      if (!checklist) {
        const { data: existing } = await supabase.from('checklists').select('*')
          .ilike('set_name', '%' + set_name + '%').eq('subset', subset || 'Base').maybeSingle();
        if (existing) checklist = existing;
      }
      if (!checklist) {
        let generated;
        try { generated = await generateChecklistWithAI(set_name, set_year, brand, subset, mode, null); }
        catch (e) { return res.status(500).json({ error: 'AI生成清单失败: ' + e.message }); }
        const { data: newCL, error: clErr } = await supabase.from('checklists')
          .insert([{ set_name, set_year: set_year || '', brand: brand || '', subset: subset || 'Base', checklist_type: mode === 'full_players' ? 'player_set' : 'parallels', items: generated }])
          .select().single();
        if (clErr) return res.status(500).json({ error: '清单保存失败: ' + clErr.message });
        checklist = newCL;
      }
    }

    // ── 2. 确定监控条目 ───────────────────────────────────────────────────
    let allItems = checklist.items || [];
    if (mode === 'full_parallels') allItems = allItems.filter(i => i.tier !== 'base');

    // ── 3. 比对已有卡片（严格匹配年份+系列）─────────────────────────────
    const owned = [];
    const missing = [];

    if (player_name || player_name_cn) {
      const ownedCards = await queryOwnedCards(player_name, player_name_cn, checklist);
      for (const item of allItems) {
        const isOwned = ownedCards.some(card => matchesItem(card, item, mode));
        (isOwned ? owned : missing).push({ ...item, owned: isOwned });
      }
    } else {
      allItems.forEach(i => missing.push({ ...i, owned: false }));
    }

    // ── 4. 创建目标 ───────────────────────────────────────────────────────
    const { data: goal, error: goalErr } = await supabase.from('collection_goals')
      .insert([{
        title, mode, checklist_id: checklist.id,
        player_name: player_name || null,
        player_name_cn: player_name_cn || null,
        filter_condition: filter_condition || null,
        total_items: owned.length + missing.length,
        owned_items: owned.filter(i => i.owned),
        missing_items: missing,
        status: 'active', priority: 0,
      }]).select().single();

    if (goalErr) return res.status(500).json({ error: goalErr.message });

    if (missing.length > 0) await generateWatchItems(goal.id, goal, missing, checklist);

    return res.status(201).json({ ...goal, owned_count: owned.filter(i => i.owned).length, missing_count: missing.length, total_items: owned.length + missing.length, checklist });
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: '缺少 id' });
    const { data, error } = await supabase.from('collection_goals')
      .update({ ...req.body, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: '缺少 id' });
    const { error } = await supabase.from('collection_goals').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── 查询已拥有的卡（严格匹配年份+系列）─────────────────────────────────────
async function queryOwnedCards(player_name, player_name_cn, checklist) {
  const conds = [];
  if (player_name) conds.push('player.ilike.%' + player_name + '%');
  if (player_name_cn) conds.push('player.ilike.%' + player_name_cn + '%');

  let q = supabase.from('cards').select('*');
  if (conds.length > 0) q = q.or(conds.join(','));

  // 严格过滤年份 — 只拿该赛季的卡
  if (checklist && checklist.set_year) {
    const yearStart = checklist.set_year.split('-')[0]; // "2020"
    const yearEnd = checklist.set_year.split('-')[1];   // "21"
    // 用更精确的匹配，如 "2020-21" 而不只是 "2020"
    if (yearEnd) {
      q = q.ilike('year', '%' + yearStart + '-' + yearEnd + '%');
    } else {
      q = q.ilike('year', '%' + yearStart + '%');
    }
  }

  // 也过滤系列名
  if (checklist && checklist.set_name) {
    const seriesKeyword = checklist.set_name.replace(/^\d{4}-\d{2,4}\s*/, '').replace(/\b(Basketball|NBA)\b/gi, '').trim().split(' ')[0];
    if (seriesKeyword.length > 2) {
      q = q.ilike('series', '%' + seriesKeyword + '%');
    }
  }

  const { data } = await q;
  return data || [];
}

// ── 精确匹配函数 ──────────────────────────────────────────────────────────────
function matchesItem(card, item, mode) {
  if (mode === 'full_players') {
    return (card.player || '').toLowerCase().includes((item.name || '').toLowerCase().split(' ').pop());
  }

  const cp = (card.parallel || card.variation || '').toLowerCase().trim();
  if (!cp) return false;

  const iName = (item.name || '').toLowerCase().trim();
  const iCn = (item.name_cn || '').toLowerCase().trim();

  // 精确匹配
  if (cp === iName) return true;

  // 包含匹配 + 严格长度比例（≥0.75）防止 "gold refractor" 匹配 "geometric gold refractor"
  if (iName.length > 2 && cp.includes(iName)) {
    if (iName.length / cp.length >= 0.75) return true;
  }
  if (cp.length > 2 && iName.includes(cp)) {
    if (cp.length / iName.length >= 0.75) return true;
  }

  // 中文名精确匹配
  if (iCn.length > 1 && cp === iCn) return true;
  if (iCn.length > 1 && cp.includes(iCn) && iCn.length / cp.length >= 0.75) return true;

  return false;
}

// ── 生成 watch_items（含优化的卡淘搜索词）────────────────────────────────────
async function generateWatchItems(goalId, goal, missingItems, checklist) {
  const cl = checklist || {};
  const playerLast = (goal.player_name || '').split(' ').pop() || '';
  const playerCn = goal.player_name_cn || '';

  // 年份简写：2020-21 → 20-21
  const setYear = cl.set_year || '';
  const yearShort = setYear.replace(/^20(\d{2})-(\d{2,4}).*$/, '$1-$2'); // "20-21"
  const yearStart = setYear.split('-')[0]; // "2020"

  // 系列关键词
  const setName = cl.set_name || '';
  const seriesEn = setName.includes('Prizm') ? 'Prizm'
    : setName.includes('Chrome') ? 'Chrome'
    : setName.includes('Select') ? 'Select'
    : setName.includes('Hoops') ? 'Hoops'
    : (cl.brand || '');
  const seriesCn = seriesEn.toLowerCase();

  const items = missingItems.map(item => {
    const name = item.name || '';
    const nameCn = item.name_cn || '';
    const numStr = item.print_run ? ('/' + item.print_run) : '';

    // eBay 关键词：球员姓+年份+系列英文名+平行英文名+编号
    const ebayKw = [playerLast, yearStart, seriesEn, name, numStr].filter(Boolean).join(' ');

    // 卡淘关键词：中文球员名+系列+中文平行名+编号+短年份
    // 优先用中文名，关键词精简（3-4个词）
    const kataoParts = [];
    if (playerCn) kataoParts.push(playerCn);
    kataoParts.push(seriesCn);
    if (nameCn) kataoParts.push(nameCn);
    else kataoParts.push(name.toLowerCase());
    if (numStr) kataoParts.push(numStr);
    if (yearShort) kataoParts.push(yearShort);
    const kataoKw = kataoParts.filter(Boolean).join(' ');

    const desc = [playerLast, nameCn || name, numStr].filter(Boolean).join(' ');

    return {
      source: 'collection_goal',
      goal_id: goalId,
      description: desc,
      search_keywords_ebay: ebayKw,
      search_keywords_katao: kataoKw,
      tier: 'must_watch',
      status: 'active',
    };
  });

  for (let i = 0; i < items.length; i += 50) {
    await supabase.from('watch_items').insert(items.slice(i, i + 50));
  }
}

// ── 同步已有卡片 ──────────────────────────────────────────────────────────────
async function syncOwnedCards(goalId, res) {
  const { data: goal, error: ge } = await supabase.from('collection_goals')
    .select('*, checklist:checklists(*)').eq('id', goalId).single();
  if (ge) return res.status(500).json({ error: ge.message });

  const cl = goal.checklist;
  if (!cl) return res.status(400).json({ error: '没有关联清单' });

  const ownedCards = await queryOwnedCards(goal.player_name, goal.player_name_cn, cl);

  const owned = [], missing = [];
  for (const item of (cl.items || [])) {
    const isOwned = ownedCards.some(card => matchesItem(card, item, goal.mode));
    (isOwned ? owned : missing).push({ ...item, owned: isOwned });
  }

  const { data, error } = await supabase.from('collection_goals')
    .update({ owned_items: owned.filter(i => i.owned), missing_items: missing, total_items: (cl.items || []).length, updated_at: new Date().toISOString() })
    .eq('id', goalId).select().single();
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('watch_items').delete().eq('goal_id', goalId);
  if (missing.length > 0) await generateWatchItems(goalId, { ...goal, checklist: cl }, missing, cl);

  return res.status(200).json({ ...data, owned_count: owned.filter(i => i.owned).length, missing_count: missing.length });
}

// ── AI 生成清单 ───────────────────────────────────────────────────────────────
function applyFilter(items, cond) {
  return items.filter(item => {
    if (item.tier === 'base') return false;
    if (cond.color) {
      const c = cond.color.toLowerCase();
      if (!item.name.toLowerCase().includes(c) && !(item.name_cn || '').includes(cond.color)) return false;
    }
    if (cond.max_print_run !== undefined) {
      if (!item.numbered || item.print_run === null) return false;
      if (item.print_run > cond.max_print_run) return false;
    }
    return true;
  });
}

async function generateChecklistWithAI(set_name, set_year, brand, subset, mode, filter_condition) {
  let prompt;
  if (mode === 'full_players') {
    prompt = '你是球星卡专家。完整列出 "' + set_name + '" 系列 "' + (subset || 'Base') + '" 子集的所有球员名单。返回纯JSON数组，每项：{"number":卡号整数,"name":"球员英文全名","name_cn":"球员中文名","team":"球队英文名"}。只返回JSON数组。';
  } else if (mode === 'filtered_parallels' && filter_condition) {
    const fc = filter_condition;
    const printRun = fc.max_print_run ? parseInt(fc.max_print_run) : null;
    const color = fc.color || null;
    let condDesc = '';
    if (printRun && color) condDesc = '颜色含"' + color + '"且编号恰好为 /' + printRun;
    else if (printRun) condDesc = '编号恰好为 /' + printRun + ' 的所有平行版本（不限颜色）';
    else if (color) condDesc = '颜色含"' + color + '"的所有平行版本';
    else condDesc = '所有平行版本';
    prompt = '你是球星卡专家。列出 "' + set_name + '"（' + (set_year || '') + '赛季）中，' + condDesc + '。务必穷举所有变体。' + (printRun ? '只列编号恰好是 /' + printRun + ' 的版本。' : '') + '返回纯JSON数组，每项：{"name":"版本英文名","name_cn":"版本中文名","numbered":true,"print_run":' + (printRun || '编号数量') + ',"tier":"common/numbered/premium/ultra/1of1"}。只返回JSON数组。';
  } else {
    prompt = '你是球星卡专家。完整列出 "' + set_name + '"（' + (set_year || '') + '赛季）' + (subset && subset !== 'Base' ? '"' + subset + '" 子集' : 'Base 系列') + '的所有平行折射版本，务必穷举不遗漏。返回纯JSON数组，每项：{"name":"版本英文名","name_cn":"版本中文名","numbered":true或false,"print_run":编号数量或null,"tier":"base/common/numbered/premium/ultra/1of1"}。tier: base=基础版 common=无编号 numbered=编号>50 premium=编号6-50 ultra=编号2-5 1of1=限量1。只返回JSON数组。';
  }

  const r = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: prompt }],
  });

  return extractJsonArray(r);
}

function extractJsonArray(response) {
  const textBlocks = response.content.filter(b => b.type === 'text').map(b => b.text);
  for (const text of textBlocks) {
    const allArrays = [];
    let depth = 0, start = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '[') { if (depth === 0) start = i; depth++; }
      else if (text[i] === ']') { depth--; if (depth === 0 && start !== -1) { allArrays.push(text.slice(start, i + 1)); start = -1; } }
    }
    const candidates = allArrays
      .map(s => { try { const p = JSON.parse(s); return (Array.isArray(p) && p.length > 0 && p[0] && p[0].name) ? p : null; } catch (e) { return null; } })
      .filter(Boolean).sort((a, b) => b.length - a.length);
    if (candidates.length > 0) return candidates[0];
  }
  throw new Error('AI未返回有效JSON数组');
}
