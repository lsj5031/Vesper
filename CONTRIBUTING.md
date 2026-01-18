# Contributing to Vesper

Thank you for your interest in contributing to Vesper. We welcome bug reports, feature requests, and pull requests.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
    ```bash
    git clone https://github.com/YOUR_USERNAME/vesper.git
    cd vesper
    ```
3. **Install dependencies:**
    ```bash
    npm install
    ```
4. **Create a feature branch:**
    ```bash
    git checkout -b feat/your-feature
    ```

## Development

- Run `npm run dev` to start the development server
- Run `npm run check` for type-checking
- Run `npm run build` to create a production build
- Run `npm run test` to run the test suite
- Run `npm run lint` to check code quality
- Run `npm run format:fix` to format code before committing

See [AGENTS.md](./AGENTS.md) for detailed architecture and code style conventions.

## Code Style

- **TypeScript**: Strict mode, use `type` for types, `interface` for Dexie schemas
- **Svelte**: Use `<script lang="ts">` with strict type annotations
- **Naming**: camelCase for functions, UPPERCASE for constants, PascalCase for types
- **Imports**: Relative imports within packages, absolute imports from `$lib/`
- **Tailwind**: Use o3-\* color tokens from FT Origami

## Submitting Changes

1. **Make your changes** with clear, descriptive commits
2. **Test thoroughly** — verify type-checking passes
3. **Push to your fork** and create a Pull Request
4. **Describe your changes** clearly in the PR description

## Reporting Issues

- Use GitHub Issues to report bugs
- Include steps to reproduce, expected behavior, and actual behavior
- For feature requests, explain the use case and motivation

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
