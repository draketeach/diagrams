// SPDX-License-Identifier: CC0-1.0
// Small maths expression parser shared by function-graph modules.
//
//   const e = parseExpression('2x^3 - 3sin(x) + 1/2');
//   e.evaluate(1.5)   -> number
//   e.toPgf('\\x')    -> pgfmath expression for \draw plot (radians handled)
//   e.toLatex()       -> LaTeX for labels, e.g. 2x^{3} - 3\sin(x) + \frac{1}{2}
//
// Supports + - * / ^, implicit multiplication (2x, 3(x+1), (x+1)(x-2)),
// |x| for absolute value, constants pi and e, and the functions
// sin cos tan sqrt abs exp ln log (log = base 10) sgn (sign: -1, 0 or 1).
// Two-variable expressions: parseExpression('x - y', { variables: ['x', 'y'] })
// then e.evaluate({ x: 1, y: 2 }).

const FUNCS = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  sgn: Math.sign,
};
const CONSTS = { pi: Math.PI, e: Math.E };
const NAMES = [...Object.keys(FUNCS), ...Object.keys(CONSTS)].sort((a, b) => b.length - a.length);

export class ParseError extends Error {}

function tokenize(src, variables) {
  const tokens = [];
  let i = 0;
  const s = src.replace(/−/g, '-').replace(/π/g, 'pi').replace(/[×·]/g, '*').replace(/÷/g, '/');
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      const m = s.slice(i).match(/^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/);
      if (!m) throw new ParseError(`Bad number at "${s.slice(i)}"`);
      tokens.push({ t: 'num', v: parseFloat(m[0]), raw: m[0] });
      i += m[0].length;
    } else if (/[a-zA-Z]/.test(ch)) {
      const rest = s.slice(i);
      const name = NAMES.find((n) => rest.startsWith(n));
      if (name) {
        tokens.push({ t: FUNCS[name] ? 'func' : 'const', v: name });
        i += name.length;
      } else if (variables.includes(ch)) {
        tokens.push({ t: 'var', v: ch });
        i++;
      } else {
        throw new ParseError(`Unknown name starting at "${rest}"`);
      }
    } else if ('+-*/^()|'.includes(ch)) {
      tokens.push({ t: ch });
      i++;
    } else if (ch === '[' || ch === '{') {
      tokens.push({ t: '(' });
      i++;
    } else if (ch === ']' || ch === '}') {
      tokens.push({ t: ')' });
      i++;
    } else {
      throw new ParseError(`Unexpected character "${ch}"`);
    }
  }
  return tokens;
}

function parseTokens(tokens) {
  let pos = 0;
  let absDepth = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expect = (t) => {
    const tok = next();
    if (!tok || tok.t !== t) throw new ParseError(`Expected "${t}"`);
  };

  function startsPrimary(tok) {
    if (!tok) return false;
    if (tok.t === '|') return absDepth === 0; // a new |...| only if not closing one
    return ['num', 'var', 'const', 'func', '('].includes(tok.t);
  }

  function expr() {
    // A leading sign applies to the whole first term: -1/2 = -(1/2), -x^2 = -(x^2)
    let node;
    if (peek() && peek().t === '-') {
      next();
      node = { type: 'neg', a: term() };
    } else {
      if (peek() && peek().t === '+') next();
      node = term();
    }
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = next().t;
      node = { type: 'bin', op, a: node, b: term() };
    }
    return node;
  }

  function term() {
    let node = unary();
    for (;;) {
      const tok = peek();
      if (tok && (tok.t === '*' || tok.t === '/')) {
        next();
        node = { type: 'bin', op: tok.t, a: node, b: unary() };
      } else if (startsPrimary(tok)) {
        node = { type: 'bin', op: '*', a: node, b: unary(), implicit: true };
      } else break;
    }
    return node;
  }

  function unary() {
    const tok = peek();
    if (tok && tok.t === '-') {
      next();
      return { type: 'neg', a: unary() };
    }
    if (tok && tok.t === '+') {
      next();
      return unary();
    }
    return power();
  }

  function power() {
    const base = primary();
    if (peek() && peek().t === '^') {
      next();
      return { type: 'bin', op: '^', a: base, b: unary() };
    }
    return base;
  }

  function primary() {
    const tok = next();
    if (!tok) throw new ParseError('Unexpected end of expression');
    switch (tok.t) {
      case 'num':
        return { type: 'num', v: tok.v, raw: tok.raw };
      case 'var':
        return { type: 'var', name: tok.v };
      case 'const':
        return { type: 'const', name: tok.v };
      case 'func': {
        if (peek() && peek().t === '(') {
          next();
          const a = expr();
          expect(')');
          return { type: 'call', fn: tok.v, a };
        }
        // allow "sin x" / "sin 2x" style with a single power term
        return { type: 'call', fn: tok.v, a: power() };
      }
      case '(': {
        const a = expr();
        expect(')');
        return { type: 'paren', a };
      }
      case '|': {
        absDepth++;
        const a = expr();
        absDepth--;
        expect('|');
        return { type: 'call', fn: 'abs', a };
      }
      default:
        throw new ParseError(`Unexpected "${tok.t}"`);
    }
  }

  const tree = expr();
  if (pos < tokens.length) throw new ParseError(`Unexpected "${tokens[pos].t}"`);
  return tree;
}

