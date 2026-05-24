import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "../../lib/supabase";

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

const FALLBACK_BENCHMARKS = `
天花板价格参照表（Prizm Base 新秀卡）：
S级：Curry RAW ¥5177, Durant RAW ¥654 / PSA10 ¥4367
A级：Giannis RAW ¥997, Leonard RAW ¥192 / PSA10 ¥754, Harden RAW ¥186
B级：Irving RAW ¥201 / PSA10 ¥853, Lillard RAW ¥93, AD RAW ¥80
规则：2020年后产品天花板打6-8折`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let collectionContext = "";
  try {
    const { data: cards } = await supabase
      .from("cards")
      .select("player, series, year, parallel, category, buy_price, status")
      .limit(200);

    if (cards?.length) {
      const playerCounts = {};
      const seriesCounts = {};
      const prices = [];
      cards.forEach(c => {
        playerCounts[c.player] = (playerCounts[c.player] || 0) + 1;
        if (c.series) seriesCounts[c.series] = (seriesCounts[c.series] || 0) + 1;
        if (c.buy_price) prices.push(parseFloat(c.buy_price));
      });
      const topPlayers = Object.entries(playerCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const topSeries = Object.entries(seriesCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const avgPrice = prices.length ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : 0;
      const maxPrice = prices.length ? Math.max(...prices) : 0;

      collectionContext = `
## 用户收藏画像
- 总卡片数：${cards.length}
- 常收球星：${topPlayers.map(([n, c]) => `${n}(${c}张)`).join("、")}
- 常收系列：${topSeries.map(([n, c]) => `${n}(${c})`).join("、")}
- 价位段：均价¥${avgPrice}，最高¥${maxPrice}
- PC球员偏好：${cards.filter(c => c.category === "PC").map(c => c.player).filter((v, i, a) => a.indexOf(v) === i).join("、") || "无"}
`;
    }
  } catch (e) {
    console.error("Collection context error:", e);
  }

  let existingTracking = "";
  try {
    const { data: investments } = await supabase
      .from("player_investments")
      .select("player_name, investment_type, action_score")
      .eq("status", "active");
    if (investments?.length) {
      existingTracking = `\n## 已有投资追踪（避免重复推荐）\n${investments.map(i => `- ${i.player_name} (${i.investment_type}, 行动分${i.action_score ?? "未评"})`).join("\n")}\n`;
    }
  } catch (e) {
    console.error("Existing tracking error:", e);
  }

  let benchmarkContext = "";
  try {
    const { data: benchmarks } = await supabase
      .from("price_benchmarks")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(30);
    if (benchmarks?.length) {
      benchmarkContext = `\n## 天花板参照表\n${benchmarks.map(b => `- ${b.player_name}: ${b.card_description} RAW¥${b.raw_price_cny || "?"}`).join("\n")}\n`;
    } else {
      benchmarkContext = `\n${FALLBACK_BENCHMARKS}\n`;
    }
  } catch {
    benchmarkContext = `\n${FALLBACK_BENCHMARKS}\n`;
  }

  const today = new Date().toISOString().split("T")[0];

  const userPrompt = `今天是 ${today}。请根据用户的收藏画像和当前NBA市场热点，推荐2-3个值得关注的球员用于球星卡投资追踪。
${collectionContext}
${existingTracking}
${benchmarkContext}

## 推荐要求
1. 不要推荐用户已在追踪的球员
2. 结合用户的收藏偏好（常收系列、价位段、PC球员）
3. 考虑当前NBA赛季阶段和市场热点
4. 每个推荐给出一句话理由和预估行动分（Q/T 双分制）
5. 优先推荐有明确催化剂窗口的球员

## 搜索要求
请搜索以下信息：
1. "NBA 2025-26 breakout players" — 本赛季突破球员
2. "NBA card market trends 2025" — 卡市趋势
3. "NBA prizm card value rising" — 价值上升卡

## 输出格式（严格JSON）
{
  "recommendations": [
    {
      "player_name": "英文名",
      "player_name_cn": "中文名",
      "reason": "一句话推荐理由",
      "estimated_q": <预估Q分 0-100>,
      "estimated_t": <预估T分 0-100>,
      "estimated_action": <预估行动分>,
      "catalyst": "最近催化事件",
      "risk": "主要风险"
    }
  ],
  "market_summary": "一句话市场总结"
}`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: "你是 NBA 球星卡投资分析师。根据用户的收藏偏好和当前市场，推荐值得关注的球员。推荐要实用、具体，避免泛泛而谈。",
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlocks = (message.content || []).filter(b => b.type === "text");
    const allText = textBlocks.map(b => b.text).join("\n");

    let result = null;
    const jsonCandidates = allText.match(/\{[\s\S]*\}/g);
    if (jsonCandidates) {
      const sorted = [...jsonCandidates].sort((a, b) => b.length - a.length);
      for (const candidate of sorted) {
        try {
          const parsed = JSON.parse(candidate);
          if (parsed.recommendations) { result = parsed; break; }
        } catch {}
      }
    }

    if (!result) {
      return res.status(500).json({ error: "AI 返回格式异常" });
    }

    return res.json({
      recommendations: result.recommendations || [],
      market_summary: result.market_summary || "",
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Recommend error:", e);
    return res.status(500).json({ error: e.message || "推荐失败" });
  }
}
