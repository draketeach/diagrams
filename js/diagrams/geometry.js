// SPDX-License-Identifier: CC0-1.0
// Geometry diagrams drawn in a visual editor (js/geometry/editor.js): points,
// lines, polygons, angles, right angles, side labels, text, circles, arcs,
// equal-length and parallel marks. The TikZ names every point with
// \coordinate, so the code stays easy to edit by hand.

import { mountGeometryEditor } from '../geometry/editor.js';
import { defaultScene, parseScene, sceneToTikz, coordinatesFromCode } from '../geometry/scene.js';

const schema = [{ type: 'text', key: 'scene', label: 'Drawing', default: JSON.stringify(defaultScene()) }];

function generate(values) {
  return sceneToTikz(parseScene(values.scene));
}

/** Changed \coordinate lines in hand-edited code move the points. */
function onCodeEdit(values, code) {
  const scene = parseScene(values.scene);
  const coords = coordinatesFromCode(code);
  // the code's coordinates are on the page; the drawing's are at its scale
  const k = Number(scene.settings.scale) || 1;
  for (const [nm, c] of coords) coords.set(nm, { x: Math.round((c.x / k) * 10000) / 10000, y: Math.round((c.y / k) * 10000) / 10000 });
  let moved = 0;
  for (const p of scene.points) {
    const c = coords.get(p.name);
    if (c && !p.dep && (c.x !== p.x || c.y !== p.y)) {
      p.x = c.x;
      p.y = c.y;
      moved++;
    }
  }
  if (!moved) return null;
  return {
    values: { scene: JSON.stringify(scene) },
    message: `Moved ${moved} point${moved > 1 ? 's' : ''} to the coordinates in the code (the code was then regenerated from the drawing).`,
  };
}

export default {
  id: 'geometry',
  name: 'Geometry (visual editor)',
  category: 'Geometry',
  description: 'Draw triangles and other figures with points, lines, angles, labels and marks on a snapping grid.',
  schema,
  generate,
  onCodeEdit,
  wideLayout: true,
  mountEditor: (container, opts) => mountGeometryEditor(container, opts),
};
