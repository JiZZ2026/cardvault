import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "../../lib/supabase";

export const config = {
  api: { bodyParser: { sizeLimit: "20mb" } },
};

function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch {}
  const s = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

async function fetchContext() {
  const parts = [];

  const [distResult, pcPlayersResult, correctionsResult] = await Promise.all([
    supabase.from("cards").select("series, year, parallel").order("created_at", { ascending: false }).limit(30),
    supabase.from("cards").select("pc_player").not("pc_player", "is", null).neq("pc_player", ""),
    supabase.from("recognition_corrections").select("original, corrected, field_diffs, series").order("created_at", { ascending: false }).limit(10),
  ]);
  const dist = distResult.data;
  const pcPlayers = pcPlayersResult.data;
  const corrections = correctionsResult.data;

  if (dist && dist.length > 0) {
    const counts = {};
    dist.forEach(c => {
      const key = [c.year, c.series].filter(Boolean).join(" ");
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (top.length > 0) {
      parts.push(`用户收藏偏好：最近主要收集 ${top.map(([k]) => k).join("、")} 系列。`);
    }
  }

  if (pcPlayers && pcPlayers.length > 0) {
    const unique = [...new Set(pcPlayers.map(r => r.pc_player))];
    parts.push(`PC球员（用户重点收集）：${unique.join(", ")}。`);
  }

  if (corrections && corrections.length > 0) {
    const tips = corrections.map(c => {
      const diffs = c.field_diffs || {};
      return Object.entries(diffs).map(([field, { from, to }]) =>
        `${field}: "${from}" 应为 "${to}"${c.series ? `（${c.series}系列）` : ""}`
      ).join("；");
    }).filter(Boolean);
    if (tips.length > 0) {
      parts.push(`历史纠错（用户曾修正过的识别错误，请避免重犯）：${tips.join("；")}。`);
    }
  }

  return parts.join("\n");
}

async function fetchParallels(seriesHint) {
  if (!seriesHint) return null;
  const { data } = await supabase
    .from("checklists")
    .select("items")
    .eq("checklist_type", "parallels")
    .ilike("set_name", `%${seriesHint}%`)
    .limit(1)
    .single();

  if (data && data.items && Array.isArray(data.items)) {
    const names = data.items.map(i => i.name || i.parallel).filter(Boolean);
    if (names.length > 0) return names;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { frontImage, backImage } = req.body;
  if (!frontImage && !backImage) {
    return res.status(400).json({ error: "需要至少一张图片" });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const contextStr = await fetchContext();

  const content = [];

  const addImage = (dataUrl, label) => {
    if (!dataUrl) return;
    const comma = dataUrl.indexOf(",");
    const base64 = comma !== -1 ? dataUrl.slice(comma + 1) : dataUrl;
    const mediaType = dataUrl.includes("image/png") ? "image/png" : "image/jpeg";
    content.push({ type: "text", text: `${label}：` });
    content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } });
  };

  addImage(frontImage, "正面");
  addImage(backImage, "背面");

  let promptText = `你是NBA球星卡鉴定专家。请按以下步骤分析图片中的球星卡：

Step 1 - 识别品牌系列：观察卡面设计、Logo、边框样式，判断制造商（Panini/Topps/Upper Deck）和产品系列全名（如 Prizm、Select、Mosaic 等）。
Step 2 - 识别球员：读取卡面球员姓名、球队信息、球衣号码。
Step 3 - 判断平行类型：根据卡面颜色、折射效果、特殊标记判断是否为平行版本。base card 则 parallel 为 null。
Step 4 - 读取编号、卡号、评级：查看卡背或卡面的卡号、限量编号（如 /50、1/1）、评级信息。`;

  if (contextStr) {
    promptText += `\n\n【用户上下文信息，辅助你更准确地识别】\n${contextStr}`;
  }

  promptText += `\n\n只返回JSON，不加任何其他文字：
{"player":"球星英文全名","team":"球队英文全名","year":"赛季如2023-24","series":"产品系列全名如NBA Hoops Premium Stock","manufacturer":"Topps或Panini或Upper Deck","cardNumber":"卡号如No.14或#247","parallel":"平行类型如Black Pulsar Prizm或Gold Refractor，base card则null","numbered":"编号如/50或1/1，无则null","isOneOfOne":false,"subSeries":"子系列如City Edition，无则null","isRC":false,"grade":"RAW或PSA 10等","gradeCompany":null,"gradeScore":null,"confidence":"high/medium/low"}`;

  content.push({ type: "text", text: promptText });

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 512,
      messages: [{ role: "user", content }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    const result = extractJSON(text);
    if (!result) {
      return res.status(500).json({ error: "识别结果解析失败", raw: text });
    }

    if (result.series) {
      const parallels = await fetchParallels(result.series);
      if (parallels && result.parallel) {
        const match = parallels.find(p =>
          p.toLowerCase() === result.parallel.toLowerCase() ||
          result.parallel.toLowerCase().includes(p.toLowerCase()) ||
          p.toLowerCase().includes(result.parallel.toLowerCase())
        );
        if (match) result.parallel = match;
      }
      if (parallels) result._knownParallels = parallels;
    }

    return res.json({ success: true, data: result });
  } catch (error) {
    console.error("Claude API error:", error);
    return res.status(500).json({ error: error.message || "识别失败" });
  }
}
