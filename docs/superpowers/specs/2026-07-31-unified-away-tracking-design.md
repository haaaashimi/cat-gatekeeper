# Unified Away Tracking Design

## Goal

Make "away" mean one thing everywhere: the time since the user's last real
keyboard or mouse input. Whether that time was spent idle at the desk, with the
lid closed, or a mix of both, the same rule decides when the work interval
starts fresh. This fixes two holes in the current dual-detector design:

1. Idle time and sleep time never combine. Being idle for 2 minutes and then
   asleep for 4 minutes is 6 minutes genuinely away, yet neither detector
   crosses its own threshold, so nothing resets.
2. Inconsistent thresholds. The idle path measures from when the pause engaged
   (already `idlePauseThreshold` after the last input), so an idle-away needs
   `idlePauseThreshold + breakDuration` to earn a fresh interval while a
   sleep-away needs only `breakDuration`.

## Policy (owner-confirmed)

- A fresh work interval starts only when the user actually returns (system
  wake or first input after an idle pause), and only when the total away time
  is at least `breakDuration`.
- Away time shorter than `breakDuration` never resets anything; the countdown
  resumes exactly where it froze.
- During an active break, sleep time is credited toward the remaining break;
  the break ends if it fully elapsed while asleep.
- The away timer (`idlePauseThreshold`) has exactly one job: pausing the
  countdown after N idle minutes. The countdown ticking through the detection
  window is an accepted "near accurate" trade-off. No reset logic is tied to
  this setting.

## Architecture

### New state in `main.js`

- `lastActivityAt`: wall-clock timestamp of the last real user input, refreshed
  every tick from `Date.now() - powerMonitor.getSystemIdleTime() * 1000`. It
  stays put while the user is idle, survives sleep, and jumps forward on input.

### Removed from `main.js`

- `suspendStartedAt` and both `powerMonitor.on('suspend')` /
  `powerMonitor.on('resume')` handlers. Ticks resume within about a second of
  wake, so the tick-gap detector covers every wake, and `lastActivityAt` is a
  better anchor than the suspend timestamp because the last input precedes the
  lid close.
- `idlePauseStartedAt` and the reset arithmetic in `updateIdlePauseState`.
  The unified away measure replaces both.

### New module: `timer-policy.js`

The reset decision is extracted into a pure, Electron-free function so CI can
pin the policy, following the `settings-store.js` factoring pattern:

```js
evaluateReturn({
  gapSeconds,           // seconds since the previous tick
  awaySeconds,          // seconds since last real input (pre-return value)
  isBreakActive,
  breakSecondsRemaining,
  breakDuration
}) => { action: 'none' | 'creditBreak' | 'endBreak' | 'resetWork',
        creditSeconds? }
```

Rules:

- Break active and `gapSeconds >= breakSecondsRemaining` → `endBreak`.
- Break active otherwise → `creditBreak` with `creditSeconds = gapSeconds`
  (only the slept time is credited; pre-sleep desk time already ticked the
  break down normally).
- No break and `awaySeconds >= breakDuration` → `resetWork`.
- Otherwise → `none`.

`main.js` maps actions onto its existing functions (`endBreak()`, counter
adjustments, `broadcastTimerStatus()`).

## Tick Flow (every second)

1. Compute `gapSeconds` from `lastTickAt` (unchanged, threshold 30 s).
2. Snapshot the previous `lastActivityAt`, then refresh it from
   `getSystemIdleTime()`. Return decisions always use the pre-return snapshot,
   because at the return tick the fresh sample already reflects the new input.
3. Wake path (`gapSeconds >=` threshold): call `evaluateReturn` with the
   snapshot-derived `awaySeconds` and apply the action.
4. Idle-return path (pause reason is idle and idle seconds drop to about
   zero): call `evaluateReturn` the same way, apply the action, then resume
   the timer.
5. Idle-pause engage: unchanged — pause when idle seconds reach
   `idlePauseThreshold`.

Both return paths share the same decision function, which is what makes cases
1 and 2 above impossible to regress independently.

## Error Handling

If `powerMonitor.getSystemIdleTime()` throws (guard already exists today),
`lastActivityAt` advances every tick as if the user were active. The wake path
then degrades to gap-only behavior — exactly the current shipped logic, never
worse.

Double handling is harmless by construction: a reset sets the counter to the
full interval and ending an inactive break is a no-op, so if two paths ever
fire for one return the result is identical.

## Testing

`test/timer-policy.test.js` (node:test, no Electron) covering at minimum:

- Idle 120 s + sleep 240 s with 300 s break duration → `resetWork`.
- Sleep 240 s alone → `none` (short away never resets).
- Idle-away totalling 300 s → `resetWork` (threshold asymmetry fixed).
- Break active, gap 60 s, 90 s remaining → `creditBreak` of 60 s.
- Break active, gap 120 s, 90 s remaining → `endBreak`.
- Boundary: away exactly equal to `breakDuration` → `resetWork`.

Existing `settings-store` and media tests are unaffected.

## Out of Scope

- Snooze behavior, including the owner's manual changes keeping `snoozeCount`
  across snoozed breaks (`endBreak(wasSnoozed)`).
- Crediting short aways against the next break (rejected case C).
- Deferring breaks while the screen is locked (rejected case D).
- Deadline-based timer rewrite (rejected approach 3).
