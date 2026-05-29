// pages/api/invest/watchlist.js
// GET    /api/invest/watchlist          列出所有摸金校尉监控（gh_index DESC）
// POST   /api/invest/watchlist          新增一条监控记录
// PUT    /api/invest/watchlist?id=xxx    更新分数 / 状态
// DELETE /api/invest/watchlist?id=xxx    删除

import { supabase } from "../../../lib/supabase";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const num = v => (v === "" || v == null ? null : parseInt(v));

// GH = c + r + r_modifier + (p||0) + m
function ghOf(b) {
  return (b.c_score || 0) + (b.r_score || 0) + (b.r_modifier || 0) + (b.p_score || 0) + (b.m_score || 0);
}
function calcTier(gh, c) {
  if (gh >= 75) return "target";
  if (gh >= 67 && c >= 28) return "plus_monitor";
  if (gh >= 67) return "monitor";
  if (gh >= 45) return "watch";
  return "excluded";
}

const FIELDS = [
  "player_name", "draft_year", "draft_pick", "team", "current_scan_year",
  "c_score", "c_breakdown", "r_score", "r_breakdown", "r_modifier",
  "p_score", "p_note", "m_score",
  "release_type", "release_event", "monitoring_tier",
  "thesis", "entry_target", "contract_expiry_year", "score_history", "status",
];
const INT_FIELDS = [
  "draft_year", "draft_pick", "current_scan_year",
  "c_score", "r_score", "r_modifier", "p_score", "m_score", "contract_expiry_year",
];

export default async function handler(req, res) {
  // ── GET ──
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("gold_hunter_watchlist")
      .select("*")
      .eq("status", "active")
      .order("gh_index", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  }

  // ── POST ──
  if (req.method === "POST") {
    const b = req.body || {};
    if (!b.player_name) return res.status(400).json({ error: "缺少 player_name" });
    if (b.draft_year == null) return res.status(400).json({ error: "缺少 draft_year" });

    const row = {};
    FIELDS.forEach(k => { if (k in b) row[k] = INT_FIELDS.includes(k) ? num(b[k]) : b[k]; });
    row.player_name = b.player_name;
    row.draft_year = num(b.draft_year);

    // monitoring_tier 自动计算（前端未指定时）
    if (!row.monitoring_tier) {
      const gh = ghOf({
        c_score: num(b.c_score) || 0, r_score: num(b.r_score) || 0,
        r_modifier: num(b.r_modifier) || 0, p_score: num(b.p_score) || 0, m_score: num(b.m_score) || 0,
      });
      row.monitoring_tier = calcTier(gh, num(b.c_score) || 0);
    }

    const { data, error } = await supabase
      .from("gold_hunter_watchlist")
      .insert([row])
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // ── PUT ──
  if (req.method === "PUT") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "缺少 id" });
    const b = req.body || {};

    const patch = { updated_at: new Date().toISOString() };
    FIELDS.forEach(k => { if (k in b) patch[k] = INT_FIELDS.includes(k) ? num(b[k]) : b[k]; });

    const { data, error } = await supabase
      .from("gold_hunter_watchlist")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  // ── DELETE ──
  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "缺少 id" });
    const { error } = await supabase.from("gold_hunter_watchlist").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
