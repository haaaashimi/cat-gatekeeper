const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

function defaultRunCommand(command, args = []) {
  return execFileAsync(command, args, {
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
}

function nonEmptyLines(value) {
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function resolveExecutable(command, candidates) {
  return candidates.find(candidate => fs.existsSync(candidate)) || command;
}

function createLinuxAdapter(runCommand, playerctlCommand) {
  return {
    async pausePlaying() {
      const { stdout } = await runCommand(playerctlCommand, ['--list-all']);
      const players = [...new Set(nonEmptyLines(stdout))];
      const paused = [];

      for (const player of players) {
        try {
          const status = await runCommand(playerctlCommand, ['--player', player, 'status']);
          if (status.stdout.trim().toLowerCase() !== 'playing') continue;
          await runCommand(playerctlCommand, ['--player', player, 'pause']);
          paused.push({ player });
        } catch (_) {
          // One unsupported or disappearing player must not block the others.
        }
      }

      return paused;
    },

    async resume(sessions) {
      for (const session of sessions) {
        if (!session || typeof session.player !== 'string') continue;
        try {
          const status = await runCommand(playerctlCommand, ['--player', session.player, 'status']);
          if (status.stdout.trim().toLowerCase() === 'paused') {
            await runCommand(playerctlCommand, ['--player', session.player, 'play']);
          }
        } catch (_) {
          // The player may have closed during the break.
        }
      }
    }
  };
}

function createMacAdapter(runCommand, nowPlayingCommand) {
  async function getState() {
    const { stdout } = await runCommand(nowPlayingCommand, [
      'get', '--json', 'playbackRate', 'uniqueIdentifier', 'title', 'artist'
    ]);
    return JSON.parse(stdout);
  }

  function getFingerprint(state) {
    if (typeof state.uniqueIdentifier === 'string' && state.uniqueIdentifier) {
      return { uniqueIdentifier: state.uniqueIdentifier };
    }
    if (typeof state.title === 'string' && state.title) {
      return { title: state.title, artist: state.artist || '' };
    }
    return null;
  }

  function fingerprintsMatch(left, right) {
    if (!left || !right) return false;
    if (left.uniqueIdentifier || right.uniqueIdentifier) {
      return left.uniqueIdentifier === right.uniqueIdentifier;
    }
    return left.title === right.title && left.artist === right.artist;
  }

  return {
    async pausePlaying() {
      const state = await getState();
      const playbackRate = Number.parseFloat(state.playbackRate);
      if (!Number.isFinite(playbackRate) || playbackRate <= 0) return [];

      const fingerprint = getFingerprint(state);
      await runCommand(nowPlayingCommand, ['pause']);
      return fingerprint ? [fingerprint] : [];
    },

    async resume(sessions) {
      if (sessions.length !== 1) return;
      const current = getFingerprint(await getState());
      if (fingerprintsMatch(current, sessions[0])) {
        await runCommand(nowPlayingCommand, ['play']);
      }
    }
  };
}

function createWindowsAdapter(runCommand, helperPath) {
  const shell = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';

  async function runHelper(action, sessions = []) {
    const encodedSessions = Buffer.from(JSON.stringify(sessions), 'utf8').toString('base64');
    const { stdout } = await runCommand(shell, [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', helperPath,
      '-Action', action,
      '-SessionsBase64', encodedSessions
    ]);
    return stdout.trim() ? JSON.parse(stdout) : [];
  }

  return {
    pausePlaying: () => runHelper('pause'),
    resume: sessions => runHelper('resume', sessions)
  };
}

function createUnsupportedAdapter() {
  return {
    pausePlaying: async () => [],
    resume: async () => {}
  };
}

function createMediaController(options = {}) {
  const platform = options.platform || process.platform;
  const runCommand = options.runCommand || defaultRunCommand;
  const logger = options.logger || console;
  const bundledHelperPath = path.join(__dirname, 'scripts', 'windows-media-control.ps1');
  const helperPath = options.windowsHelperPath
    || bundledHelperPath.replace('app.asar', 'app.asar.unpacked');
  const playerctlCommand = options.playerctlCommand
    || resolveExecutable('playerctl', ['/usr/bin/playerctl', '/usr/local/bin/playerctl']);
  const nowPlayingCommand = options.nowPlayingCommand
    || resolveExecutable('nowplaying-cli', [
      path.join(process.resourcesPath || '', 'bin', 'nowplaying-cli', 'nowplaying-cli'),
      path.join(__dirname, 'vendor', 'nowplaying-cli', `darwin-${process.arch}`, 'nowplaying-cli'),
      '/opt/homebrew/bin/nowplaying-cli',
      '/usr/local/bin/nowplaying-cli'
    ]);

  let adapter;
  if (platform === 'linux') {
    adapter = createLinuxAdapter(runCommand, playerctlCommand);
  } else if (platform === 'darwin') {
    adapter = createMacAdapter(runCommand, nowPlayingCommand);
  } else if (platform === 'win32') {
    adapter = createWindowsAdapter(runCommand, helperPath);
  } else {
    adapter = createUnsupportedAdapter();
  }

  return {
    async pausePlaying() {
      try {
        return await adapter.pausePlaying();
      } catch (error) {
        logger.warn(`Cat Gatekeeper: media pause unavailable (${error.message})`);
        return [];
      }
    },

    async resume(sessions) {
      if (!Array.isArray(sessions) || sessions.length === 0) return;
      try {
        await adapter.resume(sessions);
      } catch (error) {
        logger.warn(`Cat Gatekeeper: media resume unavailable (${error.message})`);
      }
    }
  };
}

module.exports = {
  createMediaController
};
