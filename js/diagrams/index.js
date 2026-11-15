// SPDX-License-Identifier: CC0-1.0
// Register every diagram type here. To add a new type:
//   1. create js/diagrams/<name>.js exporting a module (see js/core/registry.js)
//   2. import it below and add it to the list.

import { registerDiagram } from '../core/registry.js';
import fn from './function.js';
import sketch from './sketch.js';
import normal from './normal.js';
import blank from './blank.js';
import realgraph from './realgraph.js';
import scatter from './scatter.js';
import slopefield from './slopefield.js';
import geometry from './geometry.js';
import probtree from './probtree.js';
import network from './network.js';
import solids from './solids.js';
import dotplot from './dotplot.js';
import boxplot from './boxplot.js';
import complex from './complex.js';

[fn, sketch, blank, realgraph, complex, normal, scatter, dotplot, boxplot, slopefield, geometry, solids, network, probtree].forEach(registerDiagram);
