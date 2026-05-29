// pages/api/invest/positions.js
// GET    /api/invest/positions          列出所有持仓
// POST   /api/invest/positions          新增持仓
// PUT    /api/invest/positions?id=xxx    更新（改价/改状态/卖出）
// DELETE /api/invest/positions?id=xxx    删除

import { supabase } from "../../../lib/supabase";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const num = v => (v === "" || v == null ? null : Number(v));
const numI = v => (v === "" || v == null ? null : parseInt(v));

const FIELDS = [
  "player_name", "card_description", "product_line", "parallel", "numbered",
  "condition", "tier", "cost_basis", "cost_currency", "current_value", "current_value_date",
  "exit_target", "exit_rule", "status", "sell_price", "sell_date", "source", "notes",
];
const DEC_FIELDS = ["cost_basis", "current_value", "exit_target", "sell_price"];
const INT_FIELDS = ["numbered"];
const DATE_FIELDS = ["current_value_date", "sell_date"];

function clean(b, src) {
  const out = {};
  FIELDS.forEach(k => {
    if (!(k in src)) return;
    if (DEC_FIELDS.includes(k)) out[k] = num(src[k]);
    else if (INT_FIELDS.includes(k)) out[k] = numI(src[k]);
    else if (DATE_FIELDS.includes(k)) out[k] = src[k] === "" ? null : src[k];
    else out[k] = src[k];
  });
  return out;
}

export default async function handler(req, res) {
  // ── GET ──
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("positions")
      .select("*")
      .order("player_name", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  }

  // ── POST ──
  if (req.method === "POST") {
    const b = req.body || {};
    if (!b.player_name) return res.status(400).json({ error: "缺少 player_name" });
    if (!b.card_description) return res.status(400).json({ error: "缺少 card_description" });
    if (b.cost_basis == null || b.cost_basis === "") return res.status(400).json({ error: "缺少 cost_basis（成本）" });

    const row = clean(b, b);
    const { data, error } = await supabase
      .from("positions")
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
    const patch = clean(b, b);
    patch.updated_at = new Date().toISOString();

    // 标记卖出时自动补全 sell_date
    if (b.status === "sold" && !("sell_date" in b)) patch.sell_date = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("positions")
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
    const { error } = await supabase.from("positions").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
