# AGENTS.md - Vesper RSS Reader

## Build & Test Commands

```bash
npm install                # Install dependencies
npm run dev               # Start dev server (localhost:5173)
npm run build             # Build for production
npm run check             # Type-check with svelte-check
npm run check:watch       # Watch mode type-checking
```

## Architecture

- **Framework**: SvelteKit 2 (SSR off, prerendered SPA)
- **Database**: Dexie.js (IndexedDB) for offline-first storage
- **UI Framework**: Skeleton Labs + Tailwind CSS + FT Origami O3 design tokens
- **Key Libraries**: fast-xml-parser, DOMPurify, date-fns

**Directory Structure**:

- `src/lib/` - Core logic: `db.ts` (database & types), `stores.ts` (Svelte stores), `rss.ts` (feed sync), `search.ts` (tokenization), `opml.ts` (import/export), `config.ts` (configuration constants), `logger.ts` (logging utility), `backup.ts` (backup functionality), `components/` (UI)
- `src/routes/` - SvelteKit routes; `+layout.ts` disables SSR; `api/fetch-feed/` backend endpoint for proxying RSS feeds
- `static/` - Static assets

**Key Modules**:

- **DB**: Feed, Article, Folder, Settings tables with compound indices for performance
- **Stores**: selectedFeedId, selectedArticleId, searchQuery, userSettings (synced with localStorage)
- **RSS**: fetchFeed (with retry), syncFeed (auto-archive strategy: top 50 unread, rest archived), refreshAllFeeds (concurrency=3)
- **API**: GET `/api/fetch-feed?url=` proxies RSS requests server-side to avoid CORS
- **Config**: Centralized constants (RSS_CONFIG, ARTICLE_CONFIG, API_CONFIG, SEARCH_CONFIG)
- **Logger**: Consistent logging with levels (debug, info, warn, error) and context tags
- **Search**: Tokenization with stop-word filtering (63 common words) and minimum word length (2 characters)

## Code Style & Conventions

**TypeScript**:

- Strict mode enabled; use `type` for types, `interface` for Dexie schemas
- Error handling: use try-catch in async, propagate with meaningful messages
- Naming: camelCase functions, UPPERCASE constants, PascalCase types/interfaces

**Svelte Components**:

- Use `<script lang="ts">` with strict type annotations
- Reactive queries via `liveQuery()` from Dexie for read operations
- Side effects (DB writes) outside liveQuery in reactive blocks (`$: { ... }`)
- Template syntax: `{#if}`, `{#each}`, `{#await}` for control flow; `bind:this` for refs
- CSS: Tailwind classes (o3-\* color tokens), no scoped CSS unless necessary

**Database**:

- Use Dexie Table APIs: `where().equals().modify()`, `bulkAdd()`, `toCollection()`
- Define migrations in version() chains with upgrade callbacks
- Store booleans as `0 | 1` for easier indexing

**Imports**:

- Prefer relative imports in same package; absolute from `$lib/` for library code
- Use named exports; avoid default exports unless single-export module

**Tailwind/Colors**:

- Use o3-\* variables from FT Origami: o3-teal, o3-claret, o3-black-90, etc.
- Font families: headline (Playfair Display), body (IBM Plex Sans)
- Dark mode by default (darkMode: 'class')
