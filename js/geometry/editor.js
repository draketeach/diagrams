// SPDX-License-Identifier: CC0-1.0
// The geometry editor: an SVG drawing canvas with a toolbar, snapping,
// a properties panel and undo/redo. It edits a scene (see scene.js) and
// reports changes; the app turns the scene into TikZ and renders it.
//
// mountGeometryEditor(container, { onChange, defaults }) returns the same
// interface as the options form: { getValues, setValues, reset, destroy }.

import {
  parseScene,
  normalPoint,
  normalItem,
  pointMap,
  pointLabelOffset,
  segmentLabelOffset,
  angleLabelOffset,
  labelPositions,
  angleSpan,
  angleText,
  dirDeg,
  fmt,
  markOffsets,
  slopeDeg,
  isWordName,
  curveSections,
  polygonEdges,
  labelGap,
  edgeShape,
  shapeAt,
  shapeTangent,
  segmentMid,
  bearingDeg,
  bearingText,
  endText,
  endOffset,
  notToScalePlace,
  segmentText,
  resolvePoints,
  dependentsOf,
} from './scene.js';
import { sceneToEdgeList, applyEdgeList, nextBend } from './edgeList.js';

const PX = 40; // pixels per cm at zoom 1
const SNAP_POINT = 12; // px
const SNAP_LINE = 8; // px

const TOOLS = [
  { id: 'select', label: 'Select', key: 'v', hint: 'Click to select; drag points, labels and text. Drag empty space to pan. Delete removes.' },
  { id: 'point', label: 'Point', key: 'p', hint: 'Click to add a point (snaps to the grid, other points and lines).' },
  { id: 'segment', label: 'Line', key: 's', hint: 'Click two points (new or existing) to join them.' },
  { id: 'directed', label: 'Directed edge', key: 'd', hint: 'Click the start vertex, then the end: the edge gets an arrow in the middle.' },
  { id: 'ray', label: 'Ray', key: 'y', hint: 'Click the start, then a point the ray passes through. Set its bearing and the label at its end in the panel below.' },
  { id: 'north', label: 'North line', key: 'n', hint: 'Click a point: draws a dashed arrow straight up from it, labelled N.' },
  { id: 'curve', label: 'Curve', key: 'u', hint: 'Click points for a smooth curve through them; click the last point again (or press Enter) to finish. Drag the points to reshape it.' },
  { id: 'measure', label: 'Measure', key: 'e', hint: 'Click the two ends of what you are measuring: a dashed line with arrowheads, end bars and its length goes beside it.' },
  { id: 'polygon', label: 'Polygon', key: 'g', hint: 'Click the corners, then click the first one again to close it (Enter finishes an open path).' },
  { id: 'angle', label: 'Angle', key: 'a', hint: 'Click two lines that meet (or three points: arm, vertex, arm).' },
  { id: 'right', label: 'Right angle', key: 'r', hint: 'Click two lines that meet (or three points: arm, vertex, arm).' },
  { id: 'label', label: 'Label', key: 'l', hint: 'Click a line to give it a length label, or a point or angle to rename it.' },
  { id: 'text', label: 'Text', key: 't', hint: 'Click to place text.' },
  { id: 'midpoint', label: 'Midpoint', key: 'm', hint: 'Click a line (or two points) to mark its midpoint. It stays in the middle when the ends move.' },
  { id: 'perp', label: 'Perpendicular', key: 'f', hint: 'Click a point and a line: draws the perpendicular from the point to the line, with a right angle at its foot.' },
  { id: 'circle', label: 'Circle', key: 'c', hint: 'Click the centre, then a point on the circle.' },
  { id: 'arc', label: 'Arc', key: 'k', hint: 'Click the centre, the start, then the end (anticlockwise).' },
];

// toolbar icons: 24×24, drawn with the button's text colour
const DOT = (x, y, r = 1.9) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
const ICONS = {
  select: '<path d="M6 3.5v15.5l4.2-4.1 2.7 6.1 2.6-1.1-2.7-6h5.9z" fill="currentColor" stroke-linejoin="round"/>',
  point: `${DOT(12, 12, 3)}<path d="M12 3v4M12 17v4M3 12h4M17 12h4" stroke-width="1.4"/>`,
  segment: `<path d="M5.5 18.5 18.5 5.5"/>${DOT(5.5, 18.5)}${DOT(18.5, 5.5)}`,
  directed: `<path d="M4 18 20 6"/><path d="M14.6 7.4 12.9 13M14.6 7.4 8.8 7.6" stroke-linejoin="round" transform="translate(-1.2 1.4)"/>${DOT(4, 18)}${DOT(20, 6)}`,
  ray: `<path d="M5 19 19.5 4.5"/><path d="M19.8 4.2 13.4 6.6M19.8 4.2l-2.4 6.4" stroke-linejoin="round"/>${DOT(5, 19)}${DOT(10.5, 13.5, 1.6)}`,
  north: '<path d="M12 21V8" stroke-dasharray="2.6 2"/><path d="M8.5 11.5 12 7l3.5 4.5" stroke-linejoin="round"/><path d="M9 6.2V1.8l6 4.4V1.8" stroke-width="1.6" stroke-linejoin="round" transform="translate(0 -0.3)"/>',
  curve: `<path d="M3 17C7 5 12 21 21 7"/>${DOT(3, 17)}${DOT(12, 13, 1.6)}${DOT(21, 7)}`,
  measure: '<path d="M3 8v8M21 8v8"/><path d="M4 12h5.5M14.5 12H20" stroke-dasharray="2 1.6"/><path d="m6.5 9.6-2.6 2.4 2.6 2.4M17.5 9.6l2.6 2.4-2.6 2.4" stroke-linejoin="round"/><path d="M11 13.5v-3h2v3" stroke-width="1.2"/>',
  polygon: `<path d="M4 19 12 5l8 14z" stroke-linejoin="round"/>${DOT(4, 19)}${DOT(12, 5)}${DOT(20, 19)}`,
  angle: '<path d="M4 19h17M4 19 15 6"/><path d="M11 19a7 7 0 0 0-2.3-5.2" stroke-width="1.5"/>',
  right: '<path d="M5 4v15h15"/><path d="M5 13h6v6" stroke-width="1.5"/>',
  label: '<path d="M3.5 20.5h17"/><text x="12" y="15.5" text-anchor="middle" font-size="10" font-family="serif" font-style="italic" fill="currentColor" stroke="none">12</text>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6" stroke-linejoin="round"/>',
  midpoint: `<path d="M3 12h18M7.5 9v6M16.5 9v6" />${DOT(12, 12, 2.4)}`,
  perp: `<path d="M3 19h18"/><path d="M12 5v14" stroke-dasharray="2.5 2"/><path d="M12 15h4v4" stroke-width="1.4"/>${DOT(12, 5)}`,
  circle: `<circle cx="12" cy="12" r="8"/>${DOT(12, 12, 1.6)}`,
  arc: `<path d="M19.31 14.77A8.5 8.5 0 0 0 7.41 5.3"/>${DOT(19.31, 14.77)}${DOT(7.41, 5.3)}${DOT(11, 13, 1.6)}<path d="M11 13 19.31 14.77M11 13 7.41 5.3" stroke-width="1.1" stroke-dasharray="1.4 1.8"/>`,
  undo: '<path d="M9 7 4.5 11.5 9 16"/><path d="M4.5 11.5H14a5.5 5.5 0 0 1 0 11h-2" transform="translate(0 -3.5)"/>',
  redo: '<path d="M15 7l4.5 4.5L15 16"/><path d="M19.5 11.5H10a5.5 5.5 0 0 0 0 11h2" transform="translate(0 -3.5)"/>',
  delete: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5.5 5.5M8 10.5h5"/>',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5.5 5.5M8 10.5h5M10.5 8v5"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><rect x="8.5" y="8.5" width="7" height="7" rx="1"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">${ICONS[name]}</svg>`;

// in a network: fewer tools, with network names
const NETWORK_TOOLS = ['select', 'point', 'segment', 'directed', 'label', 'text'];
const NETWORK_NAMES = {
  point: ['Vertex', 'Click to add a vertex (it snaps to the grid and to other vertices).'],
  segment: ['Edge', 'Click two vertices to join them. Click a vertex twice for a loop; joining two vertices again curves the new edge.'],
  label: ['Label', 'Click an edge to label it (e.g. a weight), or a vertex to rename it.'],
};

const LINE_STYLES = [
  ['solid', 'Solid'],
  ['dashed', 'Dashed'],
  ['dotted', 'Dotted'],
];
const FILLS = [
  ['none', 'None'],
  ['gray!15', 'Light grey'],
  ['gray!30', 'Grey'],
  ['gray!50', 'Dark grey'],
  ['dots', 'Dots'],
  ['dots-sparse', 'Sparse dots'],
  ['hatch', 'Hatching'],
];
// how the canvas shows the pattern fills (the preview shows the real ones)
const CANVAS_PATTERNS =
  '<defs>' +
  '<pattern id="geo-dots" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="2" cy="2" r="0.75" fill="#333"/></pattern>' +
  '<pattern id="geo-dots-sparse" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="3.5" cy="3.5" r="0.9" fill="#333"/></pattern>' +
  '<pattern id="geo-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#333" stroke-width="0.8"/></pattern>' +
  '</defs>';
const WIDTHS = ['very thin', 'thin', 'semithick', 'thick', 'very thick'];

/** LaTeX-ish label text -> what the canvas shows (the preview shows the real thing). */
const SYMBOLS = {
  pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
  lambda: 'λ', mu: 'μ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', omega: 'ω', rho: 'ρ', psi: 'ψ',
  Delta: 'Δ', Omega: 'Ω', Sigma: 'Σ', Theta: 'Θ', Phi: 'Φ', ell: 'ℓ', times: '×', cdot: '·', pm: '±',
  circ: '°', infty: '∞', angle: '∠', triangle: '△', parallel: '∥', perp: '⊥', le: '≤', ge: '≥', ne: '≠',
};
function display(t) {
  return String(t ?? '')
    .replace(/\$/g, '')
    .replace(/\^\{?\\circ\}?/g, '°')
    .replace(/\\(?:mathrm|text|textrm|mathit|mathbf|boldsymbol|operatorname)\{([^}]*)\}/g, '$1')
    .replace(/\\sqrt\{([^}]*)\}/g, '√$1')
    .replace(/\\[ ,;:!]/g, ' ')
    .replace(/\\([a-zA-Z]+)/g, (m, g) => SYMBOLS[g] ?? '')
    .replace(/[{}]/g, '')
    .replace(/~/g, ' ');
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let uid = 0;
const newId = (prefix) => `${prefix}${Date.now().toString(36)}${(uid++).toString(36)}`;

