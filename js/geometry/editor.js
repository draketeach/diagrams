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
  angleSpan,
  angleText,
  dirDeg,
  fmt,
  markOffsets,
  segmentText,
  resolvePoints,
  dependentsOf,
} from './scene.js';

const PX = 40; // pixels per cm at zoom 1
const SNAP_POINT = 12; // px
const SNAP_LINE = 8; // px

const TOOLS = [
  { id: 'select', label: 'Select', key: 'v', hint: 'Click to select; drag points, labels and text. Drag empty space to pan. Delete removes.' },
  { id: 'point', label: 'Point', key: 'p', hint: 'Click to add a point (snaps to the grid, other points and lines).' },
  { id: 'segment', label: 'Line', key: 's', hint: 'Click two points (new or existing) to join them.' },
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
];
const WIDTHS = ['very thin', 'thin', 'semithick', 'thick', 'very thick'];

/** LaTeX-ish label text -> what the canvas shows (the preview shows the real thing). */
function display(t) {
  return String(t ?? '')
    .replace(/\$/g, '')
    .replace(/\^\{?\\circ\}?/g, '°')
    .replace(/\\(pi|theta|alpha|beta|gamma|phi)\b/g, (m, g) => ({ pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ', phi: 'φ' })[g])
    .replace(/\\sqrt\{([^}]*)\}/g, '√$1')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '');
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
    b.textContent = t.label;
    b.title = `${t.label} (${t.key.toUpperCase()})`;
    b.addEventListener('click', () => setTool(t.id));
    toolButtons.set(t.id, b);
    toolbar.append(b);
  }
  toolbar.append(el('span', 'geo-sep'));
  const undoBtn = button('Undo', 'Undo (Ctrl+Z)', () => doUndo());
  const redoBtn = button('Redo', 'Redo (Ctrl+Y)', () => doRedo());
  const delBtn = button('Delete', 'Delete the selection (Delete)', () => deleteSelection());
  const zoomOut = button('−', 'Zoom out', () => zoom(1.25));
  const zoomIn = button('+', 'Zoom in', () => zoom(0.8));
  const fitBtn = button('Fit', 'Fit the drawing in view', () => fit());
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
  function button(text, title, fn) {
    const b = el('button', 'geo-tool');
    b.type = 'button';
    b.textContent = text;
    b.title = title;
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
        if (it.type !== 'segment') continue;
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
    const p = normalPoint({ id: newId('p'), name: nextName(), x: round(s.x), y: round(s.y) });
    scene.points.push(p);
    return p.id;
  }
  const round = (v) => Math.round(v * 10000) / 10000;

  // ---------------------------------------------------------------- tools
  function setTool(id) {
    tool = id;
    clearPending();
    for (const [k, b] of toolButtons) b.classList.toggle('is-active', k === id);
    hint.textContent = TOOLS.find((t) => t.id === id).hint;
    render();
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
        if (a !== id) addSegment(a, id);
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

  function addSegment(a, b) {
    const dup = scene.items.find((i) => i.type === 'segment' && ((i.a === a && i.b === b) || (i.a === b && i.b === a)));
    if (dup) return dup.id;
    const it = normalItem({ id: newId('i'), type: 'segment', a, b, label: null });
    scene.items.push(it);
    selection = { kind: 'item', id: it.id };
    return it.id;
  }

  function finishPolygon(closed) {
    if (pending.length < 2) {
      clearPending();
      commit();
      return;
    }
    begin();
    const ids = [...pending];
    for (let i = 0; i < ids.length - 1; i++) addSegment(ids[i], ids[i + 1]);
    if (closed) {
      addSegment(ids[ids.length - 1], ids[0]);
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
      hint.textContent = TOOLS.find((t) => t.id === tool).hint;
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
      it.labelPos = { dx: round(raw.x - (a.x + b.x) / 2), dy: round(raw.y - (a.y + b.y) / 2) };
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
        if (tool === 'segment' || tool === 'circle' || tool === 'arc') commit();
        clearPending();
        render();
      } else select(null);
      return;
    }
    if (e.key === 'Enter' && tool === 'polygon') {
      finishPolygon(false);
      return;
    }
    // tool shortcuts only while the canvas has focus
    if (document.activeElement !== svg) return;
    const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
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
      const fill = { 'gray!15': '#e2e2e2', 'gray!30': '#c8c8c8', 'gray!50': '#a3a3a3' }[it.fill];
      parts.push(
        `<polygon data-kind="item" data-id="${it.id}" points="${ps.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')}" class="poly${sel('item', it.id) ? ' is-sel' : ''}" style="fill:${fill || 'transparent'}"/>`
      );
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

    // segments
    for (const it of scene.items.filter((i) => i.type === 'segment')) {
      const a = pts.get(it.a);
      const b = pts.get(it.b);
      if (!a || !b) continue;
      const cls = `shape ls-${it.style}${sel('item', it.id) || pendingSet.has(it.id) ? ' is-sel' : ''}`;
      const xy = `x1="${sx(a.x)}" y1="${sy(a.y)}" x2="${sx(b.x)}" y2="${sy(b.y)}"`;
      parts.push(`<line ${xy} class="${cls}"/>`);
      // marks at the middle
      const mx = (sx(a.x) + sx(b.x)) / 2;
      const my = (sy(a.y) + sy(b.y)) / 2;
      const ang = (Math.atan2(sy(b.y) - sy(a.y), sx(b.x) - sx(a.x)) * 180) / Math.PI;
      // as in the TikZ (pt), drawn about twice as big
      const off = markOffsets(it);
      const marks = [
        ...off.ticks.map((o) => `<line x1="${2 * o}" y1="-6" x2="${2 * o}" y2="6"/>`),
        ...off.arrows.map((o) => `<path d="M ${2 * o - 4} -4 L ${2 * o + 4} 0 L ${2 * o - 4} 4"/>`),
      ];
      if (marks.length) parts.push(`<g class="marks" transform="translate(${mx} ${my}) rotate(${ang})">${marks.join('')}</g>`);
      parts.push(`<line data-kind="item" data-id="${it.id}" ${xy} class="hit"/>`);
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
        const s = (it.size ?? 0.25) * PX;
        const u = (sp.start * Math.PI) / 180;
        const w = ((sp.start + 90) * Math.PI) / 180;
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
      const r = (it.radius ?? 0.7) * PX;
      const large = sp.size > 180 ? 1 : 0;
      parts.push(
        `<path data-kind="item" data-id="${it.id}" d="M ${cx} ${cy} L ${cx + r * Math.cos(s)} ${cy - r * Math.sin(s)} A ${r} ${r} 0 ${large} 0 ${cx + r * Math.cos(e)} ${cy - r * Math.sin(e)} Z" class="hit-fill"/>`
      );
      const text = angleText(it, pts);
      if (text) {
        const off = angleLabelOffset(it, pts);
        parts.push(labelSvg('item', it.id, v0.x + off.dx, v0.y + off.dy, display(text), false, sel('item', it.id)));
      }
    }

    // side labels
    for (const it of scene.items.filter((i) => i.type === 'segment')) {
      const a = pts.get(it.a);
      const b = pts.get(it.b);
      const text = segmentText(it, pts, scene.settings);
      if (!a || !b || !text) continue;
      const off = segmentLabelOffset(scene, it, pts);
      parts.push(labelSvg('item', it.id, (a.x + b.x) / 2 + off.dx, (a.y + b.y) / 2 + off.dy, display(text), false, sel('item', it.id)));
    }

    // text
    for (const it of scene.items.filter((i) => i.type === 'text')) {
      const lines = String(it.text || '').split(/\n|\\\\/);
      const tsp = lines
        .map((l, k) => `<tspan x="${sx(it.x)}" dy="${k === 0 ? -((lines.length - 1) * 0.6) + 'em' : '1.2em'}">${esc(display(l))}</tspan>`)
        .join('');
      parts.push(
        `<text data-kind="item" data-id="${it.id}" x="${sx(it.x)}" y="${sy(it.y)}" class="free-text${sel('item', it.id) ? ' is-sel' : ''}" dominant-baseline="middle" text-anchor="middle">${tsp}</text>`
      );
    }

    // point labels
    for (const p of scene.points) {
      if (p.hidden || !p.showLabel) continue;
      const off = pointLabelOffset(scene, p, pts);
      parts.push(labelSvg('point', p.id, p.x + off.dx, p.y + off.dy, display(p.name), true, sel('point', p.id)));
    }

    // NOT TO SCALE (as in the TikZ)
    if (scene.settings.notToScale && scene.points.length) {
      const x = Math.max(...scene.points.map((p) => p.x)) + 0.8;
      const y = Math.max(...scene.points.map((p) => p.y));
      parts.push(`<text x="${sx(x)}" y="${sy(y)}" class="free-text" dominant-baseline="hanging"><tspan x="${sx(x)}">NOT TO</tspan><tspan x="${sx(x)}" dy="1.2em">SCALE</tspan></text>`);
    }

    // pending tool feedback
    if (pending.length && pendingKind !== 'segments' && hover && ['segment', 'polygon', 'circle', 'arc'].includes(tool)) {
      const last = pts.get(pending[pending.length - 1]);
      if (last) parts.push(`<line x1="${sx(last.x)}" y1="${sy(last.y)}" x2="${sx(hover.x)}" y2="${sy(hover.y)}" class="rubber"/>`);
      if (tool === 'circle' && pending.length === 1) {
        const r = Math.hypot(hover.x - last.x, hover.y - last.y) * PX;
        parts.push(`<circle cx="${sx(last.x)}" cy="${sy(last.y)}" r="${r}" class="rubber"/>`);
      }
      if (tool === 'polygon' && pending.length > 1) {
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

    svg.innerHTML = parts.join('');
    svg.dataset.tool = tool;
    svg.dataset.view = `${v.x0},${v.y0},${v.w},${v.h}`;
    undoBtn.disabled = !undo.length;
    redoBtn.disabled = !redo.length;
    delBtn.disabled = !selection;
  }

  function labelSvg(kind, id, x, y, text, italic, selected) {
    return `<text data-kind="${kind}" data-id="${id}" data-part="label" x="${sx(x)}" y="${sy(y)}" class="lbl${italic ? ' is-math' : ''}${selected ? ' is-sel' : ''}" text-anchor="middle" dominant-baseline="central">${esc(text)}</text>`;
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
          field('Lengths shown to', selectInput([[0, 'Whole numbers'], [1, '1 decimal place'], [2, '2 decimal places']], S.lengthDecimals, (v) => (S.lengthDecimals = Number(v))))
        )
      );
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
      h.textContent = `Line ${nm(it.a)}${nm(it.b)}`;
      const measured = segmentText({ ...it, label: null }, pts, scene.settings);
      const mode = it.label === null || it.label === undefined ? 'measured' : it.label === '' ? 'none' : 'custom';
      const labelBox = textInput(mode === 'custom' ? it.label : '', (v) => (it.label = v), { placeholder: 'e.g. 81 or x' });
      props.append(
        row(
          field(
            'Label',
            selectInput([['measured', `Its length (${measured})`], ['custom', 'My own'], ['none', 'None']], mode, (v) => {
              it.label = v === 'measured' ? null : v === 'none' ? '' : measured;
              queueMicrotask(() => {
                showProps();
                if (v === 'custom') focusProp('label');
              });
            })
          ),
          mode === 'custom' ? field('Text', labelBox, 'label') : el('span'),
          field('Style', selectInput(LINE_STYLES, it.style, (v) => (it.style = v)))
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
          checkbox('Reflex angle', it.reflex, (v) => (it.reflex = v)),
          actionButton('Reset label position', () => change(() => (it.labelPos = null))),
          del
        )
      );
      if (mode !== 'custom') propInputs.set('label', labelBox);
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
          del
        )
      );
    }
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
    render();
    showProps();
  }

  setTool('select');
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
