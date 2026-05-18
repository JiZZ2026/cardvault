// pages/api/katao-search.js

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { keyword, sold } = req.body;
  if (!keyword) return res.status(400).json({ error: '缺少 keyword' });
  try {
    const results = await searchKatao(keyword, sold === true);
    return res.status(200).json({ success: true, keyword, results, total: results.length });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export async function searchKatao(keyword, sold = false) {
  // sold=false → Status:1（在售）  sold=true → Status:-2（已售）
  const searchJsonRaw = '[{"Key":"Status","Value":' + (sold ? '-2' : '1') + '}]';
  const keywordEncoded = encodeURIComponent(keyword);
  const searchJsonEncoded = searchJsonRaw.replace(/"/g, '%22');

  const url = 'https://www.cardhobby.com.cn/NewCommodity/SearchCommodity'
    + '?userId='
    + '&pageIndex=1'
    + '&pageSize=20'
    + '&searchKey=' + keywordEncoded
    + '&searchJson=' + searchJsonEncoded
    + '&sort=EffectiveTimeStamp'
    + '&sortType=desc';           // 最新优先

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
      // ✅ 修复：使用新的卡淘详情页 URL 格式
      url: 'https://www.cardhobby.com.cn/market/item/' + item.ID,
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