// ---------- evaluation

// x is a number (one variable) or an object of values, e.g. { x: 1, y: 2 }
function evaluate(node, x) {
  switch (node.type) {
    case 'num':
      return node.v;
    case 'var':
      return typeof x === 'object' && x !== null ? x[node.name] : x;
    case 'const':
      return CONSTS[node.name];
    case 'paren':
      return evaluate(node.a, x);
    case 'neg':
      return -evaluate(node.a, x);
    case 'call':
      return FUNCS[node.fn](evaluate(node.a, x));
    case 'bin': {
      const a = evaluate(node.a, x);
      const b = evaluate(node.b, x);
      switch (node.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return a / b;
        case '^':
          return Math.pow(a, b);
      }
    }
  }
  throw new Error('bad node');
}

function isConstant(node) {
  if (node.type === 'var') return false;
  if (node.type === 'num' || node.type === 'const') return true;
  return ['a', 'b'].every((k) => !node[k] || isConstant(node[k]));
}

// ---------- pgfmath output

export function formatPgfNumber(v) {
  if (!isFinite(v)) throw new Error('Non-finite number');
  if (Math.abs(v - Math.round(v)) < 1e-12) return String(Math.round(v));
  return String(Number(v.toPrecision(10)));
}

function toPgf(node, X) {
  const p = (n) => toPgf(n, X);
  switch (node.type) {
    case 'num':
      return formatPgfNumber(node.v);
    case 'var':
      return node.name === 'y' ? '(\\y)' : `(${X})`;
    case 'const':
      return node.name === 'pi' ? 'pi' : 'exp(1)';
    case 'paren':
      return `(${p(node.a)})`;
    case 'neg':
      return `(-${p(node.a)})`;
    case 'call':
      switch (node.fn) {
        case 'sin':
        case 'cos':
        case 'tan':
          return `${node.fn}(deg(${p(node.a)}))`;
        case 'log':
          return `(ln(${p(node.a)})/ln(10))`;
        case 'sgn':
          return `sign(${p(node.a)})`;
        default:
          return `${node.fn}(${p(node.a)})`;
      }
    case 'bin':
      if (node.op === '^') {
        if (node.a.type === 'const' && node.a.name === 'e') return `exp(${p(node.b)})`;
        const expVal = isConstant(node.b) ? evaluate(node.b, 0) : NaN;
        if (Number.isInteger(expVal) && expVal >= 1 && expVal <= 8) {
          const base = p(node.a);
          return `(${Array(expVal).fill(base).join('*')})`;
        }
        return `(${p(node.a)})^(${p(node.b)})`;
      }
      return `(${p(node.a)}${node.op}${p(node.b)})`;
  }
  throw new Error('bad node');
}

