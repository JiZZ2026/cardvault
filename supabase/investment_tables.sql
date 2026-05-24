-- ────────────────────────────────────────────────────────────────────────────
-- Card Vault 投资分析模块 Phase 0
-- THESIS-CHECK-EXIT 框架 + Q/T 双分制 + 持仓关联
-- 在 Supabase SQL Editor 中执行
-- ────────────────────────────────────────────────────────────────────────────

-- 球员投资追踪主表
CREATE TABLE IF NOT EXISTS player_investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name TEXT NOT NULL,
  player_name_cn TEXT,
  player_meta JSONB,
  investment_type TEXT CHECK (investment_type IN ('pc', 'investment', 'speculation')),
  thesis_text TEXT,
  thesis_created_at TIMESTAMPTZ DEFAULT now(),
  exit_rules JSONB DEFAULT '[]',
  q_score INTEGER,
  q_breakdown JSONB,
  t_score INTEGER,
  t_breakdown JSONB,
  action_score INTEGER,
  health_discount DECIMAL(3,2) DEFAULT 1.0,
  score_history JSONB DEFAULT '[]',
  status TEXT DEFAULT 'active',
  status_signal TEXT DEFAULT 'hold',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 持仓表（关联具体卡片）
CREATE TABLE IF NOT EXISTS investment_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id UUID REFERENCES player_investments(id) ON DELETE CASCADE,
  card_id UUID REFERENCES cards(id),
  card_description TEXT NOT NULL,
  card_tier TEXT,
  cost_basis DECIMAL(10,2),
  current_value DECIMAL(10,2),
  purchase_date DATE,
  status TEXT DEFAULT 'held',
  sold_price DECIMAL(10,2),
  sold_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 检查点表（CHECK 环节）
CREATE TABLE IF NOT EXISTS investment_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id UUID REFERENCES player_investments(id) ON DELETE CASCADE,
  trigger_type TEXT,
  title TEXT NOT NULL,
  description TEXT,
  decision TEXT,
  decision_reasoning TEXT,
  q_score_snapshot INTEGER,
  t_score_snapshot INTEGER,
  action_score_snapshot INTEGER,
  window_type TEXT,
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 价格基准表（行情参考）
CREATE TABLE IF NOT EXISTS price_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name TEXT NOT NULL,
  tier TEXT CHECK (tier IN ('S', 'A', 'B', 'C')),
  achievements TEXT,
  card_description TEXT NOT NULL,
  raw_price_cny DECIMAL(10,2),
  psa10_price_cny DECIMAL(10,2),
  transaction_volume INTEGER,
  data_source TEXT DEFAULT 'katao',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_player_investments_status ON player_investments(status);
CREATE INDEX IF NOT EXISTS idx_investment_positions_investment ON investment_positions(investment_id);
CREATE INDEX IF NOT EXISTS idx_investment_checkpoints_investment ON investment_checkpoints(investment_id);
CREATE INDEX IF NOT EXISTS idx_price_benchmarks_player ON price_benchmarks(player_name);
