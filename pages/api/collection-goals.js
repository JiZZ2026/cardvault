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

    // 同步已拥有的卡
    if (action === 'sync' && id) return syncOwnedCards(id, res);

    const { title, mode, player_name, player_name_cn, set_name, set_year, brand, subset, filter_condition, checklist_id } = req.body;

    if (!title || !mode || !set_name) {
      return res.status(400).json({ error: '缺少必填字段：title, mode, set_name' });
    }

    // ── 1. 查找或生成 checklist ──────────────────────────────────────────────
    let checklist = null;

    // 优先用传入的 checklist_id
    if (checklist_id) {
      const { data: existing } = await supabase.from('checklists').select('*').eq('id', checklist_id).maybeSingle();
      if (existing) checklist = existing;
    }

    // 条件筛选模式：不复用通用清单，直接生成针对性清单
    if (!checklist && mode === 'filtered_parallels') {
      let generated;
      try {
        generated = await generateChecklistWithAI(set_name, set_year, brand, subset, mode, filter_condition);
      } catch (e) {
        return res.status(500).json({ error: 'AI生成清单失败: ' + e.message });
      }
      const filterKey = [
        filter_condition?.color || '',
        filter_condition?.max_print_run ? `max${filter_condition.max_print_run}` : '',
      ].filter(Boolean).join('_');
      const subsetKey = filterKey ? `Filtered_${filterKey}` : 'Filtered';
      const { data: newCL, error: clErr } = await supabase
        .from('checklists')
        .insert([{ set_name, set_year: set_year || '', brand: brand || '', subset: subsetKey, checklist_type: 'parallels', items: generated }])
        .select().single();
      if (clErr) return res.status(500).json({ error: '清单保存失败: ' + clErr.message });
      checklist = newCL;
    }

    // 全平行 / 全球员模式：复用或新建通用清单
    if (!checklist) {
      const { data: existing } = await supabase
        .from('checklists').select('*')
        .ilike('set_name', `%${set_name}%`)
        .eq('subset', subset || 'Base')
        .maybeSingle();

      if (existing) {
        checklist = existing;
      } else {
        let generated;
        try {
          generated = await generateChecklistWithAI(set_name, set_year, brand, subset, mode, null);
        } catch (e) {
          return res.status(500).json({ error: 'AI生成清单失败: ' + e.message });
        }
        const { data: newCL, error: clErr } = await supabase
          .from('checklists')
          .insert([{ set_name, set_year: set_year || '', brand: brand || '', subset: subset || 'Base', checklist_type: mode === 'full_players' ? 'player_set' : 'parallels', items: generated }])
          .select().single();
        if (clErr) return res.status(500).json({ error: '清单保存失败: ' + clErr.message });
        checklist = newCL;
      }
    }

    // ── 2. 确定需要监控的条目 ─────────────────────────────────────────────────
    let allItems = checklist.items || [];
    if (mode === 'full_parallels') {
      allItems = allItems.filter(i => i.tier !== 'base');
    } else if (mode === 'filtered_parallels') {
      // 如果是针对性生成的清单，直接用全部；如果是通用清单，再过滤
      if (checklist.subset && checklist.subset.startsWith('Filtered')) {
        // 已经是针对性清单，不需要再过滤
      } else {
        allItems = applyFilter(allItems, filter_condition || {});
      }
    }

    // ── 3. 比对 cards 表，区分 owned / missing ────────────────────────────────
    const owned = [];
    const missing = [];

    if (player_name || player_name_cn) {
      let q = supabase.from('cards').select('*');
      const conditions = [];
      if (player_name) conditions.push(`player.ilike.%${player_name}%`);
      if (player_name_cn) conditions.push(`player.ilike.%${player_name_cn}%`);
      q = q.or(conditions.join(','));
      if (set_year) q = q.ilike('year', `%${set_year.split('-')[0]}%`);
      const { data: ownedCards } = await q;

      for (const item of allItems) {
        const isOwned = (ownedCards || []).some(card => matchesItem(card, item, mode));
        if (isOwned) owned.push({ ...item, owned: true });
        else missing.push({ ...item, owned: false });
      }
    } else {
      allItems.forEach(i => missing.push({ ...i, owned: false }));
    }

    // ── 4. 创建 collection_goal ───────────────────────────────────────────────
    const { data: goal, error: goalErr } = await supabase
      .from('collection_goals')
      .insert([{
        title, mode,
        checklist_id: checklist.id,
        player_name: player_name || null,
        player_name_cn: player_name_cn || null,
        filter_condition: filter_condition || null,
        total_items: owned.length + missing.length,
        owned_items: owned,
        missing_items: missing,
        status: 'active',
        priority: 0,
      }])
      .select().single();

    if (goalErr) return res.status(500).json({ error: goalErr.message });

    // ── 5. 生成 watch_items ───────────────────────────────────────────────────
    if (missing.length > 0) {
      const watchItems = missing.map(item => ({
        source: 'collection_goal',
        goal_id: goal.id,
        description: buildDescription(goal, item),
        search_keywords_ebay: buildEbayKw(goal, item, checklist),
        search_keywords_katao: buildKataoKw(goal, item, checklist),
        tier: 'must_watch',
        status: 'active',
      }));
      for (let i = 0; i < watchItems.length; i += 50) {
        await supabase.from('watch_items').insert(watchItems.slice(i, i + 50));
      }
    }

    return res.status(201).json({
      ...goal,
      owned_count: owned.length,
      missing_count: missing.length,
      total_items: owned.length + missing.length,
      checklist,
    });
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: '缺少 id' });
    const { data, error } = await supabase
      .from('collection_goals')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
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

  res.status(405).json({ error: 'Method not allowed' });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyFilter(items, cond) {
  return items.filter(item => {
    if (item.tier === 'base') return false;
    if (cond.color) {
      const c = cond.color.toLowerCase();
      if (!item.name.toLowerCase().includes(c) && !(item.name_cn||'').includes(cond.color)) return false;
    }
    if (cond.max_print_run !== undefined) {
      if (!item.numbered || item.print_run === null) return false;
      if (item.print_run > cond.max_print_run) return false;
    }
    return true;
  });
}

