# Vesper

> "Where the day settles."

An elegant, sophisticated, completely offline-first RSS reader that looks and feels exactly like reading the Financial Times in 2025.

![Vesper](./vesper.ico)

## Features

- 🌙 **Offline-first** — Works completely offline with IndexedDB + PWA support
- 💻 **Desktop-focused** — Three-panel FT.com-inspired layout optimized for desktop browsers
- 🔄 **Smart sync** — Auto-refresh feeds with intelligent archiving (top 50 unread preserved)
- 📥 **OPML support** — Import and export your feeds
- 🎨 **Beautiful UI** — FT Origami O3 design tokens with custom typography
- 🔍 **Fast search** — Tokenized full-text search across articles
- 🌓 **Dark & light modes** — Seamless theme switching

## Screenshots

**Dark Mode**
![Vesper Dark Mode](./dark.png)

**Light Mode**
![Vesper Light Mode](./light.png)

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173)

3. **Build for production:**
   ```bash
   npm run build
   ```

## Development

```bash
npm run dev           # Start dev server
npm run build         # Build for production
npm run check         # Type-check with svelte-check
npm run check:watch   # Watch mode type-checking
```

See [AGENTS.md](./AGENTS.md) for detailed architecture and code conventions.

## Tech Stack

- **Framework**: SvelteKit 2 (SSR off, prerendered SPA)
- **Database**: Dexie.js (IndexedDB) for offline-first storage
- **Styling**: Tailwind CSS + FT Origami O3 design tokens
- **UI**: Skeleton Labs
- **Fonts**: Playfair Display (headlines) & IBM Plex Sans (body)
- **Key Libraries**: fast-xml-parser, DOMPurify, date-fns

## Project Structure

```
src/
├── lib/
│   ├── db.ts          # Dexie database & types
│   ├── stores.ts      # Svelte stores
│   ├── rss.ts         # Feed syncing logic
│   ├── search.ts      # Search tokenization
│   ├── opml.ts        # OPML import/export
│   └── components/    # Reusable UI components
└── routes/
    ├── +layout.ts     # Root layout (SSR disabled)
    ├── api/           # API endpoints
    └── ...            # Page routes
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md) Code of Conduct.

## License

MIT — See [LICENSE](./LICENSE) for details.

## Acknowledgments

- [Financial Times](https://ft.com) for design inspiration
- [SvelteKit](https://kit.svelte.dev) team
- [Dexie.js](https://dexie.org) for excellent IndexedDB abstraction
- [Skeleton Labs](https://www.skeleton.dev) for UI components
