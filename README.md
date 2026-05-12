# Synculariti - Enterprise B2B SaaS

A minimalist, high-performance financial and logistics management platform designed for multi-location restaurants and SMBs.

🚀 **Live App**: [https://synculariti-et.vercel.app/](https://synculariti-et.vercel.app/)

---

## 🌟 The Core Value
**Multi-Tenant Determinism**: Synculariti ensures that every organization member sees the exact same data, logistics insights, and budget state regardless of device.

## 🛠️ Tech Stack
- **Frontend/Backend**: [Next.js 16.2](https://nextjs.org/) (App Router)
- **Relational Data**: [Supabase](https://supabase.com/) (PostgreSQL 17)
- **Graph Analytics**: [Neo4j Aura](https://neo4j.com/)
- **Intelligence**: [Groq API](https://groq.com/) (Llama 3.3 70B)
- **Styling**: Premium Vanilla CSS (Bento-Grid / Glassmorphism)

## 📱 PWA (2026 Standards)
Synculariti is designed as a Progressive Web App.
- **Mobile-First**: Identity-driven header, safe-area inset support, and orientation locking.
- **Offline Resilience**: Exponential backoff and state retention for flaky mobile connections.
- **Atomic Operations**: Financial integrity via Postgres Outbox Pattern and RPC transactions.

## 🧠 Intelligence Strategy
We employ a **Cloud-TTL (24h)** strategy to provide expensive AI insights across the tenant organization while minimizing API costs and latency.

---

### 👨‍💻 Development
For architecture deep-dives and development rules, please refer to **[AGENTS.md](./AGENTS.md)**.

*Built with ❤️ for High-Velocity Business Management.*
