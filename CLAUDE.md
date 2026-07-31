## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## CSS conventions

- Small tag/pill/badge components (`.status-badge`, `.stat-pill`, and any new one styled the same way) must always size to their own content — never stretch to fill a parent. When adding a new CSS rule that targets a generic tag like `span` inside a container (e.g. `.some-list li span`), scope it to the direct child (`.some-list li > span`), not a bare descendant selector — a bare descendant selector also matches badges/pills nested deeper inside that span and stretches them. This has caused a visible bug more than once (e.g. the "Inativo" badge in `MembrosList.svelte` inheriting `flex:1; min-width:60%` meant for the outer row `<span>`).

## claude-in-chrome usage

Don't open/screenshot the site with claude-in-chrome unprompted. The user runs `npm run dev` himself and watches localhost live (PC and phone) — he checks visual/UI changes on his own. Only use claude-in-chrome when: the user explicitly asks in that turn, a large/whole-feature review he requested calls for it, or there's a genuine need with no other way to verify — and even then, ask for authorization first (yes, even in auto mode) before opening the browser.
