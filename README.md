# Cat Gatekeeper

> A playful desktop app that periodically blocks your screen with a cat video to remind you to take breaks. Built with Electron. This is inspired project. See [Acknowledgments](#acknowledgments)

When your work interval is up, a cat slides in from the side of your screen and after a moment falls asleep on your display — a friendly feline gatekeeper enforcing HSE-recommended screen breaks.

**This project is open for contributions!** Whether you want to fix bugs, add features, improve documentation, or share your favorite cat videos — all contributions are welcome. See [Contributing](#contributing) below.

## ✨ Features

- **Cat overlay** — playful full-screen break reminder with animated cat
- **Two-video lifecycle** — active cat slides in, then transitions to sleeping cat
- **HSE-compliant defaults** — 30 min work / 5 min break intervals
- **Customizable** — adjust work/break intervals to your preference
- **System tray** — runs quietly in background with pause/resume controls
- **Multi-monitor** — works across all your displays
- **Custom videos** — use your own cat videos (WIP)
- **Snooze** — add 5 minutes when you're in the zone
- **Away detection** — auto-pauses when you step away; a long enough absence counts as your break
- **Media control** — pauses supported video and audio during breaks, with optional automatic resume
- **Auto-updates** — checks for new versions in the background; restart to install when ready (packaged builds)

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Launch the app
npm start
```

The app starts in your system tray. The cat will appear after 30 minutes (default) for a 5-minute break.

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
> Since Cat Gatekeeper is not signed with an Apple Developer certificate, macOS Gatekeeper will block it. You may see one of these messages:
> 
> - _"Cat Gatekeeper.dmg" is damaged and can't be opened._
> - _"Cat Gatekeeper" cannot be opened because the developer cannot be verified._
> 
> **These are standard macOS security responses for unsigned apps, not a problem with the app.** The app is open-source and safe to use.
> 
> This only affects builds **downloaded from the internet** — macOS stamps downloaded files with a "quarantine" attribute, and Gatekeeper rejects unsigned apps that carry it. A DMG built on your own machine (e.g. with `npm run dist:mac`) has no such attribute and opens normally. So a release download reporting "damaged" does **not** mean the build is broken — the artifact is healthy, macOS is simply blocking the unsigned download.
> 
> **Fix 1: Right-click → Open (quickest, no Terminal needed)**
> 
> 1. Double-click the DMG to mount it, then drag **Cat Gatekeeper** to your Applications folder
> 2. Right-click (or Control-click) **Cat Gatekeeper** in Applications
> 3. Choose **Open** from the context menu
> 4. Click **Open** in the confirmation dialog — the app launches, and from then on opens normally with a double-click
> 
> **Fix 2: Remove quarantine from the DMG (recommended)**
> 
> Open Terminal and run this command on the downloaded DMG **before** opening it:
> 
> ```bash
> xattr -d com.apple.quarantine ~/Downloads/Cat.Gatekeeper-*.dmg
> ```
> 
> Then double-click the DMG to mount it and drag the app to Applications.
> 
> **Fix 3: Allow via System Settings (after install)**
> 
> If you already installed the app and see the "cannot be verified" message:
> 
> 1. **Don't click "Move to Trash"** — click **Cancel** or the **X** button
> 2. Open **System Settings** (or System Preferences)
> 3. Go to **Privacy & Security** (or Security & Privacy)
> 4. Scroll down to the Security section
> 5. You'll see a message: _"Cat Gatekeeper was blocked..."_
> 6. Click **Open Anyway**
> 7. A second dialog will appear — click **Open**
> 
> **Fix 4: Remove quarantine from the installed app**
> 
> If the app is already installed and still blocked, clear the quarantine attribute recursively:
> 
> ```bash
> xattr -cr /Applications/Cat\ Gatekeeper.app
> ```
> 
> **Disclaimer:** Cat Gatekeeper is provided as-is under the MIT License. The app is open-source — you can review the code to verify its behavior. By using this software, you acknowledge that you do so at your own discretion. The maintainers are not responsible for any issues arising from its use.


## 🛠️ Commands

| Command | Description |
|---------|-------------|
| `npm start` | Launch the app (30 min interval) |
| `npm run start:dev` | Launch with short intervals (2 min work / 3 min break) for testing |
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

### Away & sleep behavior

The timer measures time away from a single anchor — your last real input — so
idle time at the desk and system sleep (lid close) combine into one measure:

- **Step away briefly** — the countdown pauses once you pass the away timer
  threshold and resumes exactly where it froze when you come back.
- **Away for a full break duration or more** (idle, asleep, or a mix) — you
  already had your break, so a fresh work interval starts when you return.
- **System sleeps during a break** — the slept time counts toward the break;
  if the break fully elapses while asleep, it ends on wake and a new work
  interval begins.

Example with a 5-minute break: 2 minutes idle followed by a 4-minute lid
close is 6 minutes away — the work timer starts fresh on return. A 3-minute
lid close alone just resumes the countdown where it left off.

The reset rules live in [`timer-policy.js`](timer-policy.js); the full design
is documented in
[`docs/superpowers/specs/2026-07-31-unified-away-tracking-design.md`](docs/superpowers/specs/2026-07-31-unified-away-tracking-design.md).
Known edge cases and their accepted trade-offs (e.g. why a short away earns
no break credit) are documented in
[`docs/TIMER_EDGE_CASES.md`](docs/TIMER_EDGE_CASES.md).

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
├── break-media-manager.js   # Break media pause/resume state & race protection
├── media-controller.js      # Platform media adapters (win/mac/linux)
├── settings-store.js        # Settings defaults, migration, persistence
├── timer-policy.js          # Pure away/sleep reset decision rules
├── updater.js               # In-app auto-updater (electron-updater)
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
│       ├── icon1.png        # App and tray icon
│       └── icon-small.png   # Small tray icon
├── test/                    # node:test suite (34 tests)
│   ├── break-media-manager.test.js
│   ├── media-controller.test.js
│   ├── package-contract.test.js
│   ├── settings-store.test.js
│   └── timer-policy.test.js
├── scripts/
│   ├── generate-assets.js   # Generates PNG icons and cat image
│   ├── generate-video.js    # Creates placeholder cat video via ffmpeg
│   ├── windows-media-control.ps1  # Windows media pause/resume helper
│   ├── build-nowplaying-cli.sh    # Builds the bundled macOS helper
│   ├── verify-nowplaying-bundle.js
│   ├── verify-macos-app.sh
│   └── run-with-retries.js
├── vendor/
│   └── nowplaying-cli/      # macOS media-control helper + licenses + source
└── docs/
    ├── TIMER_EDGE_CASES.md
    ├── TEST_SUITE.md
    └── superpowers/specs/     # Design specs
```

## ⚙️ Default Settings

| Setting | Default | Range |
|---------|---------|-------|
| Work interval | 30 min | 5-120 min |
| Break duration | 5 min (300 sec) | 1-10 min (60-600 sec) |
| Snooze duration | 5 min (300 sec) | 1-10 min |
| Max snooze attempts | 2 | 1-10 |
| Pause when away | enabled | on/off |
| Away after (idle threshold) | 5 min (300 sec) | 1-15 min |
| Sound effect | disabled | on/off |
| Multi-monitor | enabled | on/off |
| Pause media during breaks | enabled | on/off |
| Resume media after breaks | disabled | on/off |
| Launch on startup | disabled | on/off |
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

This sets the work interval to 2 minutes and break duration to 3 minutes. You can also use environment variables directly:

```bash
WORK_INTERVAL=2 BREAK_DURATION=180 npm start
```

> **Note:** `start:dev` and direct environment-variable overrides skip the
> whole-minute snapping that the settings UI and migration enforce, so
> non-minute values (e.g. a 10-second break) only work this way — they are
> never applied to end-user saves.

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
- **[Keith Diaz — What sitting all day does to your brain and body](https://www.ted.com/talks/keith_diaz_what_sitting_all_day_does_to_your_brain_and_body)** — TED Talk (April 2026) that informed the 30-minute work interval default
- All the cats who inspired this project 🐱

## 📬 Contact & Support

- 🐛 **Bug reports**: [GitHub Issues](https://github.com/haaaashimi/cat-gatekeeper/issues)
- 💬 **Questions**: [Discussions](https://github.com/haaaashimi/cat-gatekeeper/discussions)

---

**Made with ❤️ for cats and healthy screen habits**
