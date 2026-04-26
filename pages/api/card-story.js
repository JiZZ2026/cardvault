import Anthropic from "@anthropic-ai/sdk";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { backImage, player, year, series, cardNumber } = req.body;
  if (!player) return res.status(400).json({ error: "缺少球星信息" });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    let story;

    if (backImage) {
      // Has back image — extract text from card back and translate
      const comma = backImage.indexOf(",");
      const base64 = comma !== -1 ? backImage.slice(comma + 1) : backImage;
      const mediaType = backImage.includes("image/png") ? "image/png" : "image/jpeg";

      const message = await client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: `这是一张NBA球星卡的背面。请：
1. 提取卡背上的球员介绍文字（通常在球队logo下方）
2. 将其翻译成流畅自然的中文
3. 如果文字太短或看不清，请根据你对${player}的了解，补充一段100字左右的中文球员故事

只返回中文故事文字，不要加任何解释或标题。` }
          ],
        }],
      });

      story = message.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
    } else {
      // No back image — generate story from knowledge
      const message = await client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: `请用中文写一段关于${player}的球员故事，100-150字，风格简洁有感情，适合球星卡收藏展示。${year ? `背景是${year}赛季。` : ""}${series ? `这是${series}系列。` : ""}只返回故事文字，不要标题。`
        }],
      });
      story = message.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
    }

    return res.json({ success: true, story });
  } catch (e) {
    console.error("Card story error:", e);
    return res.status(500).json({ error: e.message || "获取故事失败" });
  }
}
