// pages/api/katao-search.js

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { keyword } = req.body;
  if (!keyword) return res.status(400).json({ error: '缺少 keyword' });
  try {
    const results = await searchKatao(keyword);
    return res.status(200).json({ success: true, keyword, results, total: results.length });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export async function searchKatao(keyword, sold = false) {
  // 手动构建 URL，保持 [ ] { } 不编码（与浏览器行为一致）
  // 卡淘服务器对 searchJson 的解析要求方括号不被 %5B%5D 编码
  const searchJsonRaw = '[{"Key":"Status","Value":' + (sold ? '-2' : '1') + '}]';
  const keywordEncoded = encodeURIComponent(keyword);
  const searchJsonEncoded = searchJsonRaw
    .replace(/"/g, '%22'); // 只编码双引号，保留 [ ] { } : ,

  const url = 'https://www.cardhobby.com.cn/NewCommodity/SearchCommodity'
    + '?userId='
    + '&pageIndex=1'
    + '&pageSize=20'
    + '&searchKey=' + keywordEncoded
    + '&searchJson=' + searchJsonEncoded
    + '&sort=EffectiveTimeStamp'
    + '&sortType=asc';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let data;
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': 'https://www.cardhobby.com.cn/',
      },
    });
    data = await resp.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('卡淘请求超时（10秒）');
    throw new Error('卡淘网络错误: ' + e.message);
  } finally {
    clearTimeout(timeout);
  }

  if (!data || data.result !== 1) {
    throw new Error('卡淘返回错误: ' + (data && data.msg ? data.msg : JSON.stringify(data).slice(0, 100)));
  }

  const items = (data.data && data.data.PagedMarketItemList) ? data.data.PagedMarketItemList : [];

  return items.map(item => {
    const price = item.LowestPrice || parseFloat(item.Price) || 0;
    const priceUSD = item.USD_LowestPrice ? parseFloat(item.USD_LowestPrice) : null;
    const timeLeft = item.EffectiveDate ? calcTimeLeft(item.EffectiveDate) : '';
    const listingType = item.ByWay === 2 ? 'auction' : 'buy_now';
    return {
      id: item.ID,
      title: item.Title,
      image: item.TitImg || null,
      price,
      priceUSD,
      currency: 'RMB',
      url: 'https://www.cardhobby.com.cn/Market/Details/' + item.ID,
      bidCount: item.PriceCount || 0,
      timeLeft,
      listingType,
      seller: item.SellRealName || '',
      isGuarantee: item.IsGuarantee === 1,
      platform: 'katao',
    };
  });
}

function calcTimeLeft(dateStr) {
  try {
    const end = new Date(dateStr);
    const diff = end - Date.now();
    if (diff <= 0) return '已结束';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return days + '天' + hours + '时';
    if (hours > 0) return hours + '时' + mins + '分';
    return mins + '分钟';
  } catch (e) { return ''; }
}
