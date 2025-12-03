// events.js - event detection and timeline rendering helpers

const sampleTimestamp = (p) => {
  if (!p || typeof p !== "object") return 0;
  if (p.timestampMS != null) return p.timestampMS;
  if (p.timestamp != null) return p.timestamp;
  return 0;
};

/**
 * Compute lap index for a given data sample index.
 */
function getLapForIndex(car, idx) {
  const laps = car.lapStarts && car.lapStarts.length ? car.lapStarts : [0];
  let lap = 1;
  for (let i = laps.length - 1; i >= 0; i--) {
    if (idx >= laps[i]) {lap = i + 1; break;}
  }
  return lap;
}

function carDurationMs(car) {
  if (!car || !car.data || !car.data.length) return 0;
  const first = car.data[0];
  const last = car.data[car.data.length - 1];
  return Math.max(0, sampleTimestamp(last) - sampleTimestamp(first));
}

/**
 * Detect crash/collision/overtake/lap events for all cars.
 */
export function detectEventsAllCars({
  cars,
  formatMs,
  CRASH_SPEED_DROP_MPS,
  CRASH_ACCEL_THRESH,
  COLL_SPEED_DROP_MIN,
  COLL_SPEED_DROP_MAX,
  COLL_ACCEL_THRESH,
  EVENT_MIN_GAP_IDX
}) {
  cars.forEach(c => c.events = []);

  cars.forEach(car => {
    const d = car.data;
    const starts = car.lapStarts && car.lapStarts.length ? car.lapStarts : [0];

    starts.forEach((idx, lapIdx) => {
      car.events.push({
        type: "lapStart",
        idx,
        lap: lapIdx + 1,
        label: `Lap ${lapIdx + 1} start`
      });
    });

    const analysis = car.computeLapAnalysis?.();
    if (analysis) {
      const laps = analysis.laps;
      const bestLapIndex = analysis.bestLapIndex;
      const bestLapTimeMs = analysis.bestLapTimeMs;
      const bestLap = laps[bestLapIndex];
      if (bestLap) {
        car.events.push({
          type: "fastestLap",
          idx: bestLap.startIndex,
          lap: bestLapIndex + 1,
          label: `Fastest lap: Lap ${bestLapIndex + 1} (${formatMs(bestLapTimeMs)})`
        });
      }
    }
  });

  cars.forEach(car => {
    const d = car.data;
    let lastCrashIdx = -Infinity;
    let lastCollIdx = -Infinity;

    for (let i = 1; i < d.length; i++) {
      const prev = d[i - 1];
      const cur = d[i];
      const speedPrev = prev.speed_mps || (prev.speed_kph / 3.6) || (prev.speed_mph / 2.23694) || 0;
      const speedCur = cur.speed_mps || (cur.speed_kph / 3.6) || (cur.speed_mph / 2.23694) || 0;
      const dv = speedPrev - speedCur;
      const ax = cur.accel_x || 0;
      const ay = cur.accel_y || 0;
      const aMag = Math.sqrt(ax * ax + ay * ay);

      if (dv > CRASH_SPEED_DROP_MPS && aMag > CRASH_ACCEL_THRESH && (i - lastCrashIdx) > EVENT_MIN_GAP_IDX) {
        lastCrashIdx = i;
        const lap = getLapForIndex(car, i);
        car.events.push({
          type: "crash",
          idx: i,
          lap,
          dv_mps: dv,
          accel: aMag,
          label: `Crash – Lap ${lap}, Δv ${(dv * 2.23694).toFixed(1)} mph`
        });
        continue;
      }

      if (dv > COLL_SPEED_DROP_MIN && dv <= COLL_SPEED_DROP_MAX && aMag > COLL_ACCEL_THRESH && (i - lastCollIdx) > EVENT_MIN_GAP_IDX) {
        lastCollIdx = i;
        const lap = getLapForIndex(car, i);
        car.events.push({
          type: "collision",
          idx: i,
          lap,
          dv_mps: dv,
          accel: aMag,
          label: `Collision – Lap ${lap}, Δv ${(dv * 2.23694).toFixed(1)} mph`
        });
      }
    }
  });

  if (cars.length >= 2) {
    const maxLen = Math.max(...cars.map(c => c.data.length));
    const lastOvertake = {};
    for (let iIdx = 0; iIdx < cars.length; iIdx++) {
      for (let jIdx = iIdx + 1; jIdx < cars.length; jIdx++) {
        const key = `${iIdx}-${jIdx}`;
        lastOvertake[key] = -Infinity;
      }
    }

    for (let k = 1; k < maxLen; k++) {
      for (let iIdx = 0; iIdx < cars.length; iIdx++) {
        for (let jIdx = iIdx + 1; jIdx < cars.length; jIdx++) {
          const carA = cars[iIdx];
          const carB = cars[jIdx];
          if (k >= carA.data.length || k >= carB.data.length) continue;
          const prevA = carA.data[k - 1].dist;
          const prevB = carB.data[k - 1].dist;
          const curA = carA.data[k].dist;
          const curB = carB.data[k].dist;

          const key = `${iIdx}-${jIdx}`;
          if (prevA <= prevB && curA > curB && (k - lastOvertake[key]) > EVENT_MIN_GAP_IDX) {
            lastOvertake[key] = k;
            const lap = getLapForIndex(carA, k);
            const label = `Overtake ${carA.name} → ${carB.name} (Lap ${lap})`;
            carA.events.push({type: "overtake", idx: k, lap, label, with: carB.name});
            carB.events.push({type: "overtake", idx: k, lap, label: `Got overtaken by ${carA.name} (Lap ${lap})`, with: carA.name});
          } else if (prevB <= prevA && curB > curA && (k - lastOvertake[key]) > EVENT_MIN_GAP_IDX) {
            lastOvertake[key] = k;
            const lap = getLapForIndex(carB, k);
            const label = `Overtake ${carB.name} → ${carA.name} (Lap ${lap})`;
            carB.events.push({type: "overtake", idx: k, lap, label, with: carA.name});
            carA.events.push({type: "overtake", idx: k, lap, label: `Got overtaken by ${carB.name} (Lap ${lap})`, with: carB.name});
          }
        }
      }
    }
  }
}

