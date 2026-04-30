// pages/api/collection-goals.js
// GET    /api/collection-goals         — 获取所有目标（含进度）
// POST   /api/collection-goals         — 新建目标（自动查/生成checklist + 算缺口 + 生成watch_items）
// PUT    /api/collection-goals?id=xxx  — 更新目标
// DELETE /api/collection-goals?id=xxx  — 删除目标

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
    const { title, mode, player_name, player_name_cn, set_name, set_year, brand, subset, filter_condition } = req.body;

    if (!title || !mode || !set_name) {
      return res.status(400).json({ error: '缺少必填字段：title, mode, set_name' });
    }

    // 1. 查找或创建 checklist
    let checklist = null;
    const { data: existing } = await supabase
      .from('checklists')
      .select('*')
      .ilike('set_name', `%${set_name}%`)
      .eq('subset', subset || 'Base')
      .maybeSingle();

    if (existing) {
      checklist = existing;
    } else {
      let generated;
      try {
        generated = await generateChecklistWithAI(set_name, set_year, brand, subset, mode);
      } catch (e) {
        return res.status(500).json({ error: 'AI生成清单失败: ' + e.message });
      }
      const { data: newCL, error: clErr } = await supabase
        .from('checklists')
        .insert([{
          set_name, set_year: set_year || '',
          brand: brand || '',
          subset: subset || 'Base',
          checklist_type: mode === 'full_players' ? 'player_set' : 'parallels',
          items: generated,
        }])
        .select()
        .single();
      if (clErr) return res.status(500).json({ error: '清单保存失败: ' + clErr.message });
      checklist = newCL;
    }

    // 2. 筛选出需要监控的条目
    let allItems = checklist.items || [];
    if (mode === 'full_parallels') {
      allItems = allItems.filter(i => i.tier !== 'base');
    } else if (mode === 'filtered_parallels') {
      allItems = applyFilter(allItems, filter_condition || {});
    }

    // 3. 比对 cards 表，区分 owned / missing
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

    // 4. 创建 collection_goal
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
      .select()
      .single();

    if (goalErr) return res.status(500).json({ error: goalErr.message });

    // 5. 生成 watch_items
    if (missing.length > 0) {
      const items = missing.map(item => ({
        source: 'collection_goal',
        goal_id: goal.id,
        description: buildDescription(goal, item),
        search_keywords_ebay: buildEbayKw(goal, item, checklist),
        search_keywords_katao: buildKataoKw(goal, item, checklist),
        tier: 'must_watch',
        status: 'active',
      }));
      for (let i = 0; i < items.length; i += 50) {
        await supabase.from('watch_items').insert(items.slice(i, i + 50));
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

// ── Helpers ──────────────────────────────────────────────────────────────────

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
    if (cond.tiers?.length > 0 && !cond.tiers.includes(item.tier)) return false;
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

async function generateChecklistWithAI(set_name, set_year, brand, subset, mode) {
  const isParallels = mode !== 'full_players';
  const prompt = isParallels
    ? `你是球星卡专家。列出 "${set_name}"${subset && subset !== 'Base' ? ` 中 "${subset}" 子集` : ''} 所有平行折射版本。
返回纯JSON数组，每个元素格式：{"name":"英文名","name_cn":"中文名","numbered":true或false,"print_run":编号数字或null,"tier":"base/common/numbered/premium/ultra/1of1"}
tier标准：base=基础版本 common=无编号平行 numbered=有编号且>50 premium=编号1-50且>5 ultra=编号2-5 1of1=限量1
只返回JSON数组，不加其他文字。`
    : `你是球星卡专家。列出 "${set_name}" 系列 "${subset}" 子集的所有球员卡片名单。
返回纯JSON数组，每个元素格式：{"number":卡号整数,"name":"球员英文全名","name_cn":"球员中文名","team":"球队英文名"}
只返回JSON数组，不加其他文字。`;

  const r = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = r.content[0].text.trim().replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
  return JSON.parse(text);
}
