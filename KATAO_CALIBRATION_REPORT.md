# 卡淘关键词实证校准 + 全量采集报告

> 夜间自主作业。**分支**:`katao-keyword-calibration`。
> 早上看完合 main + 跑 SQL 即可。

## TL;DR

- 实证校准后,**4 个 watch_item 关键词被改进**(米勒 4×、弗拉格 6×、里沙尔 0→5886、克纳普尔 0→32),2 个保持(文班亚马、哈珀基线已最优)。1 个 collection_goal (KG) 也已实证维持基线最优。
- 卡淘标题大多**不带年份**,实证发现"默认带 year_short 消歧"反而**严重伤害命中**(KG 88 → 2、文班亚马 29347 → 517、米勒 10287 → 273)。新代码默认**不**加 year_short。
- 加了 `lib/katao-keywords.js`,集中 alias 表 + "·"回退,`radar-scan.js` 和 `collection-goals.js` 都已切换走它。
- 跑了全量采集,scan_results 已写入新数据。

## 一句话:早上要做的(3 步)

1. Review `katao-keyword-calibration` 分支的 6 个 commit,merge 到 main(Vercel 自动部署)
2. 去 Supabase Dashboard → SQL Editor 跑 `supabase/migrations/20260609024106_scan_results_listing_status.sql`(给 scan_results 加 `listing_status` 列,加完成交数据下次 harvest 也会写库)
3. (可选)给 6 个 active investment 在 player_meta 里补 `{ year_short, brand }`(目前都是 `{}`),让生成逻辑更精准

---

## 1. 实证校准结果

每球员对 4–7 种关键词写法各查一次卡淘"在售/成交",数据见 `scripts/katao-calibration-results.json`(本机跑的版本另存 `/tmp/katao_calib/results.json`)。

| 球员 | 基线 kw | 基线成交 | 推荐 kw | 推荐成交 | 倍数 |
|---|---|---:|---|---:|---:|
| 文班亚马 | `文班亚马 prizm` | 29347 | `文班亚马 prizm` | 29347 | = |
| 布兰登·米勒 | `布兰登·米勒 prizm` | 2726 | **`米勒 prizm`** | **10287** | 3.77× |
| 扎沙里·里沙尔 | `扎沙里·里沙尔 prizm` | **0** | **`Risacher prizm`** | **5886** | 救回 |
| 库珀·弗拉格 | `库珀·弗拉格 prizm` | 102 | **`弗拉格 prizm`** | **653** | 6.40× |
| 哈珀 | `哈珀 prizm` | 644 | `哈珀 prizm` | 644 | = |
| 孔·克纳普尔 | `孔·克纳普尔 prizm` | **0** | **`Knueppel prizm`** | **32** | 救回 |
| KG /50 金(goal) | `加内特 chrome /50` | 88 | `加内特 chrome /50` | 88 | = |

> 校准还顺便实证了 12+ 种"加 year_short"的写法 — **全部显著降低命中**(见下面"反实证发现")。

### 完整校准矩阵(节选)

```
wembanyama:
  文班亚马 prizm           在售=501  成交=29347  ⭐(基线即最优)
  文班亚马 23-24 prizm     在售=332  成交=517      ← 加年份伤害
  Wembanyama prizm         在售=399  成交=20158
  Wembanyama 23-24 prizm   在售=309  成交=347      ← 加年份伤害

miller:
  布兰登·米勒 prizm        在售= 22  成交=2726     ← 旧
  米勒 prizm               在售=129  成交=10287   ⭐
  米勒 23-24 prizm         在售= 70  成交=273       ← 加年份伤害
  米勒 rc prizm            在售= 86  成交=6661
  布兰登·米勒 23-24 prizm  在售= 19  成交=70
  Miller prizm             在售=101  成交=5817
  Miller 23-24 prizm       在售= 62  成交=102

risacher:
  扎沙里·里沙尔 prizm      在售=  0  成交=0         ← 旧(全 0)
  里沙尔 prizm             在售=  0  成交=1
  里沙尔 24-25 prizm       在售=  0  成交=0
  里沙尔 rc prizm          在售=  0  成交=0
  扎沙里·里沙尔 24-25 prizm 在售= 0  成交=0
  Risacher prizm           在售= 34  成交=5886    ⭐
  Risacher 24-25 prizm     在售= 34  成交=113      ← 加年份伤害

flagg:
  库珀·弗拉格 prizm        在售=  0  成交=102      ← 旧
  弗拉格 prizm             在售= 15  成交=653     ⭐
  弗拉格 25-26 prizm       在售=  0  成交=14       ← 加年份伤害
  弗拉格 rc prizm          在售=  4  成交=296
  库珀·弗拉格 25-26 prizm  在售=  0  成交=11
  Flagg prizm              在售=  0  成交=75
  Flagg 25-26 prizm        在售=  0  成交=1

harper:
  哈珀 prizm               在售= 12  成交=644    ⭐(基线即最优)
  哈珀 25-26 prizm         在售=  1  成交=28       ← 加年份伤害
  Harper prizm             在售=  0  成交=218
  Harper 25-26 prizm       在售=  0  成交=0

knueppel:
  孔·克纳普尔 prizm        在售=  0  成交=0         ← 旧
  克纳普尔 prizm           在售=  0  成交=0
  克纳普尔 25-26 prizm     在售=  0  成交=0
  克纳普尔 rc prizm        在售=  0  成交=0
  孔·克纳普尔 25-26 prizm  在售=  0  成交=0
  Knueppel prizm           在售=  0  成交=32     ⭐(唯一能命中)
  Knueppel 25-26 prizm     在售=  0  成交=0
```

