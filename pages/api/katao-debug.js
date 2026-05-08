// pages/api/katao-debug.js — 直接测试真实 API 接口
export default async function handler(req, res) {
  const keyword = req.query.keyword || '加内特 prizm';
  
  // 与 katao-search.js 完全相同的请求方式
  const searchJsonEncoded = '[{"Key":"Status","Value":1}]'.replace(/"/g, '%22');
  const url = 'https://www.cardhobby.com.cn/NewCommodity/SearchCommodity'
    + '?userId=&pageIndex=1&pageSize=20'
    + '&searchKey=' + encodeURIComponent(keyword)
    + '&searchJson=' + searchJsonEncoded
    + '&sort=EffectiveTimeStamp&sortType=desc';
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': 'https://www.cardhobby.com.cn/',
      },
    });
    const data = await resp.json();
    return res.status(200).json({
      url,
      http_status: resp.status,
      result: data.result,
      total: data.data && data.data.TotalCount,
      items_count: data.data && data.data.PagedMarketItemList ? data.data.PagedMarketItemList.length : 0,
      first_item: data.data && data.data.PagedMarketItemList && data.data.PagedMarketItemList[0] ? {
        title: data.data.PagedMarketItemList[0].Title,
        price: data.data.PagedMarketItemList[0].LowestPrice,
        status: data.data.PagedMarketItemList[0].Status,
      } : null,
      raw_preview: JSON.stringify(data).slice(0, 500),
    });
  } catch (e) {
    return res.status(500).json({ url, error: e.message, error_type: e.name });
  }
}