function matchesItem(card, item, mode) {
  if (mode === 'full_players') {
    return (card.player||'').toLowerCase().includes((item.name||'').toLowerCase().split(' ').pop());
  }
  const cp = (card.parallel || card.variation || '').toLowerCase();
  const iName = (item.name||'').toLowerCase();
  const iCn = (item.name_cn||'').toLowerCase();
  if (iName.length > 2 && cp.includes(iName)) return true;
  if (iCn.length > 1 && cp.includes(iCn)) return true;
  if (item.numbered && item.print_run && (card.numbered||'').includes(`/${item.print_run}`)) return true;
  return false;
}

function buildDescription(goal, item) {
  if (goal.mode === 'full_players') return `${goal.title} — ${item.name}`;
  const parts = [];
  if (goal.player_name) parts.push(goal.player_name.split(' ').pop());
  parts.push(item.name_cn || item.name);
  if (item.numbered && item.print_run) parts.push(`/${item.print_run}`);
  return parts.filter(Boolean).join(' ');
}

function buildEbayKw(goal, item, cl) {
  const parts = [];
  if (goal.player_name) parts.push(goal.player_name.split(' ').pop());
  if (cl.set_year) parts.push(cl.set_year.split('-')[0]);
  if (cl.set_name.includes('Prizm')) parts.push('Prizm');
  else if (cl.set_name.includes('Chrome')) parts.push('Chrome');
  else if (cl.brand) parts.push(cl.brand);
  if (goal.mode !== 'full_players') {
    parts.push(item.name);
    if (item.numbered && item.print_run) parts.push(`/${item.print_run}`);
  } else {
    parts.push((item.name||'').split(' ').pop());
  }
  return parts.filter(Boolean).join(' ');
}

function buildKataoKw(goal, item, cl) {
  const parts = [];
  if (goal.player_name_cn) parts.push(goal.player_name_cn);
  else if (goal.player_name) parts.push(goal.player_name.split(' ').pop());
  if (cl.set_name.includes('Prizm')) parts.push('prizm');
  else if (cl.set_name.includes('Chrome')) parts.push('chrome');
  if (goal.mode !== 'full_players') {
    parts.push(item.name_cn || item.name.toLowerCase());
    if (item.numbered && item.print_run) parts.push(`/${item.print_run}`);
  } else {
    parts.push(item.name_cn || (item.name||'').split(' ').pop());
  }
  return parts.filter(Boolean).join(' ');
}

