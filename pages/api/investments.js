// pages/api/investments.js
// GET    /api/investments            列出所有 active 投资 + 持仓统计
// POST   /api/investments            创建投资追踪
// PUT    /api/investments?id=xxx      更新分数 / 状态等
// DELETE /api/investments?id=xxx      软删除（status -> closed）

import { supabase } from "../../lib/supabase";
import { buildInvestmentWatchItemRow } from "./radar-scan";

// upsert：按 meta->>investment_id 定位（改名也能找到），不存在则 insert
async function syncInvestmentWatchItem(inv) {
  const row = buildInvestmentWatchItemRow(inv);
  if (!row) return;
  const { data: existing } = await supabase
    .from("watch_items")
    .select("id")
    .eq("source", "investment")
    .eq("meta->>investment_id", inv.id)
    .limit(1);
  if (existing?.length) {
    await supabase.from("watch_items").update({
      description: row.description,
      search_keywords_ebay: row.search_keywords_ebay,
      search_keywords_katao: row.search_keywords_katao,
      meta: row.meta,
      status: "active",  // 重激活（防 DELETE 后再 PUT/POST 同 id）
      updated_at: new Date().toISOString(),
    }).eq("id", existing[0].id);
  } else {
    await supabase.from("watch_items").insert([row]);
  }
}

// DELETE 时归档对应 watch_item（status='inactive'，雷达不再扫）
async function archiveInvestmentWatchItem(invId) {
  await supabase.from("watch_items")
    .update({ status: "inactive", updated_at: new Date().toISOString() })
    .eq("source", "investment")
    .eq("meta->>investment_id", invId);
}

export const config = {
  api: { bodyParser: { sizeLimit: "4mb" } },
};

function computeActionScore(q, t) {
  if (q == null || t == null) return null;
  return Math.min(Number(q), Number(t));
}

function signalFromAction(score) {
  if (score == null) return "hold";
  if (score >= 75) return "buy";
  if (score >= 60) return "accumulate";
  if (score >= 40) return "hold";
  return "reduce";
}

export default async function handler(req, res) {
  // ── GET：列表 + 持仓统计 ──────────────────────────────────────────────
  if (req.method === "GET") {
    const { data: investments, error } = await supabase
      .from("player_investments")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    const ids = (investments || []).map(i => i.id);
    let posByInv = {};
    if (ids.length) {
      const { data: positions } = await supabase
        .from("investment_positions")
        .select("investment_id, cost_basis, current_value, status")
        .in("investment_id", ids);
      (positions || []).forEach(p => {
        const g = (posByInv[p.investment_id] ||= { count: 0, totalCost: 0, totalValue: 0 });
        g.count += 1;
        g.totalCost += parseFloat(p.cost_basis) || 0;
        g.totalValue += parseFloat(p.current_value) || 0;
      });
    }

    const enriched = (investments || []).map(i => ({
      ...i,
      position_count: posByInv[i.id]?.count || 0,
      total_cost: posByInv[i.id]?.totalCost || 0,
      total_value: posByInv[i.id]?.totalValue || 0,
    }));
    return res.json(enriched);
  }

  // ── POST：创建 ────────────────────────────────────────────────────────
  if (req.method === "POST") {
    const b = req.body || {};
    if (!b.player_name) return res.status(400).json({ error: "缺少 player_name" });
    if (!b.investment_type) return res.status(400).json({ error: "缺少 investment_type" });
    if (!b.thesis_text) return res.status(400).json({ error: "缺少 thesis_text（建仓逻辑）" });
    if (b.investment_type === "investment") {
      const rules = b.exit_rules;
      const empty = !rules || (Array.isArray(rules) ? rules.length === 0 : Object.keys(rules).length === 0);
      if (empty) return res.status(400).json({ error: "投资类型必须填写 EXIT 规则" });
    }

    const q = b.q_score != null ? parseInt(b.q_score) : null;
    const t = b.t_score != null ? parseInt(b.t_score) : null;
    const action = computeActionScore(q, t);

    const row = {
      player_name: b.player_name,
      player_name_cn: b.player_name_cn || null,
      player_meta: b.player_meta || null,
      investment_type: b.investment_type,
      thesis_text: b.thesis_text,
      exit_rules: b.exit_rules || [],
      q_score: q,
      q_breakdown: b.q_breakdown || null,
      t_score: t,
      t_breakdown: b.t_breakdown || null,
      action_score: action,
      health_discount: b.health_discount != null ? b.health_discount : 1.0,
      score_history: action != null ? [{ q, t, action, at: new Date().toISOString() }] : [],
      status: "active",
      status_signal: signalFromAction(action),
    };

    const { data, error } = await supabase
      .from("player_investments")
      .insert([row])
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // 同步建一条 watch_item，让雷达扫描立刻能扫到（失败不阻塞创建）
    try { await syncInvestmentWatchItem(data); }
    catch (e) { console.error("syncInvestmentWatchItem failed:", e.message); }

    return res.status(201).json(data);
  }

  // ── PUT：更新分数 / 状态 ──────────────────────────────────────────────
  if (req.method === "PUT") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "缺少 id" });
    const b = req.body || {};

    const { data: current, error: curErr } = await supabase
      .from("player_investments")
      .select("*")
      .eq("id", id)
      .single();
    if (curErr) return res.status(500).json({ error: curErr.message });

    const patch = { updated_at: new Date().toISOString() };
    ["player_name", "player_name_cn", "player_meta", "investment_type", "thesis_text",
     "exit_rules", "q_breakdown", "t_breakdown", "health_discount", "status", "status_signal"]
      .forEach(k => { if (k in b) patch[k] = b[k]; });

    const scoreChanged = ("q_score" in b) || ("t_score" in b);
    if (scoreChanged) {
      const q = ("q_score" in b ? (b.q_score != null ? parseInt(b.q_score) : null) : current.q_score);
      const t = ("t_score" in b ? (b.t_score != null ? parseInt(b.t_score) : null) : current.t_score);
      const action = computeActionScore(q, t);
      patch.q_score = q;
      patch.t_score = t;
      patch.action_score = action;
      if (!("status_signal" in b)) patch.status_signal = signalFromAction(action);
      const hist = Array.isArray(current.score_history) ? current.score_history : [];
      patch.score_history = [...hist, { q, t, action, at: new Date().toISOString() }];
    }

    const { data, error } = await supabase
      .from("player_investments")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // 关键字段改动 → 同步重建 watch_item kw；改为 closed → 归档
    try {
      if (data.status === "closed") {
        await archiveInvestmentWatchItem(id);
      } else if ("player_name" in b || "player_name_cn" in b || "player_meta" in b) {
        await syncInvestmentWatchItem(data);
      }
    } catch (e) { console.error("investments PUT watch_item sync failed:", e.message); }

    return res.json(data);
  }

  // ── DELETE：软删除 ────────────────────────────────────────────────────
  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "缺少 id" });
    const { data, error } = await supabase
      .from("player_investments")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // 同步把对应 watch_item 归档（雷达不再扫已关闭的投资）
    try { await archiveInvestmentWatchItem(id); }
    catch (e) { console.error("archiveInvestmentWatchItem failed:", e.message); }

    return res.json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