function eventTypeVisible(type, showCrash, showCollision, showOvertake, showFastLap, showLapStart) {
  if (type === "crash") return showCrash;
  if (type === "collision") return showCollision;
  if (type === "overtake") return showOvertake;
  if (type === "fastestLap") return showFastLap;
  if (type === "lapStart") return showLapStart;
  return false;
}

function drawEventIcon({ctx, ev, carColor, x, y}) {
  const size = 7;

  switch (ev.type) {
    case "crash":
      ctx.fillStyle = "#ff4444";
      ctx.fillRect(x - size, y - size, size * 2, size * 2);
      break;
    case "collision":
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = "#ffa500";
      ctx.fill();
      break;
    case "overtake":
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.lineTo(x - size, y + size);
      ctx.lineTo(x + size, y + size);
      ctx.closePath();
      ctx.fillStyle = "#00ff66";
      ctx.fill();
      break;
    case "fastestLap":
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.lineTo(x - size, y);
      ctx.lineTo(x, y + size);
      ctx.lineTo(x + size, y);
      ctx.closePath();
      ctx.fillStyle = "#c000ff";
      ctx.fill();
      break;
    case "lapStart":
      ctx.strokeStyle = "#bbbbbb";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - size * 1.5);
      ctx.lineTo(x, y + size * 1.5);
      ctx.stroke();
      break;
    default:
      ctx.fillStyle = carColor;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }
}

/**
 * Draw the event timeline for all cars.
 */
