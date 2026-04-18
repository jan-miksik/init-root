I'll analyze the app's resource footprint first, then model costs at each scale. Let me check the key loop patterns that 
  drive Cloudflare usage.                                                                                                  
                                                                                                                           
  Searched for 7 patterns, read 1 file (ctrl+o to expand)     
                                                                                                                           
⏺ App Usage Footprint (per active user, per day)
                                                                                                                           
  Based on the code (agent loop = 1h/4h/1d interval, default 1h; typically 1 manager DO + 2 trading-agent DOs = 3 DOs per  
  user):                                 
                                                                                                                           
  ┌──────────────────────────┬─────────────────────────────────────────────┬─────────────────────────────────┐             
  │         Resource         │               Per user / day                │              Notes              │             
  ├──────────────────────────┼─────────────────────────────────────────────┼─────────────────────────────────┤             
  │ Workers / DO invocations │ ~100 (72 alarm ticks + ~20 UI + cron share) │ 1h loop = 24 ticks × 3 DOs      │             
  ├──────────────────────────┼─────────────────────────────────────────────┼─────────────────────────────────┤             
  │ D1 reads                 │ ~1,500                                      │ history/snapshot fetches        │             
  ├──────────────────────────┼─────────────────────────────────────────────┼─────────────────────────────────┤             
  │ D1 writes                │ ~600                                        │ trades, snapshots, decisions    │             
  ├──────────────────────────┼─────────────────────────────────────────────┼─────────────────────────────────┤             
  │ KV reads                 │ ~360                                        │ price cache hits                │
  ├──────────────────────────┼─────────────────────────────────────────────┼─────────────────────────────────┤             
  │ KV writes                │ ~10–70                                      │ shared across users (price TTL) │
  ├──────────────────────────┼─────────────────────────────────────────────┼─────────────────────────────────┤             
  │ Subrequests              │ ~500                                        │ LLM + price APIs                │
  ├──────────────────────────┼─────────────────────────────────────────────┼─────────────────────────────────┤             
  │ DO CPU                   │ ~3–5 s/tick                                 │ LLM call + indicators           │
  └──────────────────────────┴─────────────────────────────────────────────┴─────────────────────────────────┘             
  
  Assumptions: authenticated user runs ~2 trading agents under 1 manager, default 1h interval. Real usage will skew lower  
  (many users idle, use 4h or 1d). 
                                                                                                                           
  Cloudflare Free Tier Capacity                                                                                            
                                         
  Free tier hard limits (Workers Free, SQLite-backed DOs allowed since 2024):                                              
                                   
  ┌───────────────────────────┬──────────────────────┬───────────────────────┬──────────────────────────────┐              
  │           Limit           │       Free cap       │ Consumed per user/day │       Ceiling (users)        │
  ├───────────────────────────┼──────────────────────┼───────────────────────┼──────────────────────────────┤              
  │ Workers requests          │ 100k/day             │ ~100                  │ ~1,000                       │
  ├───────────────────────────┼──────────────────────┼───────────────────────┼──────────────────────────────┤
  │ D1 rows written           │ 100k/day             │ ~600                  │ ~165                         │
  ├───────────────────────────┼──────────────────────┼───────────────────────┼──────────────────────────────┤              
  │ D1 rows read              │ 5M/day               │ ~1,500                │ ~3,300                       │
  ├───────────────────────────┼──────────────────────┼───────────────────────┼──────────────────────────────┤              
  │ KV writes (per namespace) │ 1k/day               │ depends on sharing    │ 30–100 if shared, <15 if not │
  ├───────────────────────────┼──────────────────────┼───────────────────────┼──────────────────────────────┤              
  │ DO requests               │ shares Workers quota │ 72                    │ ~1,400                       │
  ├───────────────────────────┼──────────────────────┼───────────────────────┼──────────────────────────────┤              
  │ Queues                    │ Paid only            │ –                     │ 0 (disabled unless upgraded) │
  └───────────────────────────┴──────────────────────┴───────────────────────┴──────────────────────────────┘              
                                   
  Realistic free-tier ceiling: ~50–150 concurrently active users. The binding constraints are D1 writes and KV writes —    
  Workers/DO request budgets are generous. Disabling LLM_QUEUE (code supports fallback) keeps you on free tier. Anything
  beyond that forces Workers Paid ($5/mo base).                                                                            
                                   
  Cost Projection (Cloudflare, monthly)                                                                                    
  
  Assumes Workers Paid ($5 base). LLM cost excluded (OpenRouter free models; rate limits will bite ~1k+ users).            
                                   
  ┌─────────┬─────────┬────────┬─────────────┬───────────┬──────────┬───────────┬────────────┬───────────────┐             
  │  Users  │ Workers │ DO req │ DO duration │ D1 writes │ KV reads │ KV writes │ DO storage │     Total     │
  ├─────────┼─────────┼────────┼─────────────┼───────────┼──────────┼───────────┼────────────┼───────────────┤             
  │ 10      │ incl    │ incl   │ incl        │ incl      │ incl     │ incl      │ ~$0        │ $5            │
  ├─────────┼─────────┼────────┼─────────────┼───────────┼──────────┼───────────┼────────────┼───────────────┤
  │ 100     │ incl    │ incl   │ incl        │ incl      │ incl     │ incl      │ ~$0        │ $5            │             
  ├─────────┼─────────┼────────┼─────────────┼───────────┼──────────┼───────────┼────────────┼───────────────┤             
  │ 1,000   │ incl    │ incl   │ ~$3         │ incl      │ incl     │ incl      │ ~$1        │ ~$10–15       │             
  ├─────────┼─────────┼────────┼─────────────┼───────────┼──────────┼───────────┼────────────┼───────────────┤             
  │ 10,000  │ $6      │ $3     │ ~$40        │ $130      │ $49      │ incl      │ $6         │ ~$240         │
  ├─────────┼─────────┼────────┼─────────────┼───────────┼──────────┼───────────┼────────────┼───────────────┤             
  │ 100,000 │ $87     │ $32    │ ~$1,000     │ ~$1,750   │ ~$535    │ $31       │ ~$600      │ ~$4,000–5,000 │
  └─────────┴─────────┴────────┴─────────────┴───────────┴──────────┴───────────┴────────────┴───────────────┘             
                                   
  What dominates at each scale:                                                                                            
  - ≤1k: free-tier quotas absorb everything; flat $5/mo.
  - 10k: D1 writes are the first big line item; DO duration (LLM CPU time) starts mattering.                               
  - 100k: D1 writes + DO duration + storage blow up. You'll also hit D1 single-DB practical limits (10 GB soft cap,
  single-region writes, ~1k writes/s peak per DB).                                                                         
                                                                                                                           
  Major excluded cost everywhere: LLM inference. At 100k users × 72 calls/day × ~1k tokens, even cheap models ($0.50/M tok)
   = ~$100k/mo. LLM dominates economics long before infra does.                                                            
                                         
  Architecture Recommendations by Scale                                                                                    
                                   
  ≤1k users — keep everything on Cloudflare.                                                                               
  Free / $5 plan. No reason to move.
                                                                                                                           
  1k–10k — Cloudflare, tune what's hot.                                                                                    
  - Stretch DO storage: TTL snapshots, archive closed trades to R2 as Parquet.
  - Raise default analysisInterval to 4h for free users (4× cheaper).                                                      
  - Move price cache reads fully to cache.match (HTTP cache) instead of KV — free, unlimited.
  - Add per-user agent caps (already present: MAX_AGENTS_PER_USER). Keep at 1–2 on free plan.                              
                                                                                                                           
  10k–100k — swap D1 for a real OLTP DB, keep the rest.                                                                    
  D1 is the failure point: single-region writes, expensive at volume, 10GB practical ceiling. Options:                     
  - Turso (libSQL) — SQLite-compatible, multi-region replicas, migration is nearly schema-copy. ~$29–500/mo tier. Best fit 
  if you want minimal code churn.                                                                                          
  - Neon / Supabase Postgres via Hyperdrive — Postgres features, connection pooling at the edge. ~$50–500/mo. Bigger       
  refactor (Drizzle needs postgres-js driver).                                                                             
  - Keep Workers + DOs + KV + Queues + R2 — they scale linearly and cheaply.                                               
  - Project cost at 100k users with Turso Scale + Workers: ~$1,500–2,500/mo (vs ~$4–5k all-CF).
                                                                                                                           
  100k+ — hybrid or migrate the hot path.                                                                                  
  Two reasonable paths:                                                                                                    
                                                                                                                           
  1. Stay CF, offload DB + heavy compute                                                                                   
    - Workers + DO for request edge and agent orchestration.                                                               
    - Turso/Neon for OLTP; ClickHouse/Tinybird for analytics on trades.                                                    
    - Move LLM calls off DO alarms into Cloudflare Queues → consumer Worker (already supported in code) or external worker 
  pool — drops DO CPU billing (the $1k line above).                                                                        
    - Expected: $2–4k/mo infra, flat devops.                                                                               
  2. Move to long-running VMs                                                                                              
    - Fly.io / Hetzner + Bun/Node service running the agent loop, Postgres (Neon or self-managed), Redis for cache.        
    - Cheaper raw compute at constant high load: ~$500–1,500/mo at 100k users.                                             
    - But you take on: autoscaling, deploys, DB backups, DDoS, region failover, OS patching. For a 2-person team that's a  
  real salary cost — easily wipes out the savings.                                                                         
                                                                                                                           
  Should You Leave Cloudflare?                                                                                             
                                         
  Short answer: no, until D1 forces it. The architecture you already have (DO alarms for isolated per-agent state, Workers 
  for ingress, KV for shared cache, Queues for async) is uniquely well-suited to this workload — each agent is a
  naturally-partitioned stateful unit, which is exactly what DOs are for. Replicating this on AWS (Lambda + DynamoDB + Step
   Functions + SQS) ends up more expensive and much more complex at every scale I checked.
                                         
  Maintenance trade-off:
  - Cloudflare → ~0 ops. Dashboard + wrangler. One engineer-week/month covers it.
  - Self-hosted/VM → ~20–40% of an engineer continuously (on-call, backups, scaling, patches). At typical fully-loaded     
  engineer cost (~$15k/mo), that's $3–6k/mo in hidden maintenance — more than CF charges you at 100k users.           
  - Hybrid (CF + Turso/Neon) → minimal extra ops (managed DB), biggest cost reduction. This is the recommended path for    
  10k+.                                                                                                                 
                                                                                                                           
  Concrete Next Steps If You Want Headroom Now
                                                                                                                           
  1. Set MAX_AGENTS_PER_USER=2 and default analysisInterval='4h' for free-plan users.                                      
  2. Replace KV price cache with caches.default (free, edge-cached HTTP responses).                                        
  3. Enable the already-wired LLM_QUEUE — it requires Workers Paid but decouples LLM latency from DO CPU time, which is    
  your biggest cost at 10k+.                                                                                               
  4. Archive closed-trade rows to R2 monthly; keep D1 hot set small.                                                       
                                                                                                                           
  Caveats: numbers are order-of-magnitude, based on default 1h interval and 2 agents/user. Real traffic is bursty and much 
  of it is idle — divide by 2–3× for "registered but inactive" users. Verify current CF pricing before committing; they    
  revise quarterly. 