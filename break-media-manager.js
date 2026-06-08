function createBreakMediaManager(mediaController, logger = console) {
  let generation = 0;
  let activePausePromise = Promise.resolve([]);

  function start(settings) {
    const currentGeneration = ++generation;
    activePausePromise = settings.pauseMediaOnBreak
      ? mediaController.pausePlaying()
      : Promise.resolve([]);

    activePausePromise.then((sessions) => {
      if (generation === currentGeneration && sessions.length > 0) {
        logger.log(`Cat Gatekeeper: paused ${sessions.length} media session(s)`);
      }
    });
  }

  function finish(settings) {
    const currentGeneration = generation;
    const pausePromise = activePausePromise;
    generation++;
    activePausePromise = Promise.resolve([]);

    if (!settings.pauseMediaOnBreak || !settings.autoResumeMediaAfterBreak) {
      return Promise.resolve();
    }

    return pausePromise.then((sessions) => {
      if (generation === currentGeneration + 1) {
        return mediaController.resume(sessions);
      }
      return undefined;
    });
  }

  return { start, finish };
}

module.exports = {
  createBreakMediaManager
};
