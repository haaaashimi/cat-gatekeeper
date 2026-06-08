const assert = require('node:assert/strict');
const test = require('node:test');
const { createBreakMediaManager } = require('../break-media-manager');

function deferred() {
  let resolve;
  const promise = new Promise(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test('does not pause or resume when break media control is disabled', async () => {
  const calls = [];
  const manager = createBreakMediaManager({
    pausePlaying: async () => {
      calls.push('pause');
      return [{ player: 'video' }];
    },
    resume: async () => calls.push('resume')
  });

  manager.start({ pauseMediaOnBreak: false });
  await manager.finish({ pauseMediaOnBreak: false, autoResumeMediaAfterBreak: true });
  assert.deepEqual(calls, []);
});

test('pauses media but leaves it paused when automatic resume is disabled', async () => {
  const calls = [];
  const manager = createBreakMediaManager({
    pausePlaying: async () => {
      calls.push('pause');
      return [{ player: 'video' }];
    },
    resume: async sessions => calls.push(['resume', sessions])
  }, { log() {} });

  manager.start({ pauseMediaOnBreak: true });
  await manager.finish({ pauseMediaOnBreak: true, autoResumeMediaAfterBreak: false });
  assert.deepEqual(calls, ['pause']);
});

test('resumes only sessions returned by the break pause operation', async () => {
  const sessions = [{ player: 'video' }];
  const calls = [];
  const manager = createBreakMediaManager({
    pausePlaying: async () => sessions,
    resume: async remembered => calls.push(remembered)
  }, { log() {} });

  manager.start({ pauseMediaOnBreak: true });
  await manager.finish({ pauseMediaOnBreak: true, autoResumeMediaAfterBreak: true });
  assert.deepEqual(calls, [sessions]);
});

test('does not resume a stale pause result after a later break starts', async () => {
  const firstPause = deferred();
  const resumed = [];
  let pauseCount = 0;
  const manager = createBreakMediaManager({
    pausePlaying: () => {
      pauseCount++;
      return pauseCount === 1
        ? firstPause.promise
        : Promise.resolve([{ player: 'second' }]);
    },
    resume: async sessions => resumed.push(sessions)
  }, { log() {} });

  manager.start({ pauseMediaOnBreak: true });
  const firstFinish = manager.finish({
    pauseMediaOnBreak: true,
    autoResumeMediaAfterBreak: true
  });
  manager.start({ pauseMediaOnBreak: true });
  firstPause.resolve([{ player: 'first' }]);

  await firstFinish;
  assert.deepEqual(resumed, []);
});

test('finishing waits for a pending pause before automatic resume', async () => {
  const pause = deferred();
  const resumed = [];
  const manager = createBreakMediaManager({
    pausePlaying: () => pause.promise,
    resume: async sessions => resumed.push(sessions)
  }, { log() {} });

  manager.start({ pauseMediaOnBreak: true });
  const finish = manager.finish({
    pauseMediaOnBreak: true,
    autoResumeMediaAfterBreak: true
  });
  assert.deepEqual(resumed, []);

  pause.resolve([{ player: 'video' }]);
  await finish;
  assert.deepEqual(resumed, [[{ player: 'video' }]]);
});
