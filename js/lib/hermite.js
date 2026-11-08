// SPDX-License-Identifier: CC0-1.0
// Smooth cubic Hermite curves through points, tuned for exam-style sketches.
//
// - A point higher (or lower) than both neighbours is a turning point and
//   gets a horizontal tangent.
// - Other points get a "Bessel" slope (slope of the parabola through the
//   point and its neighbours), which looks like a real polynomial.
// - Next to a turning point the slope is capped at 2× the secant, which
//   makes the turning point look parabolic instead of a flat plateau and
//   guarantees the curve never overshoots the turning point.

export function sketchSlopes(points) {
  const k = points.length;
  if (k < 2) return points.map(() => 0);
  const h = [];
  const d = [];
  for (let i = 0; i < k - 1; i++) {
    h.push(points[i + 1].x - points[i].x);
    d.push((points[i + 1].y - points[i].y) / h[i]);
  }
  const m = new Array(k).fill(0);
  const extremum = new Array(k).fill(false);
  for (let i = 1; i < k - 1; i++) {
    if (d[i - 1] * d[i] <= 0) {
      extremum[i] = true;
      m[i] = 0;
    } else {
      m[i] = (h[i] * d[i - 1] + h[i - 1] * d[i]) / (h[i - 1] + h[i]);
    }
  }
  // ends: slope of the parabola through the first/last three points
  const endSlope = (h0, h1, d0, d1) => {
    if (h1 === undefined) return d0;
    let s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(s) !== Math.sign(d0)) s = d0;
    return s;
  };
  m[0] = endSlope(h[0], h[1], d[0], d[1]);
  m[k - 1] = endSlope(h[k - 2], h[k - 3], d[k - 2], d[k - 3]);

  // limit slopes so each segment stays monotone (no overshoot)
  for (let i = 0; i < k - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const cap = extremum[i] || extremum[i + 1] ? 2 : 3;
    for (const j of [i, i + 1]) {
      const r = m[j] / d[i];
      if (r > cap) m[j] = cap * d[i];
    }
  }
  return m;
}

// Backwards-compatible name
export const monotoneSlopes = sketchSlopes;

/** Evaluator for the Hermite curve. Returns NaN outside the points' range. */
export function hermiteFunction(points, slopes) {
  return (x) => {
    if (x < points[0].x || x > points[points.length - 1].x) return NaN;
    let i = 0;
    while (i < points.length - 2 && x > points[i + 1].x) i++;
    const p0 = points[i];
    const p1 = points[i + 1];
    const h = p1.x - p0.x;
    const t = (x - p0.x) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * p0.y +
      (t3 - 2 * t2 + t) * h * slopes[i] +
      (-2 * t3 + 3 * t2) * p1.y +
      (t3 - t2) * h * slopes[i + 1]
    );
  };
}
