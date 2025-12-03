// inputs.js - input model building and rendering

/**
 * Build throttle/brake/steer input model for a car.
 */
export function buildInputModelForCar({car, raceType, samples}) {
  const d = car.data;
  if (!d || d.length < 2) {
    car.inputModel = null;
    return;
  }

  // Estimate typical max accel / brake / lateral values from data (medium filtering)
  let maxPosAx = 0, maxNegAx = 0, maxAbsAy = 0;
  for (let i = 0; i < d.length; i++) {
    const ax = (d[i].smooth_ax ?? d[i].accel_x ?? 0);
    const ay = (d[i].accel_y ?? 0);
    if (ax > 0 && ax < 40) maxPosAx = Math.max(maxPosAx, ax);
    if (ax < 0 && ax > -40) maxNegAx = Math.min(maxNegAx, ax);
    if (Math.abs(ay) < 40) maxAbsAy = Math.max(maxAbsAy, Math.abs(ay));
  }
  const maxBrake = Math.max(3.0, -maxNegAx * 0.85);   // m/s^2
  const maxThrottle = Math.max(2.0, maxPosAx * 0.85); // m/s^2
  const maxSteer = Math.max(2.0, maxAbsAy * 0.85);    // m/s^2 lateral

  const lapDefs = [];
  const starts = car.lapStarts && car.lapStarts.length ? car.lapStarts : [0];

  if (raceType === 'lapped' && starts.length > 1) {
    for (let l = 0; l < starts.length - 1; l++) {
      const sIdx = starts[l];
      const eIdx = (l + 1 < starts.length ? starts[l + 1] - 1 : d.length - 1);
      if (eIdx > sIdx) lapDefs.push({ startIndex: sIdx, endIndex: eIdx });
    }
    const lastStart = starts[starts.length - 1];
    if (lastStart < d.length - 5) {
      lapDefs.push({ startIndex: lastStart, endIndex: d.length - 1 });
    }
  } else {
    lapDefs.push({ startIndex: 0, endIndex: d.length - 1 });
  }

  if (!lapDefs.length) {
    lapDefs.push({ startIndex: 0, endIndex: d.length - 1 });
  }

  const S = samples;
  const perLapThrottle = [];
  const perLapBrake = [];
  const perLapSteer = [];

  for (let li = 0; li < lapDefs.length; li++) {
    const def = lapDefs[li];
    const sIdx = def.startIndex;
    const eIdx = def.endIndex;
    const startDist = d[sIdx].dist;
    const endDist = d[eIdx].dist;
    const lapLen = Math.max(1e-6, endDist - startDist);

    const thArr = new Array(S);
    const brArr = new Array(S);
    const stArr = new Array(S);

    let cursor = sIdx + 1;
    let prevTh = 0, prevBr = 0, prevSt = 0;

    for (let si = 0; si < S; si++) {
      const frac = si / (S - 1);
      const targetDist = startDist + frac * lapLen;

      while (cursor <= eIdx && d[cursor].dist < targetDist) cursor++;

      let ax, ay, spd;
      if (cursor <= sIdx) {
        const p = d[sIdx];
        ax = (p.smooth_ax ?? p.accel_x ?? 0);
        ay = (p.accel_y ?? 0);
        spd = p.speed_mps || 0;
      } else if (cursor > eIdx) {
        const p = d[eIdx];
        ax = (p.smooth_ax ?? p.accel_x ?? 0);
        ay = (p.accel_y ?? 0);
        spd = p.speed_mps || 0;
      } else {
        const a = d[cursor - 1], b = d[cursor];
        const span = (b.dist - a.dist) || 1e-6;
        const t = (targetDist - a.dist) / span;

        const axA = (a.smooth_ax ?? a.accel_x ?? 0);
        const axB = (b.smooth_ax ?? b.accel_x ?? 0);
        const ayA = (a.accel_y ?? 0);
        const ayB = (b.accel_y ?? 0);
        const vA = a.speed_mps || 0;
        const vB = b.speed_mps || 0;

        ax = axA + (axB - axA) * t;
        ay = ayA + (ayB - ayA) * t;
        spd = vA + (vB - vA) * t;
      }

      const gLong = ax / 9.81;
      const gLat = ay / 9.81;

      const unstable = (
        Math.abs(gLong) > 1.7 ||
        Math.abs(gLat) > 2.0 ||
        spd < 1.0
      );

      let thVal, brVal, stVal;

      if (!unstable) {
        // Raw virtual intensities
        const rawBrake = Math.max(0, -ax);
        const rawThrottle = Math.max(0, ax);
        const rawSteer = Math.abs(ay);

        thVal = maxThrottle > 0 ? (rawThrottle / maxThrottle) : 0;
        brVal = maxBrake > 0 ? (rawBrake / maxBrake) : 0;
        stVal = maxSteer > 0 ? (rawSteer / maxSteer) : 0;

        // clamp
        thVal = Math.max(0, Math.min(1, thVal));
        brVal = Math.max(0, Math.min(1, brVal));
        stVal = Math.max(0, Math.min(1, stVal));

        // light smoothing
        const SMOOTH = 0.35;
        thVal = prevTh * SMOOTH + thVal * (1 - SMOOTH);
        brVal = prevBr * SMOOTH + brVal * (1 - SMOOTH);
        stVal = prevSt * SMOOTH + stVal * (1 - SMOOTH);
      } else {
        // medium filtering in unstable windows
        const DECAY = 0.85;
        thVal = prevTh * DECAY;
        brVal = prevBr * DECAY;
        stVal = prevSt * DECAY;
      }

      thArr[si] = thVal;
      brArr[si] = brVal;
      stArr[si] = stVal;
      prevTh = thVal;
      prevBr = brVal;
      prevSt = stVal;
    }

    perLapThrottle.push(thArr);
    perLapBrake.push(brArr);
    perLapSteer.push(stArr);
  }

  car.inputModel = {
    lapDefs,
    perLapThrottle,
    perLapBrake,
    perLapSteer
  };
}

