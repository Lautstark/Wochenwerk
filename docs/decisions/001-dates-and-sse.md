# ADR 001: Dates and Server-Sent Events

**Status: accepted for post-prototype work, and partly superseded.**
[ADR 002](002-browser-only-and-a-shared-folder.md) proposes replacing SSE with a
synced folder the board polls. The date model below is unaffected.

Schedule entries are calendar-date based; no explicit Week table is needed. SSE carries board/parent refresh notifications after writes. This is the smallest model that supports future planning and immediate shared updates. Revisit only if the board later needs a true server-to-device command channel.