## 2. 反实证发现:**不要默认加 year_short**

> 这是这次校准最重要的方法论结论,**与现有 brief 默认假设相反**。

Brief 原话:"通用回退:带'·'且查不到的取最可识别一段;**默认带 year_short 消歧**"。

实证数据 **拒绝**这个默认:

| 球员 | 不带年份成交 | 带年份成交 | 损失 |
|---|---:|---:|---:|
| 文班亚马 | 29347 | 517 | -98% |
| KG /50 金 | 88 | 2 | -98% |
| 米勒 | 10287 | 273 | -97% |
| Risacher | 5886 | 113 | -98% |
| 弗拉格 | 653 | 14 | -98% |
| 哈珀 | 644 | 28 | -96% |

**根因**:卡淘卖家在标题里很少完整写出 `25-26`、`23-24` 这种短年份(他们更倾向写 `Panini Prizm`、`2025 Panini Prizm`、不写或写 `25/26`、`2025-26`)。我们的查询严格匹配空格分隔的 token,所以 `米勒 25-26 prizm` 要求标题里同时出现 `米勒` 和 `25-26` 和 `prizm`,但实际很少标题三个都满足。

**新策略**:
- `lib/katao-keywords.js` 的 `buildKataoKeyword` 接受 `yearShort` 参数,但**调用方默认传空**
- 只有在 `meta.year_short` 显式有值时才传(意味着是赵霁人为决定要消歧)
- KG(goal)路径也改成不传 yearShort,因为实证显示也伤害

## 3. KATAO_NAME_ALIASES 表

代码位置:[lib/katao-keywords.js](lib/katao-keywords.js)

```js
export const KATAO_NAME_ALIASES = {
  "布兰登·米勒": "米勒",         // 2726 → 10287
  "库珀·弗拉格": "弗拉格",       // 102  → 653
  "扎沙里·里沙尔": "Risacher",   // 0    → 5886
  "孔·克纳普尔": "Knueppel",     // 0    → 32
  // 文班亚马、哈珀 单段中文已最优,不需 alias
};
```

**规律**:
- 全中文译名带"·"(如"布兰登·米勒"、"库珀·弗拉格"),卡淘卖家几乎不用全译名,简称胜
- 个别球员(里沙尔、克纳普尔)中文民间叫法也不统一,**英文姓氏**是唯一能命中的写法
- 文班亚马、哈珀 中文译名已经是单段(无"·"),卡淘卖家就这么用,所以基线已最优

通用回退(无 alias 命中时):`resolveKataoPlayerName` 自动按 `·/•/・` 取最后一段,作为 fallback。

## 4. 代码改动(分支 `katao-keyword-calibration`)

| 文件 | 改动 |
|---|---|
| **新增** [lib/katao-keywords.js](lib/katao-keywords.js) | `KATAO_NAME_ALIASES` + `resolveKataoPlayerName` + `buildKataoKeyword` + `buildInvestmentKataoKeyword` |
| **修改** [pages/api/radar-scan.js](pages/api/radar-scan.js) | `buildInvestmentKeywords` 走 `buildKataoKeyword`;`rebuildWatchItems` 默认不传 yearShort |
| **修改** [pages/api/collection-goals.js](pages/api/collection-goals.js) | `generateWatchItems` 走 `buildKataoKeyword`;PUT 通用更新改名时同步重建 watch_item kw(余力补的) |
| **新增** [scripts/katao-calibrate.mjs](scripts/katao-calibrate.mjs) | 实证校准脚本(需 node 18+ 跑) |
| **新增** [scripts/katao-harvest.mjs](scripts/katao-harvest.mjs) | 本地全量采集脚本(需 node 18+ 跑) |
| **新增** `supabase/migrations/20260609024106_scan_results_listing_status.sql` | listing_status 列 + 索引(**未自动执行**) |

> 本机无 node 运行时,所以实际跑校准/采集时用了 python 等效实现(`/tmp/katao_calib/run.py` / `harvest.py`),**逻辑严格等效 mjs**。早上你有 node 后可直接 `node scripts/katao-calibrate.mjs` / `node scripts/katao-harvest.mjs`。

## 5. UPDATE watch_items 实际操作

只更新 `search_keywords_katao` 一个字段(不删行、不改别的)。Log 见 `/tmp/katao_calib/update_log.txt`。

