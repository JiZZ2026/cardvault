-- ============================================================
-- CardVault 投资系统建表 SQL（PRD 第二章）
-- 在 Supabase SQL Editor 执行一次即可
-- ============================================================

-- ===== 1. 摸金校尉监控表 =====
CREATE TABLE IF NOT EXISTS gold_hunter_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name TEXT NOT NULL,
  draft_year INTEGER NOT NULL,
  draft_pick INTEGER,
  team TEXT,
  current_scan_year INTEGER DEFAULT 1,  -- Y1/Y2/Y3/Y4
  -- 四维分数
  c_score INTEGER DEFAULT 0,
  c_breakdown JSONB DEFAULT '{}',
  r_score INTEGER DEFAULT 0,
  r_breakdown JSONB DEFAULT '{}',
  r_modifier INTEGER DEFAULT 0,
  p_score INTEGER,  -- NULL = 待校准
  p_note TEXT,      -- "待校准" / 价格来源说明
  m_score INTEGER DEFAULT 0,
  -- GH = C + R + r_modifier + COALESCE(P,0) + M
  gh_index INTEGER GENERATED ALWAYS AS (
    c_score + r_score + r_modifier + COALESCE(p_score, 0) + m_score
  ) STORED,
  -- 状态
  release_type TEXT CHECK (release_type IN ('trade','departure','free_agent','system','unknown')),
  release_event TEXT,
  monitoring_tier TEXT CHECK (monitoring_tier IN ('target','plus_monitor','monitor','watch','excluded')),
  thesis TEXT,
  entry_target TEXT,
  contract_expiry_year INTEGER,
  -- 历史
  score_history JSONB DEFAULT '[]',  -- [{scan_year, c, r, r_mod, p, m, gh, date}]
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===== 2. 持仓表（轻量版，不依赖 player_investments） =====
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name TEXT NOT NULL,
  card_description TEXT NOT NULL,  -- "Bowman Chrome /150 蓝折签字"
  product_line TEXT,               -- "Bowman Chrome" / "Prizm" / "NT"
  parallel TEXT,                   -- "Blue Refractor" / "Silver"
  numbered INTEGER,                -- 150 / 99 / 50 / 25 / 10 / NULL(无编号)
  condition TEXT,                  -- "RAW" / "PSA 10" / "BGS 9.5" / "微瑕"
  tier TEXT CHECK (tier IN ('core','barbell_big','barbell_small','spec')),
  -- 价格
  cost_basis DECIMAL(10,2) NOT NULL,
  cost_currency TEXT DEFAULT 'CNY',
  current_value DECIMAL(10,2),
  current_value_date DATE,
  -- EXIT
  exit_target DECIMAL(10,2),
  exit_rule TEXT,                  -- "Phase 1: Morant交易后出" / "长持3年"
  -- 状态
  status TEXT DEFAULT 'held' CHECK (status IN ('held','for_sale','sold','watching')),
  sell_price DECIMAL(10,2),
  sell_date DATE,
  source TEXT,                     -- "卡淘竞拍" / "eBay" / "朋友"
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===== 3. 价格快照表 =====
CREATE TABLE IF NOT EXISTS price_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name TEXT NOT NULL,
  year TEXT NOT NULL,              -- "19-20" / "18-19"
  product TEXT NOT NULL,           -- "Prizm" / "Chrome"
  parallel TEXT NOT NULL,          -- "Silver" / "Blue Ice" / "Gold"
  numbered INTEGER,                -- NULL = 无编号
  price DECIMAL(10,2) NOT NULL,
  price_condition TEXT DEFAULT 'RAW',  -- "RAW" / "PSA 9" / "PSA 10"
  source TEXT DEFAULT '卡淘',
  transaction_count INTEGER,
  snapshot_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===== 4. 索引 =====
CREATE INDEX IF NOT EXISTS idx_positions_player ON positions(player_name);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS idx_gh_player ON gold_hunter_watchlist(player_name);
CREATE INDEX IF NOT EXISTS idx_gh_tier ON gold_hunter_watchlist(monitoring_tier);
CREATE INDEX IF NOT EXISTS idx_prices_player ON price_snapshots(player_name);

-- ===== 5. RLS（开启 + 暂时全放行，与现有表一致）=====
ALTER TABLE gold_hunter_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for now" ON gold_hunter_watchlist;
DROP POLICY IF EXISTS "Allow all for now" ON positions;
DROP POLICY IF EXISTS "Allow all for now" ON price_snapshots;

CREATE POLICY "Allow all for now" ON gold_hunter_watchlist FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for now" ON positions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for now" ON price_snapshots FOR ALL USING (true) WITH CHECK (true);