export function mountGeometryEditor(container, { onChange = () => {}, defaults = {} } = {}) {
  let scene = parseScene(defaults.scene);
  let tool = 'select';
  let selection = null; // { kind: 'point' | 'item', id }
  let pending = []; // clicked points / segments for multi-click tools
  let pendingKind = null; // 'points' | 'segments'
  let hover = null; // snapped pointer position
  let drag = null;
  const undo = [];
  const redo = [];

  // ---------------------------------------------------------------- DOM
  container.replaceChildren();
  container.classList.add('geo-host');
  const toolbar = el('div', 'geo-toolbar');
  const toolButtons = new Map();
  for (const t of TOOLS) {
    const b = el('button', 'geo-tool');
    b.type = 'button';
    b.innerHTML = icon(t.id);
    b.title = `${t.label} (${t.key.toUpperCase()})`;
    b.setAttribute('aria-label', t.label);
    b.addEventListener('click', () => setTool(t.id));
    toolButtons.set(t.id, b);
    toolbar.append(b);
  }
  toolbar.append(el('span', 'geo-sep'));
  const undoBtn = button('undo', 'Undo (Ctrl+Z)', () => doUndo());
  const redoBtn = button('redo', 'Redo (Ctrl+Y)', () => doRedo());
  const delBtn = button('delete', 'Delete the selection (Delete)', () => deleteSelection());
  const zoomOut = button('zoomOut', 'Zoom out', () => zoom(1.25));
  const zoomIn = button('zoomIn', 'Zoom in', () => zoom(0.8));
  const fitBtn = button('fit', 'Fit the drawing in view', () => fit());
  toolbar.append(undoBtn, redoBtn, delBtn, el('span', 'geo-sep'), zoomOut, zoomIn, fitBtn);

  const hint = el('div', 'geo-hint');
  const wrap = el('div', 'geo-canvas');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'geo-svg');
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('aria-label', 'Geometry drawing canvas');
  wrap.append(svg);
  const props = el('div', 'geo-props');
  container.append(toolbar, hint, wrap, props);

  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  function button(iconName, title, fn) {
    const b = el('button', 'geo-tool');
    b.type = 'button';
    b.innerHTML = icon(iconName);
    b.title = title;
    b.setAttribute('aria-label', title.replace(/ \(.*\)$/, ''));
    b.addEventListener('click', fn);
    return b;
  }

  // ---------------------------------------------------------------- state changes
  const snapshot = () => JSON.stringify(scene);
  let before = null; // scene before the current edit (for undo)
  function begin() {
    if (before === null) before = snapshot();
  }
  /** Finish an edit: record it for undo and tell the app. */
  function commit() {
    const now = snapshot();
    if (before !== null && before !== now) {
      undo.push(before);
      if (undo.length > 200) undo.shift();
      redo.length = 0;
      onChange();
    }
    before = null;
    render();
  }
  function change(fn) {
    begin();
    fn();
    commit();
  }
  function doUndo() {
    if (!undo.length) return;
    redo.push(snapshot());
    scene = parseScene(undo.pop());
    selection = validSelection(selection);
    clearPending();
    onChange();
    renderAll();
  }
  function doRedo() {
    if (!redo.length) return;
    undo.push(snapshot());
    scene = parseScene(redo.pop());
    selection = validSelection(selection);
    onChange();
    renderAll();
  }
  function validSelection(sel) {
    if (!sel) return null;
    if (sel.kind === 'point') return scene.points.some((p) => p.id === sel.id) ? sel : null;
    return scene.items.some((i) => i.id === sel.id) ? sel : null;
  }

  // ---------------------------------------------------------------- coordinates
  const view = () => scene.settings.view;
  const sx = (x) => (x - view().x0) * PX;
  const sy = (y) => (view().y0 + view().h - y) * PX;
  function toScene(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    const u = m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
    return { x: u.x / PX + view().x0, y: view().y0 + view().h - u.y / PX };
  }
  /** Screen pixels per cm (for snapping distances). */
  function pxPerCm() {
    const m = svg.getScreenCTM();
    return m ? m.a * PX : PX;
  }

  // ---------------------------------------------------------------- snapping
  function snap(raw, { exclude = null, lines = true } = {}) {
    const k = pxPerCm();
    let best = null;
    for (const p of scene.points) {
      if (exclude && (exclude === p.id || exclude.has?.(p.id))) continue;
      const d = Math.hypot(p.x - raw.x, p.y - raw.y) * k;
      if (d < SNAP_POINT && (!best || d < best.d)) best = { d, x: p.x, y: p.y, point: p.id };
    }
    if (best) return best;
    if (lines) {
      const pts = pointMap(scene);
      for (const it of scene.items) {
        if (it.type !== 'segment' || it.bend || it.a === it.b) continue;
        const a = pts.get(it.a);
        const b = pts.get(it.b);
        if (!a || !b) continue;
        const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
        if (!L2) continue;
        const t = Math.max(0, Math.min(1, ((raw.x - a.x) * (b.x - a.x) + (raw.y - a.y) * (b.y - a.y)) / L2));
        let px = a.x + t * (b.x - a.x);
        let py = a.y + t * (b.y - a.y);
        const d = Math.hypot(px - raw.x, py - raw.y) * k;
        if (d < SNAP_LINE && (!best || d < best.d)) {
          // prefer a grid line crossing the segment when it is close
          if (scene.settings.snap) {
            const g = scene.settings.grid;
            const cands = [];
            if (Math.abs(b.x - a.x) > 1e-9) {
              const gx = Math.round(px / g) * g;
              const tt = (gx - a.x) / (b.x - a.x);
              if (tt >= 0 && tt <= 1) cands.push({ x: gx, y: a.y + tt * (b.y - a.y) });
            }
            if (Math.abs(b.y - a.y) > 1e-9) {
              const gy = Math.round(py / g) * g;
              const tt = (gy - a.y) / (b.y - a.y);
              if (tt >= 0 && tt <= 1) cands.push({ x: a.x + tt * (b.x - a.x), y: gy });
            }
            const near = cands.find((c) => Math.hypot(c.x - px, c.y - py) * k < SNAP_LINE);
            if (near) [px, py] = [near.x, near.y];
          }
          best = { d, x: px, y: py, segment: it.id };
        }
      }
      if (best) return best;
    }
    if (scene.settings.snap) {
      const g = scene.settings.grid;
      return { x: Math.round(raw.x / g) * g, y: Math.round(raw.y / g) * g };
    }
    return { x: raw.x, y: raw.y };
  }

  function nextName() {
    const used = new Set(scene.points.map((p) => p.name));
    const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const first = String(scene.settings.firstLetter || 'A').trim();
    const lower = first === first.toLowerCase() && first !== first.toUpperCase();
    const start = Math.max(0, ALPHA.indexOf(first.toUpperCase()));
    const letters = [...ALPHA.slice(start) + ALPHA.slice(0, start)].map((L) => (lower ? L.toLowerCase() : L));
    for (let round = 0; ; round++) {
      for (const L of letters) {
        const nm = round ? `${L}_${round}` : L;
        if (!used.has(nm)) return nm;
      }
    }
  }

  /** The point at a snap result: an existing one, or a new one. */
  function pointAt(s) {
    if (s.point) return s.point;
    const p = normalPoint({ id: newId('p'), name: nextName(), x: round(s.x), y: round(s.y), dot: isNet() });
    scene.points.push(p);
    return p.id;
  }
  const round = (v) => Math.round(v * 10000) / 10000;

  // ---------------------------------------------------------------- tools
  function setTool(id) {
    tool = id;
    clearPending();
    for (const [k, b] of toolButtons) b.classList.toggle('is-active', k === id);
    hint.textContent = toolHint(id);
    render();
  }
  const isNet = () => scene.settings.mode === 'network';
  function toolInfo(id) {
    const t = TOOLS.find((x) => x.id === id);
    const nn = isNet() && NETWORK_NAMES[id];
    return nn ? { ...t, label: nn[0], hint: nn[1] } : t;
  }
  function toolHint(id) {
    const t = toolInfo(id);
    return `${t.label} (${t.key.toUpperCase()}): ${t.hint}`;
  }
  /** Show the tools for this kind of drawing, with their names. */
  function applyMode() {
    for (const [id, btn] of toolButtons) {
      const t = toolInfo(id);
      btn.hidden = isNet() ? !NETWORK_TOOLS.includes(id) : id === 'directed';
      btn.title = `${t.label} (${t.key.toUpperCase()})`;
      btn.setAttribute('aria-label', t.label);
    }
    if (toolButtons.get(tool)?.hidden) setTool('select');
  }
  function clearPending() {
    pending = [];
    pendingKind = null;
  }

  function hitTarget(e) {
    const t = e.target.closest?.('[data-kind]');
    return t ? { kind: t.dataset.kind, id: t.dataset.id, part: t.dataset.part || null } : null;
  }
  const findItem = (id) => scene.items.find((i) => i.id === id);
  const findPoint = (id) => scene.points.find((p) => p.id === id);

  /**
   * The vertex and arm ends for two clicked lines. They may share an end, or
   * one may end at a point lying on the other (e.g. the foot of an altitude);
   * then the arm along the other line goes towards the side that was clicked.
   */
  function anglebetween(c1, c2) {
    const s1 = findItem(c1.id);
    const s2 = findItem(c2.id);
    const v = sharedPoint(s1, s2);
    if (v) return { v, a: s1.a === v ? s1.b : s1.a, b: s2.a === v ? s2.b : s2.a };
    const pts = pointMap(scene);
    const onLine = (pid, seg) => {
      const p = pts.get(pid);
      const a = pts.get(seg.a);
      const b = pts.get(seg.b);
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (!L) return false;
      const cross = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / L;
      const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (L * L);
      return cross < 1e-6 && t > 1e-6 && t < 1 - 1e-6;
    };
    const towardsClick = (vid, seg, at) => {
      const p = pts.get(vid);
      const a = pts.get(seg.a);
      const b = pts.get(seg.b);
      const da = (a.x - p.x) * (at.x - p.x) + (a.y - p.y) * (at.y - p.y);
      const db = (b.x - p.x) * (at.x - p.x) + (b.y - p.y) * (at.y - p.y);
      return da >= db ? seg.a : seg.b;
    };
    for (const [x, y, cx, cy] of [[s1, s2, c1, c2], [s2, s1, c2, c1]]) {
      for (const end of [x.a, x.b]) {
        if (onLine(end, y)) {
          const armX = x.a === end ? x.b : x.a;
          const armY = towardsClick(end, y, cy.at);
          return x === s1 ? { v: end, a: armX, b: armY } : { v: end, a: armY, b: armX };
        }
      }
    }
    return null;
  }

  function sharedPoint(s1, s2) {
    for (const p of [s1.a, s1.b]) if (p === s2.a || p === s2.b) return p;
    return null;
  }

  function addAngleFrom(kind, v, a, b) {
    if (v === a || v === b || a === b) return flash('Pick two different arms.');
    const dup = scene.items.find((i) => i.type === kind && i.v === v && new Set([i.a, i.b, a, b]).size === 2);
    if (dup) {
      select({ kind: 'item', id: dup.id });
      return;
    }
    const it = normalItem({ id: newId('i'), type: kind, v, a, b });
    scene.items.push(it);
    selection = { kind: 'item', id: it.id };
  }

  function onClickTool(e) {
    const raw = toScene(e);
    const target = hitTarget(e);
    if (tool === 'point') {
      change(() => {
        const s = snap(raw);
        const id = pointAt(s);
        selection = { kind: 'point', id };
      });
      showProps();
      return;
    }
    if (tool === 'curve') {
      const sp = snap(raw);
      begin();
      const id = pointAt(sp);
      if (pending.length >= 2 && id === pending[pending.length - 1]) {
        finishCurve();
        return;
      }
      if (pending[pending.length - 1] !== id) pending.push(id);
      render();
      return;
    }
    if (tool === 'measure') {
      const sp = snap(raw);
      begin();
      const id = pointAt(sp);
      if (!pending.length) {
        pending = [id];
        render();
        return;
      }
      if (pending[0] !== id) addMeasure(pending[0], id);
      clearPending();
      commit();
      showProps();
      return;
    }
    if (tool === 'north') {
      const sp = snap(raw);
      change(() => addNorth(pointAt(sp)));
      showProps();
      return;
    }
    if (tool === 'directed') {
      const sp = snap(raw, { lines: false });
      begin();
      const id = pointAt(sp);
      if (!pending.length) {
        pending = [id];
        render();
        return;
      }
      addEdge(pending[0], id, true);
      clearPending();
      commit();
      showProps();
      return;
    }
    if (tool === 'ray') {
      const sp = snap(raw);
      begin();
      const id = pointAt(sp);
      if (!pending.length) {
        pending = [id];
        render();
        return;
      }
      if (pending[0] !== id) addRay(pending[0], id);
      clearPending();
      commit();
      showProps();
      return;
    }
    if (tool === 'segment' || tool === 'polygon') {
      const s = snap(raw);
      begin();
      const id = pointAt(s);
      if (tool === 'segment') {
        if (pending.length === 0) {
          pending = [id];
          render();
          return;
        }
        const a = pending[0];
        if (isNet()) addEdge(a, id, false);
        else if (a !== id) addSegment(a, id);
        clearPending();
        commit();
        showProps();
        return;
      }
      // polygon
      if (pending.length >= 3 && id === pending[0]) {
        finishPolygon(true);
        return;
      }
      if (pending[pending.length - 1] !== id) pending.push(id);
      render();
      return;
    }
    if (tool === 'angle' || tool === 'right') {
      if (target?.kind === 'item' && findItem(target.id)?.type === 'segment') {
        if (pendingKind === 'points') clearPending();
        pendingKind = 'segments';
        if (!pending.some((q) => q.id === target.id)) pending.push({ id: target.id, at: raw });
        if (pending.length === 2) {
          const arms = anglebetween(pending[0], pending[1]);
          if (!arms) {
            flash('Those lines don\u2019t meet at a point. Pick two lines that meet at a marked point.');
          } else {
            change(() => addAngleFrom(tool, arms.v, arms.a, arms.b));
            showProps();
          }
          clearPending();
        }
        render();
        return;
      }
      if (pendingKind === 'segments') clearPending();
      const s = snap(raw, { lines: false });
      if (!s.point) return flash('Click a line, or a point.');
      pendingKind = 'points';
      if (pending[pending.length - 1] !== s.point) pending.push(s.point);
      if (pending.length === 3) {
        const [a, v, b] = pending;
        change(() => addAngleFrom(tool, v, a, b));
        clearPending();
        showProps();
      }
      render();
      return;
    }
    if (tool === 'midpoint') {
      if (target?.kind === 'item' && findItem(target.id)?.type === 'segment') {
        const sg = findItem(target.id);
        change(() => addMidpoint(sg.a, sg.b));
        clearPending();
        showProps();
        return;
      }
      const sp = snap(raw, { lines: false });
      if (!sp.point) return flash('Click a line, or two points.');
      if (pending[0] && pending[0] !== sp.point) {
        const a = pending[0];
        change(() => addMidpoint(a, sp.point));
        clearPending();
        showProps();
      } else pending = [sp.point];
      render();
      return;
    }
    if (tool === 'perp') {
      const seg = target?.kind === 'item' && findItem(target.id)?.type === 'segment' ? findItem(target.id) : null;
      const sp = seg ? null : snap(raw, { lines: false });
      if (!seg && !sp.point) return flash('Click a point and a line.');
      const kind = seg ? 'segment' : 'point';
      pending = pending.filter((q) => q.kind !== kind);
      pending.push(seg ? { kind, id: seg.id } : { kind, id: sp.point });
      const P = pending.find((q) => q.kind === 'point');
      const L = pending.find((q) => q.kind === 'segment');
      if (P && L) {
        const line = findItem(L.id);
        if (line.a === P.id || line.b === P.id) {
          flash('Pick a point that isn\u2019t on the line.');
          clearPending();
        } else {
          change(() => addPerpendicular(P.id, line));
          clearPending();
          showProps();
        }
      }
      render();
      return;
    }
    if (tool === 'label') {
      if (target) {
        const it = target.kind === 'item' ? findItem(target.id) : null;
        // a measured or empty label becomes your own text, ready to type over
        if (it && (it.type === 'segment' || it.type === 'angle') && !it.label) {
          change(() => {
            const pts = pointMap(scene);
            it.label = it.type === 'segment' ? segmentText({ ...it, label: null }, pts, scene.settings) : angleText({ ...it, label: null }, pts);
          });
        }
        select({ kind: target.kind, id: target.id });
        setTimeout(() => focusProp(target.kind === 'point' ? 'name' : 'label'), 0);
      }
      return;
    }
    if (tool === 'text') {
      const s = snap(raw, { lines: false });
      change(() => {
        const it = normalItem({ id: newId('i'), type: 'text', x: round(s.x), y: round(s.y), text: 'Text' });
        scene.items.push(it);
        selection = { kind: 'item', id: it.id };
      });
      showProps();
      setTimeout(() => focusProp('text'), 0);
      return;
    }
    if (tool === 'circle' || tool === 'arc') {
      const s = snap(raw);
      begin();
      const id = pointAt(s);
      if (pending[pending.length - 1] !== id) pending.push(id);
      const need = tool === 'circle' ? 2 : 3;
      if (pending.length === need) {
        const [c, a, b] = pending;
        const it = normalItem(tool === 'circle' ? { id: newId('i'), type: 'circle', c, p: a } : { id: newId('i'), type: 'arc', c, a, b });
        scene.items.push(it);
        selection = { kind: 'item', id: it.id };
        clearPending();
        commit();
        showProps();
      } else render();
    }
  }

  function addMidpoint(a, b) {
    const dup = scene.points.find((q) => q.dep?.kind === 'mid' && new Set([q.dep.a, q.dep.b, a, b]).size === 2);
    if (dup) {
      selection = { kind: 'point', id: dup.id };
      return;
    }
    const p = normalPoint({ id: newId('p'), name: nextName(), x: 0, y: 0, dep: { kind: 'mid', a, b } });
    scene.points.push(p);
    resolvePoints(scene);
    // equal-length marks on the two halves, with a count not used yet
    const used = new Set(scene.items.filter((i) => i.type === 'ticks' || i.type === 'segment').map((i) => i.ticks || 0));
    const k = [1, 2, 3].find((n) => !used.has(n)) ?? 1;
    scene.items.push(normalItem({ id: newId('i'), type: 'ticks', a, b: p.id, ticks: k }));
    scene.items.push(normalItem({ id: newId('i'), type: 'ticks', a: p.id, b, ticks: k }));
    selection = { kind: 'point', id: p.id };
  }

  /** The perpendicular from point p to a line: its foot, the line to it, and a right angle. */
  function addPerpendicular(p, line) {
    const foot = normalPoint({ id: newId('p'), name: nextName(), x: 0, y: 0, dep: { kind: 'foot', p, a: line.a, b: line.b } });
    scene.points.push(foot);
    resolvePoints(scene);
    const P = findPoint(p);
    if (Math.hypot(P.x - foot.x, P.y - foot.y) < 1e-6) {
      scene.points.pop();
      return flash('That point is on the line.');
    }
    const segId = addSegment(p, foot.id);
    findItem(segId).style = 'dashed';
    // the right angle sits on the side of the foot with more of the line
    const A = findPoint(line.a);
    const B = findPoint(line.b);
    const dA = Math.hypot(A.x - foot.x, A.y - foot.y);
    const dB = Math.hypot(B.x - foot.x, B.y - foot.y);
    const far = dA >= dB ? line.a : line.b;
    // a foot beyond the end of the line: extend the line to it, dashed
    const L = Math.hypot(B.x - A.x, B.y - A.y);
    if (Math.max(dA, dB) > L + 1e-6) {
      const ext = addSegment(dA < dB ? line.a : line.b, foot.id);
      findItem(ext).style = 'dashed';
    }
    scene.items.push(normalItem({ id: newId('i'), type: 'right', v: foot.id, a: far, b: p }));
    selection = { kind: 'point', id: foot.id };
  }

  /** A ray from a through b: a hidden end point past b, joined to a with an arrowhead. */
  function addRay(a, b) {
    const end = normalPoint({ id: newId('p'), name: `${findPoint(a).name}${findPoint(b).name}_r`.replace(/[^A-Za-z0-9_']/g, ''), x: 0, y: 0, hidden: true, dep: { kind: 'ray', a, b, ext: 1.2 } });
    // keep the name unique
    while (scene.points.some((q) => q.name === end.name)) end.name += "'";
    scene.points.push(end);
    resolvePoints(scene);
    const it = normalItem({ id: newId('i'), type: 'segment', a, b: end.id, label: '', tip: 'b' });
    scene.items.push(it);
    selection = { kind: 'item', id: it.id };
  }
  /** A North line: a hidden point straight above p, a dashed arrow up to it, and N at the top. */
  function addNorth(p) {
    const dup = scene.points.find((q) => q.dep?.kind === 'north' && q.dep.a === p);
    if (dup) {
      const it = scene.items.find((i) => i.type === 'segment' && i.b === dup.id);
      selection = it ? { kind: 'item', id: it.id } : null;
      return;
    }
    const top = normalPoint({ id: newId('p'), name: `${findPoint(p).name}_N`.replace(/[^A-Za-z0-9_']/g, ''), x: 0, y: 0, hidden: true, dep: { kind: 'north', a: p, len: 2.5 } });
    while (scene.points.some((q) => q.name === top.name)) top.name += "'";
    scene.points.push(top);
    resolvePoints(scene);
    const it = normalItem({ id: newId('i'), type: 'segment', a: p, b: top.id, label: '', style: 'dashed', tip: 'b', endMode: 'custom', endText: '\\mathbf{N}' });
    scene.items.push(it);
    selection = { kind: 'item', id: it.id };
  }
  /** The North line a segment draws, if it is one. */
  function northOf(it) {
    const e = it?.type === 'segment' ? findPoint(it.b) : null;
    return e?.dep?.kind === 'north' && e.dep.a === it.a ? e.dep : null;
  }

  /** The ray a segment draws, if it is one: its end point's construction. */
  function rayOf(it) {
    const e = it?.type === 'segment' ? findPoint(it.b) : null;
    return e?.dep?.kind === 'ray' && e.dep.a === it.a ? e.dep : null;
  }

  /** A network edge: repeats are allowed (they curve apart), a === b is a loop. */
  function addEdge(a, b, directed) {
    const it = normalItem({ id: newId('i'), type: 'segment', a, b, label: '', arrows: directed ? 1 : 0, bend: a === b ? 0 : nextBend(scene, a, b) });
    if (a === b) {
      // a second loop at the same vertex points another way
      const loops = scene.items.filter((i) => i.type === 'segment' && i.a === a && i.b === a).length;
      if (loops) it.loopDir = (loopAutoDirFor(a) + 90 * loops) % 360;
    }
    scene.items.push(it);
    selection = { kind: 'item', id: it.id };
    return it.id;
  }
  const loopAutoDirFor = (v) => {
    const first = scene.items.find((i) => i.type === 'segment' && i.a === v && i.b === v);
    return edgeShape(first, pointMap(scene), scene).dir;
  };

  function addSegment(a, b) {
    const dup = scene.items.find((i) => i.type === 'segment' && ((i.a === a && i.b === b) || (i.a === b && i.b === a)));
    if (dup) return dup.id;
    const it = normalItem({ id: newId('i'), type: 'segment', a, b, label: null });
    scene.items.push(it);
    selection = { kind: 'item', id: it.id };
    return it.id;
  }

  /** A smooth curve through the clicked points. */
  function finishCurve() {
    if (pending.length >= 2) {
      begin();
      const it = normalItem({ id: newId('i'), type: 'curve', pts: [...pending], dirs: pending.map(() => null) });
      scene.items.push(it);
      selection = { kind: 'item', id: it.id };
    }
    clearPending();
    commit();
    showProps();
  }

  /** A measurement line for a to b, set apart from the drawing (away from its middle). */
  function addMeasure(a, b, d = null) {
    const A = findPoint(a);
    const B = findPoint(b);
    if (d === null) {
      const c = centroidOf();
      const nx = -(B.y - A.y);
      const ny = B.x - A.x;
      const side = nx * (c.x - (A.x + B.x) / 2) + ny * (c.y - (A.y + B.y) / 2) > 0 ? -1 : 1;
      d = 0.7 * side;
    }
    const mk = (p) => {
      const q = normalPoint({ id: newId('p'), name: `${A.name}${B.name}_${p === a ? 1 : 2}`.replace(/[^A-Za-z0-9_']/g, ''), x: 0, y: 0, hidden: true, dep: { kind: 'offset', p, a, b, d } });
      while (scene.points.some((o) => o.name === q.name)) q.name += "'";
      scene.points.push(q);
      return q.id;
    };
    const e1 = mk(a);
    const e2 = mk(b);
    resolvePoints(scene);
    const it = normalItem({ id: newId('i'), type: 'segment', a: e1, b: e2, label: null, style: 'dashed', tip: 'both', gap: true, bars: true });
    scene.items.push(it);
    selection = { kind: 'item', id: it.id };
  }
  const centroidOf = () => {
    const ps = scene.points.filter((p) => !p.hidden);
    return ps.length ? { x: ps.reduce((t, p) => t + p.x, 0) / ps.length, y: ps.reduce((t, p) => t + p.y, 0) / ps.length } : { x: 0, y: 0 };
  };
  /** The measurement a line is, if it is one: its two set-apart ends. */
  function measureOf(it) {
    const e1 = it?.type === 'segment' ? findPoint(it.a) : null;
    const e2 = it?.type === 'segment' ? findPoint(it.b) : null;
    return e1?.dep?.kind === 'offset' && e2?.dep?.kind === 'offset' ? [e1.dep, e2.dep] : null;
  }

  function finishPolygon(closed) {
    if (pending.length < 2) {
      clearPending();
      commit();
      return;
    }
    begin();
    const ids = [...pending];
    // a side along a curve already there keeps the curve (the shading follows it)
    const curved = (a, b) =>
      scene.items.some((c) => c.type === 'curve' && ((c.pts[0] === a && c.pts[c.pts.length - 1] === b) || (c.pts[0] === b && c.pts[c.pts.length - 1] === a)));
    for (let i = 0; i < ids.length - 1; i++) if (!curved(ids[i], ids[i + 1])) addSegment(ids[i], ids[i + 1]);
    if (closed) {
      if (!curved(ids[ids.length - 1], ids[0])) addSegment(ids[ids.length - 1], ids[0]);
      const it = normalItem({ id: newId('i'), type: 'polygon', pts: ids, fill: 'none' });
      scene.items.push(it);
      selection = { kind: 'item', id: it.id };
    }
    clearPending();
    commit();
    showProps();
  }

  function select(sel) {
    selection = validSelection(sel);
    render();
    showProps();
  }

  function deleteSelection() {
    if (!selection) return;
    change(() => {
      if (selection.kind === 'point') {
        const gone = dependentsOf(scene, selection.id).add(selection.id);
        scene.points = scene.points.filter((p) => !gone.has(p.id));
        scene.items = scene.items.filter(
          (i) => i.type === 'text' || ![i.a, i.b, i.v, i.c, i.p, ...(i.pts || [])].some((x) => gone.has(x))
        );
      } else {
        scene.items = scene.items.filter((i) => i.id !== selection.id);
      }
      selection = null;
    });
    showProps();
  }

  let flashTimer = null;
  function flash(msg) {
    hint.textContent = msg;
    hint.classList.add('is-flash');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      hint.classList.remove('is-flash');
      hint.textContent = toolHint(tool);
    }, 2500);
  }

  // ---------------------------------------------------------------- pointer
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    svg.focus({ preventScroll: true });
    const target = hitTarget(e);
    const raw = toScene(e);
    if (tool !== 'select') {
      onClickTool(e);
      return;
    }
    svg.setPointerCapture(e.pointerId);
    if (target?.part === 'label') {
      drag = { type: 'label', target, moved: false };
      begin();
    } else if (target?.kind === 'point') {
      select({ kind: 'point', id: target.id });
      if (findPoint(target.id).dep) {
        flash('This point is constructed, so it moves with the points it\u2019s made from. Use \u201cMake it free\u201d to move it yourself.');
        return;
      }
      drag = { type: 'point', id: target.id, moved: false, exclude: dependentsOf(scene, target.id).add(target.id) };
      begin();
    } else if (target?.kind === 'item' && findItem(target.id)?.type === 'text') {
      const it = findItem(target.id);
      drag = { type: 'text', id: it.id, dx: it.x - raw.x, dy: it.y - raw.y, moved: false };
      begin();
      select({ kind: 'item', id: it.id });
    } else if (target) {
      select({ kind: target.kind, id: target.id });
    } else {
      drag = { type: 'pan', x0: e.clientX, y0: e.clientY, view: { ...view() }, moved: false };
      if (selection) select(null);
    }
  });

  svg.addEventListener('pointermove', (e) => {
    const raw = toScene(e);
    if (drag) {
      drag.moved = true;
      if (drag.type === 'point') {
        const s = snap(raw, { exclude: drag.exclude, lines: false });
        const p = findPoint(drag.id);
        p.x = round(s.point ? raw.x : s.x);
        p.y = round(s.point ? raw.y : s.y);
        if (!scene.settings.snap) [p.x, p.y] = [round(raw.x), round(raw.y)];
        render();
        updatePointFields();
      } else if (drag.type === 'text') {
        const it = findItem(drag.id);
        const s = snap({ x: raw.x + drag.dx, y: raw.y + drag.dy }, { lines: false });
        it.x = round(s.point ? raw.x + drag.dx : s.x);
        it.y = round(s.point ? raw.y + drag.dy : s.y);
        render();
      } else if (drag.type === 'label') {
        moveLabel(drag.target, raw);
        render();
      } else if (drag.type === 'pan') {
        const k = pxPerCm();
        const v = scene.settings.view;
        v.x0 = round(drag.view.x0 - (e.clientX - drag.x0) / k);
        v.y0 = round(drag.view.y0 + (e.clientY - drag.y0) / k);
        render();
      }
      return;
    }
    if (tool !== 'select') {
      hover = snap(raw, { lines: !['angle', 'right', 'label', 'text', 'midpoint', 'perp'].includes(tool) });
      render();
    }
  });

  svg.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.type === 'pan') return; // the view is saved with the drawing but isn't an edit
    if (d.moved) commit();
    else before = null;
    if (d.type === 'label' && !d.moved) select({ kind: d.target.kind, id: d.target.id });
  });

  svg.addEventListener('pointerleave', () => {
    hover = null;
    if (!drag) render();
  });
  svg.addEventListener('dblclick', () => {
    if (tool === 'polygon' && pending.length >= 2) finishPolygon(false);
    if (tool === 'curve' && pending.length >= 2) finishCurve();
  });

  /** Drag a label: store its offset from its anchor (cm). */
  function moveLabel(target, raw) {
    const pts = pointMap(scene);
    if (target.kind === 'point') {
      const p = findPoint(target.id);
      p.label = { dx: round(raw.x - p.x), dy: round(raw.y - p.y) };
      return;
    }
    const it = findItem(target.id);
    if (it.type === 'segment') {
      const a = pts.get(it.a);
      const b = pts.get(it.b);
      const m = segmentMid(it, pts, scene);
      it.labelPos = { dx: round(raw.x - m.x), dy: round(raw.y - m.y) };
    } else if (it.type === 'angle') {
      const v = pts.get(it.v);
      it.labelPos = { dx: round(raw.x - v.x), dy: round(raw.y - v.y) };
    }
  }

  function zoom(f) {
    const v = scene.settings.view;
    const cx = v.x0 + v.w / 2;
    const cy = v.y0 + v.h / 2;
    v.w = round(Math.min(80, Math.max(3, v.w * f)));
    v.h = round(Math.min(60, Math.max(2, v.h * f)));
    v.x0 = round(cx - v.w / 2);
    v.y0 = round(cy - v.h / 2);
    render();
  }

  function fit() {
    const xs = [];
    const ys = [];
    for (const p of scene.points) {
      xs.push(p.x);
      ys.push(p.y);
    }
    for (const it of scene.items) {
      if (it.type === 'text') {
        xs.push(it.x);
        ys.push(it.y);
      }
      if (it.type === 'circle') {
        const c = findPoint(it.c);
        const q = findPoint(it.p);
        if (c && q) {
          const r = Math.hypot(q.x - c.x, q.y - c.y);
          xs.push(c.x - r, c.x + r);
          ys.push(c.y - r, c.y + r);
        }
      }
    }
    if (!xs.length) return;
    const pad = 1.2;
    const v = scene.settings.view;
    const w = Math.max(...xs) - Math.min(...xs) + 2 * pad;
    const h = Math.max(...ys) - Math.min(...ys) + 2 * pad;
    const aspect = v.w / v.h;
    v.w = round(Math.max(w, h * aspect));
    v.h = round(v.w / aspect);
    v.x0 = round((Math.min(...xs) + Math.max(...xs)) / 2 - v.w / 2);
    v.y0 = round((Math.min(...ys) + Math.max(...ys)) / 2 - v.h / 2);
    render();
  }

  // ---------------------------------------------------------------- keys
  function onKey(e) {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if (inField || !container.isConnected) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) doRedo();
      else doUndo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      doRedo();
      return;
    }
    if (mod || e.altKey) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selection) {
        e.preventDefault();
        deleteSelection();
      }
      return;
    }
    if (e.key === 'Escape') {
      if (pending.length) {
        if (['segment', 'directed', 'ray', 'circle', 'arc'].includes(tool)) commit();
        clearPending();
        render();
      } else select(null);
      return;
    }
    if (e.key === 'Enter' && tool === 'polygon') {
      finishPolygon(false);
      return;
    }
    if (e.key === 'Enter' && tool === 'curve') {
      finishCurve();
      return;
    }
    // tool shortcuts only while the canvas has focus
    if (document.activeElement !== svg) return;
    const t = TOOLS.find((x) => x.key === e.key.toLowerCase() && !toolButtons.get(x.id).hidden);
    if (t) setTool(t.id);
  }
  window.addEventListener('keydown', onKey);

  // ---------------------------------------------------------------- drawing the canvas
  function render() {
    resolvePoints(scene);
    const v = view();
    const W = v.w * PX;
    const H = v.h * PX;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const pts = pointMap(scene);
    const placed = labelPositions(scene, pts);
    const parts = [];
    const sel = (kind, id) => selection && selection.kind === kind && selection.id === id;
    const pendingSet = new Set(pending.map((q) => (typeof q === 'object' ? q.id : q)));

    // grid
    if (scene.settings.showGrid) {
      const g = scene.settings.grid;
      const lines = [];
      for (let x = Math.ceil(v.x0 / g) * g; x <= v.x0 + v.w; x += g) {
        const major = Math.abs(x / 1 - Math.round(x)) < 1e-9;
        lines.push(`<line x1="${sx(x)}" y1="0" x2="${sx(x)}" y2="${H}" class="${major ? 'grid-major' : 'grid'}"/>`);
      }
      for (let y = Math.ceil(v.y0 / g) * g; y <= v.y0 + v.h; y += g) {
        const major = Math.abs(y - Math.round(y)) < 1e-9;
        lines.push(`<line x1="0" y1="${sy(y)}" x2="${W}" y2="${sy(y)}" class="${major ? 'grid-major' : 'grid'}"/>`);
      }
      parts.push(`<g>${lines.join('')}</g>`);
    }

    // shading
    for (const it of scene.items.filter((i) => i.type === 'polygon')) {
      const ps = it.pts.map((id) => pts.get(id)).filter(Boolean);
      if (ps.length < 3) continue;
      const fill = {
        'gray!15': '#e2e2e2',
        'gray!30': '#c8c8c8',
        'gray!50': '#a3a3a3',
        dots: 'url(#geo-dots)',
        'dots-sparse': 'url(#geo-dots-sparse)',
        hatch: 'url(#geo-hatch)',
      }[it.fill];
      let d = `M ${sx(ps[0].x)} ${sy(ps[0].y)}`;
      for (const e of polygonEdges(scene, it, pts)) {
        const q = pts.get(e.b);
        if (!e.sections) d += ` L ${sx(q.x)} ${sy(q.y)}`;
        else for (const sec of e.sections) d += ` C ${sx(sec.c1.x)} ${sy(sec.c1.y)} ${sx(sec.c2.x)} ${sy(sec.c2.y)} ${sx(sec.p.x)} ${sy(sec.p.y)}`;
      }
      parts.push(`<path data-kind="item" data-id="${it.id}" d="${d} Z" class="poly${sel('item', it.id) ? ' is-sel' : ''}" style="fill:${fill || 'transparent'}"/>`);
    }

    // circles and arcs
    for (const it of scene.items.filter((i) => i.type === 'circle' || i.type === 'arc')) {
      const c = pts.get(it.c);
      const a = pts.get(it.type === 'circle' ? it.p : it.a);
      if (!c || !a) continue;
      const r = Math.hypot(a.x - c.x, a.y - c.y) * PX;
      const cls = `shape ls-${it.style}${sel('item', it.id) ? ' is-sel' : ''}`;
      if (it.type === 'circle') {
        parts.push(`<circle data-kind="item" data-id="${it.id}" cx="${sx(c.x)}" cy="${sy(c.y)}" r="${r}" class="${cls}"/>`);
        parts.push(`<circle data-kind="item" data-id="${it.id}" cx="${sx(c.x)}" cy="${sy(c.y)}" r="${r}" class="hit"/>`);
      } else {
        const b = pts.get(it.b);
        if (!b) continue;
        const s = (dirDeg(c, a) * Math.PI) / 180;
        let e = (dirDeg(c, b) * Math.PI) / 180;
        if (e <= s) e += 2 * Math.PI;
        const large = e - s > Math.PI ? 1 : 0;
        const d = `M ${sx(c.x) + r * Math.cos(s)} ${sy(c.y) - r * Math.sin(s)} A ${r} ${r} 0 ${large} 0 ${sx(c.x) + r * Math.cos(e)} ${sy(c.y) - r * Math.sin(e)}`;
        parts.push(`<path data-kind="item" data-id="${it.id}" d="${d}" class="${cls}"/>`);
        parts.push(`<path data-kind="item" data-id="${it.id}" d="${d}" class="hit"/>`);
      }
    }

    // smooth curves
    for (const it of scene.items.filter((i) => i.type === 'curve')) {
      const cs = curveSections(it, pts);
      if (!cs) continue;
      let d = `M ${sx(cs.start.x)} ${sy(cs.start.y)}`;
      for (const sec of cs.sections) d += ` C ${sx(sec.c1.x)} ${sy(sec.c1.y)} ${sx(sec.c2.x)} ${sy(sec.c2.y)} ${sx(sec.p.x)} ${sy(sec.p.y)}`;
      const cls = `shape ls-${it.style}${sel('item', it.id) ? ' is-sel' : ''}`;
      parts.push(`<path d="${d}" class="${cls}"/><path data-kind="item" data-id="${it.id}" d="${d}" class="hit"/>`);
    }

    // segments
    for (const it of scene.items.filter((i) => i.type === 'segment')) {
      const a = pts.get(it.a);
      const b = pts.get(it.b);
      if (!a || !b) continue;
      const cls = `shape ls-${it.style}${sel('item', it.id) || pendingSet.has(it.id) ? ' is-sel' : ''}`;
      const sh = edgeShape(it, pts, scene);
      const S2 = (q) => `${sx(q.x)} ${sy(q.y)}`;
      const d = sh.kind === 'line' ? `M ${S2(a)} L ${S2(b)}` : `M ${S2(sh.a)} C ${S2(sh.c1)} ${S2(sh.c2)} ${S2(sh.b)}`;
      const gap = labelGap(it, pts, segmentText(it, pts, scene.settings));
      if (gap) {
        // broken around its label
        const at = (t) => S2({ x: a.x + ((b.x - a.x) * t) / gap.L, y: a.y + ((b.y - a.y) * t) / gap.L });
        parts.push(`<path d="M ${S2(a)} L ${at(gap.from)} M ${at(gap.to)} L ${S2(b)}" class="${cls}"/>`);
      } else parts.push(`<path d="${d}" class="${cls}"/>`);
      if (it.bars && it.a !== it.b) {
        const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = (-(b.y - a.y) / L) * 0.15;
        const ny = ((b.x - a.x) / L) * 0.15;
        for (const P of [a, b]) parts.push(`<path d="M ${S2({ x: P.x + nx, y: P.y + ny })} L ${S2({ x: P.x - nx, y: P.y - ny })}" class="${cls.replace(/ ls-\w+/, '')}"/>`);
      }
      // arrowheads at the ends (along the curve's ends)
      for (const [end, from] of [[b, sh.kind === 'line' ? a : sh.c2], [a, sh.kind === 'line' ? b : sh.c1]]) {
        const want = end === b ? ['b', 'both'] : ['a', 'both'];
        if (!want.includes(it.tip)) continue;
        const ex = sx(end.x);
        const ey = sy(end.y);
        const L = Math.hypot(sx(end.x) - sx(from.x), sy(end.y) - sy(from.y)) || 1;
        const ux = (ex - sx(from.x)) / L;
        const uy = (ey - sy(from.y)) / L;
        parts.push(
          `<path d="M ${ex} ${ey} L ${ex - ux * 9 - uy * 3.5} ${ey - uy * 9 + ux * 3.5} L ${ex - ux * 9 + uy * 3.5} ${ey - uy * 9 - ux * 3.5} Z" class="arrow-tip${sel('item', it.id) ? ' is-sel' : ''}"/>`
        );
      }
      // marks at the middle, along the line or curve
      const mid = shapeAt(sh, 0.5);
      const tan = shapeTangent(sh);
      const mx = sx(mid.x);
      const my = sy(mid.y);
      const ang = (Math.atan2(-tan.y, tan.x) * 180) / Math.PI;
      // as in the TikZ (pt), drawn about twice as big
      const off = markOffsets(it);
      const marks = [
        ...off.ticks.map((o) => `<line x1="${2 * o}" y1="-6" x2="${2 * o}" y2="6"/>`),
        ...off.arrows.map((o) => `<path d="M ${2 * o - 4} -4 L ${2 * o + 4} 0 L ${2 * o - 4} 4"/>`),
      ];
      if (marks.length) parts.push(`<g class="marks" transform="translate(${mx} ${my}) rotate(${ang})">${marks.join('')}</g>`);
      parts.push(`<path data-kind="item" data-id="${it.id}" d="${d}" class="hit"/>`);
    }

    // equal-length marks on their own
    for (const it of scene.items.filter((i) => i.type === 'ticks')) {
      const a = pts.get(it.a);
      const b = pts.get(it.b);
      if (!a || !b) continue;
      const mx = (sx(a.x) + sx(b.x)) / 2;
      const my = (sy(a.y) + sy(b.y)) / 2;
      const ang = (Math.atan2(sy(b.y) - sy(a.y), sx(b.x) - sx(a.x)) * 180) / Math.PI;
      const marks = markOffsets({ ticks: it.ticks }).ticks.map((o) => `<line x1="${2 * o}" y1="-6" x2="${2 * o}" y2="6"/>`);
      parts.push(
        `<g class="marks${sel('item', it.id) ? ' is-sel' : ''}" transform="translate(${mx} ${my}) rotate(${ang})">${marks.join('')}</g>`,
        `<circle data-kind="item" data-id="${it.id}" cx="${mx}" cy="${my}" r="9" class="hit-fill"/>`
      );
    }

    // angles
    for (const it of scene.items.filter((i) => i.type === 'angle' || i.type === 'right')) {
      const v0 = pts.get(it.v);
      const A = pts.get(it.a);
      const B = pts.get(it.b);
      if (!v0 || !A || !B) continue;
      const cls = `shape${sel('item', it.id) ? ' is-sel' : ''}`;
      const sp = angleSpan(v0, A, B, it.type === 'angle' && it.reflex);
      const cx = sx(v0.x);
      const cy = sy(v0.y);
      if (it.type === 'right') {
        // like TikZ: along each arm, so it slants when the arms aren't at 90°
        const s = (it.size ?? 0.25) * PX;
        const u = (sp.start * Math.PI) / 180;
        const w = ((sp.start + sp.size) * Math.PI) / 180;
        const p1 = [cx + s * Math.cos(u), cy - s * Math.sin(u)];
        const p2 = [p1[0] + s * Math.cos(w), p1[1] - s * Math.sin(w)];
        const p3 = [cx + s * Math.cos(w), cy - s * Math.sin(w)];
        const d = `M ${p1} L ${p2} L ${p3}`;
        parts.push(`<path d="${d}" class="${cls}"/><path data-kind="item" data-id="${it.id}" d="M ${cx} ${cy} L ${p1} L ${p2} L ${p3} Z" class="hit-fill"/>`);
        continue;
      }
      const s = (sp.start * Math.PI) / 180;
      const e = ((sp.start + sp.size) * Math.PI) / 180;
      for (let k = 0; k < (it.arcs || 1); k++) {
        const r = ((it.radius ?? 0.7) + k * 0.08) * PX;
        const large = sp.size > 180 ? 1 : 0;
        const d = `M ${cx + r * Math.cos(s)} ${cy - r * Math.sin(s)} A ${r} ${r} 0 ${large} 0 ${cx + r * Math.cos(e)} ${cy - r * Math.sin(e)}`;
        parts.push(`<path d="${d}" class="${cls}"/>`);
      }
      if (it.arrow === it.a || it.arrow === it.b) {
        // which end of the arc: the start arm is a when sp.first is 'a'
        const atStart = (it.arrow === it.a) === (sp.first === 'a');
        const r = ((it.radius ?? 0.7) + ((it.arcs || 1) - 1) * 0.08) * PX;
        const g = atStart ? s : e;
        const tx = cx + r * Math.cos(g);
        const ty = cy - r * Math.sin(g);
        // tangent, pointing along the arc towards the tip (screen y is down)
        const dir = atStart ? -1 : 1;
        const vx = -Math.sin(g) * dir;
        const vy = -Math.cos(g) * dir;
        const L = 8;
        const W = 3.2;
        parts.push(
          `<path d="M ${tx} ${ty} L ${tx - vx * L - vy * W} ${ty - vy * L + vx * W} L ${tx - vx * L + vy * W} ${ty - vy * L - vx * W} Z" class="arrow-tip${sel('item', it.id) ? ' is-sel' : ''}"/>`
        );
      }
      const r = (it.radius ?? 0.7) * PX;
      const large = sp.size > 180 ? 1 : 0;
      parts.push(
        `<path data-kind="item" data-id="${it.id}" d="M ${cx} ${cy} L ${cx + r * Math.cos(s)} ${cy - r * Math.sin(s)} A ${r} ${r} 0 ${large} 0 ${cx + r * Math.cos(e)} ${cy - r * Math.sin(e)} Z" class="hit-fill"/>`
      );
      const text = angleText(it, pts);
      if (text) {
        const off = placed.get(`a:${it.id}`) ?? angleLabelOffset(it, pts);
        parts.push(labelSvg('item', it.id, v0.x + off.dx, v0.y + off.dy, display(text), false, sel('item', it.id), 0, it.bg));
      }
    }

    // side labels
    for (const it of scene.items.filter((i) => i.type === 'segment')) {
      const a = pts.get(it.a);
      const b = pts.get(it.b);
      const text = segmentText(it, pts, scene.settings);
      if (!a || !b || !text) continue;
      const off = placed.get(`s:${it.id}`) ?? segmentLabelOffset(scene, it, pts);
      const m = segmentMid(it, pts, scene);
      const turn = it.sloped ? slopeDeg({ x: 0, y: 0 }, shapeTangent(edgeShape(it, pts, scene))) : 0;
      parts.push(labelSvg('item', it.id, m.x + off.dx, m.y + off.dy, display(text), false, sel('item', it.id), turn, it.bg));
    }

    // text beyond the ends of lines (a ray's bearing)
    for (const it of scene.items.filter((i) => i.type === 'segment')) {
      const a = pts.get(it.a);
      const b = pts.get(it.b);
      const t = a && b ? endText(it, pts) : '';
      if (!t) continue;
      const o = endOffset(it, pts, t);
      parts.push(`<text data-kind="item" data-id="${it.id}" x="${sx(b.x + o.dx)}" y="${sy(b.y + o.dy)}" class="lbl${sel('item', it.id) ? ' is-sel' : ''}" text-anchor="middle" dominant-baseline="central">${esc(display(t))}</text>`);
    }

    // text
    for (const it of scene.items.filter((i) => i.type === 'text')) {
      const lines = String(it.text || '').split(/\n|\\\\/);
      const tsp = lines
        .map((l, k) => `<tspan x="${sx(it.x)}" dy="${k === 0 ? -((lines.length - 1) * 0.6) + 'em' : '1.2em'}">${esc(display(l))}</tspan>`)
        .join('');
      parts.push(
        `<text data-kind="item" data-id="${it.id}" x="${sx(it.x)}" y="${sy(it.y)}" class="free-text${sel('item', it.id) ? ' is-sel' : ''}${it.bg ? ' has-bg' : ''}" dominant-baseline="middle" text-anchor="middle">${tsp}</text>`
      );
    }

    // point labels
    for (const p of scene.points) {
      if (p.hidden || !p.showLabel) continue;
      const off = placed.get(`p:${p.id}`) ?? pointLabelOffset(scene, p, pts);
      parts.push(labelSvg('point', p.id, p.x + off.dx, p.y + off.dy, display(p.name), !isWordName(p.name), sel('point', p.id)));
    }

    // NOT TO SCALE (as in the TikZ)
    if (scene.settings.notToScale && scene.points.length) {
      const { x, y } = notToScalePlace(scene);
      parts.push(`<text x="${sx(x)}" y="${sy(y)}" class="free-text" dominant-baseline="hanging"><tspan x="${sx(x)}">NOT TO</tspan><tspan x="${sx(x)}" dy="1.2em">SCALE</tspan></text>`);
    }

    // pending tool feedback
    if (pending.length && pendingKind !== 'segments' && hover && ['segment', 'directed', 'ray', 'polygon', 'curve', 'measure', 'circle', 'arc'].includes(tool)) {
      const last = pts.get(pending[pending.length - 1]);
      if (last) parts.push(`<line x1="${sx(last.x)}" y1="${sy(last.y)}" x2="${sx(hover.x)}" y2="${sy(hover.y)}" class="rubber"/>`);
      if (tool === 'circle' && pending.length === 1) {
        const r = Math.hypot(hover.x - last.x, hover.y - last.y) * PX;
        parts.push(`<circle cx="${sx(last.x)}" cy="${sy(last.y)}" r="${r}" class="rubber"/>`);
      }
      if ((tool === 'polygon' || tool === 'curve') && pending.length > 1) {
        const ps = pending.map((id) => pts.get(id));
        parts.push(`<polyline points="${ps.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')}" class="rubber"/>`);
      }
    }

    // points (handles on top)
    for (const p of scene.points) {
      const cls = ['pt', p.hidden ? 'is-hidden' : '', p.dot ? 'is-dot' : '', p.dep ? 'is-dep' : '', sel('point', p.id) || pendingSet.has(p.id) ? 'is-sel' : '']
        .filter(Boolean)
        .join(' ');
      parts.push(`<circle data-kind="point" data-id="${p.id}" cx="${sx(p.x)}" cy="${sy(p.y)}" r="${p.hidden ? 3 : 4.5}" class="${cls}"/>`);
    }

    // where a click would go
    if (hover && tool !== 'select' && !drag) {
      const cls = hover.point ? 'snap snap-point' : hover.segment ? 'snap snap-line' : 'snap';
      parts.push(`<circle cx="${sx(hover.x)}" cy="${sy(hover.y)}" r="${hover.point ? 8 : 4}" class="${cls}"/>`);
    }

    svg.innerHTML = CANVAS_PATTERNS + parts.join('');
    svg.dataset.tool = tool;
    svg.dataset.view = `${v.x0},${v.y0},${v.w},${v.h}`;
    undoBtn.disabled = !undo.length;
    redoBtn.disabled = !redo.length;
    delBtn.disabled = !selection;
  }

  function labelSvg(kind, id, x, y, text, italic, selected, turn = 0, bg = false) {
    const rot = turn ? ` transform="rotate(${-turn} ${sx(x)} ${sy(y)})"` : '';
    return `<text data-kind="${kind}" data-id="${id}" data-part="label" x="${sx(x)}" y="${sy(y)}"${rot} class="lbl${italic ? ' is-math' : ''}${selected ? ' is-sel' : ''}${bg ? ' has-bg' : ''}" text-anchor="middle" dominant-baseline="central">${esc(text)}</text>`;
  }

  // ---------------------------------------------------------------- properties panel
  let propInputs = new Map();

  function field(label, input, key) {
    const w = el('label', 'geo-field');
    const span = el('span');
    span.textContent = label;
    w.append(span, input);
    if (key) propInputs.set(key, input);
    return w;
  }
  function textInput(value, onInput, { multiline = false, placeholder = '' } = {}) {
    const i = el(multiline ? 'textarea' : 'input');
    if (!multiline) i.type = 'text';
    else i.rows = 2;
    i.value = value ?? '';
    i.placeholder = placeholder;
    i.addEventListener('focus', begin);
    i.addEventListener('input', () => {
      begin();
      onInput(i.value);
      render();
      onChange();
    });
    i.addEventListener('change', commit);
    return i;
  }
  function numberInput(value, step, onSet) {
    const i = el('input');
    i.type = 'number';
    i.step = step;
    i.value = value;
    i.addEventListener('change', () => {
      const v = Number(i.value);
      if (!isFinite(v)) return;
      change(() => onSet(v));
    });
    return i;
  }
  function selectInput(options, value, onSet) {
    const s = el('select');
    for (const [v, t] of options) {
      const o = el('option');
      o.value = v;
      o.textContent = t;
      s.append(o);
    }
    s.value = String(value);
    s.addEventListener('change', () => change(() => onSet(s.value)));
    return s;
  }
  function checkbox(label, value, onSet) {
    const w = el('label', 'geo-check');
    const c = el('input');
    c.type = 'checkbox';
    c.checked = !!value;
    c.addEventListener('change', () => change(() => onSet(c.checked)));
    w.append(c, document.createTextNode(` ${label}`));
    return w;
  }
  function actionButton(text, fn) {
    const b = el('button', 'geo-small');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  }
  function row(...kids) {
    const r = el('div', 'geo-row');
    r.append(...kids);
    return r;
  }

  function showProps() {
    propInputs = new Map();
    props.replaceChildren();
    const h = el('div', 'geo-props-title');
    props.append(h);
    if (!selection) {
      h.textContent = 'Drawing';
      const S = scene.settings;
      props.append(
        row(
          field('Grid', selectInput([[0.25, '0.25 cm'], [0.5, '0.5 cm'], [1, '1 cm']], S.grid, (v) => (S.grid = Number(v)))),
          field('Line width', selectInput(WIDTHS.map((w) => [w, w]), S.lineWidth, (v) => (S.lineWidth = v))),
          field('Font size', selectInput([['', 'Normal'], ['\\small', 'Small'], ['\\footnotesize', 'Smaller'], ['\\large', 'Large']], S.fontSize, (v) => (S.fontSize = v)))
        ),
        row(
          checkbox('Snap to grid', S.snap, (v) => (S.snap = v)),
          checkbox('Show grid', S.showGrid, (v) => (S.showGrid = v)),
          checkbox('NOT TO SCALE', S.notToScale, (v) => (S.notToScale = v))
        ),
        row(
          field('New points start at', letterInput()),
          isNet() ? el('span') : field('Lengths shown to', selectInput([[0, 'Whole numbers'], [1, '1 decimal place'], [2, '2 decimal places']], S.lengthDecimals, (v) => (S.lengthDecimals = Number(v)))),
          isNet() ? el('span') : field('Units', unitInput()),
          field(
            'Scale on the page',
            selectInput(
              [[1, '1 cm a unit'], [0.75, '× 0.75'], [0.5, '× 0.5'], [0.4, '× 0.4'], [0.25, '× 0.25'], [0.2, '× 0.2'], [0.1, '× 0.1']],
              S.scale ?? 1,
              (v) => (S.scale = Number(v))
            )
          )
        )
      );
      if (isNet()) {
        props.append(edgeListBox());
        return;
      }
      const p = el('p', 'geo-note');
      p.textContent =
        'Each point is a named \\coordinate at the top of the TikZ code. Edit its numbers there and click outside the code box to move it here too.';
      props.append(p);
      return;
    }
    if (selection.kind === 'point') {
      const p = findPoint(selection.id);
      h.textContent = `Point ${p.name}`;
      if (p.dep) {
        const pts = pointMap(scene);
        const nm = (id) => pts.get(id)?.name ?? '?';
        h.textContent +=
          p.dep.kind === 'mid'
            ? ` \u2014 midpoint of ${nm(p.dep.a)}${nm(p.dep.b)}`
            : p.dep.kind === 'north'
              ? ` \u2014 the top of the North line at ${nm(p.dep.a)}`
              : p.dep.kind === 'ray'
              ? ` \u2014 the end of the ray from ${nm(p.dep.a)} through ${nm(p.dep.b)}`
              : ` \u2014 foot of the perpendicular from ${nm(p.dep.p)} to ${nm(p.dep.a)}${nm(p.dep.b)}`;
        props.append(
          row(
            field('Name', textInput(p.name, (v) => (p.name = v.trim())), 'name'),
            checkbox('Show its name', p.showLabel, (v) => (p.showLabel = v)),
            checkbox('Dot', p.dot, (v) => (p.dot = v)),
            checkbox('Hidden (helper point)', p.hidden, (v) => (p.hidden = v))
          ),
          row(
            actionButton('Make it free', () => change(() => delete p.dep)),
            actionButton('Reset label position', () => change(() => (p.label = null))),
            actionButton('Delete point', deleteSelection)
          )
        );
        return;
      }
      props.append(
        row(
          field('Name', textInput(p.name, (v) => (p.name = v.trim())), 'name'),
          field('x', numberInput(p.x, scene.settings.grid, (v) => (p.x = v)), 'x'),
          field('y', numberInput(p.y, scene.settings.grid, (v) => (p.y = v)), 'y')
        ),
        row(
          checkbox('Show its name', p.showLabel, (v) => (p.showLabel = v)),
          checkbox('Dot', p.dot, (v) => (p.dot = v)),
          checkbox('Hidden (helper point)', p.hidden, (v) => (p.hidden = v))
        ),
        row(actionButton('Reset label position', () => change(() => (p.label = null))), actionButton('Delete point', deleteSelection))
      );
      return;
    }
    const it = findItem(selection.id);
    const pts = pointMap(scene);
    const nm = (id) => pts.get(id)?.name ?? '?';
    const del = actionButton('Delete', deleteSelection);
    if (it.type === 'segment') {
      if (isNet() && !rayOf(it) && !northOf(it)) {
        edgeProps(it, h, nm, del);
        return;
      }
      const north = northOf(it);
      const ray = rayOf(it) || north; // neither has a length worth labelling
      h.textContent = north ? `North line at ${nm(north.a)}` : ray ? `Ray from ${nm(ray.a)} through ${nm(ray.b)}` : `Line ${nm(it.a)}${nm(it.b)}`;
      const measured = segmentText({ ...it, label: null }, pts, scene.settings);
      // a ray goes on for ever, so it has no length to show
      const mode = it.label === null || it.label === undefined ? (ray ? 'none' : 'measured') : it.label === '' ? 'none' : 'custom';
      const labelBox = textInput(mode === 'custom' ? it.label : '', (v) => (it.label = v), { placeholder: 'e.g. 81 or x' });
      const labelModes = ray ? [['custom', 'My own'], ['none', 'None']] : [['measured', `Its length (${measured})`], ['custom', 'My own'], ['none', 'None']];
      props.append(
        row(
          field(
            'Label',
            selectInput(labelModes, mode, (v) => {
              it.label = v === 'measured' ? null : v === 'none' ? '' : ray ? 'x' : measured;
              queueMicrotask(() => {
                showProps();
                if (v === 'custom') focusProp('label');
              });
            })
          ),
          mode === 'custom' ? field('Text', labelBox, 'label') : el('span'),
          field('Style', selectInput(LINE_STYLES, it.style, (v) => (it.style = v)))
        ),
        north ? row(field('Length (cm)', numberInput(north.len ?? 2.5, 0.25, (v) => (north.len = Math.max(0.5, v))))) : ray ? rayRow(it, ray) : el('span'),
        north ? row(field('Label at the top', textInput(it.endText, (v) => (it.endText = v), { placeholder: '\\mathbf{N}' }))) : ray ? endRow(it) : el('span'),
        row(
          field(
            'Arrowheads',
            selectInput([['none', 'None'], ['b', ray ? 'At the far end' : `At ${nm(it.b)}`], ['a', `At ${nm(it.a)}`], ['both', 'Both ends']], it.tip || 'none', (v) => (it.tip = v))
          ),
          checkbox('Label along the line', it.sloped, (v) => (it.sloped = v)),
          checkbox('White background', it.bg, (v) => (it.bg = v))
        ),
        row(
          checkbox('Label in a gap in the line', it.gap, (v) => (it.gap = v)),
          checkbox('Bars across the ends', it.bars, (v) => (it.bars = v)),
          measureOf(it)
            ? field('Distance from the shape (cm)', numberInput(Math.abs(measureOf(it)[0].d ?? 0.7), 0.1, (v) => {
                const sign = (measureOf(it)[0].d ?? 0.7) < 0 ? -1 : 1;
                for (const d of measureOf(it)) d.d = sign * Math.max(0, v);
              }))
            : el('span'),
          measureOf(it) ? actionButton('Other side', () => change(() => measureOf(it).forEach((d) => (d.d = -(d.d ?? 0.7))))) : el('span')
        ),
        row(
          field('Equal-length ticks', selectInput([[0, 'None'], [1, '|'], [2, '||'], [3, '|||']], it.ticks, (v) => (it.ticks = Number(v)))),
          field('Parallel arrows', selectInput([[0, 'None'], [1, '>'], [2, '>>'], [3, '>>>']], it.arrows, (v) => (it.arrows = Number(v))))
        ),
        row(actionButton('Reset label position', () => change(() => (it.labelPos = null))), del)
      );
    } else if (it.type === 'polygon') {
      h.textContent = `Polygon ${it.pts.map(nm).join('')}`;
      props.append(row(field('Shading', selectInput(FILLS, it.fill, (v) => (it.fill = v))), del));
    } else if (it.type === 'angle') {
      const measured = Math.round(angleSpan(pts.get(it.v), pts.get(it.a), pts.get(it.b), it.reflex).size);
      h.textContent = `Angle ${nm(it.a)}${nm(it.v)}${nm(it.b)} (${measured}°)`;
      const mode = it.label === null || it.label === undefined ? 'measured' : it.label === '' ? 'none' : 'custom';
      const labelBox = textInput(mode === 'custom' ? it.label : '', (v) => (it.label = v), { placeholder: 'e.g. 35^\\circ or \\theta' });
      props.append(
        row(
          field(
            'Label',
            selectInput([['measured', `Its size (${measured}°)`], ['custom', 'My own'], ['none', 'None']], mode, (v) => {
              it.label = v === 'measured' ? null : v === 'none' ? '' : `${measured}^\\circ`;
              queueMicrotask(showProps);
            })
          ),
          mode === 'custom' ? field('Text', labelBox, 'label') : el('span')
        ),
        row(
          field('Arcs', selectInput([[1, 'One'], [2, 'Two'], [3, 'Three']], it.arcs, (v) => (it.arcs = Number(v)))),
          field('Radius (cm)', numberInput(it.radius, 0.1, (v) => (it.radius = Math.max(0.1, v))))
        ),
        row(
          field(
            'Arrowhead',
            selectInput([['', 'None'], [it.a, `Pointing at ${nm(it.v)}${nm(it.a)}`], [it.b, `Pointing at ${nm(it.v)}${nm(it.b)}`]], it.arrow ?? '', (v) => (it.arrow = v || null))
          )
        ),
        row(
          checkbox('Reflex angle', it.reflex, (v) => (it.reflex = v)),
          checkbox('White background', it.bg, (v) => (it.bg = v)),
          actionButton('Reset label position', () => change(() => (it.labelPos = null))),
          del
        )
      );
      if (mode !== 'custom') propInputs.set('label', labelBox);
    } else if (it.type === 'curve') {
      h.textContent = `Curve ${it.pts.map(nm).join('')}`;
      props.append(row(field('Style', selectInput(LINE_STYLES, it.style, (v) => (it.style = v))), del));
      // its direction at each point: blank lets the curve choose, 0 is level
      const dirs = el('div', 'geo-row');
      it.pts.forEach((id, k) => {
        const i = el('input');
        i.type = 'number';
        i.step = 5;
        i.value = it.dirs?.[k] ?? '';
        i.placeholder = 'auto';
        i.addEventListener('change', () =>
          change(() => {
            it.dirs = it.pts.map((_, j) => it.dirs?.[j] ?? null);
            it.dirs[k] = i.value === '' ? null : Number(i.value);
          })
        );
        dirs.append(field(`At ${nm(id)} (°)`, i));
      });
      const note = el('p', 'geo-note');
      note.textContent = 'Direction of the curve at each point, in degrees: 0 is level, 90 straight up; leave blank to let the curve choose. Drag the points to reshape it.';
      props.append(dirs, note);
    } else if (it.type === 'ticks') {
      h.textContent = `Equal-length marks on ${nm(it.a)}${nm(it.b)}`;
      props.append(row(field('Ticks', selectInput([[1, '|'], [2, '||'], [3, '|||']], it.ticks, (v) => (it.ticks = Number(v)))), del));
    } else if (it.type === 'right') {
      h.textContent = `Right angle at ${nm(it.v)}`;
      props.append(row(field('Size (cm)', numberInput(it.size, 0.05, (v) => (it.size = Math.max(0.05, v)))), del));
    } else if (it.type === 'circle' || it.type === 'arc') {
      h.textContent = it.type === 'circle' ? `Circle, centre ${nm(it.c)}` : `Arc, centre ${nm(it.c)}`;
      props.append(row(field('Style', selectInput(LINE_STYLES, it.style, (v) => (it.style = v))), del));
    } else if (it.type === 'text') {
      h.textContent = 'Text';
      props.append(
        row(field('Text', textInput(it.text, (v) => (it.text = v), { multiline: true, placeholder: 'Use $…$ for maths' }), 'text')),
        row(
          field('x', numberInput(it.x, scene.settings.grid, (v) => (it.x = v))),
          field('y', numberInput(it.y, scene.settings.grid, (v) => (it.y = v))),
          checkbox('White background', it.bg, (v) => (it.bg = v)),
          del
        )
      );
    }
  }

  /** A network edge: its label, direction, and curve (or a loop's direction and size). */
  function edgeProps(it, h, nm, del) {
    const loop = it.a === it.b;
    h.textContent = loop ? `Loop at ${nm(it.a)}` : `Edge ${nm(it.a)}${nm(it.b)}`;
    const mode = it.label ? 'custom' : 'none';
    const box = textInput(it.label || '', (v) => (it.label = v), { placeholder: 'e.g. 5' });
    props.append(
      row(
        field(
          'Label',
          selectInput([['none', 'None'], ['custom', 'My own (e.g. a weight)']], mode, (v) => {
            it.label = v === 'none' ? '' : '1';
            queueMicrotask(() => {
              showProps();
              if (v === 'custom') focusProp('label');
            });
          })
        ),
        mode === 'custom' ? field('Text', box, 'label') : el('span'),
        field('Style', selectInput(LINE_STYLES, it.style, (v) => (it.style = v)))
      ),
      row(
        field(
          'Direction',
          selectInput(
            loop
              ? [['none', 'None'], ['f', 'Arrow (anticlockwise)'], ['b', 'Arrow (clockwise)']]
              : [['none', 'None'], ['f', `${nm(it.a)} \u2192 ${nm(it.b)}`], ['b', `${nm(it.b)} \u2192 ${nm(it.a)}`]],
            it.arrows ? 'f' : 'none',
            (v) => {
              if (v === 'none') it.arrows = 0;
              else {
                if (v === 'b') {
                  // the other way round: swap the ends, keeping the same curve
                  [it.a, it.b] = [it.b, it.a];
                  it.bend = -(it.bend || 0);
                  if (loop) it.loopDir = null;
                }
                it.arrows = 1;
              }
              queueMicrotask(showProps);
            }
          )
        ),
        loop
          ? field('Points (° from east, blank = away from the edges)', loopDirInput(it))
          : field('Curve (°, + bends left)', numberInput(it.bend || 0, 5, (v) => (it.bend = Math.max(-80, Math.min(80, v))))),
        loop ? field('Size (cm)', numberInput(it.loopSize ?? 0.8, 0.1, (v) => (it.loopSize = Math.max(0.3, v)))) : el('span')
      ),
      row(actionButton('Reset label position', () => change(() => (it.labelPos = null))), del)
    );
  }
  function loopDirInput(it) {
    const i = el('input');
    i.type = 'number';
    i.step = 15;
    i.value = it.loopDir ?? '';
    i.placeholder = String(Math.round(edgeShape(it, pointMap(scene), scene).dir));
    i.addEventListener('change', () => change(() => (it.loopDir = i.value === '' ? null : Number(i.value) % 360)));
    return i;
  }

  /** A ray's bearing and how far it runs past the point it goes through. */
  function rayRow(it, ray) {
    const P = findPoint(ray.a);
    const Q = findPoint(ray.b);
    const bearing = numberInput(Math.round(bearingDeg(P, Q) * 10) / 10, 1, (v) => {
      const d = Math.hypot(Q.x - P.x, Q.y - P.y) || 1;
      const g = (v * Math.PI) / 180;
      Q.x = round(P.x + d * Math.sin(g));
      Q.y = round(P.y + d * Math.cos(g));
    });
    const r = row(
      field(`Bearing (° from north)`, bearing, 'bearing'),
      field(`Runs past ${Q.name} by (cm)`, numberInput(ray.ext ?? 1.2, 0.1, (v) => (ray.ext = Math.max(0.2, v))))
    );
    if (Q.dep) {
      bearing.disabled = true;
      bearing.title = `${Q.name} is a constructed point, so the ray's direction follows it`;
    }
    return r;
  }
  /** The text beyond a ray's arrowhead: none, its bearing, or your own. */
  function endRow(it) {
    const pts = pointMap(scene);
    const auto = display(bearingText(bearingDeg(pts.get(it.a), pts.get(it.b))));
    const box = textInput(it.endText, (v) => (it.endText = v), { placeholder: 'e.g. 056^\\circ' });
    return row(
      field(
        'At its end',
        selectInput([['none', 'Nothing'], ['bearing', `Its bearing (${auto})`], ['custom', 'My own']], it.endMode || 'none', (v) => {
          it.endMode = v;
          if (v === 'custom' && !it.endText) it.endText = bearingText(bearingDeg(pts.get(it.a), pts.get(it.b)));
          queueMicrotask(showProps);
        })
      ),
      it.endMode === 'custom' ? field('Text', box) : el('span')
    );
  }

  /** The network as an edge list you can edit: A-B, A->B (directed), A-B 5 (labelled), A-A (loop), D (a vertex alone). */
  function edgeListBox() {
    const wrap = el('div', 'geo-edgelist');
    const ta = el('textarea');
    ta.rows = 5;
    ta.value = sceneToEdgeList(scene);
    ta.spellcheck = false;
    const go = actionButton('Update the drawing', () => {
      try {
        change(() => applyEdgeList(scene, ta.value, newId));
        showProps();
      } catch (e) {
        flash(e.message);
      }
    });
    const note = el('p', 'geo-note');
    note.textContent =
      'One edge per line: A-B, A->B (directed), A->B A, 8 (labelled; the label is everything after the edge), A-A (a loop), A-B twice (two edges), D (a vertex on its own). New vertices go on a circle; drag them where you want.';
    wrap.append(field('Edges', ta), row(go), note);
    return wrap;
  }

  /** Units after measured lengths (e.g. m or cm); blank for none. */
  function unitInput() {
    const i = el('input');
    i.type = 'text';
    i.className = 'geo-letter';
    i.placeholder = 'e.g. m';
    i.value = scene.settings.unit || '';
    i.title = 'Written after every measured length, e.g. 16 m';
    i.addEventListener('change', () => change(() => (scene.settings.unit = i.value.trim().replace(/[^A-Za-z°%]/g, ''))));
    return i;
  }

  /** One letter, A–Z or a–z: the name of the next new point (then onwards). */
  function letterInput() {
    const i = el('input');
    i.type = 'text';
    i.maxLength = 1;
    i.className = 'geo-letter';
    i.value = scene.settings.firstLetter || 'A';
    i.title = 'New points are named from this letter onwards (lower case gives a, b, c…)';
    i.addEventListener('change', () => {
      const v = i.value.trim();
      if (!/^[A-Za-z]$/.test(v)) {
        i.value = scene.settings.firstLetter || 'A';
        return;
      }
      change(() => (scene.settings.firstLetter = v));
    });
    return i;
  }

  function focusProp(key) {
    const i = propInputs.get(key);
    if (i) {
      i.focus();
      i.select?.();
    }
  }

  /** Keep the x/y boxes in step while a point is dragged. */
  function updatePointFields() {
    if (selection?.kind !== 'point') return;
    const p = findPoint(selection.id);
    if (propInputs.get('x')) propInputs.get('x').value = p.x;
    if (propInputs.get('y')) propInputs.get('y').value = p.y;
  }

  function renderAll() {
    applyMode();
    render();
    showProps();
  }

  setTool('select');
  applyMode();
  showProps();

  return {
    getValues: () => ({ scene: JSON.stringify(scene) }),
    setValues(values) {
      if (values?.scene === undefined) return;
      try {
        scene = parseScene(values.scene);
      } catch {
        scene = parseScene(defaults.scene);
      }
      selection = validSelection(selection);
      clearPending();
      renderAll();
    },
    reset() {
      undo.push(snapshot());
      scene = parseScene(defaults.scene);
      selection = null;
      clearPending();
      renderAll();
    },
    destroy() {
      window.removeEventListener('keydown', onKey);
      container.classList.remove('geo-host');
    },
    // for tests
    _scene: () => scene,
    _fmt: fmt,
  };
}
