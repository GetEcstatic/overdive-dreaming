// Plausible timeline for the audit clip (50 m pool, DYN ~190 m)
const start = 15_000;
// Wall times are hand-fitted to the footage. Mid-pool splits (12.5 m) were
// reshaped for the speed-graph study: fast off each wall, fading through the
// length and over the dive.
const marks: [number, number][] = [
  [25_000, 12.5], [35_500, 25], [46_500, 37.5], [57_000, 50],
  [66_500, 62.5], [77_000, 75], [88_500, 87.5], [100_000, 100],
  [109_800, 112.5], [120_500, 125], [131_800, 137.5], [143_000, 150],
  [153_000, 162.5], [164_600, 175], [180_000, 190]
];
export const timeline = {
  diveStartMs: start,
  diveEndMs: 180_000,
  laps: marks.filter(([, d]) => d % 50 === 0).map(([atMs, d], i, arr) => ({
    lapNumber: i + 1, atMs, splitMs: atMs - (i === 0 ? start : arr[i - 1][0]), cumulativeDistanceM: d
  })),
  subSplits: marks.filter(([, d]) => d % 50 !== 0).map(([atMs, d], i) => ({
    lapNumber: i + 1, atMs, splitMs: 0, cumulativeDistanceM: d
  }))
};
