// pages/api/cron/daily-report.js
// 每日早报 - 卡价监控 + 项目倒计时 + 待办提醒
// 触发方式：Vercel Cron（每天北京时间8:00）或手动 GET /api/cron/daily-report

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // 用service role key，cron场景不走RLS
);

const SEVER_CHAN_KEY = process.env.SERVER_CHAN_KEY;

// ─── 关键项目 & 截止日期（手动维护，或之后改成从Supabase读） ───
const PROJECTS = [
  { name: '《小娜》上映',       deadline: '2026-07-18' },
  { name: 'TMK春节档',          deadline: '2027-01-28' },
  { name: '昂西动画节',         deadline: '2026-06-09' },
  { name: 'One of One 交片',    deadline: '2026-08-31' }, // 你改成真实日期
];

// ─── 工具函数 ───
function daysUntil(dateStr) {
  const target = new Date(dateStr);
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function formatDate() {
  return new Date().toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'long', day: 'numeric', weekday: 'long'
  });
}

// ─── 卡淘价格查询 ───
async function fetchCardPrice(keyword) {
  try {
    const res = await fetch(
      `https://open.katao.com/api/SearchCommodity?keyword=${encodeURIComponent(keyword)}&pageSize=5`,
      { headers: { Authorization: `Bearer ${process.env.KATAO_API_KEY}` } }
    );
    const data = await res.json();
    const items = data?.data?.list || [];
    if (!items.length) return null;
    // 取最低价
    const prices = items.map(i => parseFloat(i.price)).filter(p => !isNaN(p));
    return prices.length ? Math.min(...prices) : null;
  } catch {
    return null;
  }
}

// ─── 主逻辑 ───
export default async function handler(req, res) {
  // 安全校验：Vercel Cron会带 Authorization header；手动调试时跳过
  const authHeader = req.headers.authorization;
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const lines = [];

    // ── Section 1: 倒计时 ──
    lines.push('## 🎬 项目倒计时\n');
    for (const p of PROJECTS) {
      const d = daysUntil(p.deadline);
      const emoji = d <= 7 ? '🔴' : d <= 30 ? '🟡' : '🟢';
      lines.push(`${emoji} **${p.name}** 还剩 **${d}** 天（${p.deadline}）`);
    }
    lines.push('');

    // ── Section 2: 卡淘盯梢 ──
    lines.push('## 🃏 卡价监控\n');
    const { data: watchItems, error } = await supabase
      .from('watch_items')
      .select('*')
      .eq('is_active', true);

    if (error || !watchItems?.length) {
      lines.push('_暂无盯梢目标_');
    } else {
      let hitCount = 0;
      for (const item of watchItems) {
        const lowestPrice = await fetchCardPrice(item.keyword || item.name);
        if (lowestPrice === null) {
          lines.push(`⚪ ${item.name} — 未查到报价`);
          continue;
        }
        const targetPrice = parseFloat(item.target_price);
        const hit = lowestPrice <= targetPrice;
        if (hit) hitCount++;
        const emoji = hit ? '✅' : '💤';
        lines.push(
          `${emoji} **${item.name}** 最低 ¥${lowestPrice.toFixed(0)}` +
          (targetPrice ? `（目标 ¥${targetPrice.toFixed(0)}${hit ? ' 达标！' : ''}）` : '')
        );
      }
      if (hitCount > 0) {
        lines.unshift(`> 🎯 今日 **${hitCount}** 张卡达到目标价，记得去看看！\n`);
      }
    }
    lines.push('');

    // ── Section 3: 今日小提醒（可自定义规则） ──
    lines.push('## 📋 今日提示\n');
    const hour = new Date().getDay(); // 0=周日
    if (hour === 1) lines.push('📅 周一：看看本周TMK的里程碑有没有要确认的');
    if (hour === 3) lines.push('🎨 周三：适合集中处理One of One创作任务');
    if (hour === 5) lines.push('🏀 周五：该打球了');
    lines.push('_保持节奏，稳步推进。_');

    // ── 推送到微信 ──
    const title = `☀️ 霁哥早报 · ${formatDate()}`;
    const desp  = lines.join('\n');

    const pushRes = await fetch(`https://sctapi.ftqq.com/${SEVER_CHAN_KEY}.send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ title, desp }),
    });
    const pushData = await pushRes.json();

    return res.status(200).json({
      success: true,
      push: pushData,
      preview: desp,
    });

  } catch (err) {
    console.error('daily-report error:', err);
    return res.status(500).json({ error: err.message });
  }
}
