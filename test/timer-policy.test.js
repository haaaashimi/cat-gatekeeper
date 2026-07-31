const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluateReturn } = require('../timer-policy');

const base = {
    gapSeconds: 0,
    awaySeconds: 0,
    isBreakActive: false,
    breakSecondsRemaining: 0,
    breakDuration: 300
};

test('idle and sleep away time combine to reset the work interval', () => {
    // Idle 120s at the desk, then lid closed for 240s: neither alone crosses
    // the 300s break duration, but the total away time does
    const decision = evaluateReturn({ ...base, gapSeconds: 240, awaySeconds: 360 });
    assert.deepEqual(decision, { action: 'resetWork' });
});

test('short sleep alone never resets', () => {
    const decision = evaluateReturn({ ...base, gapSeconds: 240, awaySeconds: 240 });
    assert.deepEqual(decision, { action: 'none' });
});

test('pure idle away of a full break duration resets on return', () => {
    // Previously required idlePauseThreshold + breakDuration; now breakDuration
    const decision = evaluateReturn({ ...base, gapSeconds: 0, awaySeconds: 300 });
    assert.deepEqual(decision, { action: 'resetWork' });
});

test('away one second short of the break duration does not reset', () => {
    const decision = evaluateReturn({ ...base, gapSeconds: 0, awaySeconds: 299 });
    assert.deepEqual(decision, { action: 'none' });
});

test('sleep during a break credits only the slept time', () => {
    const decision = evaluateReturn({
        ...base,
        isBreakActive: true,
        breakSecondsRemaining: 90,
        gapSeconds: 60,
        awaySeconds: 400
    });
    assert.deepEqual(decision, { action: 'creditBreak', creditSeconds: 60 });
});

test('break that fully elapsed while asleep ends', () => {
    const decision = evaluateReturn({
        ...base,
        isBreakActive: true,
        breakSecondsRemaining: 90,
        gapSeconds: 120,
        awaySeconds: 400
    });
    assert.deepEqual(decision, { action: 'endBreak' });
});

test('overnight sleep resets the work interval', () => {
    const decision = evaluateReturn({ ...base, gapSeconds: 28800, awaySeconds: 28900 });
    assert.deepEqual(decision, { action: 'resetWork' });
});
