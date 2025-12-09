![](https://github.com/A-zrael/Forza-Horizon-5-Recorder/blob/main/Telemetry%20Recorder%20Icon.jpeg?raw=true)
# ForzaHorizon5 Telemetry Recorder
Forza Horizon 5 PS5 data recorder with an in-browser race analyzer (track map, deltas, inputs, events).

## Quick start
1) Record a session:
```bash
cd Go_Forza_Rec/bin
./forza_recorder_v1   # writes a telemetry CSV for each run
```
2) Launch the viewer:
```bash
cd Race_Viewer   # folder containing index.html
python3 -m http.server 8000
# open http://localhost:8000
```
3) Click **Select CSVs → Load CSVs**, pick one or more recordings, and scrub/play.

## Race viewer highlights
- Multi-car overlay with color legend, per-car dashboard cards, and mini/collapsed modes.
- Auto lap detection (tunable radius/min speed/sample count/distance/expected laps) for lapped and sprint runs.
- Master track builder with speed heatmap, confidence tinting, sector coloring, and PNG export; import/export master JSON.
- Sector analysis: choose 2–6 sectors, per-car sector tables, best-lap vs best-sector delta modes with shading.
- Event timelines: crashes, collisions, overtakes, fastest laps, and lap starts; unified or per-car timelines plus hover tooltips.
- Playback bar with play/pause, scrubber, elapsed time readout, and delta/input timelines (throttle, brake, steering toggles).
- Magnifier lens on the track canvas for zoomed inspection.
- Session export (JSON) to share a loaded set of CSVs without the raw files.

## Controls cheat sheet
- **Setup panel**: toggle with “Show setup ▾”. Cards/playback mini buttons shrink UI for small screens.
- **Track layer toggles**: track sectors, speed heatmap, confidence shading, sector tables, deltas, sector count, delta mode.
- **Lap detect**: adjust radius/min speed/min samples/min lap distance/expected laps, then “Apply lap detect”.
- **Events**: switch Unified/Per-car, toggle Crash/Collision/Overtake/Fastest Lap/Lap Start.
- **Exports**: “Export session JSON” (current load), “Save track PNG” (canvas), “Export Master JSON”.

## Recorder notes
- The Go recorder binary lives in `Go_Forza_Rec/bin/forza_recorder_v1` and emits CSV telemetry the viewer consumes.
- CSVs should include `timestampMS` (or `timestamp`), speed (`speed_mps`/`speed_mph`/`speed_kph`), accel_x, engine RPM/gear if available.
- Drop multiple CSVs to compare cars in one view; the viewer rebuilds the master track automatically unless a master JSON is loaded.
