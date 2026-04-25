import { supabase } from "../../../lib/supabase";

export const config = {
  api: { bodyParser: { sizeLimit: "20mb" } },
};

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === "PUT") {
    const { data, error } = await supabase
      .from("cards")
      .update(req.body)
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
