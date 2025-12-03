import {resizeTrackLayout} from "./track.js";

/**
 * Creates a layout manager that resizes canvases and dash column.
 */
export function createLayoutManager({
  trackCanvas,
  dashColumn,
  eventCanvas,
  setupPanel,
  playbackBar,
  drawMasterTrack,
  drawCars,
  drawEventTimeline
}) {
  const resizeLayout = () => {
    resizeTrackLayout({
      trackCanvas,
      dashColumn,
      eventCanvas,
      setupPanel,
      playbackBar,
      drawMasterTrack,
      drawCars,
      drawEventTimeline
    });
  };

  window.addEventListener("resize", resizeLayout);

  return {resizeLayout};
}
