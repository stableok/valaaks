// valorant sens maths
export const DEG_PER_COUNT_AT_1 = 0.07;
export const BASE_HFOV = 103;
export const BASE_ASPECT = 16 / 9;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

export const degPerCount = (sens) => DEG_PER_COUNT_AT_1 * sens;
export const countsPer360 = (sens) => 360 / degPerCount(sens);
export const cmPer360 = (dpi, sens) => countsPer360(sens) * 2.54 / dpi;
export const inPer360 = (dpi, sens) => countsPer360(sens) / dpi;
export const eDPI = (dpi, sens) => dpi * sens;
export const reportIntervalMs = (hz) => 1000 / hz;

// vertical fov stays the same on any aspect ratio
export const BASE_VFOV = 2 * Math.atan(Math.tan(BASE_HFOV / 2 * D2R) / BASE_ASPECT) * R2D; // about 70.53
export const hfovForAspect = (aspect, vfovDeg = BASE_VFOV) => 2 * Math.atan(Math.tan(vfovDeg / 2 * D2R) * aspect) * R2D;

// fov when zoomed in
export const zoomedHFOV = (zoom) => 2 * Math.atan(Math.tan(BASE_HFOV / 2 * D2R) / zoom) * R2D;
export const zoomedVFOV = (zoom) => 2 * Math.atan(Math.tan(BASE_VFOV / 2 * D2R) / zoom) * R2D;

// sens when zoomed
export const zoomedDegPerCount = (sens, scopedMul, zoom) =>
  zoom <= 1.0001 ? degPerCount(sens) : DEG_PER_COUNT_AT_1 * sens * scopedMul * zoomedHFOV(zoom) / BASE_HFOV;

export const zoomedCmPer360 = (dpi, sens, scopedMul, zoom) =>
  (360 / zoomedDegPerCount(sens, scopedMul, zoom)) * 2.54 / dpi;

export const PRESETS = [
  { dpi: 400, sens: 0.7 },
  { dpi: 800, sens: 0.25 }, { dpi: 800, sens: 0.3 }, { dpi: 800, sens: 0.35 },
  { dpi: 800, sens: 0.4 }, { dpi: 800, sens: 0.5 },
  { dpi: 1600, sens: 0.2 }, { dpi: 1600, sens: 0.3 },
].map(p => ({ ...p, cm: cmPer360(p.dpi, p.sens) }));

export function summary(s, adsZoom = 1.25) {
  return {
    cm360: cmPer360(s.dpi, s.sens),
    in360: inPer360(s.dpi, s.sens),
    edpi: eDPI(s.dpi, s.sens),
    counts360: countsPer360(s.sens),
    degPerCount: degPerCount(s.sens),
    adsCm360: zoomedCmPer360(s.dpi, s.sens, s.scopedMul, adsZoom),
    reportMs: reportIntervalMs(s.pollingHz),
  };
}
