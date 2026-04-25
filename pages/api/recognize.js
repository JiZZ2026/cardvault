import Anthropic from "@anthropic-ai/sdk";

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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { frontImage, backImage } = req.body;
  if (!frontImage && !backImage) {
    return res.status(400).json({ error: "需要至少一张图片" });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

  content.push({
    type: "text",
    text: `你是NBA球星卡鉴定专家。仔细分析图片中的球星卡，提取所有可见信息。只返回JSON，不加任何其他文字：
{"player":"球星英文全名","team":"球队英文全名","year":"赛季如2023-24","series":"产品系列全名如NBA Hoops Premium Stock","manufacturer":"Topps或Panini或Upper Deck","cardNumber":"卡号如No.14或#247","parallel":"平行类型如Black Pulsar Prizm或Gold Refractor，base card则null","numbered":"编号如/50或1/1，无则null","isOneOfOne":false,"subSeries":"子系列如City Edition，无则null","isRC":false,"grade":"RAW或PSA 10等","gradeCompany":null,"gradeScore":null,"confidence":"high/medium/low"}`,
  });

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
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

    return res.json({ success: true, data: result });
  } catch (error) {
    console.error("Claude API error:", error);
    return res.status(500).json({ error: error.message || "识别失败" });
  }
}
