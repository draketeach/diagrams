// SPDX-License-Identifier: CC0-1.0
// Diagram type registry.
//
// Every diagram type is a plain object ("diagram module") with this shape:
//
//   {
//     id: 'function',                   // unique, URL-safe
//     name: 'Polynomial graph',         // shown in the type picker
//     category: 'Function graphs',      // groups the picker
//     description: 'Short help text',
//     schema: [ ...fields ],            // see core/formBuilder.js
//     generate(values) {                // values = current form values
//       return { code: '\\begin{tikzpicture}...', warnings: [] };
//     },
//   }
//
// The core (renderer, code box, exporter) never needs to know which module
// produced the code, so new diagram types only need a new module file plus
// one line in js/diagrams/index.js.

const diagrams = new Map();

export function registerDiagram(mod) {
  for (const key of ['id', 'name', 'schema', 'generate']) {
    if (!mod || mod[key] === undefined) {
      throw new Error(`Diagram module is missing "${key}"`);
    }
  }
  if (diagrams.has(mod.id)) throw new Error(`Duplicate diagram id "${mod.id}"`);
  diagrams.set(mod.id, { category: 'Other', description: '', ...mod });
}

export function getDiagram(id) {
  return diagrams.get(id);
}

export function listDiagrams() {
  return [...diagrams.values()];
}

/** Diagrams grouped by category, in registration order. */
export function diagramsByCategory() {
  const groups = new Map();
  for (const d of diagrams.values()) {
    if (!groups.has(d.category)) groups.set(d.category, []);
    groups.get(d.category).push(d);
  }
  return groups;
}
