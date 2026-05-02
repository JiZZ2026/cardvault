export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { player, year, series, parallel, numbered, grade, customQuery } = req.body;
  if (!player && !customQuery) return res.status(400).json({ error: "缺少卡片信息" });

  const appId = process.env.EBAY_APP_ID;
  if (!appId) return res.status(500).json({ error: "eBay API 未配置" });

  const parts = [];
  if (player) parts.push(player.trim().split(" ").slice(-1)[0]);
  if (year) parts.push(year);
  if (series) parts.push(series.replace(/\b(Basketball|NBA|Panini|Topps)\b/gi, "").trim());
  if (parallel) parts.push(parallel);
  if (numbered) parts.push(numbered);
  if (grade && grade !== "RAW") parts.push(grade);
  const keyword = customQuery || parts.filter(Boolean).join(" ");

  const base = "https://svcs.ebay.com/services/search/FindingService/v1";
  const queryStr = [
    `OPERATION-NAME=findCompletedItems`,
    `SERVICE-VERSION=1.0.0`,
    `SECURITY-APPNAME=${encodeURIComponent(appId)}`,
    `RESPONSE-DATA-FORMAT=JSON`,
    `keywords=${encodeURIComponent(keyword)}`,
    `itemFilter%280%29.name=SoldItemsOnly`,
    `itemFilter%280%29.value=true`,
    `sortOrder=EndTimeSoonest`,
    `paginationInput.entriesPerPage=10`,
  ].join("&");

  try {
    const response = await fetch(`${base}?${queryStr}`);
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({ error: "eBay 返回非JSON响应", detail: text.slice(0, 300) });
    }

    const root = data?.findCompletedItemsResponse?.[0];
    if (!root) {
      // 把 eBay 实际返回的内容暴露出来，方便调试
      const detail = JSON.stringify(data).slice(0, 400);
      console.error("eBay unexpected shape:", detail);
      return res.status(500).json({ error: "eBay 响应格式异常：" + detail, keyword });
    }

    const ack = root.ack?.[0];
    if (ack !== "Success") {
      const errMsg = root?.errorMessage?.[0]?.error?.[0]?.message?.[0] || `eBay ack: ${ack}`;
      return res.json({ success: false, error: errMsg, keyword });
    }

    const items = root?.searchResult?.[0]?.item || [];
    const totalFound = parseInt(root?.searchResult?.[0]?.["@count"] || "0");

    if (items.length === 0) {
      return res.json({ success: true, keyword, totalFound: 0, results: [], message: "未找到成交记录" });
    }

    const results = items.map(item => ({
      title:     item?.title?.[0] || "",
      price:     parseFloat(item?.sellingStatus?.[0]?.currentPrice?.[0]?.["__value__"] || "0"),
      currency:  item?.sellingStatus?.[0]?.currentPrice?.[0]?.["@currencyId"] || "USD",
      endTime:   item?.listingInfo?.[0]?.endTime?.[0] || "",
      url:       item?.viewItemURL?.[0] || "",
      condition: item?.condition?.[0]?.conditionDisplayName?.[0] || "",
    })).filter(r => r.price > 0);

    if (results.length === 0) {
      return res.json({ success: true, keyword, totalFound, results: [], message: "成交记录中无有效价格" });
    }

    const prices = results.map(r => r.price);
    const avg    = prices.reduce((a, b) => a + b, 0) / prices.length;
    const min    = Math.min(...prices);
    const max    = Math.max(...prices);
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    return res.json({
      success: true, keyword, totalFound,
      results: results.slice(0, 8),
      stats: {
        count: results.length,
        avg:    Math.round(avg * 100) / 100,
        min:    Math.round(min * 100) / 100,
        max:    Math.round(max * 100) / 100,
        median: Math.round(median * 100) / 100,
        currency: results[0]?.currency || "USD",
      },
    });

  } catch (e) {
    return res.status(500).json({ error: e.message || "查询失败", keyword });
  }
}
