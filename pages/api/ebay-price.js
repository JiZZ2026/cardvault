// eBay Finding API — searches completed/sold listings for real transaction prices

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { player, year, series, parallel, numbered, grade, customQuery } = req.body;
  if (!player && !customQuery) return res.status(400).json({ error: "缺少卡片信息" });

  const appId = process.env.EBAY_APP_ID;
  if (!appId) return res.status(500).json({ error: "eBay API 未配置" });

  // Build search keyword — simplified for best results
  const buildQuery = () => {
    const parts = [];
    // Shorten player name to last name for better eBay results
    if (player) {
      const names = player.trim().split(" ");
      parts.push(names[names.length - 1]); // last name
    }
    if (year) parts.push(year);
    // Series: strip "Basketball", "NBA" for cleaner search
    if (series) {
      const cleanSeries = series
        .replace(/\bBasketball\b/gi, "")
        .replace(/\bNBA\b/gi, "")
        .replace(/\bPanini\b/gi, "")
        .trim();
      if (cleanSeries) parts.push(cleanSeries);
    }
    if (parallel) parts.push(parallel);
    if (numbered) parts.push(numbered);
    if (grade && grade !== "RAW") parts.push(grade);
    return parts.filter(Boolean).join(" ");
  };

  const keyword = customQuery || buildQuery();

  try {
    // eBay Finding API — findCompletedItems returns sold listings
    const params = new URLSearchParams({
      "OPERATION-NAME": "findCompletedItems",
      "SERVICE-VERSION": "1.0.0",
      "SECURITY-APPNAME": appId,
      "RESPONSE-DATA-FORMAT": "JSON",
      "keywords": keyword,
      "categoryId": "212",          // Sports Trading Cards category
      "itemFilter(0).name": "SoldItemsOnly",
      "itemFilter(0).value": "true",
      "sortOrder": "EndTimeSoonest", // most recent first
      "paginationInput.entriesPerPage": "10",
    });

    const url = `https://svcs.ebay.com/services/search/FindingService/v1?${params}`;
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(500).json({ error: `eBay API 错误: ${response.status}` });
    }

    const data = await response.json();
    const root = data?.findCompletedItemsResponse?.[0];

    if (!root || root.ack?.[0] !== "Success") {
      const errMsg = root?.errorMessage?.[0]?.error?.[0]?.message?.[0] || "查询失败";
      return res.json({ success: false, error: errMsg, keyword });
    }

    const items = root?.searchResult?.[0]?.item || [];
    const totalFound = parseInt(root?.searchResult?.[0]?.["@count"] || "0");

    if (items.length === 0) {
      return res.json({ success: true, keyword, totalFound: 0, results: [], message: "未找到成交记录，建议修改搜索词" });
    }

    // Parse results
    const results = items.map(item => {
      const price = parseFloat(item?.sellingStatus?.[0]?.currentPrice?.[0]?.["__value__"] || "0");
      const currency = item?.sellingStatus?.[0]?.currentPrice?.[0]?.["@currencyId"] || "USD";
      const title = item?.title?.[0] || "";
      const endTime = item?.listingInfo?.[0]?.endTime?.[0] || "";
      const url = item?.viewItemURL?.[0] || "";
      const condition = item?.condition?.[0]?.conditionDisplayName?.[0] || "";

      return { title, price, currency, endTime, url, condition };
    }).filter(r => r.price > 0);

    // Calculate stats
    const prices = results.map(r => r.price);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const median = [...prices].sort((a, b) => a - b)[Math.floor(prices.length / 2)];

    return res.json({
      success: true,
      keyword,
      totalFound,
      results: results.slice(0, 8),
      stats: {
        count: results.length,
        avg: Math.round(avg * 100) / 100,
        min: Math.round(min * 100) / 100,
        max: Math.round(max * 100) / 100,
        median: Math.round(median * 100) / 100,
        currency: results[0]?.currency || "USD",
      },
    });

  } catch (e) {
    console.error("eBay API error:", e);
    return res.status(500).json({ error: e.message || "查询失败" });
  }
}
