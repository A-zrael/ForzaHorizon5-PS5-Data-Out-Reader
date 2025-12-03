// playback.js - playback loop and scrubber handling

/**
 * Create a playback controller driven by elapsed time (ms) instead of sample indices.
 */
export function createPlaybackController({
  playBtn,
  pauseBtn,
  scrubber,
  cars,
  getMaxDurationMs,
  setPlayheadMs,
  onFrame
}) {
  let carsRef = cars;
  const state = {playing: false, playheadMs: 0};
  let lastTimestamp = null;

  function step(now) {
    if (!state.playing) return;
    if (!carsRef || !carsRef.length) {
      state.playing = false;
      state.playheadMs = 0;
      if (scrubber) scrubber.value = 0;
      onFrame({smoothLens: false});
      return;
    }

    if (lastTimestamp == null) lastTimestamp = now;
    const dt = now - lastTimestamp;
    lastTimestamp = now;

    const maxMs = Math.max(0, getMaxDurationMs());
    if (maxMs <= 0) {
      state.playing = false;
      return;
    }

    state.playheadMs = Math.min(maxMs, state.playheadMs + dt);
    setPlayheadMs(state.playheadMs);
    if (scrubber) scrubber.value = state.playheadMs;

    onFrame({smoothLens: true});

    if (state.playheadMs >= maxMs) {
      state.playing = false;
      return;
    }
    requestAnimationFrame(step);
  }

  function play() {
    if (state.playing) return;
    state.playing = true;
    lastTimestamp = null;
    requestAnimationFrame(step);
  }

  function pause() {
    state.playing = false;
  }

  if (playBtn) playBtn.addEventListener("click", play);
  if (pauseBtn) pauseBtn.addEventListener("click", pause);

  if (scrubber) {
    scrubber.addEventListener("input", e => {
      const v = parseFloat(e.target.value);
      const maxMs = Math.max(0, getMaxDurationMs());
      const clamped = Math.max(0, Math.min(Number.isFinite(v) ? v : 0, maxMs));
      state.playheadMs = clamped;
      setPlayheadMs(clamped);
      onFrame({smoothLens: false});
    });
  }

  function setCars(newCars) {
    carsRef = newCars;
    const maxMs = Math.max(0, getMaxDurationMs());
    state.playheadMs = Math.min(state.playheadMs, maxMs);
    setPlayheadMs(state.playheadMs);
    if (scrubber) {
      scrubber.max = maxMs;
      scrubber.value = state.playheadMs;
    }
  }

  function setPlayheadMsExternal(ms) {
    const maxMs = Math.max(0, getMaxDurationMs());
    state.playheadMs = Math.max(0, Math.min(ms, maxMs));
    setPlayheadMs(state.playheadMs);
    if (scrubber) {
      scrubber.value = state.playheadMs;
    }
  }

  return {play, pause, state, setCars, setPlayheadMs: setPlayheadMsExternal};
}
