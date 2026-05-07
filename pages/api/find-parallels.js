// pages/api/find-parallels.js
// POST { series, year, numbered }
// 返回该系列的平行版本清单，如果传了 numbered 则只返回匹配编号的版本

import { supabase } from '../../lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { series, year, numbered } = req.body;
  if (!series) return res.status(400).json({ error: '缺少 series' });

  const yearNum = extractYear(year);       // "2025"
  const printRun = extractPrintRun(numbered); // 50 (from "/50")

  // ── 1. 查本地 DB（优先精确匹配年份）────────────────────────────────────────
  const seriesClean = series.replace(/\b(Basketball|NBA)\b/gi, '').trim();

  const { data: allMatches } = await supabase
    .from('checklists')
    .select('*')
    .ilike('set_name', `%${seriesClean}%`)
    .eq('checklist_type', 'parallels')
    .not('subset', 'ilike', 'Filtered%')
    .order('created_at', { ascending: false })
    .limit(10);

  if (allMatches?.length) {
    // 优先找年份完全匹配的
    const exact = allMatches.find(c => c.set_year && c.set_year.includes(yearNum));
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

  // ── 2. 本地没有，AI + web search 生成完整清单 ─────────────────────────────
  const setName = buildSetName(series, year);

  const prompt = `你是球星卡专家。请通过搜索查找 "${setName}" Base 系列的完整平行折射版本清单。

重点参考：
- https://www.checklistcenter.com 搜索 "${setName} checklist"
- https://www.cardboardconnection.com 搜索 "${setName} parallels"

要求：列出该系列 Base 卡的所有平行版本，务必完整，不要遗漏任何版本。

返回纯JSON数组，每项格式：
{"name":"版本英文名","name_cn":"版本中文名","numbered":true或false,"print_run":编号数量或null,"tier":"common/numbered/premium/ultra/1of1"}

tier: common=无编号 numbered=编号>50 premium=编号6-50 ultra=编号2-5 1of1=限量1
只返回JSON数组，不加任何其他文字。`;

  try {
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    });

    const text = r.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    const clean = text.trim().replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    const jsonMatch = clean.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('AI未返回有效JSON');

    const items = JSON.parse(jsonMatch[0]);
    if (!items.length) throw new Error('AI返回空列表');

    // 存入 DB（完整清单，不管 numbered 过滤）
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
      checklist_id: newCL?.id || null,
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

// 格式化平行列表，可按 print_run 过滤
function formatParallels(items, printRun = null) {
  if (!Array.isArray(items)) return [];

  let list = items.filter(i => i.tier !== 'base');

  // 如果识别到了编号（如 /50），只显示该编号的版本
  if (printRun) {
    const filtered = list.filter(i => i.numbered && i.print_run === printRun);
    // 如果过滤后有结果才用过滤，否则还是显示全部（避免因 AI 数据偏差导致空列表）
    if (filtered.length > 0) list = filtered;
  }

  return list
    .map(i => ({
      value: i.name,
      label: i.name_cn ? `${i.name}  (${i.name_cn})` : i.name,
      name: i.name,
      name_cn: i.name_cn || '',
      print_run: i.print_run || null,
      tier: i.tier || 'common',
      numbered: !!i.numbered,
    }))
    .sort((a, b) => {
      const order = { common:0, numbered:1, premium:2, ultra:3, '1of1':4 };
      const diff = (order[a.tier]||0) - (order[b.tier]||0);
      if (diff !== 0) return diff;
      if (a.print_run && b.print_run) return b.print_run - a.print_run;
      return 0;
    });
}

function extractYear(year) {
  if (!year) return '';
  return year.split('-')[0].trim();
}

function extractPrintRun(numbered) {
  if (!numbered) return null;
  const m = String(numbered).match(/(\d+)/);
  return m ? parseInt(m[1]) : null;
}

function buildSetName(series, year) {
  const s = series.trim();
  const y = extractYear(year);
  if (y && !s.includes(y)) return `${year} ${s}`;
  return s;
}

function detectBrand(series) {
  const s = series.toLowerCase();
  if (s.includes('prizm') || s.includes('panini') || s.includes('select') || s.includes('hoops')) return 'Panini';
  if (s.includes('topps') || s.includes('chrome')) return 'Topps';
  if (s.includes('upper deck')) return 'Upper Deck';
  return '';
}

// 从 Claude 响应（含 web_search）中可靠提取 JSON 数组
function extractJsonArray(response) {
  const textBlocks = response.content.filter(b => b.type === 'text').map(b => b.text);
  for (const text of textBlocks) {
    const clean = text.trim().replace(/```json
?/g, '').replace(/```
?/g, '').trim();
    const matches = [...clean.matchAll(/\[[\s\S]*?\]/g)];
    const candidates = matches
      .map(m => { try { const p = JSON.parse(m[0]); return Array.isArray(p) ? { arr: p } : null; } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => b.arr.length - a.arr.length);
    const valid = candidates.find(c => c.arr.length > 0 && c.arr[0]?.name);
    if (valid) return valid.arr;
  }
  const preview = textBlocks.join('\n').slice(0, 300);
  throw new Error('AI未返回有效JSON数组。预览: ' + preview);
}
