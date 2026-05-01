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

    // ── 1. 生成或获取清单 ─────────────────────────────────────────────────────
    let checklist = null;

    if (mode === 'filtered_parallels') {
      // 条件筛选模式：永远针对性生成，不复用通用清单
      let generated;
      try {
        generated = await generateChecklistWithAI(set_name, set_year, brand, subset, mode, filter_condition);
      } catch (e) {
        return res.status(500).json({ error: 'AI生成清单失败: ' + e.message });
      }
      const filterKey = [
        filter_condition?.color || '',
        filter_condition?.max_print_run ? `pr${filter_condition.max_print_run}` : '',
      ].filter(Boolean).join('_') || 'custom';
      const { data: newCL, error: clErr } = await supabase
        .from('checklists')
        .insert([{ set_name, set_year: set_year || '', brand: brand || '', subset: `Filtered_${filterKey}`, checklist_type: 'parallels', items: generated }])
        .select().single();
      if (clErr) return res.status(500).json({ error: '清单保存失败: ' + clErr.message });
      checklist = newCL;

    } else {
      // 全平行 / 全球员模式：复用或新建通用清单
      if (checklist_id) {
        const { data: existing } = await supabase.from('checklists').select('*').eq('id', checklist_id).maybeSingle();
        if (existing) checklist = existing;
      }
      if (!checklist) {
        const { data: existing } = await supabase.from('checklists').select('*')
          .ilike('set_name', `%${set_name}%`).eq('subset', subset || 'Base').maybeSingle();
        if (existing) checklist = existing;
      }
      if (!checklist) {
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

    // ── 2. 确定监控条目 ───────────────────────────────────────────────────────
    let allItems = checklist.items || [];
    if (mode === 'full_parallels') {
      allItems = allItems.filter(i => i.tier !== 'base');
    }
    // filtered_parallels 的清单已经是针对性的，不需要再过滤

    // ── 3. 比对 cards 表 ─────────────────────────────────────────────────────
    const owned = [];
    const missing = [];

    if (player_name || player_name_cn) {
      let q = supabase.from('cards').select('*');
      const conds = [];
      if (player_name) conds.push(`player.ilike.%${player_name}%`);
      if (player_name_cn) conds.push(`player.ilike.%${player_name_cn}%`);
      q = q.or(conds.join(','));
      if (set_year) q = q.ilike('year', `%${set_year.split('-')[0]}%`);
      const { data: ownedCards } = await q;

      for (const item of allItems) {
        const isOwned = (ownedCards || []).some(card => matchesItem(card, item, mode));
        (isOwned ? owned : missing).push({ ...item, owned: isOwned });
      }
    } else {
      allItems.forEach(i => missing.push({ ...i, owned: false }));
    }

    // ── 4. 创建目标 ──────────────────────────────────────────────────────────
    const { data: goal, error: goalErr } = await supabase
      .from('collection_goals')
      .insert([{
        title, mode, checklist_id: checklist.id,
        player_name: player_name || null, player_name_cn: player_name_cn || null,
        filter_condition: filter_condition || null,
        total_items: owned.length + missing.length,
        owned_items: owned.filter(i => i.owned), missing_items: missing,
        status: 'active', priority: 0,
      }]).select().single();

    if (goalErr) return res.status(500).json({ error: goalErr.message });

    // ── 5. 生成 watch_items ──────────────────────────────────────────────────
    if (missing.length > 0) {
      const watchItems = missing.map(item => ({
        source: 'collection_goal', goal_id: goal.id,
        description: buildDescription(goal, item),
        search_keywords_ebay: buildEbayKw(goal, item, checklist),
        search_keywords_katao: buildKataoKw(goal, item, checklist),
        tier: 'must_watch', status: 'active',
      }));
      for (let i = 0; i < watchItems.length; i += 50) {
        await supabase.from('watch_items').insert(watchItems.slice(i, i + 50));
      }
    }

    return res.status(201).json({
      ...goal, owned_count: owned.length, missing_count: missing.length,
      total_items: owned.length + missing.length, checklist,
    });
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: '缺少 id' });
    const { data, error } = await supabase.from('collection_goals')
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

// ── AI 清单生成 ───────────────────────────────────────────────────────────────

