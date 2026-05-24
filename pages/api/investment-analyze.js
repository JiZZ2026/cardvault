import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "../../lib/supabase";

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

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
      benchmarkContext = `\n## 天花板价格参照表（用于 T 分透支比计算）\n\n以下是卡市已有的价格基准数据，用于计算透支比（当前价格 / 天花板对标价格）：\n\n${benchmarks.map(b => `- ${b.player_name} (${b.tier}级): ${b.card_description} | 裸卡¥${b.raw_price_cny || "?"} | PSA10¥${b.psa10_price_cny || "?"} | 成交量${b.transaction_volume || "?"}`).join("\n")}\n\n透支比评分标准：\n- <0.2 = 30分（严重低估）\n- 0.2-0.4 = 22分（合理低估）\n- 0.4-0.6 = 15分（合理区间）\n- 0.6-0.8 = 8分（偏高）\n- >0.8 = 3分（严重透支）\n- >1.0 = 0分（超过天花板）\n`;
    }
  } catch (e) {
    console.error("Benchmark query error:", e);
  }

  const prompt = `你是一个 NBA 球星卡投资分析师。请对球员「${player_name}」进行 Q/T 双分制评分分析。

## Q 分（资产质量，满分 100）

Q 分衡量这张"资产"的内在质量，由四个维度组成：

### 天花板维度 (满分 35)
- **年龄窗口** (8分)：球员当前年龄处于什么阶段？
  - 21岁以下上升期 = 7-8分
  - 22-26岁巅峰前期 = 5-7分
  - 27-30岁巅峰期 = 4-5分
  - 31-33岁维持期 = 2-3分
  - 34岁以上下降期 = 0-2分
- **进攻已证明** (12分)：得分能力、助攻能力、效率值、技术全面性。注意是"已证明"而非潜力
  - 联盟前5进攻球员 = 10-12分
  - 全明星级进攻 = 7-9分
  - 优质首发级 = 4-6分
  - 角色球员级 = 1-3分
- **防守能力** (5分)：防守等级、DPOY 潜力、防守端影响力
  - DPOY 级/历史级防守 = 4-5分
  - 全防阵容级 = 3分
  - 合格防守 = 1-2分
  - 防守漏勺 = 0分
- **球队角色确定性** (10分)：是否是球队明确核心？合同状况是否稳定？未来路径是否清晰？
  - 特许经营基石 = 8-10分
  - 球队第二核心 = 5-7分
  - 关键轮换但非核心 = 2-4分
  - 角色不明/可能被交易 = 0-2分

### 叙事面维度 (满分 25)
- **城市市场** (8分)：所在城市的市场大小、球迷基础、媒体曝光度
  - 纽约/洛杉矶/旧金山 = 7-8分
  - 芝加哥/波士顿/迈阿密 = 5-6分
  - 中等市场 = 3-4分
  - 小市场 = 1-2分
- **打法观赏性** (7分)：打球风格是否吸引眼球？是否有标志性动作/绰号？
  - 观赏性极高（扣篮/三分雨/全能） = 6-7分
  - 有一定观赏性 = 3-5分
  - 偏基础打法 = 1-2分
- **文化穿透力** (5分)：是否超越篮球圈？品牌代言、时尚、社交媒体
  - 跨界文化偶像 = 4-5分
  - 有一定破圈 = 2-3分
  - 仅篮球圈内 = 0-1分
- **季后赛叙事** (5分)：季后赛表现历史、经典时刻、冲冠窗口
  - 多次季后赛高光/冠军 = 4-5分
  - 有季后赛表现 = 2-3分
  - 无季后赛经验/表现差 = 0-1分

### 卡市面维度 (满分 25)
- **RC产品线质量** (8分)：新秀卡产品线的丰富度和质量
  - Prizm+NT+Select+Optic 全覆盖 = 7-8分
  - 主流产品线覆盖 = 4-6分
  - 产品线单一 = 1-3分
- **同届竞争强度** (7分)：同一届新秀中的竞争格局
  - 一家独大无争议 = 6-7分
  - 明确领先但有竞争 = 4-5分
  - 群雄割据 = 2-3分
  - 被同届碾压 = 0-1分
- **产品周期位置** (5分)：RC 产品发行处于什么阶段
  - 早期（仍有产品未发布） = 4-5分
  - 中期（主要产品已发布） = 2-3分
  - 后期（全部发布完毕） = 1分
- **流动性** (5分)：二级市场的交易活跃度
  - 每日大量成交 = 4-5分
  - 每周有稳定成交 = 2-3分
  - 成交稀疏 = 0-1分

### 修正系数 (±15)
- **超越预期**：最近表现大幅超越赛前预期 → +10~15
- **低于预期**：最近表现大幅低于预期 → -10~15
- **健康折扣**：有重大伤病历史或当前受伤 → 乘以 0.7~0.8（相当于 -20~-30%，但在修正中体现为 -10~-15）
- **数据环境折扣**：数据膨胀/时代红利导致数据虚高 → -5~10

## T 分（入场时机，满分 100）

T 分衡量"现在是否是买入的好时机"：
${benchmarkContext}
- **价格位置** (30分)：当前价格相对于天花板的位置。用透支比计算。
  - 透支比 = 当前市场价 / 天花板对标价格
  - 如果有上面的天花板参照表数据，请查找同级别球员作为天花板参考
  - 如果没有参照表数据，请用 web search 搜索该球员关键卡的当前市价和历史高点来估算
  - 评分标准：<0.2=30分, 0.2-0.4=22分, 0.4-0.6=15分, 0.6-0.8=8分, >0.8=3分, >1.0=0分
- **催化剂距离** (25分)：距离下一个可能推动价格上涨的催化剂有多近？
  - 1周内有催化剂 = 22-25分
  - 1个月内 = 16-21分
  - 1-3个月 = 10-15分
  - 3个月以上 = 3-9分
  - 无明确催化剂 = 0-2分
- **供给压力** (15分)：市场上的供给量
  - 严重惜售/几乎无卖盘 = 13-15分
  - 供给偏紧 = 8-12分
  - 正常供给 = 4-7分
  - 大量抛售 = 0-3分
- **赛季周期** (15分)：当前处于赛季哪个阶段
  - 休赛期低谷 = 13-15分（最佳买入窗口）
  - 赛季初期 = 8-12分
  - 全明星前后 = 5-8分
  - 季后赛期间 = 2-5分（价格已反映）
- **买家池深度** (15分)：潜在买家群体
  - 全球买家+机构参与 = 12-15分
  - 大量个人买家 = 8-11分
  - 中等买家池 = 4-7分
  - 买家稀少 = 0-3分

## 输出要求

请用 web search 搜索该球员的最新信息（当前赛季表现、伤病状况、交易动态、卡市行情等），然后给出分析。

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
    "price_position": {"score": <0-30>, "max": 30, "reason": "<一句话，包含透支比数值>"},
    "catalyst_distance": {"score": <0-25>, "max": 25, "reason": "<一句话>"},
    "supply_pressure": {"score": <0-15>, "max": 15, "reason": "<一句话>"},
    "season_cycle": {"score": <0-15>, "max": 15, "reason": "<一句话>"},
    "buyer_pool": {"score": <0-15>, "max": 15, "reason": "<一句话>"}
  },
  "summary": "<两句话总结：第一句概括Q分判断，第二句概括T分判断和行动建议>"
}`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }],
      messages: [{ role: "user", content: prompt }],
    });

    // web_search 返回包含多种 block：web_search_tool_use、web_search_tool_result、text
    // JSON 通常在最后一个 text block 中，需要拼接所有 text block
    const textBlocks = (message.content || []).filter(b => b.type === "text");
    if (textBlocks.length === 0) {
      console.error("AI 未返回 text block，content types:", (message.content || []).map(b => b.type));
      return res.status(500).json({ error: "AI 未返回分析结果" });
    }

    // 拼接所有 text block 的内容
    const allText = textBlocks.map(b => b.text).join("\n");
    console.log("AI raw text length:", allText.length, "blocks:", textBlocks.length);

    // 从拼接后的文本中提取最外层的 JSON 对象
    // 贪婪匹配可能匹配到嵌套 JSON 内部，所以从后往前找最后一个完整 JSON
    let result = null;
    const jsonCandidates = allText.match(/\{[\s\S]*\}/g);
    if (jsonCandidates) {
      // 从最长的候选开始尝试解析（最外层 JSON 通常最长）
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
      summary: result.summary || "",
    });
  } catch (e) {
    console.error("Investment analyze error:", e);
    return res.status(500).json({ error: e.message || "分析失败" });
  }
}
