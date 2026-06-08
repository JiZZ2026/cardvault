// lib/katao-keywords.js
// 卡淘关键词生成的统一入口。
// 风格模仿 collection-goals.js 的 KNOWN_SUBSETS:硬编码 alias 表,
// 由 scripts/katao-calibrate.mjs 实证校准结果填充/更新。
//
// 设计原则:
//   1. 卡淘卖家上传/买家搜索都用最少、最通用的词
//   2. 中文官方全译名带"·"的(如"孔·克纳普尔"、"扎沙里·里沙尔"),
//      卡淘几乎搜不到——必须 alias 或退到姓氏段
//   3. 默认带 year_short 消歧(若 player_meta 提供;无则不强加)
//   4. 不加平行颜色名(由结果标题匹配判断)

// ── KATAO_NAME_ALIASES: 中文全译名 → 卡淘最易命中的写法 ────────────────
// 触发条件:player_name_cn 完全等于 key 时,用 value 替代。
// 收录原则:实证校准时,alias 写法成交命中显著高于全译名写法。
// 维护方式:scripts/katao-calibrate.mjs 跑完后,把命中数显著优的写法记到这里。
export const KATAO_NAME_ALIASES = {
  // 由 scripts/katao-calibrate.mjs 实证校准填充。
  // 每条记录:基线(成交) → 推荐(成交)
  //
  // 布兰登·米勒(2726) → 米勒(10287),约 4× 改进
  "布兰登·米勒": "米勒",
  // 库珀·弗拉格(102) → 弗拉格(653),约 6× 改进
  "库珀·弗拉格": "弗拉格",
  // 扎沙里·里沙尔(0) → Risacher(5886),0 → 5886 救回
  //   卡淘几乎没人用全译名;民间简称"里沙尔"也只 1 条成交;英文姓氏完胜
  "扎沙里·里沙尔": "Risacher",
  // 孔·克纳普尔(0) → Knueppel(32),0 → 32 救回
  //   中文译名 0/0,英文虽少但唯一可命中
  "孔·克纳普尔": "Knueppel",
  // ── 未列入:文班亚马(29347,单段无需 alias)、哈珀(644,基线最佳)
};

// ── 把中文名解析成"卡淘最易命中"的人名部分 ───────────────────────────
// 优先级:alias 表 → 去"·"取末段 → 原中文 → 英文姓氏
export function resolveKataoPlayerName(cn, en) {
  const cnTrim = (cn || "").trim();
  if (cnTrim && KATAO_NAME_ALIASES[cnTrim]) return KATAO_NAME_ALIASES[cnTrim];
  // 通用回退:含"·"或"•"或"・"的中文,取最后一段
  if (cnTrim && /[·•・]/.test(cnTrim)) {
    const parts = cnTrim.split(/[·•・]/).map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  if (cnTrim) return cnTrim;
  // 中文完全没有 → 用英文姓氏
  return (en || "").trim().split(/\s+/).pop() || "";
}

// ── 通用的卡淘关键词组装(球员/年份/品牌/编号) ───────────────────────
// 输入:
//   { playerCn, playerEn, yearShort, brand, numStr }
// 输出: 一个字符串,如 "弗拉格 25-26 prizm /10"
export function buildKataoKeyword({ playerCn, playerEn, yearShort, brand, numStr }) {
  const player = resolveKataoPlayerName(playerCn, playerEn);
  const b = (brand || "prizm").toLowerCase();
  return [player, yearShort || "", b, numStr || ""].filter(Boolean).join(" ").trim();
}

// ── 投资专用关键词(简化输入) ─────────────────────────────────────────
export function buildInvestmentKataoKeyword(inv) {
  const cn = inv?.player_name_cn || "";
  const en = inv?.player_name || "";
  const meta = inv?.player_meta || {};
  const yearShort = meta.year_short || "";
  const brand = (meta.brand || "prizm").toLowerCase();
  return buildKataoKeyword({ playerCn: cn, playerEn: en, yearShort, brand });
}
