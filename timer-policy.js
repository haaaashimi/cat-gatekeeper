// Pure decision logic for what happens when the user returns after time away
// (system sleep, idle at the desk, or a mix of both). Kept Electron-free so
// the reset policy can be pinned by tests — see
// docs/superpowers/specs/2026-07-31-unified-away-tracking-design.md.
//
// gapSeconds:  seconds since the previous timer tick (sleep shows up here,
//              because setInterval cannot fire while the system sleeps)
// awaySeconds: seconds since the user's last real input, taken from the
//              pre-return snapshot of lastActivityAt

function evaluateReturn({
    gapSeconds,
    awaySeconds,
    isBreakActive,
    breakSecondsRemaining,
    breakDuration
}) {
    if (isBreakActive) {
        // Time asleep counts toward the break — the user was away from the screen.
        // Only the slept time is credited; pre-sleep desk time already ticked the
        // break down normally.
        if (gapSeconds >= breakSecondsRemaining) {
            return { action: 'endBreak' };
        }
        return { action: 'creditBreak', creditSeconds: gapSeconds };
    }

    // Away for at least a full break: start the next work interval fresh
    if (awaySeconds >= breakDuration) {
        return { action: 'resetWork' };
    }

    return { action: 'none' };
}

module.exports = { evaluateReturn };
