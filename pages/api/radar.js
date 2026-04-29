import Anthropic from "@anthropic-ai/sdk";

export const config = {
  api: { bodyParser: { sizeLimit: "4mb" } },
};

function extractJSON(text) {
  // Remove markdown fences
  let s = text.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim();
  // Try direct parse
  try { return JSON.parse(s); } catch {}
  // Find first { and last } 
  const first = s.indexOf("{");
  const last  = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)); } catch {}
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { cards, pcPlayers } = req.body;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const pcCards = (cards || []).filter(c => c.category === "PC");
  const playerNames = (pcPlayers || []).map(p => p.name).join(", ");
  const summary = pcCards.length > 0
    ? pcCards.map(c => `${c.player} / ${c.series} / ${c.parallel||"Base"} / ${c.numbered||"-"} / ${c.grade||"RAW"}`).join("\n")
    : "none";

  // Ultra-simple prompt — just ask for the JSON structure
  const prompt = `NBA card collection advisor. PC players: ${playerNames}

Existing PC cards:
${summary}

Reply with ONLY this JSON, nothing else before or after:
{"players":[{"name":"player name","completeness":"50%","missing":[{"priority":"High","card":"card name","reason":"one line reason","estimatedPrice":"$50-100"}],"tip":"one tip"}],"overallTip":"one overall tip"}

Rules: max 2 missing items per player, keep all text SHORT (under 20 chars each field), no extra text outside JSON.`;

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
    console.log("Radar raw response (first 800):", raw.slice(0, 800));

    const result = extractJSON(raw);

    if (!result) {
      console.error("All JSON extraction failed. Raw:", raw.slice(0, 400));
      return res.json({ success: false, error: "AI返回格式异常，请重试" });
    }

    // Validate structure
    if (!result.players || !Array.isArray(result.players)) {
      console.error("Missing players array:", JSON.stringify(result).slice(0, 200));
      return res.json({ success: false, error: "数据结构异常，请重试" });
    }

    return res.json({ success: true, ...result });
  } catch (e) {
    console.error("Radar API error:", e.message);
    return res.status(500).json({ error: e.message || "分析失败" });
  }
}
