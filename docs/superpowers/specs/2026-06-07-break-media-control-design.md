# Break Media Control Design

## Goal

When a Cat Gatekeeper break starts, pause external media that is currently
playing so the blocking overlay does not leave an inaccessible video or audio
stream running. At the end of the break, either leave that media paused for the
user to resume manually or automatically resume only media Cat Gatekeeper
successfully paused.

## Settings

- `pauseMediaOnBreak`: enabled by default.
- `autoResumeMediaAfterBreak`: disabled by default.

The settings screen exposes both toggles. Automatic resume is visually disabled
when pause-on-break is disabled.

## Architecture

Add a main-process `MediaController` module with this interface:

```js
pausePlaying(): Promise<Array<MediaSession>>
resume(sessions: Array<MediaSession>): Promise<void>
```

`MediaSession` contains the stable identifier needed to target the same player
again. The controller selects a platform adapter and returns an empty list when
media control is unavailable. Failures are logged and never prevent a break
from opening or ending.

The platform adapters use explicit playback state and explicit pause/play
commands:

- Windows: Global System Media Transport Controls sessions.
- Linux: MPRIS-compatible players through `playerctl`.
- macOS: `nowplaying-cli`, which uses the private MediaRemote framework.

The app never sends a blind global Play/Pause toggle because it could start
media that was already paused.

## Break Lifecycle

At `startBreak`, Cat Gatekeeper starts an asynchronous pause request before
opening the overlay. It stores only sessions that were playing and were
successfully paused. A monotonically increasing break ID prevents a late pause
result from being attached to a later or already-ended break.

At `endBreak`, the overlay closes immediately. When automatic resume is
enabled, Cat Gatekeeper asks the controller to play only the sessions stored
for that break. When automatic resume is disabled, the stored sessions are
discarded and remain paused.

Snooze, dismiss, natural break completion, reset, and app quit all use the same
end/cleanup behavior. Reset and quit do not auto-resume unless they are ending
an active break and automatic resume is enabled.

## Platform Availability

Platform media utilities are optional capabilities:

- Missing utilities or unsupported players result in no media changes.
- The UI explains that support depends on the operating system and player.
- macOS support is best-effort because MediaRemote is private.
- Linux support requires `playerctl` to be available.
- Windows support uses a bundled PowerShell helper.

This initial implementation includes helper scripts and packages them with the
application. It does not introduce blind fallback toggles.

## Validation

- Unit-test controller parsing, platform selection, and session-targeted resume
  using injected command runners.
- Verify settings migration and persistence.
- Verify start/end race handling and that media-control failures do not affect
  overlay lifecycle.
- Run JavaScript syntax checks and package validation.
