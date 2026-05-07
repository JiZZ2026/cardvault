// pages/api/katao-search.js
// 调用卡淘真实 API 接口搜索在售卡片

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

export async function searchKatao(keyword) {
  // searchJson: Status=1 在售中
  const searchJson = JSON.stringify([{ Key: 'Status', Value: 1 }]);
  const params = new URLSearchParams({
    userId: '',
    pageIndex: '1',
    pageSize: '20',
    searchKey: keyword,
    searchJson,
    sort: 'EffectiveTimeStamp',
    sortType: 'asc',
  });

  const url = `https://www.cardhobby.com.cn/NewCommodity/SearchCommodity?${params}`;

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

  if (data?.result !== 1) {
    throw new Error('卡淘返回错误: ' + (data?.msg || JSON.stringify(data)));
  }

  const items = data?.data?.PagedMarketItemList || [];

  return items.map(item => {
    // 构建商品链接
    const url = `https://www.cardhobby.com.cn/Market/Details/${item.ID}`;
    // 价格：LowestPrice 是实际当前价（拍卖最低出价）
    const price = item.LowestPrice || parseFloat(item.Price) || 0;
    const priceUSD = item.USD_LowestPrice ? parseFloat(item.USD_LowestPrice) : null;
    // 剩余时间
    const timeLeft = item.EffectiveDate ? calcTimeLeft(item.EffectiveDate) : '';
    // 拍卖方式：ByWay=2 是竞拍，1 是一口价
    const listingType = item.ByWay === 2 ? 'auction' : 'buy_now';

    return {
      id: item.ID,
      title: item.Title,
      image: item.TitImg,
      price,
      priceUSD,
      currency: 'RMB',
      url,
      bidCount: item.PriceCount || 0,
      timeLeft,
      listingType,
      seller: item.SellRealName,
      isGuarantee: item.IsGuarantee === 1,
      platform: 'katao',
    };
  });
}

function calcTimeLeft(dateStr) {
  try {
    const end = new Date(dateStr);
    const now = new Date();
    const diff = end - now;
    if (diff <= 0) return '已结束';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return `${days}天${hours}时`;
    if (hours > 0) return `${hours}时${mins}分`;
    return `${mins}分钟`;
  } catch { return ''; }
}
