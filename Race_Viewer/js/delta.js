// delta.js - delta model building and timeline rendering

function percentile(arr, p) {
  if (!arr.length) return 0;
  const idx = Math.floor(p * (arr.length - 1));
  return arr[idx];
}

/**
 * Build the delta model for a single car.
 */
export function buildDeltaModelForCar({car, raceType, samples, computeLapAnalysisForCar}) {
  const analysis = computeLapAnalysisForCar(car);
  if (!analysis) {
    car.deltaModel = null;
    return;
  }
  const d = car.data;
  const lapDefs = [];
  const starts = car.lapStarts && car.lapStarts.length ? car.lapStarts : [0];

  if (raceType === 'lapped' && starts.length > 1) {
    for (let l = 0; l < starts.length - 1; l++) {
      const sIdx = starts[l];
      const eIdx = (l + 1 < starts.length ? starts[l + 1] - 1 : d.length - 1);
      if (eIdx > sIdx) lapDefs.push({startIndex: sIdx, endIndex: eIdx});
    }
    const lastStart = starts[starts.length - 1];
    if (lastStart < d.length - 5) {
      lapDefs.push({startIndex: lastStart, endIndex: d.length - 1});
    }
  } else {
    lapDefs.push({startIndex: 0, endIndex: d.length - 1});
  }

  const S = samples;
  const perLapTimes = [];

  for (let li = 0; li < lapDefs.length; li++) {
    const def = lapDefs[li];
    const sIdx = def.startIndex;
    const eIdx = def.endIndex;
    const startTimeAbs = d[sIdx].timestampMS || 0;
    const startDist = d[sIdx].dist;
    const endDist = d[eIdx].dist;
    const lapLen = Math.max(1e-6, endDist - startDist);

    const times = new Array(S);
    let cursor = sIdx + 1;
    for (let si = 0; si < S; si++) {
      const frac = si / (S - 1);
      const targetDist = startDist + frac * lapLen;

      while (cursor <= eIdx && d[cursor].dist < targetDist) cursor++;
      let ts;
      if (cursor <= sIdx) {
        ts = startTimeAbs;
      } else if (cursor > eIdx) {
        ts = d[eIdx].timestampMS || startTimeAbs;
      } else {
        const a = d[cursor - 1], b = d[cursor];
        const span = (b.dist - a.dist) || 1e-6;
        const t = (targetDist - a.dist) / span;
        const aT = a.timestampMS || startTimeAbs;
        const bT = b.timestampMS || startTimeAbs;
        ts = aT + t * (bT - aT);
      }
      times[si] = ts - startTimeAbs;
    }
    perLapTimes.push(times);
  }

  const analysis2 = computeLapAnalysisForCar(car);
  const bestIdx = analysis2.bestLapIndex;
  const refTimes = perLapTimes[bestIdx] || perLapTimes[0];

  const perLapDeltas = perLapTimes.map(times =>
    times.map((t, idx) => {
      const ref = refTimes[idx];
      if (!isFinite(t) || !isFinite(ref)) return 0;
      return t - ref;
    })
  );

  car.deltaModel = {
    lapDefs,
    perLapDeltas,
    bestLapIndex: bestIdx
  };
}

export function updateAllDeltaModels({
  cars,
  raceType,
  samples,
  computeLapAnalysisForCar,
  primaryCarSelect,
  setPrimaryCarIndex
}) {
  cars.forEach(car => buildDeltaModelForCar({car, raceType, samples, computeLapAnalysisForCar}));
  populatePrimaryCarSelect({cars, primaryCarSelect, setPrimaryCarIndex});
}

export function populatePrimaryCarSelect({cars, primaryCarSelect, setPrimaryCarIndex}) {
  if (!primaryCarSelect) return;
  primaryCarSelect.innerHTML = "";
  cars.forEach((car, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = car.name || ("Car " + (idx + 1));
    primaryCarSelect.appendChild(opt);
  });
  if (cars.length > 0) {
    primaryCarSelect.value = "0";
    if (setPrimaryCarIndex) setPrimaryCarIndex(0);
  }
}

/**
 * Draw delta timeline, returning the hover model (also stored on window for legacy).
 */