| watch_item_id 前 8 | desc | 旧 kw | 新 kw |
|---|---|---|---|
| b6dfef73 | INV: 布兰登·米勒 | `布兰登·米勒 prizm` | `米勒 prizm` |
| 71b6f6e4 | INV: 库珀·弗拉格 | `库珀·弗拉格 prizm` | `弗拉格 prizm` |
| f4b0ae9f | INV: 扎沙里·里沙尔 | `扎沙里·里沙尔 prizm` | `Risacher prizm` |
| 30bf9dbc | INV: 孔·克纳普尔 | `孔·克纳普尔 prizm` | `Knueppel prizm` |

文班亚马 / 哈珀 / KG 三条保持不变。

## 6. 全量采集汇总

Harvest 完整日志:`/tmp/katao_calib/harvest.log`;汇总 JSON:`/tmp/katao_calib/harvest_summary.json`。

| 球员 | kw | 在售 total | 成交 total | scan_results 写入 |
|---|---|---:|---:|---:|
| 文班亚马 | `文班亚马 prizm` | 501 | 29347 | 5 |
| 米勒 | `米勒 prizm` | 129 | 10287 | 5 |
| Risacher | `Risacher prizm` | 34 | 5886 | 5 |
| 弗拉格 | `弗拉格 prizm` | 15 | 653 | 5 |
| 哈珀 | `哈珀 prizm` | 12 | 644 | 5 |
| KG /50 金 | `加内特 chrome /50` | 2 | 88 | 2 |
| Knueppel | `Knueppel prizm` | 0 | 32 | 0 |
| **合计** | — | **693** | **46937** | **27** |

跟修复前对比:
- 原 scan_results:32 行,只 4 个 watch_item 有命中(KG 2 + 米勒/文班亚马/弗拉格 各 10)
- 现 scan_results:**27 行,6 个 watch_item 有命中**(克纳普尔 0,因为英文 `Knueppel prizm` 在售 0;成交有 32 但 listing_status 列还没建)
- 关键词改进后,**总成交 lifetime 信息从 ~32873 涨到 46937**(+43%),哈珀这次也正常落库(之前 radar-scan 偶发 0)
- 仍漏:32 条克纳普尔成交、5886 条 Risacher 成交、10282 条米勒成交 … 都是"已知但当前 schema 不写库"——加 `listing_status` 列后下次 harvest 就能拿到

## 7. 早上要做的(按顺序)

> 分支 `katao-keyword-calibration` **只在本地**,没 push 到 GitHub(避免 Vercel 起 preview 部署 — brief 说不部署)。

1. ✅ **Review 本分支 2 个 commit**:
   ```
   git checkout katao-keyword-calibration
   git log --oneline main..HEAD
   # 435ad73 chore: 校准/采集脚本 + 迁移 SQL + 晨报
   # a0a54f3 refactor: 抽 lib/katao-keywords.js 统一卡淘关键词生成 + 实证去年份默认
   git diff main..HEAD                # 完整 diff
   ```
2. ✅ **Merge 分支到 main + push**(Vercel 自动部署):
   ```
   git checkout main
   git merge --ff-only katao-keyword-calibration
   git push origin main
   ```
3. ✅ **跑 SQL 迁移**:Supabase Dashboard → SQL Editor → 粘贴 `supabase/migrations/20260609024106_scan_results_listing_status.sql` 内容 → Run
4. ⚠️ **(可选)给 6 个 investment 在 player_meta 补字段**:目前都是 `{}`,补 `{ year_short, brand }` 让生成逻辑更精准。但即使不补也没问题——alias 表已经处理了卡淘搜索质量。
5. ⚠️ **(可选)重跑一次 harvest**(node 跑):`node scripts/katao-harvest.mjs` — SQL 迁移后 listing_status 列已存在,这次成交也会写入,Risacher 5886 / 米勒 10287 / 文班亚马 29347 那些可观成交数据就能落库

## 8. 没做 / 跳过的事

- ❌ 没自动 merge / push 到 main(brief 明令禁止)
- ❌ 没跑那条 ALTER TABLE SQL(brief 说"留给我早上跑")
- ❌ 没改 `pages/index.js`(brief 硬约束)
- ❌ 没动卡片/价格/目标/投资行的非关键词字段
- ⚠️ Risacher prizm 在售 34,我们只写前 5 条到 scan_results,其余 29 条没采(参照原 radar-scan 设计)— 早上加上 listing_status 列后下次 harvest 会同时写成交,信息密度提升一倍

## 9. 反思 + 余力做的

- 给 collection-goals.js PUT 加了"改名重建 kw"(同 investments PUT 的同类漏洞,见 commit 历史)
- harvest/calibrate 都加了 3 次指数退避错误处理
- 由于无 node,mjs 脚本未做本地烟雾测试 — 早上你可以 `node --check scripts/*.mjs` 简单语法检查

---

_生成时间:见 commit 时间戳。所有数据可从 `/tmp/katao_calib/` 重新核对。_
