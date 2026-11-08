// Numerical helpers for function graphs: roots, turning points, rounding.

export function bisect(pred, a, b, iterations = 60) {
  // pred(a) !== pred(b); returns the switching point
  const pa = pred(a);
  for (let i = 0; i < iterations; i++) {
    const m = (a + b) / 2;
    if (pred(m) === pa) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

function goldenMin(g, a, b, iterations = 80) {
  const r = (Math.sqrt(5) - 1) / 2;
  let c = b - r * (b - a);
  let d = a + r * (b - a);
  for (let i = 0; i < iterations; i++) {
    if (g(c) < g(d)) b = d;
    else a = c;
    c = b - r * (b - a);
    d = a + r * (b - a);
  }
  return (a + b) / 2;
}

/** Snap values extremely close to "nice" numbers (integers, halves, ...). */
export function clean(v, tol = 1e-7) {
  for (const den of [1, 2, 4, 3, 5, 10]) {
    const n = Math.round(v * den);
    if (Math.abs(v * den - n) < tol * den) return n / den;
  }
  return Math.abs(v) < tol ? 0 : v;
}

function dedupe(xs, tol) {
  const out = [];
  for (const x of [...xs].sort((a, b) => a - b)) {
    if (!out.length || Math.abs(x - out[out.length - 1]) > tol) out.push(x);
  }
  return out;
}

/**
 * Real roots of f in [a, b]: sign changes plus "touching" roots
 * (local minima of |f| that reach ~0).
 */
export function findRoots(f, a, b, n = 4000) {
  const h = (b - a) / n;
  const xs = [];
  const ys = [];
  let scale = 0;
  for (let i = 0; i <= n; i++) {
    const x = a + i * h;
    const y = f(x);
    xs.push(x);
    ys.push(y);
    if (isFinite(y)) scale = Math.max(scale, Math.abs(y));
  }
  const tol = 1e-9 * (1 + scale);
  const roots = [];
  for (let i = 0; i <= n; i++) {
    const y = ys[i];
    if (!isFinite(y)) continue;
    if (Math.abs(y) <= tol) {
      roots.push(xs[i]);
      continue;
    }
    if (i < n && isFinite(ys[i + 1]) && Math.sign(y) * Math.sign(ys[i + 1]) < 0) {
      const r = bisect((x) => f(x) > 0, xs[i], xs[i + 1]);
      // reject sign changes caused by asymptotes (e.g. 1/x)
      if (Math.abs(f(r)) < 1e-6 * (1 + scale)) roots.push(r);
    }
    if (i > 0 && i < n && isFinite(ys[i - 1]) && isFinite(ys[i + 1])) {
      const ay = Math.abs(y);
      if (ay < Math.abs(ys[i - 1]) && ay < Math.abs(ys[i + 1]) && Math.sign(ys[i - 1]) === Math.sign(ys[i + 1])) {
        const m = goldenMin((x) => Math.abs(f(x)), xs[i - 1], xs[i + 1]);
        if (Math.abs(f(m)) < 1e-7 * (1 + scale)) roots.push(m);
      }
    }
  }
  return dedupe(roots, h * 1.5).map((r) => clean(r));
}

export function derivative(f, x) {
  const h = 1e-5 * (1 + Math.abs(x));
  return (f(x + h) - f(x - h)) / (2 * h);
}

/** Turning points in (a, b): [{ x, y, kind: 'max' | 'min' }] */
export function findTurningPoints(f, a, b, n = 4000) {
  const h = (b - a) / n;
  const pts = [];
  let prevX = a;
  let prevY = f(a);
  let prevD = NaN;
  for (let i = 1; i <= n; i++) {
    const x = a + i * h;
    const y = f(x);
    if (!isFinite(y) || !isFinite(prevY)) {
      prevX = x;
      prevY = y;
      prevD = NaN;
      continue;
    }
    const d = y - prevY;
    if (isFinite(prevD) && prevD !== 0 && d !== 0 && Math.sign(prevD) !== Math.sign(d)) {
      const kind = prevD > 0 ? 'max' : 'min';
      const g = kind === 'max' ? (t) => -f(t) : f;
      const tx = goldenMin(g, prevX - h, x);
      pts.push({ x: clean(tx, 1e-6), y: 0, kind });
    }
    if (d !== 0) prevD = d;
    prevX = x;
    prevY = y;
  }
  return pts.map((p) => ({ ...p, y: clean(f(p.x), 1e-9) }));
}

/** Format a number for display with up to dp decimal places (trailing zeros removed). */
export function fmt(v, dp = 2) {
  if (!isFinite(v)) return String(v);
  let s = v.toFixed(dp);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') s = '0';
  return s;
}

function fracLatex(num, den, suffix = '') {
  const sign = num < 0 ? '-' : '';
  const a = Math.abs(num);
  if (den === 1) return `${sign}${a === 1 && suffix ? '' : a}${suffix}`;
  if (suffix) return `${sign}\\frac{${a === 1 ? '' : a}${suffix}}{${den}}`;
  return `${sign}\\frac{${a}}{${den}}`;
}

function gcd(a, b) {
  return b ? gcd(b, a % b) : Math.abs(a);
}

/**
 * LaTeX for v, using an exact form when v is (very nearly) a simple
 * fraction, a fraction of pi, or ±√k / ±a√k. Falls back to dp decimals.
 */
export function niceLatex(v, dp = 2, exact = true) {
  if (!isFinite(v)) return String(v);
  if (exact) {
    const tol = 1e-9 * Math.max(1, Math.abs(v));
    for (let den = 1; den <= 12; den++) {
      const num = Math.round(v * den);
      if (Math.abs(v * den - num) < tol * den && gcd(num, den) === 1) return fracLatex(num, den);
    }
    if (Math.abs(v) > 1e-9) {
      for (let den = 1; den <= 12; den++) {
        const num = Math.round((v / Math.PI) * den);
        if (num !== 0 && Math.abs((v / Math.PI) * den - num) < 1e-9 * den && gcd(num, den) === 1) {
          return fracLatex(num, den, '\\pi');
        }
      }
      const sq = v * v;
      for (let a = 1; a <= 10; a++) {
        const k = Math.round(sq / (a * a));
        if (k > 1 && k <= 200 && Math.abs(sq / (a * a) - k) < 1e-8 * Math.max(1, sq)) {
          // k must be square-free-ish so we don't write 2√4
          if (Number.isInteger(Math.sqrt(k))) continue;
          let squareFree = true;
          for (let p = 2; p * p <= k; p++) if (k % (p * p) === 0) squareFree = false;
          if (!squareFree) continue;
          return `${v < 0 ? '-' : ''}${a === 1 ? '' : a}\\sqrt{${k}}`;
        }
      }
    }
  }
  return fmt(v, dp);
}

/** Round to a "nice" axis value. */
export function niceRound(v) {
  const step = Math.abs(v) >= 10 ? 1 : 0.1;
  return Math.round(v / step) * step;
}