async function generateChecklistWithAI(set_name, set_year, brand, subset, mode, filter_condition) {
  let prompt;

  if (mode === 'full_players') {
    prompt = `你是球星卡专家。完整列出 "${set_name}" 系列 "${subset}" 子集的所有球员名单。
返回纯JSON数组，每项：{"number":卡号整数,"name":"球员英文全名","name_cn":"球员中文名","team":"球队英文名"}
只返回JSON数组。`;

  } else if (mode === 'filtered_parallels' && filter_condition) {
    const fc = filter_condition;
    const printRun = fc.max_print_run ? parseInt(fc.max_print_run) : null;
    const color = fc.color || null;

    // 根据条件组合不同提示词
    let conditionDesc;
    if (printRun && color) {
      conditionDesc = `颜色/类型含"${color}"且编号恰好为 /${printRun} 的所有平行版本`;
    } else if (printRun) {
      conditionDesc = `编号恰好为 /${printRun} 的所有平行版本（不限颜色，任何颜色只要是 /${printRun} 都要列出）`;
    } else if (color) {
      conditionDesc = `颜色/类型含"${color}"的所有平行版本（不限编号）`;
    } else {
      conditionDesc = '所有平行版本';
    }

    prompt = `你是球星卡专家，对 NBA 球星卡每个系列的完整平行版本非常熟悉。

请列出 "${set_name}"（${set_year || ''}赛季）中，${conditionDesc}。

要求：
1. 务必穷举所有符合条件的变体，不要遗漏
2. 每种版本单独列一条，不要合并
3. 如果该系列确实存在某个变体就列出，不存在的不要编造
${printRun ? `4. 只列编号恰好是 /${printRun} 的版本，其他编号的版本不要列` : ''}

返回纯JSON数组，每项：
{"name":"版本英文名","name_cn":"版本中文名","numbered":${printRun ? 'true' : 'true或false'},"print_run":${printRun || '编号数量'},"tier":"common/numbered/premium/ultra/1of1"}
tier: common=无编号 numbered=编号>50 premium=编号6-50 ultra=编号2-5 1of1=限量1
只返回JSON数组，不加任何其他文字。`;

  } else {
    prompt = `你是球星卡专家。完整列出 "${set_name}"（${set_year || ''}赛季）${subset && subset !== 'Base' ? `"${subset}" 子集` : 'Base 系列'}的所有平行折射版本，务必穷举不遗漏。
返回纯JSON数组，每项：{"name":"版本英文名","name_cn":"版本中文名","numbered":true或false,"print_run":编号数量或null,"tier":"base/common/numbered/premium/ultra/1of1"}
tier: base=基础版 common=无编号平行 numbered=编号>50 premium=编号6-50 ultra=编号2-5 1of1=限量1
只返回JSON数组。`;
  }

  const r = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = r.content[0].text.trim().replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
  return JSON.parse(text);
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

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
  parts.push(item.name);
  if (item.numbered && item.print_run) parts.push(`/${item.print_run}`);
  return parts.filter(Boolean).join(' ');
}

function buildKataoKw(goal, item, cl) {
  const parts = [];
  if (goal.player_name_cn) parts.push(goal.player_name_cn);
  else if (goal.player_name) parts.push(goal.player_name.split(' ').pop());
  if (cl.set_name.includes('Prizm')) parts.push('prizm');
  else if (cl.set_name.includes('Chrome')) parts.push('chrome');
  parts.push(item.name_cn || item.name.toLowerCase());
  if (item.numbered && item.print_run) parts.push(`/${item.print_run}`);
  return parts.filter(Boolean).join(' ');
}

async function syncOwnedCards(goalId, res) {
  const { data: goal, error: ge } = await supabase
    .from('collection_goals').select('*, checklist:checklists(*)').eq('id', goalId).single();
  if (ge) return res.status(500).json({ error: ge.message });
  const cl = goal.checklist;
  if (!cl) return res.status(400).json({ error: '没有关联清单' });

  let q = supabase.from('cards').select('*');
  const conds = [];
  if (goal.player_name) conds.push(`player.ilike.%${goal.player_name}%`);
  if (goal.player_name_cn) conds.push(`player.ilike.%${goal.player_name_cn}%`);
  if (conds.length > 0) q = q.or(conds.join(','));
  const { data: ownedCards } = await q;

  const owned = [], missing = [];
  for (const item of (cl.items || [])) {
    const isOwned = (ownedCards || []).some(card => matchesItem(card, item, goal.mode));
    (isOwned ? owned : missing).push({ ...item, owned: isOwned });
  }

  const { data, error } = await supabase.from('collection_goals')
    .update({ owned_items: owned.filter(i=>i.owned), missing_items: missing, total_items: (cl.items||[]).length, updated_at: new Date().toISOString() })
    .eq('id', goalId).select().single();
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('watch_items').delete().eq('goal_id', goalId);
  if (missing.length > 0) {
    const watchItems = missing.map(item => ({
      source:'collection_goal', goal_id:goalId,
      description: buildDescription(goal, item),
      search_keywords_ebay: buildEbayKw(goal, item, cl),
      search_keywords_katao: buildKataoKw(goal, item, cl),
      tier:'must_watch', status:'active',
    }));
    for (let i = 0; i < watchItems.length; i += 50) {
      await supabase.from('watch_items').insert(watchItems.slice(i, i + 50));
    }
  }
  return res.status(200).json({ ...data, owned_count: owned.length, missing_count: missing.length });
}
