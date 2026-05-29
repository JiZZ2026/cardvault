#!/usr/bin/env bash
# 投资模块种子数据导入（PRD 第六章）
# 用法：在项目根目录运行  bash supabase/seed-invest.sh
# 前提：已在 Supabase SQL Editor 执行 supabase/invest_tables.sql
set -euo pipefail

ENV_FILE="$(dirname "$0")/../.env.local"
SRK=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' "$ENV_FILE" | cut -d= -f2-)
URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' "$ENV_FILE" | cut -d= -f2-)

post() {  # $1=table  $2=json
  curl -s -X POST "$URL/rest/v1/$1" \
    -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
    -H "Content-Type: application/json" -H "Prefer: return=minimal" \
    -d "$2" -w "  [$1] HTTP %{http_code}\n" -o /dev/null
}

echo "== 摸金校尉监控（3人）=="
post gold_hunter_watchlist '[
  {"player_name":"Reed Sheppard","draft_year":2024,"draft_pick":3,"team":"Rockets","current_scan_year":2,
   "c_score":22,"r_score":34,"r_modifier":0,"p_score":18,"m_score":5,
   "release_type":"departure","release_event":"Simmons走人，首发位置确定","monitoring_tier":"target",
   "thesis":"Y2 39%三分breakout验证，GH=79摸金目标","entry_target":"NT RPA /99 ¥3,000-5,000",
   "score_history":[{"scan_year":1,"c":22,"r":28,"r_mod":0,"p":15,"m":0,"gh":65,"date":"2025-05-20"},{"scan_year":2,"c":22,"r":34,"r_mod":0,"p":18,"m":5,"gh":79,"date":"2026-05-27"}]},
  {"player_name":"Jaylen Coward","draft_year":2025,"draft_pick":11,"team":"Grizzlies","current_scan_year":1,
   "c_score":22,"r_score":34,"r_modifier":0,"p_score":16,"m_score":0,
   "release_type":"departure","release_event":"Morant今夏大概率被交易","monitoring_tier":"plus_monitor",
   "thesis":"Butler/Middleton天花板，灰熊重建核心","entry_target":"Chrome /99签字 ¥345 + RPA ¥2,700",
   "score_history":[{"scan_year":1,"c":22,"r":34,"r_mod":0,"p":16,"m":0,"gh":72,"date":"2026-05-27"}]},
  {"player_name":"Dylan Harper","draft_year":2025,"draft_pick":2,"team":"Spurs","current_scan_year":1,
   "c_score":30,"r_score":25,"r_modifier":0,"p_score":10,"m_score":0,
   "release_type":"unknown","release_event":"Fox受伤创造临时释放，非结构性","monitoring_tier":"monitor",
   "thesis":"压缩纯度最高但释放事件是临时的","entry_target":"等WCF结束后回调",
   "score_history":[{"scan_year":1,"c":30,"r":25,"r_mod":0,"p":10,"m":0,"gh":65,"date":"2026-05-27"}]}
]'

echo "== 持仓（Sheppard NT RMA）=="
post positions '[
  {"player_name":"Reed Sheppard","card_description":"NT RMA 双窗 /99 微瑕B","product_line":"National Treasures",
   "parallel":"RMA Triple","numbered":99,"condition":"微瑕","tier":"barbell_small",
   "cost_basis":779,"current_value":558,"status":"held","source":"卡淘",
   "exit_rule":"Phase 1出或换正RPA","notes":"买贵了，RMA≠RPA差20倍"}
]'

echo "== 价格快照：Garland 2019-20 Prizm =="
post price_snapshots '[
  {"player_name":"Garland","year":"19-20","product":"Prizm","parallel":"Base","numbered":null,"price":2.44,"price_condition":"RAW","transaction_count":1237,"source":"卡淘"},
  {"player_name":"Garland","year":"19-20","product":"Prizm","parallel":"Silver","numbered":null,"price":16.6,"price_condition":"RAW","transaction_count":763,"source":"卡淘"},
  {"player_name":"Garland","year":"19-20","product":"Prizm","parallel":"Red","numbered":299,"price":345,"price_condition":"RAW","transaction_count":50,"source":"卡淘"},
  {"player_name":"Garland","year":"19-20","product":"Prizm","parallel":"Blue","numbered":199,"price":106,"price_condition":"RAW","transaction_count":67,"source":"卡淘"},
  {"player_name":"Garland","year":"19-20","product":"Prizm","parallel":"Blue Ice","numbered":99,"price":203,"price_condition":"RAW","transaction_count":32,"source":"卡淘"},
  {"player_name":"Garland","year":"19-20","product":"Prizm","parallel":"Purple","numbered":75,"price":857,"price_condition":"PSA 9","transaction_count":20,"source":"卡淘"},
  {"player_name":"Garland","year":"19-20","product":"Prizm","parallel":"FB Pink","numbered":50,"price":385,"price_condition":"RAW","transaction_count":15,"source":"卡淘"},
  {"player_name":"Garland","year":"19-20","product":"Prizm","parallel":"Mojo","numbered":25,"price":2019,"price_condition":"RAW","transaction_count":4,"source":"卡淘"},
  {"player_name":"Garland","year":"19-20","product":"Prizm","parallel":"Gold","numbered":10,"price":22823,"price_condition":"PSA 8","transaction_count":2,"source":"卡淘"}
]'

echo "== 价格快照：Murray（Silver 锚点，价格模型v1.0）=="
post price_snapshots '[
  {"player_name":"Murray","year":"18-19","product":"Prizm","parallel":"Silver","price":58,"price_condition":"RAW","source":"卡淘","notes":"价格模型v1.0 Silver阶梯锚点"}
]'

echo "✓ 种子数据导入完成"
