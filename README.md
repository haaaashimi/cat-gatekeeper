# Cat Gatekeeper

> A playful desktop app that periodically blocks your screen with a cat video to remind you to take breaks. Built with Electron. This is inspired project. See [Acknowledgments](#acknowledgments)

When your work interval is up, a cat slides in from the side of your screen and after a moment falls asleep on your display — a friendly feline gatekeeper enforcing HSE-recommended screen breaks.

**This project is open for contributions!** Whether you want to fix bugs, add features, improve documentation, or share your favorite cat videos — all contributions are welcome. See [Contributing](#contributing) below.

## ✨ Features

- **Cat overlay** — playful full-screen break reminder with animated cat
- **Two-video lifecycle** — active cat slides in, then transitions to sleeping cat
- **HSE-compliant defaults** — 50 min work / 5 min break intervals
- **Customizable** — adjust work/break intervals to your preference
- **System tray** — runs quietly in background with pause/resume controls
- **Multi-monitor** — works across all your displays
- **Custom videos** — use your own cat videos (WIP)
- **Snooze** — add 5 minutes when you're in the zone
- **Media control** — pauses supported video and audio during breaks, with optional automatic resume

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Launch the app
npm start
```

The app starts in your system tray. The cat will appear after 50 minutes (default) for a 5-minute break.

> The app ships with real cat videos (`neko1.webm`, `neko2.webm`) and all required assets in `src/assets/`. No additional setup needed.

## 📥 Installation

### Download from Releases

For most users, we recommend downloading the latest release:

1. Go to the [Releases page](https://github.com/haaaashimi/cat-gatekeeper/releases)
2. Download the installer for your platform:
   - **Windows**: `.exe` installer
   - **macOS**: `.dmg` disk image
   - **Linux**: `.AppImage` file

### macOS Security Gatekeeper

> **⚠️ Important for macOS users:**
> 
> Since Cat Gatekeeper is not signed with an Apple Developer certificate, macOS Gatekeeper will block it on first launch with a message like:
> 
> _"Cat Gatekeeper" cannot be opened because the developer cannot be verified._
> 
> **This is a standard macOS security feature, not a problem with the app.** The app is open-source and safe to use.
> 
> **To open the app:**
> 
> 1. **Don't click "Move to Trash"** — click **Cancel** or the **X** button
> 2. Open **System Settings** (or System Preferences)
> 3. Go to **Privacy & Security** (or Security & Privacy)
> 4. Scroll down to the Security section
> 5. You'll see a message: _"Cat Gatekeeper was blocked..."_
> 6. Click **Open Anyway**
> 7. A second dialog will appear — click **Open**
> 
> **Alternative method (via Terminal):**
> 
> ```bash
> xattr -d com.apple.quarantine /Applications/Cat\ Gatekeeper.app
> ```
> 
> **Disclaimer:** Cat Gatekeeper is provided as-is under the MIT License. The app is open-source — you can review the code to verify its behavior. By using this software, you acknowledge that you do so at your own discretion. The maintainers are not responsible for any issues arising from its use.


## 🛠️ Commands

| Command | Description |
|---------|-------------|
| `npm start` | Launch the app (50 min interval) |
| `npm run start:dev` | Launch with 1 min interval for testing |
| `npm run pack` | Package app into a directory (no installer) |
| `npm run dist` | Build installers for all platforms |
| `npm run dist:win` | Build Windows installer (.exe) |
| `npm run dist:mac` | Build macOS disk image (.dmg) |
| `npm run dist:linux` | Build Linux package (.AppImage) |

## 🎮 How It Works

1. The app sits in your system tray with a background timer
2. When the work interval ends, a full-screen overlay opens
3. The active cat video plays **once**, sliding in from the right side of the screen
4. When the active video ends, the cat transitions to a **sleeping** loop while a large countdown timer shows remaining break time
5. Reminder text and controls appear at the bottom of the screen
6. After the break, the overlay closes and the timer resets
7. You can snooze (+5 min) or dismiss the break early

## 🎨 Custom Cat Video 🚧

### Via Settings UI
1. Right-click the tray icon and open **Settings**
2. Scroll to **Custom Cat Video** and click **Browse...**
3. Select your MP4/WEBM/AVI/MOV file
4. Click **Save Settings**

> **Note:** This feature is currently under development. Basic video selection works, but advanced features may be limited.

### By replacing the default files
The active cat video defaults to `src/assets/neko1.webm`. Replace it with your own file (keeping the same name), or use the Settings UI to pick any video file. The sleeping cat (`neko2.webm`) is always bundled with the app.

### Video guidelines
- **Best:** Videos on a dark or black background (blends with the overlay)
- **Good:** Close-up cat faces with no distracting background
- **Avoid:** Green screen videos — chroma key removal is currently in development
- **Active cat format:** WEBM or MP4 (ideally short, 5-15 seconds, plays once)
- **Recommendation:** Use a walking cat for the active slot and a resting cat for the sleeping slot

To process a green screen video to a dark background using ffmpeg:

```bash
ffmpeg -i your_greenscreen.mp4 -vf "colorkey=0x00FF00:0.3:0.1,format=yuv420p" \
  -c:v libx264 -pix_fmt yuv420p src/assets/cat_processed.mp4
```

## 💻 Tech Stack

- **Electron** — cross-platform desktop shell
- **HTML/CSS/JS** — overlay and settings UI
- **electron-builder** — packaging and distribution
- **ffmpeg** — placeholder video generation (dev dependency)

## 📁 Project Structure

```
cat-gatekeeper/
├── main.js                  # Main process: windows, tray, timer, IPC
├── preload.js               # Secure context bridge
├── package.json
├── src/
│   ├── overlay.html         # Break overlay with cat video & timer
│   ├── overlay.css          # Overlay styling
│   ├── overlay.js           # Overlay logic (countdown, dismiss)
│   ├── settings.html        # Settings panel
│   ├── settings.css         # Settings styling
│   ├── settings.js          # Settings logic (form handling)
│   ├── silent.html          # Helper page for sound playback
│   └── assets/
│       ├── neko1.webm       # Active cat video (slides in, plays once)
│       ├── neko2.webm       # Sleeping cat video (loops after active ends)
│       ├── cat.mp4          # Fallback/legacy video
│       ├── cat.png          # Fallback cat image
│       ├── icon1.png         # App and tray icon
│       └── icon-small.png   # Small tray icon
└── scripts/
    ├── generate-assets.js   # Generates PNG icons and cat image
    └── generate-video.js    # Creates placeholder cat video via ffmpeg
```

## ⚙️ Default Settings

| Setting | Default | Range |
|---------|---------|-------|
| Work interval | 50 min | 5-120 min |
| Break duration | 5 min (300 sec) | 1-10 min (60-600 sec) |
| Snooze duration | 5 min (300 sec) | configurable |
| Sound effect | disabled | on/off |
| Multi-monitor | enabled | on/off |
| Pause media during breaks | enabled | on/off |
| Resume media after breaks | disabled | on/off |
| Cat video | bundled neko1.webm (active) + neko2.webm (sleeping) | user-selectable |

### External Media Support

Cat Gatekeeper uses explicit pause and play commands and never sends a blind
Play/Pause toggle. Automatic resume only targets media that Cat Gatekeeper
successfully paused.

- **Windows:** Uses Windows Global System Media Transport Controls.
- **Linux:** Requires `playerctl` and an MPRIS-compatible player.
- **macOS:** Includes `nowplaying-cli`; no separate installation is required.
  Support is best-effort because the utility relies on Apple's private
  MediaRemote framework. Its GPLv3 license and corresponding source are
  included in the app bundle.

## 📦 Building for Distribution

### Windows
```bash
npm run dist:win
```
Produces an NSIS installer in `dist/`.

### macOS
```bash
npm run dist:mac
```
Produces a DMG in `dist/`.

### Linux
```bash
npm run dist:linux
```
Produces an AppImage in `dist/`.

## 🧪 Dev Mode

For quick testing with short intervals:

```bash
npm run start:dev
```

This sets the work interval to 1 minute and break duration to 15 seconds. You can also use environment variables directly:

```bash
WORK_INTERVAL=1 BREAK_DURATION=15 npm start
```

## 🤝 Contributing

We welcome all contributions! Whether you're fixing a bug, adding a feature, improving documentation, or sharing cat videos — every contribution matters.

### Ways to Contribute

- 🐛 **Report bugs** — Found something broken? [Open an issue](https://github.com/haaaashimi/cat-gatekeeper/issues)
- 💡 **Suggest features** — Have an idea? We'd love to hear it
- 📝 **Improve docs** — Better documentation helps everyone
- 🎨 **Design** — UI/UX improvements, icons, animations
- 🐱 **Cat videos** — Share your favorite cat videos for the overlay
- 💻 **Code** — Fix bugs, build features, optimize performance

### Getting Started

1. **Fork** this repository
2. **Create your feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Test thoroughly** — use `npm run start:dev` for quick testing
5. **Commit your changes**: `git commit -m 'Add amazing feature'`
6. **Push to the branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Development Guidelines

- Follow the existing code style
- Comment your code, especially for complex logic
- Test on multiple platforms if possible (Windows, macOS, Linux)
- Update documentation when adding features
- Keep pull requests focused — one feature/fix per PR

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **[ぞくぞく](https://x.com/konekone2026)** — The original creator of the [Cat Gatekeeper Chrome extension](https://chromewebstore.google.com/detail/cat-gatekeeper/elbikiflgfhjdjmficnigpeegjbhdidh), built to limit SNS usage. This Electron desktop app is inspired by their brilliant idea, adapted to follow HSE screen-break guidelines for desk workers.
- HSE (Health and Safety Executive) for screen break recommendations
- All the cats who inspired this project 🐱

## 📬 Contact & Support

- 🐛 **Bug reports**: [GitHub Issues](https://github.com/haaaashimi/cat-gatekeeper/issues)
- 💬 **Questions**: [Discussions](https://github.com/haaaashimi/cat-gatekeeper/discussions)

---

**Made with ❤️ for cats and healthy screen habits**
