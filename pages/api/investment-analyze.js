import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "../../lib/supabase";

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

const FALLBACK_BENCHMARKS = `
天花板价格参照表（Prizm Base 新秀卡，用于透支比计算）：

S级天花板（历史级球员）:
- Stephen Curry: RAW ¥5177
- Kevin Durant: RAW ¥654 / PSA10 ¥4367

A级天花板（全明星核心级）:
- Giannis Antetokounmpo: RAW ¥997（2MVP+1冠，Base天花板被供给量锁死）
- Kawhi Leonard: RAW ¥192 / PSA10 ¥754
- James Harden: RAW ¥186
- Dwyane Wade: RAW ¥107

B级天花板（优质首发级）:
- Kyrie Irving: RAW ¥201 / PSA10 ¥853
- Damian Lillard: RAW ¥93 / PSA10 ¥563
- Anthony Davis: RAW ¥80 / PSA10 ¥382
- Chris Paul: RAW ¥39

重要规则：
- 2020年后产品的同级天花板打6-8折（供给量显著增大）
- 成就≠卡价，Giannis 2MVP+1冠 Prizm Base RAW 也只有 ¥997，说明 Base 天花板被供给量锁死
- 卡价驱动力排序：稀缺性 > 情感溢价 > 当前热度 > 市场规模 > 成就`;

