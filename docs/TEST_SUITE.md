# Test Suite

Cat Gatekeeper uses Node.js's built-in test runner. The suite focuses on the
break media-control feature, its settings, and the packaging contracts required
to make platform helpers work after installation.

## Run Tests

```bash
npm test
```

Run a single file:

```bash
node --test test/break-media-manager.test.js
```

Run a test by name:

```bash
node --test --test-name-pattern="stale pause result"
```

The full suite currently contains 22 tests.

## Test Files

### `test/break-media-manager.test.js`

Tests the break-level media state machine independently from Electron and the
operating system.

Coverage:

- Does nothing when pause-on-break is disabled.
- Pauses media without resuming when automatic resume is disabled.
- Resumes only sessions returned by the current break's pause operation.
- Rejects stale asynchronous pause results after another break starts.
- Waits for an in-progress pause operation before automatic resume.

These tests protect the most important safety rule: Cat Gatekeeper must never
start unrelated or previously paused media.

### `test/media-controller.test.js`

Tests platform adapter behavior by injecting fake command runners.

Coverage:

- Unsupported platforms make no media-control calls.
- Linux pauses only players reporting `Playing`.
- Linux resumes only remembered players still reporting `Paused`.
- macOS pauses media even when a safe resume fingerprint is unavailable.
- macOS resumes only when the current media fingerprint matches.
- macOS safely falls back from unique identifiers to title and artist.
- Missing tools and command failures become safe no-ops.
- Windows receives the exact remembered sessions encoded for targeted resume.

The tests never invoke real players or modify system playback.

### `test/settings-store.test.js`

Tests settings defaults, migration, persistence, and recovery using temporary
files.

Coverage:

- New installs receive the media-control defaults.
- Version 4 settings migrate to version 5 and persist the new settings.
- Saving media settings preserves unrelated settings.
- Corrupt JSON falls back to defaults.
- environment variables take precedence when settings are saved.

Temporary settings directories are deleted automatically after each test.

### `test/package-contract.test.js`

Tests static contracts that are easy to break during packaging changes.

Coverage:

- Production modules are included in Electron Builder's file list.
- The Windows PowerShell helper is unpacked from `app.asar`.
- The macOS helper, licenses, notice, and corresponding source are packaged.
- The settings UI exposes and binds both media-control settings.
- The bundled macOS helper notice pins the expected upstream revision.
- The GPL corresponding-source archive exists and is non-empty.

## Production Boundaries

Tests use the same modules as the running application:

- `break-media-manager.js` owns break-specific pause/resume state and race
  protection.
- `media-controller.js` selects and executes platform adapters.
- `settings-store.js` owns defaults, migration, loading, and saving.
- `main.js` connects those modules to Electron's break lifecycle.

Keep operating-system commands behind `media-controller.js`. Keep asynchronous
break-generation logic behind `break-media-manager.js`. This allows tests to
inject deterministic fakes without launching Electron or controlling real
media.

## Additional Validation

Run these checks before releasing:

```bash
npm test
npm run verify:mac-helper
npm run pack
npm run verify:mac-app
```

Useful syntax checks:

```bash
node --check main.js
node --check break-media-manager.js
node --check media-controller.js
node --check settings-store.js
bash -n scripts/build-nowplaying-cli.sh
```

On a macOS build machine, verify the packaged application, bundled native
helper signatures, license, and corresponding source:

```bash
npm run verify:mac-app
```

## Continuous Integration

`.github/workflows/ci.yml` runs the test suite on Ubuntu, macOS, and Windows.
Installer builds start only after all test jobs pass.

Platform-specific CI checks:

- macOS verifies the bundled helper before building, then checks the packaged
  app signature, helper executable, GPL license, and corresponding source.
- Windows parses the PowerShell media helper to catch syntax errors.
- Ubuntu verifies the platform-independent lifecycle, settings, adapter, and
  package-contract tests.

`.github/workflows/release.yml` also requires the test suite to pass before tag
builds and artifact publication begin.

## Manual Platform Verification

The automated suite verifies command selection and safety behavior, but it
cannot prove that every external player correctly integrates with the
operating system. Test release candidates with real media on each supported
platform.

### Shared Scenarios

For each platform, test with automatic resume both disabled and enabled:

1. Start supported media and trigger a break.
2. Confirm the media pauses while the overlay blocks input.
3. End the break naturally and confirm the configured resume behavior.
4. Repeat using **Done**, **Snooze**, **Reset Timer**, and app quit.
5. Start a different media item during the break and confirm Cat Gatekeeper
   does not resume the previous item.
6. Begin with media already paused and confirm Cat Gatekeeper does not play it.
7. Test with no media session and confirm the break still opens normally.

### Windows

- Test browser video and at least one native media player.
- Confirm Global System Media Transport Controls identifies playing sessions.
- Confirm the packaged PowerShell helper executes outside `app.asar`.

### macOS

- Test browser video and Apple Music or Spotify.
- Confirm the bundled `nowplaying-cli` works without Homebrew.
- Confirm the packaged executable and dylib pass `codesign --verify`.
- Test after major macOS upgrades because MediaRemote is a private framework.

### Linux

- Install `playerctl`.
- Test at least one MPRIS-compatible browser or native player.
- Confirm missing `playerctl` leaves media unchanged and does not block breaks.

## Adding Tests

- Use `node:test` and `node:assert/strict`.
- Name files `test/*.test.js`.
- Prefer injected fake command runners over invoking platform utilities.
- Use deferred promises to test asynchronous race conditions.
- Use temporary directories for settings tests.
- Add a package-contract test when introducing a new required runtime file.
- Never write a test that sends a blind Play/Pause toggle or controls the
  developer's real media session.
