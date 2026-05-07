// pages/api/checklists.js
import { supabase } from '../../lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { id, search } = req.query;
    if (id) {
      const { data, error } = await supabase.from('checklists').select('*').eq('id', id).single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }
    let q = supabase.from('checklists').select('id,set_name,set_year,brand,subset,checklist_type').order('set_year', { ascending: false });
    if (search) q = q.ilike('set_name', `%${search}%`);
    const { data, error } = await q.limit(30);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { set_name, set_year, brand, subset, checklist_type, use_ai } = req.body;
    if (!set_name || !checklist_type) return res.status(400).json({ error: '缺少 set_name 或 checklist_type' });
    let items = req.body.items || [];
    if (use_ai) {
      try { items = await generateWithAI(set_name, set_year, brand, subset, checklist_type); }
      catch (e) { return res.status(500).json({ error: 'AI生成失败: ' + e.message }); }
    }
    const { data, error } = await supabase.from('checklists')
      .insert([{ set_name, set_year, brand, subset: subset || 'Base', checklist_type, items }])
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

async function generateWithAI(set_name, set_year, brand, subset, checklist_type) {
  const isParallels = checklist_type === 'parallels';
  const prompt = isParallels
    ? `你是球星卡专家。列出 "${set_name}" ${subset || 'Base'} 的所有平行版本，务必完整。
返回纯JSON数组，每项：{"name":"英文名","name_cn":"中文名","numbered":true或false,"print_run":编号数量或null,"tier":"common/numbered/premium/ultra/1of1"}
tier: common=无编号 numbered=编号>50 premium=编号6-50 ultra=编号2-5 1of1=限量1
只返回JSON数组，不加任何说明文字。`
    : `你是球星卡专家。列出 "${set_name}" 系列 "${subset}" 子集的所有球员名单。
返回纯JSON数组，每项：{"number":卡号数字,"name":"球员英文名","name_cn":"球员中文名","team":"球队"}
只返回JSON数组，不加任何说明文字。`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: prompt }],
  });

  return extractJsonArray(response);
}

// 从 Claude 响应中可靠地提取 JSON 数组
// web_search 会产生多个 content block，需要正确处理
function extractJsonArray(response) {
  const textBlocks = response.content.filter(b => b.type === 'text').map(b => b.text);

  for (const text of textBlocks) {
    const clean = text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // 找最大的 JSON 数组（排除小的辅助数组）
    const matches = [...clean.matchAll(/\[[\s\S]*?\]/g)];
    const candidates = matches
      .map(m => { try { const p = JSON.parse(m[0]); return Array.isArray(p) ? { arr: p, raw: m[0] } : null; } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => b.arr.length - a.arr.length); // 按数组长度降序

    // 取最长的那个，且必须有 name 字段（是卡片数据）
    const valid = candidates.find(c => c.arr.length > 0 && c.arr[0]?.name);
    if (valid) return valid.arr;
  }

  // 所有 text block 都没找到，记录原始内容方便调试
  const allText = textBlocks.join('\n').slice(0, 500);
  throw new Error(`AI未返回有效JSON数组。响应预览: ${allText}`);
}