// ---------- LaTeX output

const PREC = { '+': 1, '-': 1, neg: 2, '*': 3, '/': 3, '^': 5 };

function prec(node) {
  if (node.type === 'bin') return PREC[node.op];
  if (node.type === 'neg') return PREC.neg;
  return 9;
}

function wrap(node, minPrec) {
  const s = toLatex(node);
  return prec(node) < minPrec ? `(${s})` : s;
}

function startsWithDigit(s) {
  return /^[0-9.]/.test(s);
}

function toLatex(node) {
  switch (node.type) {
    case 'num':
      return node.raw ?? String(node.v);
    case 'var':
      return node.name || 'x';
    case 'const':
      return node.name === 'pi' ? '\\pi' : 'e';
    case 'paren':
      return `(${toLatex(node.a)})`;
    case 'neg':
      return `-${wrap(node.a, PREC.neg + 1)}`;
    case 'call': {
      const inner = toLatex(node.a);
      switch (node.fn) {
        case 'sqrt':
          return `\\sqrt{${inner}}`;
        case 'abs':
          return `|${inner}|`;
        case 'exp':
          return `e^{${inner}}`;
        case 'sgn': {
          const arg = node.a.type === 'paren' ? inner : `(${inner})`;
          return `\\operatorname{sgn}${arg}`;
        }
        default: {
          const arg = node.a.type === 'paren' ? inner : `(${inner})`;
          return `\\${node.fn}${arg}`;
        }
      }
    }
    case 'bin': {
      const { op, a, b } = node;
      if (op === '+') return `${toLatex(a)} + ${toLatex(b)}`;
      if (op === '-') {
        return `${toLatex(a)} - ${wrap(b, PREC['-'] + 1)}`;
      }
      if (op === '/') return `\\frac{${stripParen(a)}}{${stripParen(b)}}`;
      if (op === '^') {
        const base = a.type === 'num' || a.type === 'var' || a.type === 'const' || a.type === 'paren'
          ? toLatex(a)
          : `(${toLatex(a)})`;
        return `${base}^{${stripParen(b)}}`;
      }
      // multiplication
      const left = wrap(a, PREC['*']);
      const right = wrap(b, PREC['*'] + (b.type === 'neg' ? 1 : 0));
      const explicit = startsWithDigit(right) || (a.type === 'num' && b.type === 'num');
      return explicit ? `${left} \\times ${right}` : `${left}${right}`;
    }
  }
  throw new Error('bad node');
}

function stripParen(node) {
  return node.type === 'paren' ? toLatex(node.a) : toLatex(node);
}

// ---------- public API

export function parseExpression(src, { variable = 'x', variables = null } = {}) {
  const text = String(src ?? '').trim();
  if (!text) throw new ParseError('Expression is empty');
  const tree = parseTokens(tokenize(text, variables ?? [variable]));
  return {
    source: text,
    tree,
    isConstant: isConstant(tree),
    evaluate: (x) => evaluate(tree, x),
    toPgf: (X = '\\x') => toPgf(tree, X),
    toLatex: () => toLatex(tree),
  };
}

/** Parse a constant like "-1/2", "sqrt(3)", "2pi". Returns { value, latex, negative }. */
export function parseConstant(src) {
  const e = parseExpression(src);
  if (!e.isConstant) throw new ParseError(`"${src}" should be a number`);
  const value = e.evaluate(0);
  if (!isFinite(value)) throw new ParseError(`"${src}" is not a finite number`);
  const tree = e.tree;
  return {
    value,
    latex: e.toLatex(),
    negative: tree.type === 'neg',
    // LaTeX of the absolute value when written with a leading minus (for "x + 1/2")
    absLatex: tree.type === 'neg' ? toLatex(tree.a) : e.toLatex(),
    simple: tree.type === 'num' || (tree.type === 'neg' && tree.a.type === 'num'),
  };
}

/** Split a comma/semicolon separated list, ignoring empty items. */
export function splitList(src) {
  return String(src ?? '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
