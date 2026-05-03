// pages/api/katao-search.js
// POST /api/katao-search  搜索卡淘在售/已售卡片

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { keyword, sold = false } = req.body;
  if (!keyword) return res.status(400).json({ error: '缺少 keyword' });

  try {
    const results = await searchKatao(keyword, sold);
    return res.status(200).json({ success: true, keyword, results });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export async function searchKatao(keyword, sold = false) {
  const encoded = encodeURIComponent(keyword);
  const url = `http://www.cardhobby.com.cn/market/search?keyword=${encoded}&searchtype=1`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8秒超时

  let html;
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'http://www.cardhobby.com.cn/',
      },
    });
    html = await resp.text();
  } finally {
    clearTimeout(timeout);
  }

  return parseKataoResults(html, sold);
}

function parseKataoResults(html, sold) {
  const results = [];

  // 解析卡片条目 — 匹配商品块
  // 标题：class 包含 "goods-name" 或 "item-title"
  // 价格：包含 ¥ 符号
  // 卡淘的 HTML 结构：每个商品在一个 <div class="goods-item"> 或类似容器中

  // 提取所有商品块（用正则粗解析，避免依赖 DOM）
  const itemPattern = /<div[^>]*class="[^"]*goods-item[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  let match;

  while ((match = itemPattern.exec(html)) !== null) {
    const block = match[1];

    // 标题
    const titleMatch = block.match(/class="[^"]*goods-name[^"]*"[^>]*>([\s\S]*?)<\/[a-z]+>/i)
      || block.match(/class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/[a-z]+>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    // 价格（人民币）
    const priceMatch = block.match(/¥\s*([\d,\.]+)/);
    const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : 0;

    // 链接
    const linkMatch = block.match(/href="([^"]*\/goods\/[^"]+)"/i)
      || block.match(/href="([^"]*item[^"]+)"/i);
    const relUrl = linkMatch ? linkMatch[1] : '';
    const url = relUrl.startsWith('http') ? relUrl : `http://www.cardhobby.com.cn${relUrl}`;

    // 竞价次数
    const bidMatch = block.match(/(\d+)\s*次竞价/);
    const bidCount = bidMatch ? parseInt(bidMatch[1]) : 0;

    // 剩余时间
    const timeMatch = block.match(/(\d+[天时分][^<]{0,10})/);
    const timeLeft = timeMatch ? timeMatch[1].trim() : '';

    if (title && price > 0) {
      results.push({ title, price, currency: 'RMB', url, bidCount, timeLeft, platform: 'katao' });
    }
  }

  // 如果正则匹配不到，尝试更宽泛的解析
  if (results.length === 0) {
    return parseFallback(html);
  }

  return results;
}

function parseFallback(html) {
  // 备用解析：直接找价格和标题的组合
  const results = [];
  const blocks = html.split(/class="goods-item|class="item-wrap|class="product-item/);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    const titleMatch = block.match(/>([^<]{10,100}Topps|Prizm|Chrome|Panini|加内特|库里|字母[^<]{0,50})</i)
      || block.match(/title="([^"]{5,100})"/);
    const priceMatch = block.match(/¥\s*([\d,\.]+)/);

    if (titleMatch && priceMatch) {
      const title = (titleMatch[1] || titleMatch[0]).replace(/<[^>]+>/g, '').trim();
      const price = parseFloat(priceMatch[1].replace(',', ''));
      if (price > 0) {
        results.push({ title, price, currency: 'RMB', url: '', bidCount: 0, timeLeft: '', platform: 'katao' });
      }
    }
  }

  return results;
}
