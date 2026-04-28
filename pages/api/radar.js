import Anthropic from "@anthropic-ai/sdk";

export const config = {
  api: { bodyParser: { sizeLimit: "4mb" } },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { cards, pcPlayers } = req.body;
  if (!cards?.length) return res.status(400).json({ error: "没有卡片数据" });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Build a summary of existing PC cards
  const pcCards = cards.filter(c => c.category === "PC");
  const summary = pcCards.map(c =>
    `${c.player} | ${c.year} ${c.series} | ${c.parallel||"Base"} | ${c.numbered||"无编号"} | ${c.grade||"RAW"}`
  ).join("\n");

  const playerNames = pcPlayers.map(p => p.name).join("、");

  const prompt = `你是NBA球星卡收藏顾问。以下是一位收藏者的PC球星卡清单：

球星：${playerNames}

已有卡片：
${summary || "暂无PC卡片"}

请根据这些球星的主流收藏方向，分析并推荐：
1. 每位PC球星最值得追求的缺失类型（重点关注经典系列、限量平行、签名卡）
2. 当前市场上值得关注的补缺机会
3. 整体收藏完整度评估

请用JSON格式回复，不加其他文字：
{
  "players": [
    {
      "name": "球星名",
      "completeness": "评分如 60%",
      "missing": [
        {
          "priority": "高/中/低",
          "card": "卡片描述",
          "reason": "为什么值得收藏（一句话）",
          "estimatedPrice": "价格区间如 ¥500-800"
        }
      ],
      "tip": "针对这位球星的一句收藏建议"
    }
  ],
  "overallTip": "整体收藏建议（1-2句）"
}`;

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
    const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    let result;
    try { result = JSON.parse(match ? match[0] : cleaned); }
    catch { return res.json({ success: false, error: "解析失败" }); }

    return res.json({ success: true, ...result });
  } catch (e) {
    console.error("Radar error:", e);
    return res.status(500).json({ error: e.message || "分析失败" });
  }
}
