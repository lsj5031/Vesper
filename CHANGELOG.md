# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Starter feeds** on empty-state onboarding: one-click HN / Simon Willison / CSS-Tricks / Daring Fireball, plus “Load starter pack”
- **SEO & social meta**: description, Open Graph, Twitter cards, `/og.png`
- **Self-hosted fonts** (Playfair Display + IBM Plex Sans) under `/fonts` — no Google Fonts runtime

### Changed

- **package.json** `homepage` → `https://reader.liu.nz`
- **PWA / web manifest** description clarifies offline-first RSS
- **README** trimmed; desktop/Pake docs moved to [docs/desktop.md](./docs/desktop.md)

## [0.0.6] - 2025-02-05

### Added

- **Enhanced Keyboard Navigation**: Comprehensive keyboard shortcuts including 'b' for sidebar toggle, Shift+u for help modal, and improved focus tracking
- **Duplicate Prevention**: Explicit duplicate checks when adding new feeds and backup imports
- **Zen Mode**: New zen mode for distraction-free reading
- **Confirmation Dialogs**: Added confirmation dialogs for destructive actions
- **Keyboard Shortcuts Link**: Direct access to keyboard shortcuts documentation

### Changed

- **Improved UX**: Consolidated refresh icons and enhanced user experience
- **Author Display**: Conditionally hide author section when not available
- **Auto-Archive Strategy**: Removed auto-archive limit and improved proxy support
- **App Icons**: Updated app icons for better visual consistency

### Fixed

- **Desktop Builds**: Improved Pake build debugging and included MSI in release artifacts
- **Release Artifacts**: Only include final app files, not build artifacts
- **Windows Builds**: Proper static file serving on Windows using cmd shell
- **Portable EXE**: Use --keep-binary for portable Windows EXE instead of MSI

### Infrastructure

- **Build Process**: Enhanced release workflow with better error handling
- **Documentation**: Updated changelog and build documentation

## [0.0.2] - 2025-01-19

### Added

- **Desktop App Support**: Build native desktop apps with Pake (macOS, Windows, Linux)
- **Direct Fetch Mode**: Enable CORS-free feed fetching for desktop apps
- **Keyboard Navigation**: Arrow keys, `j`/`k` for articles, `h`/`l` for feeds, `?` for help
- **Bulk Article Selection**: Select multiple articles for batch operations
- **Onboarding Modal**: Guide new users when feed list is empty
- **Smooth Animations**: Micro-interactions across UI components
- **Unread Count Badges**: Show unread counts on feeds
- **External Link Button**: Quick access to original article URLs
- **Comprehensive Search**: Full-text search with tokenization
- **Auto-Archiving**: Smart archiving strategy (top 50 unread, rest archived)
- **Backup/Restore**: Export and import all data
- **Staging Deployment**: Separate staging environment workflow

### Changed

- Replaced `rss-parser` with `fast-xml-parser` for better feed parsing
- Moved OPML/Backup actions and theme switcher to Settings modal
- Display feed names instead of authors in article list
- Enhanced article reader styling and theme consistency
- Improved RSS feed reliability with malformed XML support
- Updated buttons to use Origami o3-button classes

### Fixed

- Unread article filtering in All view now preserves older unread items
- RSS link resolution handles missing article links safely
- Improved validation, escaping, and UI consistency
- Fixed selection button visibility issues
- Corrected Windows desktop app build in GitHub Actions

### Infrastructure

- Added Cloudflare Workers configuration
- Added GitHub Actions for automated deployment
- Added oxlint and svelte-check to pre-commit hooks
- Added comprehensive test coverage with IndexedDB mocks

## [0.0.1] - 2025-01-01

### Initial Release

- Project foundation with SvelteKit 2
- Dexie.js database setup
- Basic RSS feed parsing
- Tailwind CSS + FT Origami styling
- Offline-capable with IndexedDB storage
- PWA-ready with service worker
- OPML import/export
- Dark/light mode with FT Origami O3 design tokens
- Three-panel layout inspired by FT.com
