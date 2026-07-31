# Timer Edge Cases

This file documents known edge cases in the work/break timer's away and sleep
handling, and the reasoning behind each accepted trade-off. The behavior
itself is defined by the pure rules in [`timer-policy.js`](../timer-policy.js)
and pinned by `test/timer-policy.test.js`; the full design is in
[`docs/superpowers/specs/2026-07-31-unified-away-tracking-design.md`](superpowers/specs/2026-07-31-unified-away-tracking-design.md).

Guiding principle for all decisions below: **it is better to rest more than to
strictly calculate the exact right rest time.** When in doubt, the timer errs
toward giving the user another break rather than skipping one.

## Summary

| # | Case | Behavior | Status |
|---|------|----------|--------|
| 1 | Short away earns no break credit | Break fires on schedule after return | Accepted |
| 2 | Away detection window counts as work | Up to the away-timer threshold of away time ticks as work | Accepted |
| 3 | Wake without input | Reset applies at wake; timer stays paused until first input | By design |
| 4 | Break elapses while asleep or locked | Slept time credits the break; break may end on wake | By design |
| 5 | System stall mistaken for sleep | ≥ 30 s tick gap is treated as sleep | Accepted |
| 6 | Idle detection unavailable | Degrades to sleep-gap-only detection | Fallback |
| 7 | Auto-pause on idle disabled | Pure idle away never resets; sleep still does | Accepted |
| 8 | Manual pause is respected | No auto-resume or reset evaluation while manually paused | By design |
| 9 | Env overrides bypass minute snapping | Dev-only `WORK_INTERVAL`/`BREAK_DURATION` skip validation | Dev hook |

## 1. Short away earns no break credit

**Scenario:** the user steps away mid-work-interval for less than a full break
duration — say 3–4 minutes against a 5-minute break. They rested, but on
return the frozen countdown resumes and the break fires on schedule, giving a
full 5-minute overlay shortly after they already rested.

**Behavior:** away time below the break duration earns zero credit. Only an
absence of at least one full break duration starts a fresh work interval.

**Why accepted:** alternatives were considered (crediting away time 1:1
against the next break; a "half the break counts as a full break" threshold)
and rejected. A 3-minute wander is not a guaranteed rest, and shortening or
skipping breaks based on it risks under-resting. Resting slightly more than
strictly necessary is the preferred failure mode. If this proves annoying in
practice, the credit approach is the designed next step — it extends
`evaluateReturn()` without changing the existing rules.

## 2. Away detection window counts as work

**Scenario:** the idle pause only engages after the away-timer threshold
(`idlePauseThreshold`). The seconds between the user's last input and the
pause engaging tick the work timer down as if the user were working.

**Behavior:** short absences below the threshold are invisible; longer
absences lose up to one threshold's worth of accuracy in the work countdown.

**Why accepted:** the error is small (roughly a minute), always in the
user's favor (the break arrives slightly earlier than strictly needed), and
reset decisions are unaffected — they measure from the last real input, not
from when the pause engaged.

## 3. Wake without input

**Scenario:** the lid opens (or the system wakes on schedule) but the user
does not touch the keyboard or mouse yet.

**Behavior:** the reset decision applies immediately at the wake tick, using
the away span measured from the last input before sleep. The system idle time
still includes the sleep, so the idle pause engages (or stays engaged) and the
timer remains frozen until the first real input. The fresh work interval
therefore effectively starts counting when the user actually starts working.
The reset decision re-evaluates on first input and is idempotent.

**Why by design:** this matches the agreed policy — a fresh interval starts
when the user actually resumes, not when the machine happens to wake.

## 4. Break elapses while asleep or locked

**Scenario:** the system sleeps (or the screen locks) during an active break.
The user never sees part or all of the cat overlay.

**Behavior:** slept time counts toward the break, since the user was away
from the screen. If the remaining break fully elapses while asleep, the break
ends on wake and a new work interval begins.

**Why by design:** the purpose of the break is time away from the screen,
which sleep guarantees. Holding the overlay hostage after a genuine absence
would punish the user for resting.

## 5. System stall mistaken for sleep

**Scenario:** a severe system stall (heavy swap, debugger freeze) delays the
timer tick by 30 seconds or more without any sleep occurring.

**Behavior:** the gap is treated as sleep. During a break the stalled time
credits the break; outside a break nothing happens unless the user was also
away long enough to cross the reset threshold.

**Why accepted:** stalls of this size are rare, and both outcomes are benign
— a slightly shorter break, or no effect at all. Corroborating with system
idle time was rejected because waking a Mac requires a key press, which
zeroes idle time and would break genuine sleep detection.

## 6. Idle detection unavailable

**Scenario:** `powerMonitor.getSystemIdleTime()` throws (unsupported
environment or platform quirk).

**Behavior:** the last-activity anchor falls back to "active now" every tick,
so away measurement degrades to the sleep-gap length alone. Sleep resets
still work; combined idle + sleep and pure-idle resets do not.

**Why fallback:** graceful degradation to the pre-unification behavior beats
crashing the tick loop or freezing the timer.

## 7. Auto-pause on idle disabled

**Scenario:** the user turns off **auto-pause on idle** in settings, then
idles at the desk for longer than a break duration without the system
sleeping.

**Behavior:** no reset occurs. The idle-return evaluation only runs while an
idle pause is engaged, and with the setting off it never engages. Sleep-gap
detection is unaffected.

**Why accepted:** disabling auto-pause is an explicit statement that idle
time should count as work time; silently resetting would contradict the
setting.

## 8. Manual pause is respected

**Scenario:** the user manually pauses the timer, then walks away or the
system sleeps.

**Behavior:** away time and returns never auto-resume a manual pause. A
long-enough sleep can still refresh `workSecondsRemaining` behind the scenes,
but the timer stays paused until the user manually resumes.

**Why by design:** a manual pause is an explicit instruction that outranks
automatic away handling.

## 9. Env overrides bypass minute snapping

**Scenario:** the `WORK_INTERVAL` / `BREAK_DURATION` environment variables
(used for development and testing) are set to values that are not whole
minutes.

**Behavior:** they apply after settings load and skip the whole-minute
snapping that migration and the settings UI enforce, so displays like `4:30`
can reappear.

**Why dev hook:** intentional escape hatch for fast manual testing (e.g.
10-second breaks). Never active for end users.
