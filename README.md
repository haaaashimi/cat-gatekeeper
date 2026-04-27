# Cat Gatekeeper

A playful Windows desktop app that periodically blocks your screen with a cat video to remind you to take breaks. Built with Electron.

When your work interval is up, a cat slides in from the side of your screen and after a moment falls asleep on your display — a friendly feline gatekeeper enforcing HSE-recommended screen breaks.

## Features

- **Full-screen cat overlay** — blocks your screen with a cat video at break time
- **Two-video lifecycle** — an active cat slides in from the right, then transitions to a looping sleeping cat
- **Slide-in animation** — the cat smoothly enters from off-screen over 3 seconds
- **Large countdown display** — prominent timer showing remaining break time
- **Configurable intervals** — work period (5-120 min) and break duration (1-10 min)
- **HSE-recommended defaults** — 50 min work, 5 min break per hour (5-10 min break hourly)
- **System tray** — runs quietly in the background, pause/resume from tray menu
- **Custom cat video** — use your own MP4 via the settings panel *(Work in Progress)*
- **Chroma key support** — remove green screen backgrounds *(Work in Progress)*
- **Multi-monitor support** — shows the cat on all displays
- **Sound alert** — optional meow on break start
- **Snooze** — add 5 more minutes if you're in the zone

## Quick Start

```bash
# Install dependencies
npm install

# Generate placeholder assets (icons, cat image, fallback video)
npm run setup

# Launch the app
npm start
```

The app starts in your system tray. The cat will appear after 50 minutes (default) for a 5-minute break.

> The app ships with real cat videos (`neko1.webm`, `neko2.webm`) in `src/assets/`. The `npm run setup` script only generates placeholder fallback assets — the real cat videos are included directly.

## Commands

| Command | Description |
|---------|-------------|
| `npm start` | Launch the app (50 min interval) |
| `npm run start:dev` | Launch with 1 min interval for testing |
| `npm run setup` | Generate placeholder icons, cat image, and fallback video |
| `npm run pack` | Package app into a directory (no installer) |
| `npm run dist` | Build installers for all platforms |
| `npm run dist:win` | Build Windows installer (.exe) |
| `npm run dist:mac` | Build macOS disk image (.dmg) |
| `npm run dist:linux` | Build Linux package (.AppImage) |

## How It Works

1. The app sits in your system tray with a background timer
2. When the work interval ends, a full-screen overlay opens
3. The active cat video plays **once**, sliding in from the right side of the screen
4. When the active video ends, the cat transitions to a **sleeping** loop while a large countdown timer shows remaining break time
5. Reminder text and controls appear at the bottom of the screen
6. After the break, the overlay closes and the timer resets
7. You can snooze (+5 min) or dismiss the break early

## Custom Cat Video *(Work in Progress)*

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

## Tech Stack

- **Electron** — cross-platform desktop shell
- **HTML/CSS/JS** — overlay and settings UI
- **electron-builder** — packaging and distribution
- **ffmpeg** — placeholder video generation (dev dependency)

## Project Structure

```
cat-reminder/
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
│       ├── icon.png         # App and tray icon
│       └── icon-small.png   # Small tray icon
└── scripts/
    ├── generate-assets.js   # Generates PNG icons and cat image
    └── generate-video.js    # Creates placeholder cat video via ffmpeg
```

## Default Settings

| Setting | Default | Range |
|---------|---------|-------|
| Work interval | 50 min | 5-120 min |
| Break duration | 5 min (300 sec) | 1-10 min (60-600 sec) |
| Sound effect | enabled | on/off |
| Multi-monitor | enabled | on/off |
| Cat video | bundled neko1.webm (active) + neko2.webm (sleeping) | user-selectable |

## Building for Distribution

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

## Dev Mode

For quick testing with short intervals:

```bash
npm run start:dev
```

This sets the work interval to 1 minute and break duration to 15 seconds. You can also use environment variables directly:

```bash
WORK_INTERVAL=2 BREAK_DURATION=10 npm start
```
