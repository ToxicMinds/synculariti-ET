# Synculariti - Enterprise B2B SaaS

A minimalist, high-performance financial, logistics, and operations management platform for multi-location restaurants and SMBs.

🚀 **Live App**: [https://synculariti-et.vercel.app/](https://synculariti-et.vercel.app/)

---

## 🌟 The Core Value
**Business-Grade Determinism**: Every organization member sees identical data, budget state, and operational insights regardless of device or location.

## 🛠️ Tech Stack
- **Frontend/Backend**: [Next.js 16.2](https://nextjs.org/) (App Router, Server Actions)
- **Relational Data**: [Supabase](https://supabase.com/) (PostgreSQL 17, RLS, Real-time)
- **Graph Analytics**: [Neo4j Aura](https://neo4j.com/) (Price Intelligence, Waste Prediction)
- **Intelligence**: [Groq API](https://groq.com/) (Llama 3.3 70B — Receipt Scanning, Categorization)
- **WhatsApp Integration**: [OpenWA](https://openwa.dev/) sidecar on GCP (Two-way workflows, Action Links)
- **Styling**: Premium Vanilla CSS (Bento-Grid / Glassmorphism)

## 📱 Key Features

### 📊 Financial Ledger
- Multi-currency expense tracking with eKasa QR fiscal receipt scanning
- Budget tracking with per-category variance alerts
- Bank statement reconciliation via Enable Banking integration

### 📦 Logistics (IMS)
- Atomic purchase order procurement via Postgres RPCs
- Append-only inventory ledger with historical traceability
- Stock level calculations from ledger sums

### 🧠 AI Intelligence
- Receipt parsing: Vision LLM → Categorization → Ledger (deterministic pipeline)
- Graph-powered analytics: Price Intelligence, Timing Patterns, Waste Risk scoring
- 3 parallel Cypher queries → LLM narrator → cached insight with 24h TTL

### 💬 WhatsApp Workflows
- Third-party API Gateway with HMAC-verified webhook callbacks
- Dual-path outbox delivery (DB webhook primary, GCP crontab safety net)
- Interactive action links for PO approval, audit decisions, and POS discrepancy resolution
- Poll fallback to action link text messages (sidecar lacks native poll endpoint)

## 📱 PWA (2026 Standards)
- **Mobile-First**: Safe-area inset support, orientation locking, gesture navigation
- **Offline Resilience**: Cross-tab Web Locks API for mutation queue serialization
- **Atomic Operations**: Financial integrity via Postgres RPC transactions and outbox pattern

## 🧠 Intelligence Strategy
We employ a **Structured Query → LLM Narration** pipeline: analytical Cypher queries score findings by impact, and the LLM narrates only the winning finding's structured data. A template fallback (`articulateFinding()`) kicks in if the LLM is unavailable. Results are cached per-tenant with a 24-hour TTL.

---

### 👨‍💻 Development
For architecture deep-dives, design rules, and operational standards, refer to:
- **[AGENTS.md](./AGENTS.md)** — Canonical architecture guide
- **[RULES.md](./RULES.md)** — Operational rulebook
- **[SYMBOLS.md](./SYMBOLS.md)** — Symbol map for all hooks, interfaces, and routes
- **[audit_report.md](./audit_report.md)** — Current system audit and backlog

*Built with ❤️ for High-Velocity Business Management.*
