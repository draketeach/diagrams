// SPDX-License-Identifier: CC0-1.0
// Drag handles between the three panels (options, code, preview) to change
// their widths. The widths are kept in this browser, separately for the usual
// layout and the wide one used by the geometry editor. Double-click a handle
// (or press Home on it) to go back to the standard widths.

const MIN = [240, 220, 260]; // px: the narrowest each panel may get
const WIDE_QUERY = '(min-width: 1101px)'; // below this the panels stack (see style.css)
const key = (mode) => `tikz-diagrams.columns.${mode}`;

export function initColumnSplitters(layout, getMode) {
  const panels = [...layout.querySelectorAll(':scope > .panel')];
  if (panels.length !== 3) return { refresh() {} };
  const wide = window.matchMedia(WIDE_QUERY);
  const handles = [0, 1].map((i) => {
    const h = document.createElement('div');
    h.className = 'col-splitter';
    h.setAttribute('role', 'separator');
    h.setAttribute('aria-orientation', 'vertical');
    h.setAttribute('aria-label', i === 0 ? 'Resize the options and code panels' : 'Resize the code and preview panels');
    h.tabIndex = 0;
    h.title = 'Drag to resize (double-click to reset)';
    layout.append(h);
    return h;
  });

  const read = () => {
    try {
      const v = JSON.parse(localStorage.getItem(key(getMode())));
      return Array.isArray(v) && v.length === 3 && v.every((x) => x > 0) ? v : null;
    } catch {
      return null;
    }
  };
  const save = (fr) => {
    try {
      if (fr) localStorage.setItem(key(getMode()), JSON.stringify(fr));
      else localStorage.removeItem(key(getMode()));
    } catch {
      /* storage may be unavailable; the widths just won't be kept */
    }
  };
  const setTemplate = (fr) => {
    layout.style.gridTemplateColumns =
      fr && wide.matches ? fr.map((f, i) => `minmax(${MIN[i]}px, ${f.toFixed(4)}fr)`).join(' ') : '';
  };

  /** Put the handles over the gaps between the panels. */
  function place() {
    const show = wide.matches;
    const box = layout.getBoundingClientRect();
    handles.forEach((h, i) => {
      h.hidden = !show;
      if (!show) return;
      const a = panels[i].getBoundingClientRect();
      const b = panels[i + 1].getBoundingClientRect();
      h.style.left = `${(a.right + b.left) / 2 - box.left - 6}px`;
      h.style.top = `${a.top - box.top}px`;
      h.style.height = `${a.height}px`;
    });
  }

  function refresh() {
    setTemplate(read());
    requestAnimationFrame(place);
  }

  /** Move handle i by dx pixels (between its two panels only). */
  function move(i, start, dx) {
    const w = [...start];
    const lo = MIN[i] - w[i];
    const hi = w[i + 1] - MIN[i + 1];
    const d = Math.max(lo, Math.min(hi, dx));
    w[i] += d;
    w[i + 1] -= d;
    const total = w.reduce((s, x) => s + x, 0);
    const fr = w.map((x) => (x / total) * 3);
    setTemplate(fr);
    place();
    return fr;
  }

  handles.forEach((h, i) => {
    h.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      const start = panels.map((p) => p.getBoundingClientRect().width);
      const x0 = e.clientX;
      let fr = null;
      document.body.classList.add('is-resizing');
      h.classList.add('is-active');
      const onMove = (ev) => (fr = move(i, start, ev.clientX - x0));
      const onUp = () => {
        h.removeEventListener('pointermove', onMove);
        h.removeEventListener('pointerup', onUp);
        h.removeEventListener('pointercancel', onUp);
        document.body.classList.remove('is-resizing');
        h.classList.remove('is-active');
        if (fr) save(fr);
        window.dispatchEvent(new Event('resize')); // let the preview refit
      };
      h.addEventListener('pointermove', onMove);
      h.addEventListener('pointerup', onUp);
      h.addEventListener('pointercancel', onUp);
    });
    h.addEventListener('dblclick', () => {
      save(null);
      refresh();
      window.dispatchEvent(new Event('resize'));
    });
    h.addEventListener('keydown', (e) => {
      if (e.key === 'Home') {
        save(null);
        refresh();
        return;
      }
      const step = e.key === 'ArrowLeft' ? -20 : e.key === 'ArrowRight' ? 20 : 0;
      if (!step) return;
      e.preventDefault();
      save(move(i, panels.map((p) => p.getBoundingClientRect().width), e.shiftKey ? step * 3 : step));
    });
  });

  new ResizeObserver(() => place()).observe(layout);
  wide.addEventListener('change', refresh);
  refresh();
  return { refresh };
}
