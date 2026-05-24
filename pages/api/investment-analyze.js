import Anthropic from "@anthropic-ai/sdk";

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { player_name } = req.body;
  if (!player_name) return res.status(400).json({ error: "缺少 player_name" });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `你是一个 NBA 球星卡投资分析师。请对球员「${player_name}」进行 Q/T 双分制评分分析。

## Q 分（资产质量，满分 100）

Q 分衡量这张"资产"的内在质量，由四个维度组成：

### 天花板 (满分 35)
- **年龄窗口** (8分)：球员当前年龄处于什么阶段？年轻上升期给高分，巅峰期中等，下降期低分
- **进攻能力** (12分)：得分、助攻、效率、技术全面性
- **防守能力** (5分)：防守等级、DPOY 潜力
- **角色确定性** (10分)：是否是球队核心？合同状况？未来发展路径是否清晰？

### 叙事面 (满分 25)
- **市场号召力** (8分)：球迷基础、球衣销量、社交媒体热度
- **观赏性** (7分)：打球风格是否吸引眼球？是否有标志性动作？
- **文化穿透力** (5分)：是否超越篮球圈？品牌代言、时尚影响力
- **季后赛叙事** (5分)：季后赛表现历史、是否有经典时刻？冲冠窗口？

### 卡市面 (满分 25)
- **RC 产品线深度** (8分)：新秀卡产品线的丰富度和质量（Prizm/National Treasures/Select 等）
- **同届竞争** (7分)：同一届新秀中的竞争格局，是否一家独大？
- **产品周期** (5分)：目前处于产品发行的什么阶段？早期还是已过高峰？
- **流动性** (5分)：二级市场的交易活跃度，是否容易买卖？

### 修正系数 (±15)
- **伤病风险** (最多 -10)：伤病历史和风险
- **正面催化** (最多 +10)：即将到来的正面事件（全明星、MVP 竞选等）
- **负面风险** (最多 -5)：交易传闻、场外问题等

## T 分（入场时机，满分 100）

T 分衡量"现在是否是买入的好时机"：

- **价格位置** (30分)：当前价格相对于历史高点和低点的位置。越接近历史低点得分越高
- **催化剂距离** (25分)：距离下一个可能推动价格上涨的催化剂（赛季开始、季后赛、全明星等）有多近？越近越高分
- **供给压力** (15分)：市场上的供给量。供给少、惜售情绪浓得高分
- **赛季周期** (15分)：当前处于赛季的哪个阶段？休赛期通常是低点，季后赛是高点
- **买家池深度** (15分)：潜在买家群体的大小和购买力

## 输出要求

请用 web search 搜索该球员的最新信息（当前赛季表现、伤病状况、交易动态、卡市行情等），然后给出分析。

严格按以下 JSON 格式返回，不要包含任何其他文字：

{
  "q_score": <总Q分>,
  "q_breakdown": {
    "ceiling": {
      "total": <天花板总分>,
      "age_window": {"score": <分>, "reason": "<一句话>"},
      "offense": {"score": <分>, "reason": "<一句话>"},
      "defense": {"score": <分>, "reason": "<一句话>"},
      "role_certainty": {"score": <分>, "reason": "<一句话>"}
    },
    "narrative": {
      "total": <叙事面总分>,
      "market_appeal": {"score": <分>, "reason": "<一句话>"},
      "entertainment": {"score": <分>, "reason": "<一句话>"},
      "cultural_impact": {"score": <分>, "reason": "<一句话>"},
      "playoff_narrative": {"score": <分>, "reason": "<一句话>"}
    },
    "card_market": {
      "total": <卡市面总分>,
      "rc_products": {"score": <分>, "reason": "<一句话>"},
      "draft_class_competition": {"score": <分>, "reason": "<一句话>"},
      "product_cycle": {"score": <分>, "reason": "<一句话>"},
      "liquidity": {"score": <分>, "reason": "<一句话>"}
    },
    "modifier": {
      "total": <修正系数>,
      "injury_risk": {"score": <分>, "reason": "<一句话>"},
      "positive_catalyst": {"score": <分>, "reason": "<一句话>"},
      "negative_risk": {"score": <分>, "reason": "<一句话>"}
    }
  },
  "t_score": <总T分>,
  "t_breakdown": {
    "price_position": {"score": <分>, "max": 30, "reason": "<一句话>"},
    "catalyst_distance": {"score": <分>, "max": 25, "reason": "<一句话>"},
    "supply_pressure": {"score": <分>, "max": 15, "reason": "<一句话>"},
    "season_cycle": {"score": <分>, "max": 15, "reason": "<一句话>"},
    "buyer_pool": {"score": <分>, "max": 15, "reason": "<一句话>"}
  },
  "summary": "<一句话总结投资建议>"
}`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = message.content.find(b => b.type === "text");
    if (!textBlock) return res.status(500).json({ error: "AI 未返回分析结果" });

    const raw = textBlock.text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: "AI 返回格式异常" });

    const result = JSON.parse(jsonMatch[0]);

    const q = Math.max(0, Math.min(100, Math.round(Number(result.q_score))));
    const t = Math.max(0, Math.min(100, Math.round(Number(result.t_score))));

    return res.json({
      q_score: q,
      t_score: t,
      q_breakdown: result.q_breakdown,
      t_breakdown: result.t_breakdown,
      summary: result.summary || "",
    });
  } catch (e) {
    console.error("Investment analyze error:", e);
    return res.status(500).json({ error: e.message || "分析失败" });
  }
}
