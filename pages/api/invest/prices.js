// pages/api/invest/prices.js
// GET    /api/invest/prices             列出价格快照
// GET    /api/invest/prices?player=xxx  某球员的所有价格
// POST   /api/invest/prices             录入新价格
// POST   /api/invest/prices?batch=1     批量导入（body: { rows: [...] }）
// DELETE /api/invest/prices?id=xxx      删除

import { supabase } from "../../../lib/supabase";

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

const num = v => (v === "" || v == null ? null : Number(v));
const numI = v => (v === "" || v == null ? null : parseInt(v));

const FIELDS = [
  "player_name", "year", "product", "parallel", "numbered",
  "price", "price_condition", "source", "transaction_count", "snapshot_date", "notes",
];

function clean(src) {
  const out = {};
  FIELDS.forEach(k => {
    if (!(k in src)) return;
    if (k === "price") out[k] = num(src[k]);
    else if (k === "numbered" || k === "transaction_count") out[k] = numI(src[k]);
    else if (k === "snapshot_date") out[k] = src[k] === "" ? undefined : src[k];
    else out[k] = src[k];
  });
  return out;
}

export default async function handler(req, res) {
  // ── GET ──
  if (req.method === "GET") {
    const { player } = req.query;
    let q = supabase.from("price_snapshots").select("*");
    if (player) q = q.eq("player_name", player);
    q = q.order("player_name", { ascending: true })
         .order("numbered", { ascending: true, nullsFirst: true });
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  }

  // ── POST（单条 / 批量）──
  if (req.method === "POST") {
    const { batch } = req.query;
    const b = req.body || {};

    if (batch) {
      const rows = Array.isArray(b.rows) ? b.rows : [];
      if (!rows.length) return res.status(400).json({ error: "rows 为空" });
      const bad = rows.find(r => !r.player_name || !r.year || !r.product || !r.parallel || r.price == null);
      if (bad) return res.status(400).json({ error: "存在缺少必填字段的条目（player_name/year/product/parallel/price）" });
      const cleaned = rows.map(clean);
      const { data, error } = await supabase.from("price_snapshots").insert(cleaned).select();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(201).json({ inserted: data.length, data });
    }

    if (!b.player_name) return res.status(400).json({ error: "缺少 player_name" });
    if (!b.year) return res.status(400).json({ error: "缺少 year" });
    if (!b.product) return res.status(400).json({ error: "缺少 product" });
    if (!b.parallel) return res.status(400).json({ error: "缺少 parallel" });
    if (b.price == null || b.price === "") return res.status(400).json({ error: "缺少 price" });

    const { data, error } = await supabase
      .from("price_snapshots")
      .insert([clean(b)])
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // ── DELETE ──
  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "缺少 id" });
    const { error } = await supabase.from("price_snapshots").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
