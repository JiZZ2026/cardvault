import { supabase } from "../../lib/supabase";

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { original, corrected } = req.body;
    if (!original || !corrected) {
      return res.status(400).json({ error: "需要 original 和 corrected" });
    }

    const fields = ["player", "series", "parallel", "numbered", "year"];
    const fieldDiffs = {};
    fields.forEach(f => {
      const o = original[f] || null;
      const c = corrected[f] || null;
      if (o !== c) fieldDiffs[f] = { from: o, to: c };
    });

    const { data, error } = await supabase
      .from("recognition_corrections")
      .insert({
        original,
        corrected,
        field_diffs: Object.keys(fieldDiffs).length > 0 ? fieldDiffs : null,
        series: corrected.series || original.series || null,
        parallel: corrected.parallel || original.parallel || null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, data });
  }

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("recognition_corrections")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, data });
  }

  return res.status(405).end();
}
