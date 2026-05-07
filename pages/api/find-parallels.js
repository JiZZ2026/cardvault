// pages/api/find-parallels.js
// POST { series, year, numbered }

import { supabase } from '../../lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { series, year, numbered } = req.body;
  if (!series) return res.status(400).json({ error: '缺少 series' });

  const yearNum = (year || '').split('-')[0];
  const printRun = extractPrintRun(numbered);
  const seriesClean = series.replace(/\b(Basketball|NBA)\b/gi, '').trim();

  // 1. 查本地 DB
  const { data: allMatches } = await supabase
    .from('checklists')
    .select('*')
    .ilike('set_name', `%${seriesClean}%`)
    .eq('checklist_type', 'parallels')
    .not('subset', 'ilike', 'Filtered%')
    .order('created_at', { ascending: false })
    .limit(10);

  if (allMatches && allMatches.length > 0) {
    const exact = yearNum ? allMatches.find(c => c.set_year && c.set_year.includes(yearNum)) : null;
    const cl = exact || allMatches[0];
    return res.status(200).json({
      source: 'database',
      checklist_id: cl.id,
      set_name: cl.set_name,
      parallels: formatParallels(cl.items, printRun),
      total_parallels: (cl.items || []).filter(i => i.tier !== 'base').length,
      filtered_by_print_run: printRun,
    });
  }

  // 2. AI + web search 生成
  const setName = buildSetName(series, year);
  const prompt = '你是球星卡专家。请查找 "' + setName + '" Base 系列的完整平行折射版本清单。重点参考 checklistcenter.com 和 cardboardconnection.com。务必列出所有平行版本，不要遗漏。返回纯JSON数组，每项：{"name":"版本英文名","name_cn":"版本中文名","numbered":true或false,"print_run":编号数量或null,"tier":"common/numbered/premium/ultra/1of1"}。tier: common=无编号 numbered=编号>50 premium=编号6-50 ultra=编号2-5 1of1=限量1。只返回JSON数组，不加其他文字。';

  try {
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    });

    const items = extractJsonArray(r);
    if (!items.length) throw new Error('AI返回空列表');

    const { data: newCL } = await supabase
      .from('checklists')
      .insert([{
        set_name: setName,
        set_year: year || '',
        brand: detectBrand(series),
        subset: 'Base',
        checklist_type: 'parallels',
        items,
      }])
      .select().single();

    return res.status(200).json({
      source: 'ai_generated',
      checklist_id: newCL ? newCL.id : null,
      set_name: setName,
      parallels: formatParallels(items, printRun),
      total_parallels: items.filter(i => i.tier !== 'base').length,
      filtered_by_print_run: printRun,
    });
  } catch (e) {
    console.error('find-parallels error:', e.message);
    return res.status(500).json({ error: 'AI查询失败: ' + e.message });
  }
}

function extractJsonArray(response) {
  const textBlocks = response.content.filter(b => b.type === 'text').map(b => b.text);
  for (const text of textBlocks) {
    // 用括号深度匹配，找所有顶层数组，避免正则换行问题
    const allArrays = [];
    let depth = 0, start = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '[') {
        if (depth === 0) start = i;
        depth++;
      } else if (text[i] === ']') {
        depth--;
        if (depth === 0 && start !== -1) {
          allArrays.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
    const candidates = allArrays
      .map(s => { try { const p = JSON.parse(s); return (Array.isArray(p) && p.length > 0 && p[0] && p[0].name) ? p : null; } catch (e) { return null; } })
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    if (candidates.length > 0) return candidates[0];
  }
  const preview = textBlocks.join(' ').slice(0, 200);
  throw new Error('AI未返回有效JSON数组。预览: ' + preview);
}

function formatParallels(items, printRun) {
  if (!Array.isArray(items)) return [];
  let list = items.filter(i => i.tier !== 'base');
  if (printRun) {
    const filtered = list.filter(i => i.numbered && i.print_run === printRun);
    if (filtered.length > 0) list = filtered;
  }
  const tierOrder = { common:0, numbered:1, premium:2, ultra:3, '1of1':4 };
  return list
    .map(i => ({
      value: i.name,
      label: i.name_cn ? (i.name + '  (' + i.name_cn + ')') : i.name,
      name: i.name,
      name_cn: i.name_cn || '',
      print_run: i.print_run || null,
      tier: i.tier || 'common',
      numbered: !!i.numbered,
    }))
    .sort((a, b) => {
      const d = (tierOrder[a.tier]||0) - (tierOrder[b.tier]||0);
      if (d !== 0) return d;
      if (a.print_run && b.print_run) return b.print_run - a.print_run;
      return 0;
    });
}

function extractPrintRun(numbered) {
  if (!numbered) return null;
  const m = String(numbered).match(/(\d+)/);
  return m ? parseInt(m[1]) : null;
}

function buildSetName(series, year) {
  const s = series.trim();
  const y = (year || '').split('-')[0];
  if (y && !s.includes(y)) return year + ' ' + s;
  return s;
}

function detectBrand(series) {
  const s = series.toLowerCase();
  if (s.includes('prizm') || s.includes('panini') || s.includes('select') || s.includes('hoops')) return 'Panini';
  if (s.includes('topps') || s.includes('chrome')) return 'Topps';
  if (s.includes('upper deck')) return 'Upper Deck';
  return '';
}
