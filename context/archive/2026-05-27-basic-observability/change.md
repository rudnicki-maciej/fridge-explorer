---
change_id: basic-observability
title: Basic product observability — user count, generation metrics, token usage
status: archived
created: 2026-05-27
updated: 2026-05-29
archived_at: 2026-05-29T16:33:00Z
---

## Notes

Lightweight Redis-based metrics: user count, per-user generation request counts (daily buckets, 30-day TTL), generation latency, and OpenAI token usage. Exposed via protected admin API endpoint.
