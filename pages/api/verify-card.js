import Anthropic from "@anthropic-ai/sdk";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { player, year, series, parallel, numbered, manufacturer } = req.body;
  if (!player || !series) return res.status(400).json({ error: "缺少必要信息" });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `你是NBA球星卡专家。请验证以下卡片信息是否准确：

球星：${player}
赛季：${year || "未知"}
系列：${series}
厂商：${manufacturer || "未知"}
平行类型：${parallel || "Base"}
编号：${numbered || "无编号"}

请从你的知识库中验证：
1. 这个系列（${series}）是否真实存在？
2. "${parallel || "Base"}" 这个平行类型在该系列中是否存在？如果不存在，列出该系列真实存在的相似平行类型（最多5个）
3. ${numbered ? `编号 ${numbered} 在该平行类型中是否正确？` : "无编号是否合理？"}
4. ${player} 是否在该系列中有卡片？

请用JSON格式回复，不加任何其他文字：
{
  "seriesValid": true或false,
  "parallelValid": true或false,
  "parallelSuggestions": ["如果不正确，列出正确选项，最多5个"],
  "numberedValid": true或false,
  "playerValid": true或false,
  "confidence": "high/medium/low",
  "notes": "简短说明，如有问题请指出"
}`;

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content.filter(b => b.type === "text").map(b => b.text).join("").trim();

    // Parse JSON
    let result;
    try {
      const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      result = JSON.parse(match ? match[0] : cleaned);
    } catch {
      return res.json({ success: true, verified: true, notes: "无法解析验证结果，请手动确认" });
    }

    return res.json({ success: true, ...result });
  } catch (e) {
    console.error("Verify error:", e);
    return res.status(500).json({ error: e.message || "验证失败" });
  }
}
