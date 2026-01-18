# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