export function updateAllInputModels({cars, raceType, samples}) {
  cars.forEach(car => buildInputModelForCar({car, raceType, samples}));
}

export function drawInputTimeline({
  inputCanvas,
  inputCtx,
  cars,
  primaryCarIndex,
  samples,
  inputThrottleToggle,
  inputBrakeToggle,
  inputSteerToggle
}) {
  if (!inputCanvas || !inputCtx) return;
  inputCtx.clearRect(0, 0, inputCanvas.width, inputCanvas.height);
  if (!cars.length) return;

  const primary = cars[primaryCarIndex] || cars[0];

  if (!primary || !primary.inputModel) {
    const W = inputCanvas.width;
    const H = inputCanvas.height;
    inputCtx.save();
    inputCtx.fillStyle = "rgba(17, 20, 26, 0.9)";
    inputCtx.fillRect(0, 0, W, H);
    inputCtx.fillStyle = "#9BA1A8";
    inputCtx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    inputCtx.textAlign = "center";
    inputCtx.fillText("No input model yet (need accel data)", W / 2, H / 2);
    inputCtx.restore();
    return;
  }

  const model = primary.inputModel;
  const laps = model.lapDefs;
  if (!laps || !laps.length) {
    const W = inputCanvas.width;
    const H = inputCanvas.height;
    inputCtx.save();
    inputCtx.fillStyle = "rgba(17, 20, 26, 0.9)";
    inputCtx.fillRect(0, 0, W, H);
    inputCtx.fillStyle = "#9BA1A8";
    inputCtx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    inputCtx.textAlign = "center";
    inputCtx.fillText("No laps for inputs", W / 2, H / 2);
    inputCtx.restore();
    return;
  }

  const d = primary.data;
  const idxGlobal = primary.dataIndex || 0;
  let currentLapIdx = 0;
  for (let l = laps.length - 1; l >= 0; l--) {
    if (idxGlobal >= laps[l].startIndex) { currentLapIdx = l; break; }
  }

  let thArr = model.perLapThrottle[currentLapIdx];
  let brArr = model.perLapBrake[currentLapIdx];
  let stArr = model.perLapSteer[currentLapIdx];

  let sampleCount = (thArr && thArr.length) || (brArr && brArr.length) || (stArr && stArr.length) || samples;

  if (!thArr) thArr = new Array(sampleCount).fill(0);
  if (!brArr) brArr = new Array(sampleCount).fill(0);
  if (!stArr) stArr = new Array(sampleCount).fill(0);

  const W = inputCanvas.width;
  const H = inputCanvas.height;
  const padX = 35;
  const padY = 8;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  const showThrottle = !inputThrottleToggle || inputThrottleToggle.checked;
  const showBrake = !inputBrakeToggle || inputBrakeToggle.checked;
  const showSteer = inputSteerToggle && inputSteerToggle.checked;

  inputCtx.save();
  inputCtx.clearRect(0, 0, W, H);

  // background bands
  inputCtx.fillStyle = "rgba(17, 20, 26, 0.9)";
  inputCtx.fillRect(padX, padY, innerW, innerH);

  inputCtx.strokeStyle = "#343843";
  inputCtx.lineWidth = 1;
  inputCtx.beginPath();
  inputCtx.moveTo(padX, padY + innerH);
  inputCtx.lineTo(padX + innerW, padY + innerH);
  inputCtx.stroke();

  const S = thArr.length;

  function drawLine(arr, color) {
    inputCtx.beginPath();
    for (let i = 0; i < S; i++) {
      const frac = i / (S - 1);
      const x = padX + frac * innerW;
      const v = Math.max(0, Math.min(1, arr[i] || 0));
      const y = padY + innerH * (1 - v);
      if (i === 0) inputCtx.moveTo(x, y);
      else inputCtx.lineTo(x, y);
    }
    inputCtx.strokeStyle = color;
    inputCtx.lineWidth = 1.5;
    inputCtx.stroke();
  }

  if (showThrottle) drawLine(thArr, "#3EE98A");
  if (showBrake) drawLine(brArr, "#FF6B6B");
  if (showSteer) drawLine(stArr, "#4FC3F7");

  inputCtx.fillStyle = "#9BA1A8";
  inputCtx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  inputCtx.fillText("Inputs (" + primary.name + ")", padX, padY - 2);

  // marker aligned with delta / lap progress
  const lapDef = laps[currentLapIdx];
  const sIdx = lapDef.startIndex;
  const eIdx = lapDef.endIndex;
  const spanIdx = Math.max(1, eIdx - sIdx);
  const fracIdx = Math.max(0, Math.min(1, (idxGlobal - sIdx) / spanIdx));
  const markerX = padX + fracIdx * innerW;

  inputCtx.strokeStyle = "rgba(255,255,255,0.9)";
  inputCtx.lineWidth = 1;
  inputCtx.beginPath();
  inputCtx.moveTo(markerX, padY);
  inputCtx.lineTo(markerX, padY + innerH);
  inputCtx.stroke();

  inputCtx.restore();
}
