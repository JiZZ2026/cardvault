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
    ? `你是球星卡专家。列出 "${set_name}" ${subset || 'Base'} 的所有平行版本。返回JSON数组，每项：{"name":"英文名","name_cn":"中文名","numbered":true/false,"print_run":编号数量或null,"tier":"common/numbered/premium/ultra/1of1"}。tier规则：common=无编号；numbered=编号>50；premium=编号≤50且>5；ultra=编号≤5且>1；1of1=1/1。只返回JSON数组。`
    : `你是球星卡专家。列出 "${set_name}" 系列 "${subset}" 子集的所有球员。返回JSON数组，每项：{"number":卡号数字,"name":"球员英文名","name_cn":"球员中文名","team":"球队"}。只返回JSON数组。`;
  const response = await anthropic.messages.create({ model:'claude-sonnet-4-6', max_tokens:4096, messages:[{role:'user',content:prompt}] });
  const text = response.content[0].text.trim().replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
  return JSON.parse(text);
}