const SYSTEM_PROMPT = `你是一个 NBA 球星卡投资分析师，严格按照以下 Q/T 双分制框架评分。你不能自由发挥评分标准，必须严格遵守每个维度的定义和分数范围。

## 核心原则（必须遵守）

1. 选秀顺位不是Q分独立维度，市场只看球场表现
2. 成就≠卡价，卡价驱动力排序：稀缺性 > 情感溢价 > 当前热度 > 市场规模 > 成就
3. Base天花板被供给量锁死，Giannis 2MVP+1冠 Prizm Base RAW 也只有 ¥997
4. 催化剂正在发生 = 价格已升高 = 对买家不利，对持有者是卖出窗口
5. 季后赛/全明星期间，赛季周期维度应该给低分（价格已反映热度）
6. T分是从买家视角评估的——高T分意味着现在是好的买入时机（价格低、催化剂远、市场冷）

## Q 分（资产质量，满分 100）

### 天花板维度 (满分 35)
- 年龄窗口 (8分)：21岁以下=7-8, 22-26岁=5-7, 27-30岁=4-5, 31-33岁=2-3, 34+岁=0-2
- 进攻已证明 (12分)：联盟前5=10-12, 全明星级=7-9, 优质首发=4-6, 角色球员=1-3。注意是"已证明"而非潜力
- 防守能力 (5分)：DPOY级=4-5, 全防阵容=3, 合格=1-2, 漏勺=0
- 球队角色确定性 (10分)：特许基石=8-10, 第二核心=5-7, 关键轮换=2-4, 角色不明=0-2

### 叙事面维度 (满分 25)
- 城市市场 (8分)：纽约/LA/旧金山=7-8, 芝加哥/波士顿/迈阿密=5-6, 中等市场=3-4, 小市场=1-2
- 打法观赏性 (7分)：极高=6-7, 有一定=3-5, 偏基础=1-2
- 文化穿透力 (5分)：跨界偶像=4-5, 有破圈=2-3, 仅篮球圈=0-1
- 季后赛叙事 (5分)：多次高光/冠军=4-5, 有表现=2-3, 无经验/差=0-1

### 卡市面维度 (满分 25)
- RC产品线质量 (8分)：Prizm+NT+Select+Optic全覆盖=7-8, 主流覆盖=4-6, 产品线单一=1-3
- 同届竞争强度 (7分)：一家独大=6-7, 明确领先=4-5, 群雄割据=2-3, 被碾压=0-1
- 产品周期位置 (5分)：早期=4-5, 中期=2-3, 后期=1
- 流动性 (5分)：每日大量成交=4-5, 每周稳定=2-3, 成交稀疏=0-1

### 修正系数 (±15)
- 超越预期：+10~15 / 低于预期：-10~15
- 健康折扣：重大伤病 → -10~-15
- 数据环境折扣：数据膨胀 → -5~-10

## T 分（入场时机，满分 100）——从买家视角

### 价格位置 (满分 30)
用透支比计算：透支比 = 当前市场价 / 同级天花板对标价格
- 透支比 <0.2 = 30分（严重低估，捡漏机会）
- 透支比 0.2-0.4 = 22分（合理低估）
- 透支比 0.4-0.6 = 15分（合理区间）
- 透支比 0.6-0.8 = 8分（偏高，谨慎）
- 透支比 >0.8 = 3分（严重透支）
- 透支比 >1.0 = 0分（超过天花板，泡沫）

### 催化剂距离 (满分 25)——衡量"下一个还未被市场定价的催化事件有多远"
⚠️ 关键逻辑：催化事件正在发生 = 价格已经反映热度 = 买入窗口关闭 = 低分！
- 催化事件正在发生中（如正在打季后赛、刚获奖）= 3-8分（追高风险，价格已涨）
- 催化事件刚结束、市场开始冷却 = 8-12分（回调中但尚未到底）
- 距离下一个催化事件 1-3个月 = 12-18分（有提前布局空间）
- 距离下一个催化事件 3-6个月 = 18-22分（充足的布局窗口）
- 休赛期中段、无近期催化事件 = 22-25分（最佳买入时机，市场最冷）

### 供给压力 (满分 15)
- 严重惜售/几乎无卖盘 = 13-15
- 供给偏紧 = 8-12
- 正常供给 = 4-7
- 大量抛售 = 0-3
- PSA pop report 数据很重要：pop > 20000 表示供给过大，天花板需要打折

### 赛季周期 (满分 15)
⚠️ 季后赛/全明星 = 价格高峰 = 买家应该等 = 低分
- 休赛期低谷（7-9月）= 13-15分（最佳买入窗口）
- 赛季初期（10-12月）= 8-12分
- 全明星前后（1-2月）= 4-7分（价格开始升温）
- 季后赛期间（4-6月）= 2-5分（价格已反映热度，追高风险）

### 买家池深度 (满分 15)
- 全球买家+机构参与 = 12-15
- 大量个人买家 = 8-11
- 中等买家池 = 4-7
- 买家稀少 = 0-3

## 行动分 = min(Q, T)
- >=75 积极建仓
- 60-74 小仓位试探
- 40-59 不建仓，观望
- <40 不碰

## 持有者视角反转规则
如果用户已经持有该球员的卡片，T分的含义需要反转：
- T分高（市场冷、价格低）= 对持有者不利，建议继续持有等待
- T分低（催化剂正在发生、价格高）= 对持有者有利，是出货窗口
在 holder_perspective 字段中给出持有者建议。`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { player_name } = req.body;
  if (!player_name) return res.status(400).json({ error: "缺少 player_name" });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let benchmarkContext = "";
  try {
    const { data: benchmarks } = await supabase
      .from("price_benchmarks")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (benchmarks && benchmarks.length > 0) {
      benchmarkContext = `\n## 天花板价格参照表（来自数据库，优先使用）\n\n${benchmarks.map(b => `- ${b.player_name} (${b.tier}级): ${b.card_description} | 裸卡¥${b.raw_price_cny || "?"} | PSA10¥${b.psa10_price_cny || "?"} | 成交量${b.transaction_volume || "?"}`).join("\n")}\n`;
    } else {
      benchmarkContext = `\n## 天花板价格参照表（硬编码基准）\n\n${FALLBACK_BENCHMARKS}\n`;
    }
  } catch (e) {
    console.error("Benchmark query error:", e);
    benchmarkContext = `\n## 天花板价格参照表（硬编码基准）\n\n${FALLBACK_BENCHMARKS}\n`;
  }

  let holderContext = "";
  try {
    const { data: heldCards } = await supabase
      .from("cards")
      .select("player, series, parallel, grade, buy_price, status")
      .or(`player.ilike.%${player_name}%`)
      .limit(20);
    if (heldCards && heldCards.length > 0) {
      holderContext = `\n## 用户持仓信息\n\n用户已经持有该球员 ${heldCards.length} 张卡片：\n${heldCards.map(c => `- ${c.series || "?"} ${c.parallel || "Base"} ${c.grade ? `(${c.grade})` : "RAW"} | 买入价¥${c.buy_price || "?"} | 状态:${c.status || "holding"}`).join("\n")}\n\n⚠️ 因为用户已持有该球员卡片，请在 holder_perspective 字段给出持有者视角的建议（T分高=市场冷=继续持有等待, T分低=催化剂到来=考虑出货）。\n`;
    } else {
      holderContext = "\n## 用户持仓信息\n\n用户当前未持有该球员任何卡片。holder_perspective 设为 null。\n";
    }
  } catch (e) {
    console.error("Held cards query error:", e);
    holderContext = "\n## 用户持仓信息\n\n无法查询持仓数据。holder_perspective 设为 null。\n";
  }

  const today = new Date().toISOString().split("T")[0];

  const userPrompt = `请对球员「${player_name}」进行 Q/T 双分制评分分析。今天是 ${today}。
${benchmarkContext}
${holderContext}
## 搜索要求

请用 web search 搜索以下信息：
1. "${player_name} current season stats 2025-26 NBA" — 当前赛季表现
2. "${player_name} injury update 2025" — 伤病状况
3. "${player_name} prizm PSA 10 pop report" — PSA pop 数量，用于供给压力评估
4. "${player_name} prizm base card price" — 当前卡价行情
5. 如果是季后赛期间，搜索 "NBA playoffs 2026 bracket" 确认赛季阶段

## 透支比计算步骤

1. 确定该球员属于什么级别（S/A/B/C）
2. 从天花板参照表中找到同级球员的价格作为天花板
3. 如果是2020年后产品，天花板打6-8折
4. 透支比 = 当前市场价 / 调整后天花板价格
5. 在 price_position 的 reason 中注明透支比数值

## 输出要求

严格按以下 JSON 格式返回，不要包含任何其他文字：

{
  "q_score": <总Q分 0-100>,
  "q_breakdown": {
    "ceiling": {
      "total": <天花板总分 0-35>,
      "age_window": {"score": <0-8>, "reason": "<一句话>"},
      "offense": {"score": <0-12>, "reason": "<一句话>"},
      "defense": {"score": <0-5>, "reason": "<一句话>"},
      "role_certainty": {"score": <0-10>, "reason": "<一句话>"}
    },
    "narrative": {
      "total": <叙事面总分 0-25>,
      "market_appeal": {"score": <0-8>, "reason": "<一句话>"},
      "entertainment": {"score": <0-7>, "reason": "<一句话>"},
      "cultural_impact": {"score": <0-5>, "reason": "<一句话>"},
      "playoff_narrative": {"score": <0-5>, "reason": "<一句话>"}
    },
    "card_market": {
      "total": <卡市面总分 0-25>,
      "rc_products": {"score": <0-8>, "reason": "<一句话>"},
      "draft_class_competition": {"score": <0-7>, "reason": "<一句话>"},
      "product_cycle": {"score": <0-5>, "reason": "<一句话>"},
      "liquidity": {"score": <0-5>, "reason": "<一句话>"}
    },
    "modifier": {
      "total": <修正系数 -15到+15>,
      "detail": "<一句话说明修正原因和组成>"
    }
  },
  "t_score": <总T分 0-100>,
  "t_breakdown": {
    "price_position": {"score": <0-30>, "max": 30, "reason": "<包含透支比数值，如'透支比0.65，偏高'>"},
    "catalyst_distance": {"score": <0-25>, "max": 25, "reason": "<说明当前催化剂状态，正在发生=低分>"},
    "supply_pressure": {"score": <0-15>, "max": 15, "reason": "<包含PSA pop数量如有>"},
    "season_cycle": {"score": <0-15>, "max": 15, "reason": "<说明当前赛季阶段>"},
    "buyer_pool": {"score": <0-15>, "max": 15, "reason": "<一句话>"}
  },
  "holder_perspective": "<如果用户持有该球员卡片，给出持有者建议（T分低=催化剂到来=出货窗口）；如果未持有，设为null>",
  "summary": "<两句话总结：第一句概括Q分判断，第二句概括T分判断和行动建议>"
}`;

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }],
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlocks = (message.content || []).filter(b => b.type === "text");
    if (textBlocks.length === 0) {
      console.error("AI 未返回 text block，content types:", (message.content || []).map(b => b.type));
      return res.status(500).json({ error: "AI 未返回分析结果" });
    }

    const allText = textBlocks.map(b => b.text).join("\n");
    console.log("AI raw text length:", allText.length, "blocks:", textBlocks.length);

    let result = null;
    const jsonCandidates = allText.match(/\{[\s\S]*\}/g);
    if (jsonCandidates) {
      const sorted = [...jsonCandidates].sort((a, b) => b.length - a.length);
      for (const candidate of sorted) {
        try {
          const parsed = JSON.parse(candidate);
          if (parsed.q_score !== undefined && parsed.t_score !== undefined) {
            result = parsed;
            break;
          }
        } catch {}
      }
    }

    if (!result) {
      console.error("AI 返回格式异常，无法提取 JSON。原始文本前500字符:", allText.slice(0, 500));
      return res.status(500).json({ error: "AI 返回格式异常" });
    }

    const q = Math.max(0, Math.min(100, Math.round(Number(result.q_score))));
    const t = Math.max(0, Math.min(100, Math.round(Number(result.t_score))));

    return res.json({
      q_score: q,
      t_score: t,
      q_breakdown: result.q_breakdown,
      t_breakdown: result.t_breakdown,
      holder_perspective: result.holder_perspective || null,
      summary: result.summary || "",
    });
  } catch (e) {
    console.error("Investment analyze error:", e);
    return res.status(500).json({ error: e.message || "分析失败" });
  }
}
