import { supabase } from "../../lib/supabase";

export const config = {
  api: { bodyParser: { sizeLimit: "20mb" } },
};

// Convert empty strings to null for date/numeric fields
function sanitize(card) {
  // Only sanitize fields that are explicitly present in the payload
  // Never set fields to null if they weren't included in the update
  const DATE_FIELDS = ["buy_date", "sell_date"];
  const NUM_FIELDS  = ["buy_price", "sell_price"];
  const out = { ...card };
  DATE_FIELDS.forEach(f => { if (f in out && out[f] === "") out[f] = null; });
  NUM_FIELDS.forEach(f  => { if (f in out && out[f] === "") out[f] = null; });
  return out;
}


export default async function handler(req, res) {
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("cards")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === "POST") {
    const card = sanitize(req.body);
    const { data, error } = await supabase
      .from("cards")
      .insert([card])
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  res.status(405).end();
}