export function drawDeltaTimeline({
  deltaCtx,
  deltaCanvas,
  cars,
  primaryCarIndex,
  samples,
  deltaShadingToggle
}) {
  deltaCtx.clearRect(0, 0, deltaCanvas.width, deltaCanvas.height);
  if (!cars.length) {
    window.__deltaLast = null;
    return;
  }
  const primary = cars[primaryCarIndex] || cars[0];
  if (!primary.deltaModel) {
    window.__deltaLast = null;
    return;
  }

  const model = primary.deltaModel;
  const laps = model.lapDefs;
  if (!laps.length) {
    window.__deltaLast = null;
    return;
  }

  const padX = 35;
  const padY = 16;
  const W = deltaCanvas.width;
  const H = deltaCanvas.height;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const midY = padY + innerH / 2;

  const S = samples;
  const idxGlobal = primary.dataIndex || 0;
  let currentLapIdx = 0;
  for (let l = laps.length - 1; l >= 0; l--) {
    if (idxGlobal >= laps[l].startIndex) {currentLapIdx = l; break;}
  }

  const deltas = model.perLapDeltas[currentLapIdx];
  if (!deltas) {
    window.__deltaLast = null;
    return;
  }

  // use 95th percentile of |delta| for scaling to avoid spikes dominating
  const absVals = deltas.filter(Number.isFinite).map(v => Math.abs(v)).sort((a, b) => a - b);
  let maxAbs = percentile(absVals, 0.95);
  if (!isFinite(maxAbs) || maxAbs < 50) maxAbs = 50;

  const shadingOn = deltaShadingToggle && deltaShadingToggle.checked;

  // baseline
  deltaCtx.strokeStyle = "#343843";
  deltaCtx.lineWidth = 1;
  deltaCtx.beginPath();
  deltaCtx.moveTo(padX, midY);
  deltaCtx.lineTo(W - padX, midY);
  deltaCtx.stroke();

  // optional shading
  if (shadingOn) {
    for (let i = 0; i < S - 1; i++) {
      const frac1 = i / (S - 1);
      const frac2 = (i + 1) / (S - 1);
      const x1 = padX + frac1 * innerW;
      const x2 = padX + frac2 * innerW;
      const v1 = deltas[i];
      const v2 = deltas[i + 1];

      const norm1 = v1 / maxAbs;
      const norm2 = v2 / maxAbs;

      const y1 = midY + norm1 * (innerH * 0.48);
      const y2 = midY + norm2 * (innerH * 0.48);

      const isLoss = (v1 + v2) / 2 > 0;
      const fillColor = isLoss ? "rgba(255, 96, 96, 0.35)" : "rgba(96, 255, 150, 0.35)";

      deltaCtx.beginPath();
      deltaCtx.moveTo(x1, midY);
      deltaCtx.lineTo(x1, y1);
      deltaCtx.lineTo(x2, y2);
      deltaCtx.lineTo(x2, midY);
      deltaCtx.closePath();
      deltaCtx.fillStyle = fillColor;
      deltaCtx.fill();
    }
  }

  // delta curve
  deltaCtx.beginPath();
  for (let i = 0; i < S; i++) {
    const frac = i / (S - 1);
    const x = padX + frac * innerW;
    const v = deltas[i];
    const norm = v / maxAbs;
    const y = midY + norm * (innerH * 0.48);
    if (i === 0) deltaCtx.moveTo(x, y);
    else deltaCtx.lineTo(x, y);
  }
  deltaCtx.strokeStyle = "#BB86FF";
  deltaCtx.lineWidth = 2;
  deltaCtx.stroke();

  // label
  deltaCtx.fillStyle = "#9BA1A8";
  deltaCtx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  deltaCtx.fillText("Δt vs best (" + primary.name + ")", padX, padY - 4);

  // marker
  const lapDef = laps[currentLapIdx];
  const sIdx = lapDef.startIndex;
  const eIdx = lapDef.endIndex;
  const spanIdx = Math.max(1, eIdx - sIdx);
  const fracIdx = Math.max(0, Math.min(1, (idxGlobal - sIdx) / spanIdx));
  const markerX = padX + fracIdx * innerW;

  deltaCtx.strokeStyle = "#FFFFFF";
  deltaCtx.lineWidth = 1;
  deltaCtx.beginPath();
  deltaCtx.moveTo(markerX, padY);
  deltaCtx.lineTo(markerX, padY + innerH);
  deltaCtx.stroke();

  const hoverModel = {
    padX,
    padY,
    innerW,
    innerH,
    midY,
    deltas,
    currentLapIdx,
    primaryName: primary.name
  };
  window.__deltaLast = hoverModel;
  return hoverModel;
}
