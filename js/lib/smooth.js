// SPDX-License-Identifier: CC0-1.0
// Smooth curves through points, as cubic Bézier sections (Catmull–Rom, like
// TikZ's smooth plots). A point may fix the curve's direction there: dir in
// degrees on the page (0 = level); xu and yu (cm per unit) say how the page is
// scaled, so angles are true on the page whatever the axes' scales.

/**
 * Sections of the curve: [{ c1, c2, p }] — from the previous point, via
 * control points c1 and c2, to p. points: [{ x, y, dir? }].
 */
export function smoothSections(points, tension = 0.5, xu = 1, yu = 1) {
  const P = points;
  const k = (2 / 3) * tension; // control points: k × the velocity at each point
  const vel = P.map((p, i) => {
    const a = P[Math.max(0, i - 1)];
    const b = P[Math.min(P.length - 1, i + 1)];
    const span = i === 0 || i === P.length - 1 ? 1 : 2;
    let v = { x: (b.x - a.x) / span, y: (b.y - a.y) / span };
    if (p.dir !== null && p.dir !== undefined && p.dir !== '' && isFinite(p.dir)) {
      // same speed on the page, in the given direction (along the way the curve travels)
      const len = Math.hypot(v.x * xu, v.y * yu);
      let ux = Math.cos((p.dir * Math.PI) / 180);
      let uy = Math.sin((p.dir * Math.PI) / 180);
      if (ux * v.x * xu + uy * v.y * yu < 0) [ux, uy] = [-ux, -uy];
      v = { x: (ux * len) / xu, y: (uy * len) / yu };
    }
    return v;
  });
  const out = [];
  for (let i = 0; i + 1 < P.length; i++) {
    out.push({
      c1: { x: P[i].x + k * vel[i].x, y: P[i].y + k * vel[i].y },
      c2: { x: P[i + 1].x - k * vel[i + 1].x, y: P[i + 1].y - k * vel[i + 1].y },
      p: { x: P[i + 1].x, y: P[i + 1].y },
    });
  }
  return out;
}

/** The same sections run backwards (end to start). */
export function reverseSections(start, sections) {
  const pts = [start, ...sections.map((s) => s.p)];
  const out = [];
  for (let i = sections.length - 1; i >= 0; i--) out.push({ c1: sections[i].c2, c2: sections[i].c1, p: pts[i] });
  return out;
}

/** A point part-way (t from 0 to 1) along one section that starts at a. */
export function sectionAt(a, s, t) {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return { x: w[0] * a.x + w[1] * s.c1.x + w[2] * s.c2.x + w[3] * s.p.x, y: w[0] * a.y + w[1] * s.c1.y + w[2] * s.c2.y + w[3] * s.p.y };
}
