import Anthropic from "@anthropic-ai/sdk";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { player, series, parallel, numbered, grade, year, customQuery } = req.body;
  if (!player && !customQuery) return res.status(400).json({ error: "缺少卡片信息" });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const parts = [player, year, series, parallel, numbered];
  if (grade && grade !== "RAW") parts.push(grade);
  const autoDesc = parts.filter(Boolean).join(" ");
  const cardDesc = customQuery || autoDesc;

  const prompt = `你是NBA球星卡市场价格分析师。请搜索以下球星卡的近期市场成交价格：

"${cardDesc}"

搜索建议：在eBay搜索 "${cardDesc} sold" 查看已成交记录。

请简洁提供：
1. 📊 价格区间（人民币 + 美元）
2. 📋 近期成交案例（2-3条，如有）
3. 📈 简短行情分析（1-2句）

用中文回答，保持简洁。找不到数据时如实说明并给合理估价。`;

  // Helper: run one search turn
  async function runWithTool(toolType) {
    const msg1 = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      tools: [{ type: toolType, name: "web_search" }],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: prompt }],
    });

    let searchUsed = msg1.content.some(b => b.type === "tool_use");

    // If model wants to use a tool, do a second turn
    if (msg1.stop_reason === "tool_use") {
      const toolBlock = msg1.content.find(b => b.type === "tool_use");
      const msg2 = await client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 1024,
        tools: [{ type: toolType, name: "web_search" }],
        messages: [
          { role: "user", content: prompt },
          { role: "assistant", content: msg1.content },
          {
            role: "user",
            content: [{
              type: "tool_result",
              tool_use_id: toolBlock.id,
              content: `搜索完成，请根据你对"${cardDesc}"的了解整合分析。`,
            }],
          },
        ],
      });
      const text = msg2.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
      return { text, searchUsed: true };
    }

    const text = msg1.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    return { text, searchUsed };
  }

  // Try each known tool type
  for (const toolType of ["web_search_20250305", "web_search_20241022", "web_search_20250101"]) {
    try {
      const { text, searchUsed } = await runWithTool(toolType);
      if (text) {
        return res.json({ success: true, cardDesc, autoDesc, analysis: text, searchUsed, timestamp: new Date().toISOString() });
      }
    } catch (e) {
      const msg = e.message || "";
      if (msg.includes("tool") || msg.includes("search") || msg.includes("unknown") || msg.includes("invalid")) continue;
      return res.status(500).json({ error: msg });
    }
  }

  // Fallback: no web search
  try {
    const fb = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 800,
      messages: [{ role: "user", content: `根据你对NBA球星卡市场的了解，估算：${cardDesc} 的市场价格区间（人民币+美元），并给简短分析。用中文，结尾注明"⚠️ 估算价格，建议参考实时成交数据"。` }],
    });
    const text = fb.content.filter(b => b.type === "text").map(b => b.text).join("");
    return res.json({ success: true, cardDesc, autoDesc, analysis: text, searchUsed: false, timestamp: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: e.message || "查询失败" });
  }
}
