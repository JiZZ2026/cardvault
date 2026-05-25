import { supabase } from "../../lib/supabase";

export const config = {
  api: { bodyParser: { sizeLimit: "20mb" } },
};

function normalizeCard(raw) {
  return {
    player: raw.player_name || raw.player || "",
    team: raw.team || "",
    year: raw.year || "",
    series: raw.set_name || raw.series || "",
    manufacturer: raw.brand || raw.manufacturer || "",
    card_number: raw.card_number || "",
    parallel: raw.parallel || "",
    numbered: raw.numbered || null,
    is_one_of_one: raw.numbered === "/1" || raw.is_one_of_one || false,
    sub_series: raw.sub_series || raw.insert_name || "",
    is_rc: raw.is_rc || false,
    grade: raw.grade || "RAW",
    grade_company: raw.grade_company || null,
    grade_score: raw.grade_score || null,
    category: raw.category || "PC",
    status: raw.status || "holding",
    price_currency: raw.purchase_currency || raw.price_currency || "RMB",
    buy_price: raw.purchase_price != null ? parseFloat(raw.purchase_price) : null,
    buy_date: raw.purchase_date || null,
    sell_price: null,
    sell_date: null,
    source: raw.source || "batch_import",
    location: raw.location || "",
    notes: raw.notes || "",
    tags: raw.tags || [],
    front_image: raw.image_front || null,
    back_image: raw.image_back || null,
    pc_player:
      (raw.category || "PC") === "PC"
        ? raw.player_name || raw.player || null
        : null,
  };
}

function validateCard(card) {
  const issues = [];
  if (!card.player) issues.push("缺少必填字段: player_name");
  if (!card.year) issues.push("缺少必填字段: year");
  if (!card.series) issues.push("缺少必填字段: series");
  return issues;
}

async function checkDuplicate(card) {
  const yearStart = (card.year || "").split("-")[0].trim();
  const seriesKeyword = (card.series || "").split(" ")[0].trim();

  if (!card.player || !yearStart || !seriesKeyword) return null;

  const { data: existing } = await supabase
    .from("cards")
    .select("id, player, year, series, card_number, parallel")
    .ilike("player", `%${card.player}%`)
    .ilike("year", `%${yearStart}%`)
    .ilike("series", `%${seriesKeyword}%`)
    .limit(5);

  if (!existing || existing.length === 0) return null;

  const match = existing.find(
    (e) =>
      (e.card_number || "").replace(/^#/, "") ===
        (card.card_number || "").replace(/^#/, "") &&
      (e.parallel || "").toLowerCase() === (card.parallel || "").toLowerCase()
  );

  return match || null;
}

async function handleValidate(cards, res) {
  const items = [];
  let ready = 0,
    duplicates = 0,
    errors = 0;

  for (let i = 0; i < cards.length; i++) {
    const normalized = normalizeCard(cards[i]);
    const issues = validateCard(normalized);

    if (issues.length > 0) {
      errors++;
      items.push({ index: i, status: "error", card: normalized, issues });
      continue;
    }

    const dup = await checkDuplicate(normalized);
    if (dup) {
      duplicates++;
      items.push({
        index: i,
        status: "duplicate",
        card: normalized,
        issues: ["数据库中已存在相同卡片"],
        existing_id: dup.id,
      });
    } else {
      ready++;
      items.push({ index: i, status: "ready", card: normalized, issues: [] });
    }
  }

  return res.json({ total: cards.length, ready, duplicates, errors, items });
}

async function handleImport(cards, skipDuplicates, res) {
  let imported = 0,
    skipped = 0,
    failed = 0;
  const importErrors = [];

  const toInsert = [];
  for (let i = 0; i < cards.length; i++) {
    const normalized = normalizeCard(cards[i]);
    const issues = validateCard(normalized);
    if (issues.length > 0) {
      failed++;
      importErrors.push({ index: i, issues });
      continue;
    }

    if (skipDuplicates) {
      const dup = await checkDuplicate(normalized);
      if (dup) {
        skipped++;
        continue;
      }
    }

    toInsert.push(normalized);
  }

  const BATCH_SIZE = 50;
  for (let start = 0; start < toInsert.length; start += BATCH_SIZE) {
    const batch = toInsert.slice(start, start + BATCH_SIZE);
    const { error } = await supabase.from("cards").insert(batch);
    if (error) {
      failed += batch.length;
      importErrors.push({
        index: start,
        issues: [`批量写入失败: ${error.message}`],
      });
    } else {
      imported += batch.length;
    }
  }

  return res.json({
    success: failed === 0,
    imported,
    skipped,
    failed,
    errors: importErrors,
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { action } = req.query;
  const { cards, skip_duplicates } = req.body || {};

  if (!Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: "cards 数组不能为空" });
  }

  if (action === "validate") {
    return handleValidate(cards, res);
  }

  if (action === "import") {
    return handleImport(cards, skip_duplicates !== false, res);
  }

  return res.status(400).json({ error: "未知 action，请使用 validate 或 import" });
}
