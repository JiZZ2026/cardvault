// pages/api/watch-items.js
// POST /api/watch-items  手动新增一个监控条目（附加到某个 goal）
// DELETE /api/watch-items?id=xxx  删除某条

import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {

  if (req.method === 'POST') {
    const { goal_id, description, search_keywords_ebay, search_keywords_katao, tier } = req.body;
    if (!description) return res.status(400).json({ error: '缺少 description' });

    const { data, error } = await supabase
      .from('watch_items')
      .insert([{
        source: 'manual',
        goal_id: goal_id || null,
        description,
        search_keywords_ebay: search_keywords_ebay || description,
        search_keywords_katao: search_keywords_katao || description,
        tier: tier || 'must_watch',
        status: 'active',
      }])
      .select().single();

    if (error) return res.status(500).json({ error: error.message });

    // 如果关联了 goal，同时把这条加入 goal 的 missing_items
    if (goal_id) {
      const { data: goal } = await supabase
        .from('collection_goals').select('missing_items, total_items').eq('id', goal_id).single();
      if (goal) {
        const newItem = {
          name: description,
          name_cn: description,
          numbered: !!search_keywords_ebay?.includes('/'),
          print_run: extractPrintRun(description),
          tier: tier || 'must_watch',
          owned: false,
          manual: true,
        };
        const missing = [...(goal.missing_items || []), newItem];
        await supabase.from('collection_goals')
          .update({ missing_items: missing, total_items: (goal.total_items || 0) + 1 })
          .eq('id', goal_id);
      }
    }

    return res.status(201).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: '缺少 id' });
    const { error } = await supabase.from('watch_items').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

function extractPrintRun(str) {
  const m = str.match(/\/(\d+)/);
  return m ? parseInt(m[1]) : null;
}
