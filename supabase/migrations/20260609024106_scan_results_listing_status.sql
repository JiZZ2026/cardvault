-- 20260609024106_scan_results_listing_status.sql
-- 为 scan_results 加 listing_status 列,区分"在售 / 成交",支持两种状态共存。
--
-- 在售 listing 用 'on_sale'(默认值,兼容历史行);成交用 'sold'。
-- 加列后,scripts/katao-harvest.mjs 检测到列存在会自动把成交也写入。
-- pages/api/radar-scan.js POST 'sold' action 路径目前不写库,只返回查询结果;
-- 后续若要在 App 侧展示历史成交,需读这两类。
--
-- 此迁移文件由 Claude 在 katao-keyword-calibration 分支生成,但**未自动执行**。
-- 由赵霁早上 review 后在 Supabase Dashboard → SQL Editor 手动跑。

ALTER TABLE scan_results
  ADD COLUMN IF NOT EXISTS listing_status text DEFAULT 'on_sale';

-- 可选:加索引提速 watch_item_id + listing_status 联合查询
CREATE INDEX IF NOT EXISTS scan_results_wid_status_idx
  ON scan_results (watch_item_id, listing_status);

-- 注意:历史所有行都会用默认 'on_sale' 填充,符合现状(老逻辑只写在售)。
