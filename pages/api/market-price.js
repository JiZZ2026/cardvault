import Anthropic from "@anthropic-ai/sdk";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { player, series, parallel, numbered, grade, year } = req.body;
  if (!player) return res.status(400).json({ error: "缺少球星信息" });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Build a precise search query
  const parts = [player];
  if (year) parts.push(year);
  if (series) parts.push(series);
  if (parallel) parts.push(parallel);
  if (numbered) parts.push(numbered);
  if (grade && grade !== "RAW") parts.push(grade);
  const cardDesc = parts.join(" ");

  const prompt = `你是NBA球星卡市场价格分析师。请搜索以下球星卡的近期市场成交价格：

卡片：${cardDesc}

请搜索eBay近期成交价（sold listings），以及其他可获取的中文市场数据。

根据搜索结果，请提供：
1. 市场参考价格区间（人民币）
2. 近期实际成交案例（如有）
3. 简短的市场行情分析（2-3句话）
4. 数据来源说明

如果数据不足，请说明原因并给出尽可能合理的估价区间。
请用中文回答，价格同时提供人民币和美元参考。`;

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    });

    // Extract all text content from response (including after tool use)
    const textBlocks = message.content.filter(b => b.type === "text").map(b => b.text);
    const analysis = textBlocks.join("\n").trim();

    // Also check if there were search results used
    const searchUsed = message.content.some(b => b.type === "tool_use");

    return res.json({
      success: true,
      cardDesc,
      analysis,
      searchUsed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // If web search not available, fall back to Claude's knowledge
    if (error.message?.includes("web_search")) {
      try {
        const fallback = await client.messages.create({
          model: "claude-opus-4-5",
          max_tokens: 800,
          messages: [{ role: "user", content: `根据你对NBA球星卡市场的了解，请估算以下卡片的大概市场价格区间：${cardDesc}。请说明这是基于训练数据的估算，可能与当前市场有偏差。用中文回答，同时提供人民币和美元参考。` }],
        });
        const text = fallback.content.filter(b => b.type === "text").map(b => b.text).join("");
        return res.json({ success: true, cardDesc, analysis: text, searchUsed: false, timestamp: new Date().toISOString() });
      } catch(e2) {
        return res.status(500).json({ error: e2.message });
      }
    }
    console.error("Market price error:", error);
    return res.status(500).json({ error: error.message || "查询失败" });
  }
}
