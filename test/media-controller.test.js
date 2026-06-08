const assert = require('node:assert/strict');
const test = require('node:test');
const { createMediaController } = require('../media-controller');

function commandKey(command, args) {
  return [command, ...args].join(' ');
}

test('unsupported platforms do not attempt media commands', async () => {
  let called = false;
  const controller = createMediaController({
    platform: 'freebsd',
    runCommand: async () => {
      called = true;
      return { stdout: '' };
    }
  });

  assert.deepEqual(await controller.pausePlaying(), []);
  await controller.resume([{ player: 'anything' }]);
  assert.equal(called, false);
});

test('linux pauses only playing players and resumes only remembered paused players', async () => {
  const calls = [];
  const statuses = new Map([
    ['video', 'Playing'],
    ['music', 'Paused']
  ]);

  const runCommand = async (command, args) => {
    calls.push(commandKey(command, args));
    if (args[0] === '--list-all') return { stdout: 'video\nmusic\nvideo\n' };
    const player = args[1];
    const action = args[2];
    if (action === 'status') return { stdout: statuses.get(player) };
    if (action === 'pause') statuses.set(player, 'Paused');
    if (action === 'play') statuses.set(player, 'Playing');
    return { stdout: '' };
  };

  const controller = createMediaController({
    platform: 'linux',
    runCommand,
    playerctlCommand: 'playerctl'
  });
  const paused = await controller.pausePlaying();
  assert.deepEqual(paused, [{ player: 'video' }]);
  assert.equal(statuses.get('music'), 'Paused');

  await controller.resume(paused);
  assert.equal(statuses.get('video'), 'Playing');
  assert.ok(calls.includes('playerctl --player video pause'));
  assert.ok(calls.includes('playerctl --player video play'));
  assert.ok(!calls.includes('playerctl --player music play'));
});

test('macOS pauses playing media even when a safe resume fingerprint is unavailable', async () => {
  const calls = [];
  const runCommand = async (command, args) => {
    calls.push(commandKey(command, args));
    if (args[0] === 'get') {
      return { stdout: JSON.stringify({ playbackRate: 1, uniqueIdentifier: null, title: null, artist: null }) };
    }
    return { stdout: '' };
  };

  const controller = createMediaController({
    platform: 'darwin',
    runCommand,
    nowPlayingCommand: 'nowplaying-cli'
  });
  assert.deepEqual(await controller.pausePlaying(), []);
  assert.ok(calls.includes('nowplaying-cli pause'));
});

test('macOS resumes only when the current media fingerprint still matches', async () => {
  const calls = [];
  let currentIdentifier = 'video-1';
  const runCommand = async (command, args) => {
    calls.push(commandKey(command, args));
    if (args[0] === 'get') {
      return {
        stdout: JSON.stringify({
          playbackRate: 1,
          uniqueIdentifier: currentIdentifier,
          title: 'Video',
          artist: ''
        })
      };
    }
    return { stdout: '' };
  };

  const controller = createMediaController({
    platform: 'darwin',
    runCommand,
    nowPlayingCommand: 'nowplaying-cli'
  });
  const paused = await controller.pausePlaying();
  await controller.resume(paused);
  assert.equal(calls.filter(call => call === 'nowplaying-cli play').length, 1);

  currentIdentifier = 'video-2';
  await controller.resume(paused);
  assert.equal(calls.filter(call => call === 'nowplaying-cli play').length, 1);
});

test('macOS uses title and artist as a conservative fallback fingerprint', async () => {
  const calls = [];
  let title = 'Original video';
  const runCommand = async (command, args) => {
    calls.push(commandKey(command, args));
    if (args[0] === 'get') {
      return {
        stdout: JSON.stringify({
          playbackRate: 1,
          uniqueIdentifier: null,
          title,
          artist: 'Creator'
        })
      };
    }
    return { stdout: '' };
  };

  const controller = createMediaController({
    platform: 'darwin',
    runCommand,
    nowPlayingCommand: 'nowplaying-cli'
  });
  const paused = await controller.pausePlaying();
  assert.deepEqual(paused, [{ title: 'Original video', artist: 'Creator' }]);

  title = 'Different video';
  await controller.resume(paused);
  assert.ok(!calls.includes('nowplaying-cli play'));
});

test('controller turns platform command failures into safe no-ops', async () => {
  const warnings = [];
  const controller = createMediaController({
    platform: 'linux',
    playerctlCommand: 'playerctl',
    runCommand: async () => {
      throw new Error('playerctl missing');
    },
    logger: { warn: message => warnings.push(message) }
  });

  assert.deepEqual(await controller.pausePlaying(), []);
  await controller.resume([{ player: 'video' }]);
  assert.equal(warnings.length, 1);
});

test('Windows helper receives encoded remembered sessions for targeted resume', async () => {
  const calls = [];
  const runCommand = async (command, args) => {
    calls.push({ command, args });
    return { stdout: '[{"source":"app","title":"video","artist":""}]' };
  };

  const controller = createMediaController({
    platform: 'win32',
    runCommand,
    windowsHelperPath: 'C:\\helpers\\media.ps1'
  });
  const sessions = await controller.pausePlaying();
  await controller.resume(sessions);

  assert.equal(calls.length, 2);
  assert.ok(calls[0].args.includes('pause'));
  assert.ok(calls[1].args.includes('resume'));

  const encoded = calls[1].args[calls[1].args.indexOf('-SessionsBase64') + 1];
  assert.deepEqual(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')), sessions);
});
