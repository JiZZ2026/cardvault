// pages/api/katao-debug.js
// 临时调试用 — 返回卡淘搜索页的原始 HTML 片段
// GET /api/katao-debug?keyword=加内特+prizm

export default async function handler(req, res) {
  const keyword = req.query.keyword || '加内特 prizm';
  const encoded = encodeURIComponent(keyword);
  const url = `http://www.cardhobby.com.cn/market/search?keyword=${encoded}&searchtype=1`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': 'http://www.cardhobby.com.cn/',
      },
    });
    clearTimeout(timeout);

    const html = await resp.text();
    const status = resp.status;

    // 返回关键片段，帮助分析结构
    // 找第一个商品块的前后各 2000 字符
    const markers = [
      'goods-item', 'product-item', 'item-wrap', 'card-item',
      'goods-list', 'search-result', 'commodity', 'lot-item',
      '次竞价', '¥', 'auction'
    ];

    const snippets = {};
    for (const marker of markers) {
      const idx = html.indexOf(marker);
      if (idx !== -1) {
        snippets[marker] = html.substring(Math.max(0, idx - 100), idx + 500);
      }
    }

    // 同时返回 HTML 前 3000 字符和中间一段
    return res.status(200).json({
      url,
      http_status: status,
      html_length: html.length,
      html_start: html.substring(0, 2000),
      html_middle: html.substring(Math.floor(html.length / 2), Math.floor(html.length / 2) + 2000),
      snippets,
      found_markers: Object.keys(snippets),
    });

  } catch (e) {
    return res.status(500).json({
      url,
      error: e.message,
      error_type: e.name,
      note: e.name === 'AbortError' ? '请求超时（10秒），Vercel可能无法访问卡淘' : '网络错误',
    });
  }
}
