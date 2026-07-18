# Desktop app (Pake)

Vesper can be packaged as a native desktop application using [Pake](https://github.com/tw93/Pake) — a lightweight (~5MB) wrapper for macOS, Windows, and Linux.

**Note:** Automated GitHub Actions builds are experimental. Manual local builds are recommended.

## Prerequisites

```bash
npm install -g pake-cli
```

**Platform-specific requirements:**

- **Linux**: `sudo apt-get install libwebkit2gtk-4.1-dev build-essential curl wget libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`
- **macOS**: Xcode Command Line Tools (already installed if you have `git`)
- **Windows**: Visual Studio Build Tools (already installed if you have Node.js)

## Build steps

1. **Build and preview Vesper:**

    ```bash
    npm run build
    npm run preview
    # Runs on http://localhost:4173
    ```

2. **Package with Pake (in a new terminal):**

    ```bash
    pake http://localhost:4173 \
      --name "Vesper RSS" \
      --icon ./static/vesper.ico \
      --width 1400 \
      --height 900
    ```

    **Icon formats:**
    - Linux/Mac: Use `./static/icon-512.png` (512×512 PNG)
    - Windows: Use `./static/vesper.ico`

3. **Install the generated app:**
    - **macOS**: Open the `.dmg` and drag to Applications
    - **Windows**: Run the `.msi` installer
    - **Linux**: `sudo dpkg -i Vesper-RSS_x86_64.deb`

## Desktop app settings

Without the server-side CORS proxy:

1. Open Vesper → **Settings**
2. Enable **Direct Fetch Mode**
3. Some commercial feeds may still fail CORS; personal blogs and many indie feeds work

## Automated releases (experimental)

```bash
git tag v1.0.0
git push origin v1.0.0
```

Prefer manual builds until Pake native deps are stable in CI.
