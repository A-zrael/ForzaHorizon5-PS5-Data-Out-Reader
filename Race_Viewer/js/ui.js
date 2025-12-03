// ui.js - UI helpers extracted from core.js

/**
 * Build dashboard cards for each car with collapse/sector toggles.
 */
export function createDashboards({cars, dashContainer, miniMode}) {
  dashContainer.innerHTML = "";
  cars.forEach((car, i) => {
    const card = document.createElement("div");
    card.className = "dash";
    card.style.borderColor = car.color;

    card.innerHTML = `
      <div class="dashHeader" style="background:linear-gradient(90deg, ${car.color}33, #252930);">
        <div class="dashHeaderLeft">
          <span class="dot" style="background:${car.color}"></span>
          <span class="dashTitleText">${car.name}</span>
        </div>
        <button class="collapseBtn small" data-car-index="${i}">▼</button>
      </div>
      <div class="dashBody">
        <div class="summaryRow" id="summary_${i}"></div>
        <div class="detailBlock">
          <div class="metricRow">
            <div class="metricLabel">Speed</div>
            <div class="metricBarWrap">
              <div class="metricBarBg">
                <div class="metricBarFill" id="speedBar_${i}"></div>
              </div>
              <div class="metricValue" id="speedVal_${i}">0 mph</div>
            </div>
          </div>
          <div class="metricRow">
            <div class="metricLabel">RPM</div>
            <div class="metricBarWrap">
              <div class="metricBarBg">
                <div class="metricBarFill" id="rpmBar_${i}"></div>
              </div>
              <div class="metricValue" id="rpmVal_${i}">0 / 0</div>
            </div>
          </div>
          <div class="metricRow">
            <div class="metricLabel">Gear</div>
            <div class="metricValue" id="gear_${i}">N</div>
          </div>
          <div class="lapInfo" id="lap_${i}">Elapsed: 0:00.000</div>
          <button class="sectorToggleBtn small" id="sectorToggle_${i}">Show sectors ▾</button>
          <div class="sectorPanel collapsed" id="sectorPanel_${i}">
            <div id="sectorBox_${i}"></div>
          </div>
        </div>
      </div>
    `;
    dashContainer.appendChild(card);

    car.speedBarEl = card.querySelector(`#speedBar_${i}`);
    car.speedValEl = card.querySelector(`#speedVal_${i}`);
    car.rpmBarEl = card.querySelector(`#rpmBar_${i}`);
    car.rpmValEl = card.querySelector(`#rpmVal_${i}`);
    car.gearEl = card.querySelector(`#gear_${i}`);
    car.lapEl = card.querySelector(`#lap_${i}`);
    car.sectorBox = card.querySelector(`#sectorBox_${i}`);
    car.summaryEl = card.querySelector(`#summary_${i}`);
    car.dataIndex = 0;
    car.index = 0;

    const btn = card.querySelector(".collapseBtn");
    const header = card.querySelector(".dashHeader");
    const sectorToggle = card.querySelector(`#sectorToggle_${i}`);
    const sectorPanel = card.querySelector(`#sectorPanel_${i}`);

    function toggleCard() {
      const isCollapsed = card.classList.toggle("collapsed");
      btn.textContent = isCollapsed ? "►" : "▼";
    }

    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      toggleCard();
    });
    header.addEventListener("click", (ev) => {
      if (ev.target === btn) return;
      toggleCard();
    });

    sectorToggle.addEventListener("click", () => {
      const isCollapsed = sectorPanel.classList.toggle("collapsed");
      sectorToggle.textContent = isCollapsed ? "Show sectors ▾" : "Hide sectors ▴";
    });

    if (miniMode) {
      card.classList.add("mini");
    }
  });
}

/**
 * Redraw the legend items from cars.
 */
export function updateLegend({legendEl, cars}) {
  legendEl.innerHTML = "";
  cars.forEach(c => {
    const div = document.createElement("div");
    div.className = "legendItem";
    div.innerHTML = `<span class="dot" style="background:${c.color}"></span> ${c.name}`;
    legendEl.appendChild(div);
  });
}

/**
 * Sync the scrubber range with the longest telemetry series.
 */
export function setupScrubber({scrubber, getMaxDurationMs}) {
  if (!scrubber) return;
  const maxMs = Math.max(0, Math.round(getMaxDurationMs ? getMaxDurationMs() : 0));
  scrubber.max = maxMs;
  scrubber.value = 0;
  scrubber.step = 1;
}

/**
 * Update dashboard values and sector tables.
 */
export function updateDashboards({cars, clamp01, formatMs, renderAnalysisTables}) {
  cars.forEach(car => {
    const p = car.data[Math.min(car.dataIndex, car.data.length - 1)];

    const speed = p.speed_mph || 0;
    const speedPct = clamp01(speed / (car.speedScale || 120));
    if (car.speedBarEl) {
      car.speedBarEl.style.width = (speedPct * 100).toFixed(1) + "%";
    }
    if (car.speedValEl) {
      car.speedValEl.textContent = Math.round(speed) + " mph";
    }

    const rpm = p.engine_rpm || 0;
    const rpmMax = p.engine_max_rpm || rpm || 1;
    const rpmPct = clamp01(rpm / rpmMax);
    if (car.rpmBarEl) {
      car.rpmBarEl.style.width = (rpmPct * 100).toFixed(1) + "%";
    }
    if (car.rpmValEl) {
      car.rpmValEl.textContent = Math.round(rpm) + " / " + Math.round(rpmMax);
    }

    const gear = ("gear" in p && p.gear !== 0) ? String(p.gear) : "N";
    if (car.gearEl) {
      car.gearEl.textContent = gear;
    }

    const t0 = car.data[0].timestampMS || 0;
    const tNow = p.timestampMS || 0;
    const elMs = Math.max(0, tNow - t0);
    if (car.lapEl) {
      car.lapEl.textContent = "Elapsed: " + formatMs(elMs);
    }

    if (car.summaryEl) {
      car.summaryEl.textContent = `${Math.round(speed)} mph | G${gear} | ${formatMs(elMs)}`;
    }
  });

  renderAnalysisTables();
}

/**
 * Update the small playback info line.
 */
export function updatePlaybackInfo({cars, playbackInfoEl, formatMs}) {
  if (!cars.length) {playbackInfoEl.textContent = ""; return;}
  const car = cars[0];
  const idx = Math.min(car.dataIndex, car.data.length - 1);
  const p = car.data[idx];
  const t0 = car.data[0].timestampMS || 0;
  const tNow = p.timestampMS || 0;
  const elMs = Math.max(0, tNow - t0);
  playbackInfoEl.textContent = "Elapsed: " + formatMs(elMs);
}
