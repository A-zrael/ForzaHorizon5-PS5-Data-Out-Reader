import {
    attachLensHandlers,
    drawCars as renderCars,
    drawMasterTrack as renderMasterTrack,
    resizeTrackLayout,
    worldToCanvas as worldToCanvasBase
} from "./track.js";
import {
    createDashboards as createDashboardsUI,
    setupScrubber as setupScrubberUI,
    updateDashboards as updateDashboardsUI,
    updateLegend as updateLegendUI,
    updatePlaybackInfo as updatePlaybackInfoUI
} from "./ui.js";
import {
    detectEventsAllCars as detectEventsAllCarsModule,
    drawEventTimeline as drawEventTimelineModule,
    findNearestEventAtPixel as findNearestEventAtPixelModule
} from "./events.js";
import {
    buildDeltaModelForCar as buildDeltaModelForCarModule,
    updateAllDeltaModels as updateAllDeltaModelsModule,
    populatePrimaryCarSelect as populatePrimaryCarSelectModule,
    drawDeltaTimeline as drawDeltaTimelineModule
} from "./delta.js";
import {
    buildInputModelForCar as buildInputModelForCarModule,
    updateAllInputModels as updateAllInputModelsModule,
    drawInputTimeline as drawInputTimelineModule
} from "./inputs.js";
import {createPlaybackController} from "./playback.js";
import {createLayoutManager} from "./layout.js";