export function drawEventTimeline({
  eventCtx,
  eventCanvas,
  cars,
  timelineMode,
  showCrash,
  showCollision,
  showOvertake,
  showFastLap,
  showLapStart,
  EVENT_CLUSTER_THRESHOLD,
  EVENT_LANE_OFFSET
}) {
  eventCtx.clearRect(0, 0, eventCanvas.width, eventCanvas.height);
  if (!cars.length) return;

  const maxDurationMs = Math.max(...cars.map(carDurationMs));
  if (maxDurationMs <= 0) return;

  const padX = 30;
  const padY = 10;
  const innerW = eventCanvas.width - padX * 2;
  const innerH = eventCanvas.height - padY * 2;

  let drawable = [];
  if (timelineMode === 'unified') {
    const y = eventCanvas.height / 2;
    cars.forEach(car => {
      const d = car.data;
      if (!d || !d.length) return;
      car.events.forEach(ev => {
        if (!eventTypeVisible(ev.type, showCrash, showCollision, showOvertake, showFastLap, showLapStart)) return;
        const sample = d[Math.min(ev.idx, d.length - 1)];
        const evTime = Math.max(0, sampleTimestamp(sample) - sampleTimestamp(d[0]));
        const tFrac = Math.min(1, evTime / maxDurationMs);
        const x = padX + tFrac * innerW;
        drawable.push({car, ev, x, baseY: y, timeMs: evTime});
      });
    });
  } else {
    const rowH = innerH / cars.length;
    cars.forEach((car, ci) => {
      const cy = padY + rowH * (ci + 0.5);
      const d = car.data;
      if (!d || !d.length) return;
      car.events.forEach(ev => {
        if (!eventTypeVisible(ev.type, showCrash, showCollision, showOvertake, showFastLap, showLapStart)) return;
        const sample = d[Math.min(ev.idx, d.length - 1)];
        const evTime = Math.max(0, sampleTimestamp(sample) - sampleTimestamp(d[0]));
        const tFrac = Math.min(1, evTime / maxDurationMs);
        const x = padX + tFrac * innerW;
        drawable.push({car, ev, x, baseY: cy, timeMs: evTime});
      });
    });
  }

  if (!drawable.length) return;

  drawable.sort((a, b) => a.x - b.x);

  const clusters = [];
  let currentCluster = [drawable[0]];
  for (let i = 1; i < drawable.length; i++) {
    const prev = drawable[i - 1];
    const curr = drawable[i];
    if (Math.abs(curr.x - prev.x) < EVENT_CLUSTER_THRESHOLD) {
      currentCluster.push(curr);
    } else {
      clusters.push(currentCluster);
      currentCluster = [curr];
    }
  }
  if (currentCluster.length) clusters.push(currentCluster);

  eventCtx.strokeStyle = "#333";
  eventCtx.lineWidth = 1;
  if (timelineMode === 'unified') {
    const y = eventCanvas.height / 2;
    eventCtx.beginPath();
    eventCtx.moveTo(padX, y);
    eventCtx.lineTo(eventCanvas.width - padX, y);
    eventCtx.stroke();
  } else {
    const rowH = innerH / cars.length;
    cars.forEach((_, ci) => {
      const cy = padY + rowH * (ci + 0.5);
      eventCtx.beginPath();
      eventCtx.moveTo(padX, cy);
      eventCtx.lineTo(eventCanvas.width - padX, cy);
      eventCtx.stroke();
    });
  }

  const drawn = [];
  clusters.forEach(cluster => {
    const n = cluster.length;
    const mid = (n - 1) / 2;
    cluster.forEach((item, i) => {
      const lane = i - mid;
      const y = item.baseY + lane * EVENT_LANE_OFFSET;
      drawEventIcon({ctx: eventCtx, ev: item.ev, carColor: item.car.color, x: item.x, y});
      drawn.push({car: item.car, ev: item.ev, x: item.x, y, timeMs: item.timeMs});
    });
  });

  eventCanvas.__clusteredEvents = drawn;
}

/**
 * Find nearest event to a pixel position (hover or click).
 */
export function findNearestEventAtPixel({eventCanvas, x, y, clickMode}) {
  const events = eventCanvas.__clusteredEvents || [];
  if (!events.length) return null;

  let best = null;
  let bestDist = Infinity;
  events.forEach(item => {
    const dx = item.x - x;
    const dy = item.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = item;
    }
  });

  const hoverRadius = clickMode ? 15 : 10;
  if (bestDist <= hoverRadius) return best;
  return null;
}