async function generateChecklistWithAI(set_name, set_year, brand, subset, mode, filter_condition) {
  let prompt;

  if (mode === 'full_players') {
    prompt = `你是球星卡专家。列出 "${set_name}" 系列 "${subset}" 子集的完整球员名单，不要遗漏。
返回纯JSON数组，每项格式：{"number":卡号整数,"name":"球员英文全名","name_cn":"球员中文名","team":"球队英文名"}
只返回JSON数组，不加任何其他文字。`;

  } else if (mode === 'filtered_parallels' && filter_condition && (filter_condition.color || filter_condition.max_print_run)) {
    // 针对性生成：直接问 AI 符合条件的所有版本
    const colorDesc = filter_condition.color || '所有颜色';
    const runDesc = filter_condition.max_print_run ? `编号 ≤${filter_condition.max_print_run}` : '所有编号';

    prompt = `你是球星卡专家，对 NBA 球星卡每个系列的平行版本非常熟悉。

请列出 "${set_name}"（${set_year || ''}赛季）中，所有满足以下条件的平行版本：
- 颜色/类型关键词：${colorDesc}
- 编号范围：${runDesc}

要求：
1. 穷举所有变体，不要遗漏。例如 Gold Refractor、Gold Shimmer Refractor、Wave Gold Refractor、Gold Prizm Refractor 等所有带 Gold 字样或金色的版本都要包含
2. 每种版本单独列一条
3. 即使某版本较稀有也要列出

返回纯JSON数组，每项格式：
{"name":"版本英文名","name_cn":"版本中文名","numbered":true,"print_run":编号数量,"tier":"premium或ultra或1of1"}
tier: premium=编号6-50；ultra=编号2-5；1of1=限量1
只返回JSON数组，不加任何其他文字。`;

  } else {
    // 全平行清单
    prompt = `你是球星卡专家。完整列出 "${set_name}"（${set_year || ''}赛季）${subset && subset !== 'Base' ? `"${subset}" 子集` : 'Base 系列'} 的所有平行折射版本，务必穷举，不遗漏任何变体。
返回纯JSON数组，每项格式：{"name":"版本英文名","name_cn":"版本中文名","numbered":true或false,"print_run":编号数量或null,"tier":"base/common/numbered/premium/ultra/1of1"}
tier: base=基础版 common=无编号平行 numbered=编号>50 premium=编号6-50 ultra=编号2-5 1of1=限量1
只返回JSON数组，不加任何其他文字。`;
  }

  const r = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = r.content[0].text.trim().replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
  return JSON.parse(text);
}

async function syncOwnedCards(goalId, res) {
  const { data: goal, error: ge } = await supabase
    .from('collection_goals')
    .select('*, checklist:checklists(*)')
    .eq('id', goalId).single();
  if (ge) return res.status(500).json({ error: ge.message });

  const cl = goal.checklist;
  if (!cl) return res.status(400).json({ error: '没有关联清单' });

  let q = supabase.from('cards').select('*');
  const conditions = [];
  if (goal.player_name) conditions.push(`player.ilike.%${goal.player_name}%`);
  if (goal.player_name_cn) conditions.push(`player.ilike.%${goal.player_name_cn}%`);
  if (conditions.length > 0) q = q.or(conditions.join(','));

  const { data: ownedCards } = await q;
  const fullItems = cl.items || [];

  const owned = [], missing = [];
  for (const item of fullItems) {
    const isOwned = (ownedCards || []).some(card => matchesItem(card, item, goal.mode));
    if (isOwned) owned.push({ ...item, owned: true });
    else missing.push({ ...item, owned: false });
  }

  const { data, error } = await supabase
    .from('collection_goals')
    .update({ owned_items: owned, missing_items: missing, total_items: fullItems.length, updated_at: new Date().toISOString() })
    .eq('id', goalId).select().single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('watch_items').delete().eq('goal_id', goalId);
  if (missing.length > 0) {
    const watchItems = missing.map(item => ({
      source: 'collection_goal', goal_id: goalId,
      description: buildDescription(goal, item),
      search_keywords_ebay: buildEbayKw(goal, item, cl),
      search_keywords_katao: buildKataoKw(goal, item, cl),
      tier: 'must_watch', status: 'active',
    }));
    for (let i = 0; i < watchItems.length; i += 50) {
      await supabase.from('watch_items').insert(watchItems.slice(i, i + 50));
    }
  }

  return res.status(200).json({ ...data, owned_count: owned.length, missing_count: missing.length });
}