// --- core.js (updated with exports) ---
    const SAMPLES = 800;
    const LAP_RADIUS = 20;
    const LAP_MIN_SPEED = 8;
    const MIN_LAP_SAMPLES = 300;
    const ABS_EXCLUDE_M = 12;
    const LOOP_CLOSE_FRACTION = 0.9;
    const LOOP_MIN_GAP = 0.5;
    const LOOP_DETECT_GAP = 40;

    const colors = ["#00ffff", "#ffa500", "#ff66cc", "#7CFC00", "#ff8c00", "#ff4444", "#ffffff", "#00bfff"];
    const MIN_DT = 0.016, MAX_DT = 0.25;

    const CRASH_SPEED_DROP_MPS = 9;
    const CRASH_ACCEL_THRESH = 8;
    const COLL_SPEED_DROP_MIN = 3;
    const COLL_SPEED_DROP_MAX = 9;
    const COLL_ACCEL_THRESH = 6;
    const EVENT_MIN_GAP_IDX = 30;
    const TRACK_MAD_K = 2.5; // outlier cutoff multiplier for master track fusion

    const EVENT_CLUSTER_THRESHOLD = 14;
    const EVENT_LANE_OFFSET = 8;

    let cars = [];
    let masterTrack = [];
    let masterLockedFromJSON = false;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    let raceType = 'lapped';
    let detectedRaceType = 'lapped';
    let raceTypeOverridden = false;

    let sectorCount = 4;
    let timelineMode = 'unified';
    let miniMode = false;
    let masterTrackMaxSpeed = 1;
    let primaryCarIndex = 0;
    let lensActive = false;
    let lensX = 0, lensY = 0;
    const LENS_RADIUS = 60;
    let playheadMs = 0;
    // --- Magnifier smoothing ---
    let lensSmoothX = 0;
    let lensSmoothY = 0;
    const LENS_SMOOTHING = 0.15;
    // 0.10 = heavy smoothing
    // 0.20 = light smoothing
    // 0.15 = ideal
    const lensState = {
      get active() {return lensActive;},
      set active(v) {lensActive = v;},
      get x() {return lensX;},
      set x(v) {lensX = v;},
      get y() {return lensY;},
      set y(v) {lensY = v;},
      get smoothX() {return lensSmoothX;},
      set smoothX(v) {lensSmoothX = v;},
      get smoothY() {return lensSmoothY;},
      set smoothY(v) {lensSmoothY = v;},
      get radius() {return LENS_RADIUS;}
    };

    const csvInput = document.getElementById("csvInput");
    const loadBtn = document.getElementById("loadBtn");
    const masterJsonInput = document.getElementById("masterJsonInput");
    const useMasterBtn = document.getElementById("useMasterBtn");
    const exportMasterBtn = document.getElementById("exportMasterBtn");
    const scrubber = document.getElementById("scrubber");
    const dashContainer = document.getElementById("dashContainer");
    const legend = document.getElementById("legend");
    const cardsMiniBtn = document.getElementById("cardsMiniBtn");
    const playbackMiniBtn = document.getElementById("playbackMiniBtn");
    const trackCanvas = document.getElementById("track");
    const trackCtx = trackCanvas.getContext("2d");
    const raceTypeInfo = document.getElementById("raceTypeInfo");
    const showSectorsEl = document.getElementById("showSectors");
    const showTrackSectorsEl = document.getElementById("showTrackSectors");
    const showDeltasEl = document.getElementById("showDeltas");
    const sectorCountEl = document.getElementById("sectorCount");
    const deltaModeEl = document.getElementById("deltaMode");
    const heatToggle = document.getElementById("heatToggle");
    const confidenceToggle = document.getElementById("confidenceToggle");
    const eventCanvas = document.getElementById("eventTimeline");
    const eventCtx = eventCanvas.getContext("2d");
    const deltaCanvas = document.getElementById("deltaTimeline");
    const deltaCtx = deltaCanvas.getContext("2d");
    const inputCanvas = document.getElementById("inputTimeline");
    const inputCtx = inputCanvas.getContext("2d");
    const primaryCarSelect = document.getElementById("primaryCarSelect");
    const deltaShadingToggle = document.getElementById("deltaShadingToggle");
    const inputThrottleToggle = document.getElementById("inputThrottleToggle");
    const inputBrakeToggle = document.getElementById("inputBrakeToggle");
    const inputSteerToggle = document.getElementById("inputSteerToggle");
    const tooltipEl = document.getElementById("eventTooltip");
    const playbackInfo = document.getElementById("playbackInfo");

    const toggleSetupBtn = document.getElementById("toggleSetupBtn");
    const miniModeBtn = document.getElementById("miniModeBtn");
    const setupPanel = document.getElementById("setupPanel");
    const dashColumn = document.getElementById("dashColumn");
    const playbackBar = document.getElementById("playbackBar");
    const playbackCollapseBtn = document.getElementById("playbackCollapseBtn");

    const timelineUnifiedBtn = document.getElementById("timelineUnified");
    const timelinePerCarBtn = document.getElementById("timelinePerCar");
    const showCrashEl = document.getElementById("showCrash");
    const showCollisionEl = document.getElementById("showCollision");
    const showOvertakeEl = document.getElementById("showOvertake");
    const showFastLapEl = document.getElementById("showFastLap");
    const showLapStartEl = document.getElementById("showLapStart");

    const playBtn = document.getElementById("playBtn");
    const pauseBtn = document.getElementById("pauseBtn");

    const safe = v => {const n = parseFloat(v); return Number.isFinite(n) ? n : 0;};
    const clamp01 = x => Math.max(0, Math.min(1, x));
    const sampleTimestamp = (p) => {
      if (!p || typeof p !== "object") return 0;
      if (p.timestampMS != null) return p.timestampMS;
      if (p.timestamp != null) return p.timestamp;
      return 0;
    };
    function speedToColor(norm) {
      norm = clamp01(norm);
      // Palette C: slow = red (#FF3030), mid = yellow (#FFD000), fast = mint green (#00FF80)
      const slow = {r: 255, g: 48, b: 48};
      const mid = {r: 255, g: 208, b: 0};
      const fast = {r: 0, g: 255, b: 128};

      let c1, c2, t;
      if (norm <= 0.5) {
        // slow -> mid
        t = norm / 0.5;
        c1 = slow;
        c2 = mid;
      } else {
        // mid -> fast
        t = (norm - 0.5) / 0.5;
        c1 = mid;
        c2 = fast;
      }
      const r = Math.round(c1.r + (c2.r - c1.r) * t);
      const g = Math.round(c1.g + (c2.g - c1.g) * t);
      const b = Math.round(c1.b + (c2.b - c1.b) * t);
      return `rgb(${r},${g},${b})`;
    }
    const basename = n => n.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');

    function formatMs(ms) {
      if (ms == null) return '-';
      const s = Math.floor(ms / 1000);
      const msR = Math.floor(ms % 1000);
      const mm = Math.floor(s / 60);
      const ss = s % 60;
      return `${mm}:${String(ss).padStart(2, '0')}.${String(msR).padStart(3, '0')}`;
    }
    function formatDeltaSec(ms) {
      if (ms == null) return '-';
      if (ms === 0) return '+0.000s';
      const s = ms / 1000;
      const sign = s >= 0 ? '+' : '-';
      const abs = Math.abs(s);
      return sign + abs.toFixed(3) + 's';
    }
    const carDurationMs = (car) => {
      if (!car || !car.data || !car.data.length) return 0;
      const first = car.data[0];
      const last = car.data[car.data.length - 1];
      return Math.max(0, sampleTimestamp(last) - sampleTimestamp(first));
    };
    function getMaxDurationMs() {
      if (!cars.length) return 0;
      return Math.max(...cars.map(carDurationMs));
    }

    toggleSetupBtn.addEventListener("click", () => {
      const isOpen = setupPanel.classList.toggle("open");
      toggleSetupBtn.textContent = isOpen ? "Hide setup ▴" : "Show setup ▾";
      setTimeout(resizeLayout, 260);
    });

    if (miniModeBtn) {
      miniModeBtn.style.display = "none";
    }

    if (cardsMiniBtn) {
      cardsMiniBtn.addEventListener("click", () => {
        miniMode = !miniMode;
        cardsMiniBtn.textContent = miniMode ? "Cards: Mini" : "Cards: Full";
        document.body.classList.toggle("cards-mini", miniMode);
        document.querySelectorAll(".dash").forEach(card => {
          card.classList.toggle("mini", miniMode);
        });
      });
    }

    if (playbackMiniBtn) {
      playbackMiniBtn.addEventListener("click", () => {
        const isMini = document.body.classList.toggle("bottom-mini");
        playbackMiniBtn.textContent = isMini ? "Bottom: Mini" : "Bottom: Full";
        resizeLayout();
        drawMasterTrack();
      });
    }

    if (primaryCarSelect) {
      primaryCarSelect.addEventListener("change", () => {
        const idx = parseInt(primaryCarSelect.value, 10);
        primaryCarIndex = Number.isFinite(idx) ? idx : 0;
        drawDeltaTimeline();
        drawInputTimeline();
      });
    }

    if (deltaShadingToggle) {
      deltaShadingToggle.addEventListener("change", () => {
        drawDeltaTimeline();
      });
    }
    if (heatToggle) {
      heatToggle.addEventListener("change", () => {
        drawMasterTrack();
        drawEventTimeline();
      });
    }
    if (inputThrottleToggle) {
      inputThrottleToggle.addEventListener("change", () => {
        drawInputTimeline();
      });
    }
    if (inputBrakeToggle) {
      inputBrakeToggle.addEventListener("change", () => {
        drawInputTimeline();
      });
    }
    if (inputSteerToggle) {
      inputSteerToggle.addEventListener("change", () => {
        drawInputTimeline();
      });
    }



    masterJsonInput.addEventListener("change", e => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = ev => {
        try {
          const obj = JSON.parse(ev.target.result);
          if (Array.isArray(obj.master)) {
            masterTrack = obj.master;
            masterLockedFromJSON = true;
            ensureMasterDist();
            recomputeBoundsFromMaster();
            autoDetectRaceTypeFromMaster();
            updateMasterSpeedProfile();
            updateRaceTypeUI();
            drawMasterTrack();
            if (cars.length) {
              cars.forEach(updateCarTrackIndex);
              updateDashboards();
              drawCars();
              detectEventsAllCars();
              drawEventTimeline();
            }
            alert("Master track loaded from JSON and locked.");
          } else alert("Invalid master JSON.");
        } catch (err) {alert("Invalid JSON file.");}
      };
      r.readAsText(f);
    });
    useMasterBtn.onclick = () => masterJsonInput.click();

    exportMasterBtn.onclick = () => {
      if (!masterTrack.length) return alert("No master to export yet.");
      const blob = new Blob([JSON.stringify({master: masterTrack})], {type: "application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "master_track.json";
      a.click();
      URL.revokeObjectURL(url);
    };

    function updateRaceTypeUI() {
      const detText = detectedRaceType === 'lapped'
        ? 'Lapped (circuit race)'
        : 'Sprint (point-to-point)';
      const showType = raceType === 'lapped'
        ? 'Lapped (circuit race)'
        : 'Sprint (point-to-point)';
      const other = raceType === 'lapped' ? 'Sprint' : 'Lapped';
      raceTypeInfo.innerHTML =
        `Detected: ${detText} &nbsp; | &nbsp; Current mode: <b>${showType}</b> 
     &nbsp; <button id="raceToggleBtn" class="small">Switch to ${other}</button>`;
      const btn = document.getElementById("raceToggleBtn");
      if (btn) {
        btn.onclick = () => {
          raceType = (raceType === 'lapped') ? 'sprint' : 'lapped';
          raceTypeOverridden = true;
          updateRaceTypeUI();
          if (!masterLockedFromJSON) {
            buildMasterFromTelemetry();
            updateMasterSpeedProfile(); // refresh heatmap for new race type
          }
          drawMasterTrack();
          cars.forEach(updateCarTrackIndex);
          updateDashboards();
          drawCars();
          detectEventsAllCars();
          drawEventTimeline();
          updateAllDeltaModels();
          updateAllInputModels();
          drawDeltaTimeline();
          drawInputTimeline();
        };
      }
    }

    function autoDetectRaceTypeFromCars() {
      if (!cars.length) return;
      const car = cars[0];
      const d = car.data;
      if (!d.length) return;
      const start = d[0];
      const end = d[d.length - 1];
      const gap = Math.hypot(end.pos_x - start.pos_x, end.pos_y - start.pos_y);
      const hasMultipleLaps = car.lapStarts && car.lapStarts.length > 1;

      let guess;
      if (hasMultipleLaps) {
        // If we detected more than one lap, strongly assume lapped race.
        guess = 'lapped';
      } else if (gap < LOOP_DETECT_GAP) {
        // Single stint but start/end close together -> probably lapped.
        guess = 'lapped';
      } else {
        guess = 'sprint';
      }

      detectedRaceType = guess;
      if (!raceTypeOverridden) {
        raceType = guess;
      }
      updateRaceTypeUI();
    }

    function autoDetectRaceTypeFromMaster() {
      if (!masterTrack.length) return;
      const first = masterTrack[0];
      const last = masterTrack[masterTrack.length - 1];
      const gap = Math.hypot(last.x - first.x, last.y - first.y);
      detectedRaceType = (gap < LOOP_DETECT_GAP ? 'lapped' : 'sprint');
      if (!raceTypeOverridden) {
        raceType = detectedRaceType;
      }
      updateRaceTypeUI();
    }

    showSectorsEl.addEventListener("change", () => updateDashboards());
    showTrackSectorsEl.addEventListener("change", () => {drawMasterTrack();});
    showDeltasEl.addEventListener("change", () => updateDashboards());
    sectorCountEl.addEventListener("change", () => {
      sectorCount = parseInt(sectorCountEl.value, 10) || 4;
      updateDashboards();
      drawMasterTrack();
    });
    deltaModeEl.addEventListener("change", () => {
      updateDashboards();
      drawDeltaTimeline();
    });

    timelineUnifiedBtn.onclick = () => {
      timelineMode = 'unified';
      drawEventTimeline();
    };
    timelinePerCarBtn.onclick = () => {
      timelineMode = 'percar';
      drawEventTimeline();
    };

    [showCrashEl, showCollisionEl, showOvertakeEl, showFastLapEl, showLapStartEl].forEach(el => {
      el.addEventListener("change", () => drawEventTimeline());
    });

    [showTrackSectorsEl, showSectorsEl].forEach(el => {
      if (el) el.addEventListener("change", () => {drawMasterTrack();});
    });
    if (heatToggle) {
      heatToggle.addEventListener("change", () => drawMasterTrack());
    }
    if (confidenceToggle) {
      confidenceToggle.addEventListener("change", () => drawMasterTrack());
    }
    if (sectorCountEl) {
      sectorCountEl.addEventListener("change", () => {sectorCount = parseInt(sectorCountEl.value, 10) || 4; drawMasterTrack();});
    }

    loadBtn.onclick = () => {
      if (!csvInput.files.length) return alert("Choose CSV files first");
      startLoad([...csvInput.files].slice(0, 8));
    };

    function startLoad(files) {
      playbackController.pause();
      cars = [];
      dashContainer.innerHTML = "";
      legend.innerHTML = "";
      tooltipEl.style.display = "none";

      if (!masterLockedFromJSON) {
        masterTrack = [];
        minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
      }

      let readers = files.map((f, idx) => new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = ev => res({text: ev.target.result, name: f.name, idx});
        r.onerror = rej;
        r.readAsText(f);
      }));
      Promise.all(readers).then(list => {
        list.forEach(f => parseCSV(f.text, f.name, f.idx));
        detectLapsForAll();
        if (!masterLockedFromJSON) {
          autoDetectRaceTypeFromCars();
          buildMasterFromTelemetry();
          updateMasterSpeedProfile();
        } else {
          ensureMasterDist();
          recomputeBoundsFromMaster();
          autoDetectRaceTypeFromMaster();
        }
        playbackController.setCars(cars);
        createDashboards();
        updateLegend();
        updateAllDeltaModels();
        updateAllInputModels();
        drawMasterTrack();
        setupScrubber();
        setPlayheadMs(0);
        cars.forEach(c => c.events = []);
        detectEventsAllCars();
        drawEventTimeline();
        drawDeltaTimeline();
        drawInputTimeline();
        resizeLayout();
      }).catch(err => alert("File load error: " + err));
    }

    function parseCSV(text, name, idx) {
      const rows = text.trim().split("\n").filter(r => r.trim());
      if (rows.length < 2) return;
      const headers = rows.shift().split(",").map(h => h.trim());
      const data = rows.map(r => {
        const vals = r.split(",");
        const o = {};
        headers.forEach((h, i) => o[h] = safe(vals[i]));
        if (!("timestampMS" in o)) {
          const k1 = headers.indexOf("timestampMS");
          const k2 = headers.indexOf("timestamp");
          o.timestampMS = safe(vals[k1 >= 0 ? k1 : k2 >= 0 ? k2 : 0]);
        }
        return o;
      });

      let x = 0, y = 0, heading = 0, dist = 0;
      data[0].pos_x = 0; data[0].pos_y = 0; data[0].dist = 0;

      for (let i = 1; i < data.length; i++) {
        const prev = data[i - 1], cur = data[i];
        let dt = (cur.timestampMS - prev.timestampMS) / 1000;
        if (!isFinite(dt) || dt <= 0 || dt > MAX_DT) dt = MIN_DT;

        if (cur.smooth_ax === undefined) cur.smooth_ax = cur.accel_x || 0;
        cur.smooth_ax = cur.smooth_ax * 0.85 + (cur.accel_x || 0) * 0.15;

        const speed = Math.max(cur.speed_mps || 0, 0.1);
        let yawRate = 0;
        if (speed > 2) yawRate = cur.smooth_ax / speed;

        heading += yawRate * dt;

        const dx = Math.cos(heading) * speed * dt;
        const dy = Math.sin(heading) * speed * dt;
        x += dx; y += dy; dist += Math.hypot(dx, dy);

        cur.pos_x = x;
        cur.pos_y = y;
        cur.dist = dist;
      }

      const totalDist = data[data.length - 1].dist || 1;
      const speedScale = Math.max(...data.map(p => p.speed_mph || 0)) * 1.05 || 100;
      const startTimeMs = sampleTimestamp(data[0]);
      const endTimeMs = sampleTimestamp(data[data.length - 1]);
      const durationMs = Math.max(0, endTimeMs - startTimeMs);

      cars.push({
        name: basename(name),
        color: colors[idx % colors.length],
        data,
        dataIndex: 0,
        index: 0,
        totalDist,
        speedScale,
        startTimeMs,
        endTimeMs,
        durationMs,
        lapStarts: [],
        lapLen: null,
        sectorBox: null,
        lapEl: null,
        events: [],
        speedBarEl: null,
        speedValEl: null,
        rpmBarEl: null,
        rpmValEl: null,
        gearEl: null,
        summaryEl: null
      });
    }

    function detectLapsForAll() {
      cars.forEach(car => {
        const d = car.data;
        if (!d.length) {car.lapStarts = [0]; return;}
        const startX = d[0].pos_x;
        const startY = d[0].pos_y;
        const laps = [0];
        let lastIdx = 0;

        for (let i = 1; i < d.length; i++) {
          const dx = d[i].pos_x - startX;
          const dy = d[i].pos_y - startY;
          const dist0 = Math.hypot(dx, dy);
          const speed = d[i].speed_mps || (d[i].speed_kph / 3.6) || (d[i].speed_mph / 2.23694) || 0;
          if (dist0 < LAP_RADIUS && speed > LAP_MIN_SPEED && (i - lastIdx) > MIN_LAP_SAMPLES) {
            laps.push(i);
            lastIdx = i;
          }
        }
        car.lapStarts = laps;
        if (laps.length > 1) {
          car.lapLen = d[laps[1]].dist - d[laps[0]].dist;
        } else {
          car.lapLen = (d[d.length - 1].dist - d[0].dist) || 1;
        }
      });
    }

    function buildMasterFromTelemetry() {
      if (!cars.length) return;
      masterTrack = [];
      minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
      const useRobustFusion = cars.length > 1;

      let segments;

      if (raceType === 'lapped') {
        segments = cars.map(car => {
          const d = car.data;
          const laps = car.lapStarts;
          const startIdx = laps[0] || 0;
          const endIdx = (laps[1] ? laps[1] : d.length - 1);
          const seg = d.slice(startIdx, endIdx + 1).map(p => ({x: p.pos_x, y: p.pos_y}));
          let lapDist = [0]; let acc = 0;
          for (let i = 1; i < seg.length; i++) {
            const dx = seg[i].x - seg[i - 1].x;
            const dy = seg[i].y - seg[i - 1].y;
            acc += Math.hypot(dx, dy);
            lapDist[i] = acc;
          }
          const lapLen = lapDist[lapDist.length - 1] || 1;
          return {seg, lapDist, lapLen};
        });
      } else {
        segments = cars.map(car => {
          const d = car.data;
          const seg = d.map(p => ({x: p.pos_x, y: p.pos_y}));
          let lapDist = [0]; let acc = 0;
          for (let i = 1; i < seg.length; i++) {
            const dx = seg[i].x - seg[i - 1].x;
            const dy = seg[i].y - seg[i - 1].y;
            acc += Math.hypot(dx, dy);
            lapDist[i] = acc;
          }
          const lapLen = lapDist[lapDist.length - 1] || 1;
          return {seg, lapDist, lapLen};
        });
      }

      function posAtDist(segObj, target) {
        const seg = segObj.seg;
        const lapDist = segObj.lapDist;
        if (target <= 0) return seg[0];
        if (target >= segObj.lapLen) return seg[seg.length - 1];
        let lo = 0, hi = lapDist.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (lapDist[mid] < target) lo = mid + 1; else hi = mid;
        }
        const hiIdx = Math.min(lo, lapDist.length - 1);
        const loIdx = Math.max(0, hiIdx - 1);
        const a = seg[loIdx], b = seg[hiIdx];
        const span = (lapDist[hiIdx] - lapDist[loIdx]) || 1e-6;
        const t = (target - lapDist[loIdx]) / span;
        return {x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t};
      }

      const median = (arr) => {
        if (!arr.length) return 0;
        const copy = [...arr].sort((a, b) => a - b);
        const mid = copy.length >> 1;
        if (copy.length % 2) return copy[mid];
        return (copy[mid - 1] + copy[mid]) * 0.5;
      };

      for (let i = 0; i < SAMPLES; i++) {
        const frac = i / (SAMPLES - 1);
        const pts = segments.map(s => posAtDist(s, frac * s.lapLen));

        // Robust fuse across all cars: median center, then MAD-based outlier rejection.
        // Geometry: average of all cars at this arc-length (keeps path stable).
        let ax = 0, ay = 0;
        pts.forEach(p => {ax += p.x; ay += p.y;});
        ax /= pts.length; ay /= pts.length;

        // Confidence: fraction of cars that agree within a MAD-based gate (only meaningful with >1 car).
        let confidence = 1;
        let support = pts.length;
        if (useRobustFusion) {
          const xs = pts.map(p => p.x);
          const ys = pts.map(p => p.y);
          const medX = median(xs);
          const medY = median(ys);
          const dists = pts.map(p => Math.hypot(p.x - medX, p.y - medY));
          const medDist = median(dists);
          const madDist = median(dists.map(d => Math.abs(d - medDist)));
          const scaledMad = madDist * 1.4826;
          const gate = (scaledMad > 0 ? medDist + TRACK_MAD_K * scaledMad : ABS_EXCLUDE_M);
          const gateCap = ABS_EXCLUDE_M * 2;
          support = dists.filter(d => d <= gate && d <= gateCap).length;
          confidence = support / Math.max(1, pts.length);
        }

        masterTrack.push({
          x: ax,
          y: ay,
          confidence,
          support,
          supportTotal: pts.length
        });
      }

      recomputeBoundsFromMaster();
      ensureMasterDist();

      if (raceType === 'lapped') {
        closeMasterLoopSmooth();
      }
    }

    function ensureMasterDist() {
      if (!masterTrack.length) return;
      let acc = 0;
      masterTrack[0].dist = 0;
      for (let i = 1; i < masterTrack.length; i++) {
        const dx = masterTrack[i].x - masterTrack[i - 1].x;
        const dy = masterTrack[i].y - masterTrack[i - 1].y;
        acc += Math.hypot(dx, dy);
        masterTrack[i].dist = acc;
      }
    }
    function recomputeBoundsFromMaster() {
      if (!masterTrack.length) return;
      minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
      masterTrack.forEach(p => {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      });
      if (minX === maxX) {minX -= 1; maxX += 1;}
      if (minY === maxY) {minY -= 1; maxY += 1;}
    }

    function closeMasterLoopSmooth() {
      if (!masterTrack.length) return;
      const n = masterTrack.length;
      if (n < 4) return;

      const first = masterTrack[0];
      const last = masterTrack[n - 1];
      const gapX = first.x - last.x;
      const gapY = first.y - last.y;
      const gapMag = Math.hypot(gapX, gapY);
      if (gapMag < LOOP_MIN_GAP) return;

      const startIdx = Math.floor(n * LOOP_CLOSE_FRACTION);
      if (startIdx >= n - 1) return;
      const lastIdx = n - 1;
      const length = lastIdx - startIdx;
      if (length <= 0) return;

      for (let i = startIdx; i <= lastIdx; i++) {
        const t = (i - startIdx) / length;
        masterTrack[i].x += gapX * t;
        masterTrack[i].y += gapY * t;
      }

      ensureMasterDist();
      recomputeBoundsFromMaster();
    }

    function updateMasterSpeedProfile() {
      if (!cars.length || !masterTrack.length) return;
      const refCar = cars[0];
      const d = refCar.data;
      if (!d.length) return;

      const totalCarDist = d[d.length - 1].dist || 1;
      const totalMasterDist = masterTrack[masterTrack.length - 1].dist || 1;
      let j = 0;

      for (let i = 0; i < masterTrack.length; i++) {
        const targetDist = (masterTrack[i].dist / totalMasterDist) * totalCarDist;
        while (j < d.length - 1 && d[j].dist < targetDist) j++;
        const p = d[j];

        const speed = (p.speed_mps != null ? p.speed_mps : 0) ||
          (p.speed_kph != null ? p.speed_kph / 3.6 : 0) ||
          (p.speed_mph != null ? p.speed_mph / 2.23694 : 0);
        masterTrack[i].heatSpeed = speed;
      }

      const speeds = masterTrack.map(p => p.heatSpeed || 0).filter(Number.isFinite).sort((a, b) => a - b);
      if (!speeds.length) {window.__heatMin = 0; window.__heatRange = 1; return;}
      const p10 = speeds[Math.floor(0.10 * (speeds.length - 1))];
      const p90 = speeds[Math.floor(0.90 * (speeds.length - 1))];
      window.__heatMin = p10;
      window.__heatRange = (p90 - p10) || 1;
    }


    function createDashboards() {
      createDashboardsUI({cars, dashContainer, miniMode});
    }

    function updateLegend() {
      updateLegendUI({legendEl: legend, cars});
    }

    function setupScrubber() {
      setupScrubberUI({scrubber, getMaxDurationMs});
    }

    function findIndexForTime(car, elapsedMs) {
      const d = car.data;
      if (!d.length) return 0;
      const t0 = (car.startTimeMs != null) ? car.startTimeMs : sampleTimestamp(d[0]);
      const target = t0 + Math.max(0, elapsedMs);
      const lastIdx = d.length - 1;
      const lastTs = sampleTimestamp(d[lastIdx]);
      if (target >= lastTs) return lastIdx;
      if (target <= sampleTimestamp(d[0])) return 0;
      let lo = 0, hi = lastIdx;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        const ts = sampleTimestamp(d[mid]);
        if (ts <= target) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      return lo;
    }

    function setPlayheadMs(ms) {
      const maxMs = getMaxDurationMs();
      playheadMs = Math.max(0, Math.min(ms, maxMs));
      cars.forEach(car => {
        car.dataIndex = findIndexForTime(car, playheadMs);
        updateCarTrackIndex(car);
      });
      if (scrubber) {
        scrubber.value = playheadMs;
      }
    }

    function renderFrame({smoothLens}) {
      updateDashboards();
      if (smoothLens) {
        lensSmoothX += (lensX - lensSmoothX) * LENS_SMOOTHING;
        lensSmoothY += (lensY - lensSmoothY) * LENS_SMOOTHING;
      }
      drawMasterTrack();
      drawCars();
      drawEventTimeline();
      drawDeltaTimeline();
      drawInputTimeline();
      updatePlaybackInfo();
    }

    const playbackController = createPlaybackController({
      playBtn,
      pauseBtn,
      scrubber,
      cars,
      getMaxDurationMs,
      setPlayheadMs,
      onFrame: renderFrame
    });

    function updatePlaybackInfo() {
      updatePlaybackInfoUI({cars, playbackInfoEl: playbackInfo, formatMs});
    }

    const {resizeLayout} = createLayoutManager({
      trackCanvas,
      dashColumn,
      eventCanvas,
      setupPanel,
      playbackBar,
      drawMasterTrack,
      drawCars,
      drawEventTimeline
    });

    attachLensHandlers(trackCanvas, lensState);

    if (playbackCollapseBtn) {
      playbackCollapseBtn.addEventListener("click", () => {
        const isCollapsed = document.body.classList.toggle("bottom-collapsed");
        playbackCollapseBtn.textContent = isCollapsed ? "▴" : "▾";
        const inner = document.getElementById("playbackInner");
        if (inner) {
          inner.classList.add("collapsing");
          setTimeout(() => inner.classList.remove("collapsing"), 260);
        }
        resizeLayout();
        drawMasterTrack();
      });
    }

    function updateCarTrackIndex(car) {
      const d = car.data;
      if (!d.length || !masterTrack.length) {car.index = 0; return;}

      const idx = car.dataIndex;
      const laps = car.lapStarts && car.lapStarts.length ? car.lapStarts : [0];

      let lapIdx = 0;
      for (let i = laps.length - 1; i >= 0; i--) {
        if (idx >= laps[i]) {lapIdx = i; break;}
      }

      const lapStartIdx = laps[lapIdx];
      const lapStartDist = d[lapStartIdx].dist;
      let lapEndDist;
      if (lapIdx + 1 < laps.length) {
        lapEndDist = d[laps[lapIdx + 1]].dist;
      } else {
        lapEndDist = d[d.length - 1].dist;
      }

      const lapLen = Math.max(1e-6, lapEndDist - lapStartDist);
      const lapDistWithin = d[idx].dist - lapStartDist;
      const frac = clamp01(lapDistWithin / lapLen);

      const masterLen = masterTrack[masterTrack.length - 1].dist || 1;
      const target = frac * masterLen;

      let lo = 0, hi = masterTrack.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (masterTrack[mid].dist < target) lo = mid + 1; else hi = mid;
      }
      car.index = lo;
    }

    function computeLapAnalysisForCar(car) {
      const d = car.data;
      if (!d.length || sectorCount <= 0) return null;

      const starts = car.lapStarts && car.lapStarts.length ? car.lapStarts : [0];
      const lapDefs = [];

      if (raceType === 'lapped' && starts.length > 1) {
        for (let l = 0; l < starts.length - 1; l++) {
          const sIdx = starts[l];
          const eIdx = starts[l + 1] - 1;
          if (eIdx > sIdx) lapDefs.push({startIndex: sIdx, endIndex: eIdx});
        }
        const lastStart = starts[starts.length - 1];
        if (lastStart < d.length - 1) {
          lapDefs.push({startIndex: lastStart, endIndex: d.length - 1});
        }
      } else {
        lapDefs.push({startIndex: 0, endIndex: d.length - 1});
      }

      if (!lapDefs.length) return null;

      const laps = [];
      let bestLapIndex = 0;
      let bestLapTimeMs = null;

      const bestSectorTimesMs = new Array(sectorCount).fill(null);

      lapDefs.forEach((def, lapIdx) => {
        const sIdx = def.startIndex;
        const eIdx = def.endIndex;
        const startTime = d[sIdx].timestampMS || 0;
        const endTime = d[eIdx].timestampMS || startTime;
        const lapTimeMs = Math.max(0, endTime - startTime);

        const startDist = d[sIdx].dist;
        const endDist = d[eIdx].dist;
        const lapLen = Math.max(1e-6, endDist - startDist);

        const boundaryTimes = [startTime];
        for (let s = 1; s <= sectorCount; s++) {
          const targetDist = startDist + (s / sectorCount) * lapLen;
          let i = sIdx;
          while (i <= eIdx && d[i].dist < targetDist) i++;
          let ts;
          if (i <= sIdx) {
            ts = startTime;
          } else if (i > eIdx) {
            ts = endTime;
          } else {
            const a = d[i - 1], b = d[i];
            const span = (b.dist - a.dist) || 1e-6;
            const t = (targetDist - a.dist) / span;
            ts = a.timestampMS + t * (b.timestampMS - a.timestampMS);
          }
          boundaryTimes.push(ts);
        }

        const sectorTimesMs = [];
        for (let s = 0; s < sectorCount; s++) {
          const dt = boundaryTimes[s + 1] - boundaryTimes[s];
          const v = Math.max(0, dt);
          sectorTimesMs.push(v);

          if (bestSectorTimesMs[s] == null || v < bestSectorTimesMs[s]) {
            bestSectorTimesMs[s] = v;
          }
        }

        laps.push({startIndex: sIdx, endIndex: eIdx, lapTimeMs, sectorTimesMs});

        if (bestLapTimeMs === null || lapTimeMs < bestLapTimeMs) {
          bestLapTimeMs = lapTimeMs;
          bestLapIndex = lapIdx;
        }
      });

      return {laps, bestLapIndex, bestLapTimeMs, bestSectorTimesMs};
    }

    function renderAnalysisTables() {
      const showSectors = showSectorsEl.checked;
      const showDeltas = showDeltasEl.checked;
      const deltaMode = deltaModeEl ? deltaModeEl.value : "bestSector";

      cars.forEach(c => {if (c.sectorBox) c.sectorBox.innerHTML = "";});
      if (!showSectors || !cars.length || sectorCount <= 0) return;

      cars.forEach(car => {
        const box = car.sectorBox;
        if (!box) return;
        const analysis = computeLapAnalysisForCar(car);
        if (!analysis) return;

        const laps = analysis.laps;
        const lapCount = laps.length;
        const bestLapIndex = analysis.bestLapIndex;
        const bestLapTimeMs = analysis.bestLapTimeMs;
        const bestSectorTimesMs = analysis.bestSectorTimesMs;

        const tbl = document.createElement("table");
        tbl.className = "timing";

        const hdr = document.createElement("tr");
        let hdrHtml = "<th></th>";
        for (let i = 0; i < lapCount; i++) hdrHtml += `<th>Lap ${i + 1}</th>`;
        hdrHtml += "<th>Best</th>";
        hdr.innerHTML = hdrHtml;
        tbl.appendChild(hdr);

        for (let s = 0; s < sectorCount; s++) {
          const rowT = document.createElement("tr");
          let rowTHtml = `<td>S${s + 1}</td>`;
          for (let l = 0; l < lapCount; l++) {
            rowTHtml += `<td>${formatMs(laps[l].sectorTimesMs[s])}</td>`;
          }
          rowTHtml += `<td>${formatMs(bestSectorTimesMs[s])}</td>`;
          rowT.innerHTML = rowTHtml;
          tbl.appendChild(rowT);

          if (showDeltas) {
            const rowD = document.createElement("tr");
            let rowDHtml = `<td>ΔS${s + 1}</td>`;
            for (let l = 0; l < lapCount; l++) {
              const st = laps[l].sectorTimesMs[s];

              let ref;
              if (deltaMode === "bestLap") {
                ref = laps[bestLapIndex].sectorTimesMs[s];
              } else {
                ref = bestSectorTimesMs[s];
              }

              const delta = (st != null && ref != null) ? (st - ref) : null;
              rowDHtml += `<td>${formatDeltaSec(delta)}</td>`;
            }
            rowDHtml += `<td></td>`;
            rowD.innerHTML = rowDHtml;
            tbl.appendChild(rowD);
          }
        }

        const rowLap = document.createElement("tr");
        let rowLapHtml = "<td>Lap</td>";
        for (let l = 0; l < lapCount; l++) {
          rowLapHtml += `<td>${formatMs(laps[l].lapTimeMs)}</td>`;
        }
        rowLapHtml += `<td>${formatMs(bestLapTimeMs)}</td>`;
        rowLap.innerHTML = rowLapHtml;
        tbl.appendChild(rowLap);

        if (showDeltas) {
          const rowLapD = document.createElement("tr");
          let rowLapDHtml = "<td>ΔLap</td>";
          for (let l = 0; l < lapCount; l++) {
            const delta = laps[l].lapTimeMs - bestLapTimeMs;
            rowLapDHtml += `<td>${formatDeltaSec(delta)}</td>`;
          }
          rowLapDHtml += "<td></td>";
          rowLapD.innerHTML = rowLapDHtml;
          tbl.appendChild(rowLapD);
        }

        box.appendChild(tbl);

        const hint = document.createElement("div");
        hint.className = "deltaHint";
        hint.textContent = deltaMode === "bestLap"
          ? "ΔS vs best lap sectors • ΔLap vs best lap"
          : "ΔS vs best sector times • ΔLap vs best lap";
        box.appendChild(hint);
      });
    }

    function updateDashboards() {
      updateDashboardsUI({
        cars,
        clamp01,
        formatMs,
        renderAnalysisTables
      });
    }

    function worldToCanvas(x, y) {
      return worldToCanvasBase(
        trackCanvas,
        {minX, maxX, minY, maxY},
        x,
        y
      );
    }

    function drawMasterTrack() {
      renderMasterTrack({
        trackCtx,
        trackCanvas,
        masterTrack,
        raceType,
        sectorCount,
        showTrackSectorsEl,
        heatToggle,
        minX,
        maxX,
        minY,
        maxY,
        lens: lensState,
        cars,
        speedToColor,
        confidenceToggle
      });
      drawCars();
    }

    function drawCars() {
      renderCars({
        trackCtx,
        masterTrack,
        cars,
        lens: lensState,
        worldToCanvas
      });
    }
    function detectEventsAllCars() {
      // attach computeLapAnalysis for reuse inside event module
      cars.forEach(car => car.computeLapAnalysis = () => computeLapAnalysisForCar(car));
      detectEventsAllCarsModule({
        cars,
        formatMs,
        CRASH_SPEED_DROP_MPS,
        CRASH_ACCEL_THRESH,
        COLL_SPEED_DROP_MIN,
        COLL_SPEED_DROP_MAX,
        COLL_ACCEL_THRESH,
        EVENT_MIN_GAP_IDX
      });
    }

    function drawEventTimeline() {
      drawEventTimelineModule({
        eventCtx,
        eventCanvas,
        cars,
        timelineMode,
        showCrash: showCrashEl.checked,
        showCollision: showCollisionEl.checked,
        showOvertake: showOvertakeEl.checked,
        showFastLap: showFastLapEl.checked,
        showLapStart: showLapStartEl.checked,
        EVENT_CLUSTER_THRESHOLD,
        EVENT_LANE_OFFSET
      });
    }
    function buildDeltaModelForCar(car) {
      buildDeltaModelForCarModule({
        car,
        raceType,
        samples: SAMPLES,
        computeLapAnalysisForCar
      });
    }

    function updateAllDeltaModels() {
      updateAllDeltaModelsModule({
        cars,
        raceType,
        samples: SAMPLES,
        computeLapAnalysisForCar,
        primaryCarSelect,
        setPrimaryCarIndex: (idx) => primaryCarIndex = idx
      });
    }

    function populatePrimaryCarSelect() {
      populatePrimaryCarSelectModule({
        cars,
        primaryCarSelect,
        setPrimaryCarIndex: (idx) => primaryCarIndex = idx
      });
    }

    function drawDeltaTimeline() {
      drawDeltaTimelineModule({
        deltaCtx,
        deltaCanvas,
        cars,
        primaryCarIndex,
        samples: SAMPLES,
        deltaShadingToggle
      });
    }



    // ===== INPUT MODEL & TIMELINE (PHASE 3.0) =====
    function buildInputModelForCar(car) {
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

      const S = SAMPLES;
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

    function updateAllInputModels() {
      updateAllInputModelsModule({cars, raceType, samples: SAMPLES});
    }

    function drawInputTimeline() {
      drawInputTimelineModule({
        inputCanvas,
        inputCtx,
        cars,
        primaryCarIndex,
        samples: SAMPLES,
        inputThrottleToggle,
        inputBrakeToggle,
        inputSteerToggle
      });
    }
    eventCanvas.addEventListener("mousemove", e => {
      const rect = eventCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const hit = findNearestEventAtPixelModule({eventCanvas, x, y, clickMode: false});
      if (hit) {
        tooltipEl.style.display = "block";
        tooltipEl.style.left = (e.clientX + 10) + "px";
        tooltipEl.style.top = (e.clientY + 10) + "px";
        tooltipEl.textContent = `${hit.car.name}: ${hit.ev.label || hit.ev.type} @ idx ${hit.ev.idx}`;
      } else {
        tooltipEl.style.display = "none";
      }
    });

    eventCanvas.addEventListener("mouseleave", () => {
      tooltipEl.style.display = "none";
    });

    deltaCanvas.addEventListener("mousemove", e => {
      const model = window.__deltaLast;
      if (!model) {
        tooltipEl.style.display = "none";
        return;
      }
      const rect = deltaCanvas.getBoundingClientRect();
      const scaleX = deltaCanvas.width / rect.width;
      const scaleY = deltaCanvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      const {padX, padY, innerW, innerH, deltas, currentLapIdx, primaryName} = model;

      if (x < padX || x > padX + innerW || y < padY || y > padY + innerH) {
        tooltipEl.style.display = "none";
        return;
      }

      const frac = (x - padX) / innerW;
      const S = deltas.length;
      const sampleIdx = Math.max(0, Math.min(S - 1, Math.round(frac * (S - 1))));
      const v = deltas[sampleIdx];
      const sec = v / 1000;
      const sign = sec >= 0 ? "+" : "-";
      const abs = Math.abs(sec).toFixed(3);
      const pct = (frac * 100).toFixed(1);
      const lapNo = currentLapIdx + 1;

      tooltipEl.style.display = "block";
      tooltipEl.style.left = (e.clientX + 10) + "px";
      tooltipEl.style.top = (e.clientY + 10) + "px";
      tooltipEl.textContent = `${primaryName} Lap ${lapNo}: ${sign}${abs}s @ ${pct}%`;
    });

    deltaCanvas.addEventListener("mouseleave", () => {
      tooltipEl.style.display = "none";
    });



    eventCanvas.addEventListener("click", e => {
      const rect = eventCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const hit = findNearestEventAtPixelModule({eventCanvas, x, y, clickMode: true});
      if (hit) {
        const car = hit.car;
        const d = car?.data || [];
        const idx = hit.ev.idx;
        const sample = d[Math.min(idx, d.length - 1)];
        const base = d[0];
        const targetMsRaw = Math.max(0, sampleTimestamp(sample) - sampleTimestamp(base));
        const targetMs = (hit.timeMs != null ? hit.timeMs : targetMsRaw);
        playbackController.setPlayheadMs(targetMs);
        renderFrame({smoothLens: false});
      }
    });

    window.__debug = {cars, masterTrack};

    
window.addEventListener("load", () => {
      autoDetectRaceTypeFromMaster();
      resizeLayout();
    });
  
