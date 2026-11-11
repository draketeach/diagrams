// SPDX-License-Identifier: CC0-1.0
// Register every diagram type here. To add a new type:
//   1. create js/diagrams/<name>.js exporting a module (see js/core/registry.js)
//   2. import it below and add it to the list.

import { registerDiagram } from '../core/registry.js';
import fn from './function.js';
import sketch from './sketch.js';
import normal from './normal.js';
import blank from './blank.js';

[fn, sketch, blank, normal].forEach(registerDiagram);
