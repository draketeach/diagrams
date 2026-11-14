// SPDX-License-Identifier: CC0-1.0
// Networks (graphs): vertices and edges drawn on the geometry editor's canvas
// with network tools — edges that can repeat (they curve apart), loops,
// directed edges (an arrow in the middle) — and an edge list to type
// ("A-B, B->C 5, C-C") that stays in step with the drawing.

import { mountGeometryEditor } from '../geometry/editor.js';
import { parseScene, sceneToTikz } from '../geometry/scene.js';
import geometry from './geometry.js';

export const DEFAULT_NETWORK = JSON.parse(
  "{\"settings\": {\"mode\": \"network\", \"grid\": 0.25, \"snap\": true, \"showGrid\": true, \"lineWidth\": \"thin\", \"fontSize\": \"\", \"notToScale\": false, \"view\": {\"x0\": -4.5, \"y0\": -3.8, \"w\": 10, \"h\": 6.8}}, \"points\": [{\"id\": \"A\", \"name\": \"A\", \"x\": 0.0, \"y\": 2.05, \"dot\": true}, {\"id\": \"B\", \"name\": \"B\", \"x\": 1.93, \"y\": 1.05, \"dot\": true}, {\"id\": \"C\", \"name\": \"C\", \"x\": 2.38, \"y\": -1.12, \"dot\": true}, {\"id\": \"D\", \"name\": \"D\", \"x\": -0.5, \"y\": -2.8, \"dot\": true}, {\"id\": \"E\", \"name\": \"E\", \"x\": -0.38, \"y\": -1.18, \"dot\": true}, {\"id\": \"F\", \"name\": \"F\", \"x\": -2.05, \"y\": 0.35, \"dot\": true}, {\"id\": \"G\", \"name\": \"G\", \"x\": 0.0, \"y\": 0.35, \"dot\": true}], \"items\": [{\"id\": \"eAB\", \"type\": \"segment\", \"a\": \"A\", \"b\": \"B\", \"label\": \"\"}, {\"id\": \"eAF\", \"type\": \"segment\", \"a\": \"A\", \"b\": \"F\", \"label\": \"\"}, {\"id\": \"eAG\", \"type\": \"segment\", \"a\": \"A\", \"b\": \"G\", \"label\": \"\"}, {\"id\": \"eFG\", \"type\": \"segment\", \"a\": \"F\", \"b\": \"G\", \"label\": \"\"}, {\"id\": \"eGB\", \"type\": \"segment\", \"a\": \"G\", \"b\": \"B\", \"label\": \"\"}, {\"id\": \"eFE\", \"type\": \"segment\", \"a\": \"F\", \"b\": \"E\", \"label\": \"\"}, {\"id\": \"eFD\", \"type\": \"segment\", \"a\": \"F\", \"b\": \"D\", \"label\": \"\"}, {\"id\": \"eGE\", \"type\": \"segment\", \"a\": \"G\", \"b\": \"E\", \"label\": \"\"}, {\"id\": \"eBE\", \"type\": \"segment\", \"a\": \"B\", \"b\": \"E\", \"label\": \"\"}, {\"id\": \"eBD\", \"type\": \"segment\", \"a\": \"B\", \"b\": \"D\", \"label\": \"\"}, {\"id\": \"eED\", \"type\": \"segment\", \"a\": \"E\", \"b\": \"D\", \"label\": \"\"}, {\"id\": \"eBC\", \"type\": \"segment\", \"a\": \"B\", \"b\": \"C\", \"label\": \"\"}, {\"id\": \"eCD\", \"type\": \"segment\", \"a\": \"C\", \"b\": \"D\", \"label\": \"\"}]}"
);

const schema = [{ type: 'text', key: 'scene', label: 'Network', default: JSON.stringify(DEFAULT_NETWORK) }];

function generate(values) {
  const scene = parseScene(values.scene);
  scene.settings.mode = 'network';
  return sceneToTikz(scene);
}

export default {
  id: 'network',
  name: 'Network (visual editor)',
  category: 'Networks',
  description: 'Vertices and edges on a snapping grid: loops, repeated (curved) and directed edges, labels, or type an edge list.',
  schema,
  generate,
  onCodeEdit: geometry.onCodeEdit,
  wideLayout: true,
  mountEditor: (container, opts) => mountGeometryEditor(container, opts),
};
