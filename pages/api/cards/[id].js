import { supabase } from "../../../lib/supabase";

export const config = {
  api: { bodyParser: { sizeLimit: "20mb" } },
};

function sanitize(card) {
  const DATE_FIELDS = ["buy_date", "sell_date"];
  const NUM_FIELDS  = ["buy_price", "sell_price"];
  const out = { ...card };
  DATE_FIELDS.forEach(f => { if (out[f] === "" || out[f] === undefined) out[f] = null; });
  NUM_FIELDS.forEach(f  => { if (out[f] === "" || out[f] === undefined) out[f] = null; });
  return out;
}

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === "PUT") {
    const { data, error } = await supabase
      .from("cards")
      .update(sanitize(req.body))
      .eq("id", id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === "DELETE") {
    const { error } = await supabase.from("cards").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  }

  res.status(405).end();
}
