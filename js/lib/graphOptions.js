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
  NOT_TO_SCALE_FIELD,
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
        field('curvePoints', {
          label: 'At x =',
          help: undefined,
          examples: {
            rows: [
              ['3', 'A point on the curve at x = 3'],
              ['2:P, -1:Q', 'Named points P and Q'],
              ['1/2, pi', 'Exact x-values'],
            ],
          },
        }),
        field('curvePointLabel'),
        row(field('curvePointDots'), field('curvePointLines', { label: 'Dashed lines to axes' })),
      ]),
      group('Asymptotes & shading', [
        field('asymptotes', { label: 'Asymptotes', help: undefined, examples: ASYMPTOTE_EXAMPLES }),
        field('asymptoteLabel'),
        ...(extra.lines || []),
      ]),
      ...(extra.meet ? [group('Where graphs meet', extra.meet)] : []),
      group('Axes', [
        row(field('xAxisLabel', { label: 'x label' }), field('yAxisLabel', { label: 'y label' })),
        row(field('xAxisLabelPos', { label: 'x label position' }), field('yAxisLabelPos', { label: 'y label position' })),
        field('xCustomTicks', { label: 'Ticks on x', help: undefined, examples: TICK_EXAMPLES }),
        field('yCustomTicks', { label: 'Ticks on y' }),
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
        row(field('originLabel', { label: 'Label the origin' }), field('originText', { label: 'as' })),
        NOT_TO_SCALE_FIELD,
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

// ---------------------------------------------------------------- "?" examples

export const GRAPH_EXAMPLES = {
  rows: [
    ['y = x^3 - 7x + 6', 'A function of x ("y =" is optional)'],
    ['y = 2sin(x) + e^(-x)', 'sin cos tan, sqrt, ln, log, e^, pi, |x| or abs(x)'],
    ['t = 4 - p', 'Other letters: the first graph\'s letters name the axes (p across, t up)'],
    ['y = -1/2(x+2)(x-3)^2', 'Brackets multiply; 2x, 3(x+1), x(x-1) all work'],
    ['x^2 - 1, -2 <= x < 3', 'Restricted domain: filled dot for ≤, open dot for <'],
    ['{ x/4, 0 <= x <= 2; 0, otherwise }', 'Piecewise: pieces separated by ; inside { }'],
    ['{ 1, x < 0; 3, x = 0; x^2, x > 0 }', 'A single point (x = a) is drawn as a dot'],
    ['x = 3', 'A vertical line (after the first graph)'],
    ['y^2 = x(x+2)(x-5)', 'y² = f(x): y = ±√f(x), e.g. an oval and an open branch'],
    ['y = 6 - 3x; dashed; label', 'Settings after ; — dashed or dotted, label shows the equation'],
    ['y = 1/x; thick; no arrows', 'A line width (thin … very thick), no arrows at the ends'],
    ['y = 2x; from 0 to 4; label: L', 'Only draw it for 0 ≤ x ≤ 4; label it L'],
  ],
  notes: [
    'One graph per line. The first graph gets the intercept and turning-point labels.',
    'Piecewise pieces may also go on separate lines between { and }, with settings after "};".',
  ],
};

export const POINT_EXAMPLES = {
  rows: [
    ['-4, 0', 'The curve passes through (−4, 0)'],
    ['2, -2.35, 0', 'Gradient 0 there: a turning point'],
    ['4.13, 0, 2.5', 'Passes through (4.13, 0) with gradient 2.5'],
    ['1, 3 : P', 'A labelled point (the label goes after a colon)'],
    ['sqrt(2), pi/2', 'Exact values work: fractions, sqrt, pi'],
  ],
  notes: [
    'One point per line. Points are joined in order of x.',
    'Without a gradient, a point higher or lower than both neighbours becomes a turning point, and other points follow the curve smoothly.',
  ],
};

export const ASYMPTOTE_EXAMPLES = {
  rows: [
    ['y = 5', 'A horizontal dashed line across the axes'],
    ['x = -2', 'A vertical dashed line'],
    ['y = 5 from 0 to 10', 'Only from x = 0 to 10'],
    ['y = 1, x = 0', 'Several, separated by commas'],
  ],
};

export const TICK_EXAMPLES = {
  rows: [
    ['3, 5', 'Ticks labelled 3 and 5'],
    ['5/2, pi, 2sqrt(3)', 'Exact values: fractions, π and surds'],
    ['3:a', 'A tick at 3 labelled a'],
    ['2pi:2\\pi', 'Any LaTeX label after the colon'],
  ],
};
