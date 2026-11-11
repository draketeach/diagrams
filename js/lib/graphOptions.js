// SPDX-License-Identifier: CC0-1.0
// The options form shared by the Function and Sketch diagrams: a few basic
// options at the top, and everything else in a collapsed "More options"
// group with short sub-groups. The field definitions come from
// lib/functionGraph.js; this file only arranges them.

import {
  windowFields,
  axesFields,
  gridFields,
  curveStyleFields,
  curvePointFields,
  labelFields,
  asymptoteFields,
} from './functionGraph.js';

const ALL = [windowFields(), axesFields(), gridFields(), curveStyleFields(), curvePointFields(), labelFields(), asymptoteFields()];

/** A field from the shared definitions, with optional changes. */
export function field(key, changes = {}) {
  const find = (fields) => {
    for (const f of fields) {
      if (f.key === key) return f;
      if (f.fields) {
        const hit = find(f.fields);
        if (hit) return hit;
      }
    }
    return null;
  };
  const f = find(ALL);
  if (!f) throw new Error(`Unknown field ${key}`);
  return { ...f, ...changes };
}

export const row = (...fields) => ({ type: 'row', fields });
export const group = (label, fields, extra = {}) => ({ type: 'group', label, collapsed: true, fields, ...extra });

const END_OPTIONS = [
  { value: 'arrow', label: 'Arrow' },
  { value: 'dot', label: 'Dot' },
  { value: 'plain', label: 'Plain' },
];

export function curveEndFields(showIf) {
  return row(
    { type: 'select', key: 'leftEnd', label: 'Left end', default: 'arrow', options: END_OPTIONS, showIf },
    { type: 'select', key: 'rightEnd', label: 'Right end', default: 'arrow', options: END_OPTIONS, showIf }
  );
}

/** The basic labels: x-intercepts, y-intercept, turning points. */
export function basicLabelFields(showIf) {
  return [
    row(
      field('labelX', { label: 'x-intercepts', showIf }),
      field('labelY', { label: 'y-intercept', showIf })
    ),
    field('tpLabel', {
      showIf,
      options: [
        { value: 'none', label: 'Not labelled' },
        { value: 'coords', label: 'Coordinates' },
        { value: 'axes', label: 'Values on the axes' },
      ],
    }),
  ];
}

export const DOT_FIELD = {
  type: 'checkbox',
  key: 'pointDots',
  label: 'Dots on intercepts and turning points',
  default: false,
};

/**
 * The sub-groups of "More options".
 * extra: { curve: [...], labels: [...], lines: [...], meet: [...] } added to those groups.
 */
export function moreOptions(extra = {}) {
  const manual = (v) => v.windowMode === 'manual';
  const grid = (v) => v.showGrid;
  return {
    type: 'group',
    label: 'More options',
    collapsed: true,
    fields: [
      group('Curve', [
        ...(extra.curve || []),
        row(field('curveWidth', { label: 'Line width' }), field('curveArrow', { label: 'Arrowheads' })),
        field('dotSize'),
      ]),
      group('Labels', [
        row(
          field('xLabelPlacement', { label: 'x-intercept labels' }),
          field('yLabelFormat', { label: 'y-intercept label' })
        ),
        row(
          field('ticks', { label: 'Ticks at labelled x-values', showIf: (v) => v.labelX || v.labelEnds }),
          field('yTick', { label: 'Tick at y-intercept', showIf: (v) => v.labelY })
        ),
        DOT_FIELD,
        ...(extra.labels || []),
        field('showEquation', { label: 'Equation on the graph' }),
        row(field('dp'), field('fontSize', { label: 'Font size' })),
        field('exact'),
      ]),
      group('Points on the curve', [
        field('curvePoints', { label: 'At x =' }),
        field('curvePointLabel'),
        row(field('curvePointDots'), field('curvePointLines', { label: 'Dashed lines to axes' })),
      ]),
      group('Asymptotes & shading', [
        row(field('asymptotes', { label: 'Asymptotes', help: undefined }), field('asymptoteLabel')),
        ...(extra.lines || []),
      ]),
      ...(extra.meet ? [group('Where graphs meet', extra.meet)] : []),
      group('Axes', [
        row(field('xAxisLabel', { label: 'x label' }), field('yAxisLabel', { label: 'y label' })),
        row(field('xAxisLabelPos', { label: 'x label position' }), field('yAxisLabelPos', { label: 'y label position' })),
        row(field('xCustomTicks', { label: 'Ticks on x', help: undefined }), field('yCustomTicks', { label: 'Ticks on y' })),
        field('customTickLabels'),
        row(field('xScaleTicks', { label: 'Scale ticks on x' }), field('yScaleTicks', { label: 'Scale ticks on y' })),
        row(
          field('xStep', { label: 'x spacing', help: undefined, showIf: (v) => v.xScaleTicks }),
          field('yStep', { label: 'y spacing', help: undefined, showIf: (v) => v.yScaleTicks })
        ),
        row(
          field('xScaleNumbers', { label: 'Numbers', showIf: (v) => v.xScaleTicks }),
          field('yScaleNumbers', { label: 'Numbers', showIf: (v) => v.yScaleTicks })
        ),
        field('originLabel', { label: 'Label the origin O' }),
        row(field('axisArrow', { label: 'Arrowheads' }), field('axisWidth', { label: 'Line width' })),
      ]),
      group('Size & range', [
        row(field('width'), field('height')),
        field('equalScale'),
        field('windowMode'),
        row(field('xmin', { showIf: manual }), field('xmax', { showIf: manual })),
        row(field('ymin', { showIf: manual }), field('ymax', { showIf: manual })),
      ]),
      group('Grid', [
        field('showGrid'),
        row(field('gridXStep', { help: undefined, showIf: grid }), field('gridYStep', { help: undefined, showIf: grid })),
        row(field('gridXmin', { label: 'From x', help: undefined, showIf: grid }), field('gridXmax', { label: 'to x', showIf: grid })),
        row(field('gridYmin', { label: 'From y', showIf: grid }), field('gridYmax', { label: 'to y', showIf: grid })),
        field('gridShade', { showIf: grid }),
      ]),
      group('Advanced', [field('plotMethod'), field('samples')]),
    ],
  };
}

/** Old option names used by the drawing helpers. */
export function legacyValues(values) {
  return { ...values, interceptDots: !!values.pointDots, tpDots: !!values.pointDots };
}
