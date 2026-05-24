// pages/api/investments/[id].js
// GET  /api/investments/:id                  投资详情 + positions + checkpoints
// POST /api/investments/:id?action=checkpoint 添加检查点
// POST /api/investments/:id?action=link-card  关联卡片（创建 investment_position）

import { supabase } from "../../../lib/supabase";

export const config = {
  api: { bodyParser: { sizeLimit: "4mb" } },
};

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "缺少 id" });

  // ── GET：详情 ─────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const { data: investment, error } = await supabase
      .from("player_investments")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    if (!investment) return res.status(404).json({ error: "未找到该投资" });

    const { data: positions } = await supabase
      .from("investment_positions")
      .select("*, cards(*)")
      .eq("investment_id", id)
      .order("created_at", { ascending: false });

    const { data: checkpoints } = await supabase
      .from("investment_checkpoints")
      .select("*")
      .eq("investment_id", id)
      .order("created_at", { ascending: false });

    return res.json({
      ...investment,
      positions: positions || [],
      checkpoints: checkpoints || [],
    });
  }

  // ── POST：检查点 / 关联卡片 ───────────────────────────────────────────
  if (req.method === "POST") {
    const { action } = req.query;
    const b = req.body || {};

    if (action === "checkpoint") {
      if (!b.title) return res.status(400).json({ error: "缺少 title" });
      const { data: inv } = await supabase
        .from("player_investments")
        .select("q_score, t_score, action_score, score_history")
        .eq("id", id)
        .single();

      const qSnap = b.q_score_snapshot != null ? b.q_score_snapshot : (inv?.q_score ?? null);
      const tSnap = b.t_score_snapshot != null ? b.t_score_snapshot : (inv?.t_score ?? null);
      const aSnap = b.action_score_snapshot != null ? b.action_score_snapshot : (inv?.action_score ?? null);

      const row = {
        investment_id: id,
        trigger_type: b.trigger_type || "manual",
        title: b.title,
        description: b.description || null,
        decision: b.decision || null,
        decision_reasoning: b.decision_reasoning || null,
        q_score_snapshot: qSnap,
        t_score_snapshot: tSnap,
        action_score_snapshot: aSnap,
        window_type: b.window_type || null,
        is_resolved: b.is_resolved === true,
      };
      const { data, error } = await supabase
        .from("investment_checkpoints")
        .insert([row])
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });

      const hist = Array.isArray(inv?.score_history) ? inv.score_history : [];
      const newHist = [...hist, { q: qSnap, t: tSnap, action: aSnap, at: new Date().toISOString(), checkpoint: b.title }];
      await supabase
        .from("player_investments")
        .update({ score_history: newHist, updated_at: new Date().toISOString() })
        .eq("id", id);

      return res.status(201).json(data);
    }

    if (action === "link-card") {
      if (!b.card_description) return res.status(400).json({ error: "缺少 card_description" });
      const row = {
        investment_id: id,
        card_id: b.card_id || null,
        card_description: b.card_description,
        card_tier: b.card_tier || null,
        cost_basis: b.cost_basis != null && b.cost_basis !== "" ? b.cost_basis : null,
        current_value: b.current_value != null && b.current_value !== "" ? b.current_value : null,
        purchase_date: b.purchase_date || null,
        status: b.status || "held",
      };
      const { data, error } = await supabase
        .from("investment_positions")
        .insert([row])
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json(data);
    }

    return res.status(400).json({ error: "未知 action" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
