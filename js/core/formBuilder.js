// SPDX-License-Identifier: CC0-1.0
// Builds an options form from a declarative schema.
//
// Field types:
//   { type: 'group',    label, fields: [...], showIf?, collapsed? }  (groups can nest)
//   { type: 'row',      fields: [...], showIf?, fixed? }   -- fields side by side, as many
//        columns as there are fields showing (fixed: one column per field, so a
//        field keeps its place, e.g. x on the left and y on the right); a row
//        with nothing showing is hidden, and help text goes under the whole row
//   { type: 'select',   key, label, options: [{ value, label }], default }
//   { type: 'number',   key, label, default, step?, min?, max? }
//   { type: 'text',     key, label, default, placeholder? }
//   { type: 'textarea', key, label, default, rows? }
//   { type: 'checkbox', key, label, default }
//   { type: 'note',     text, showIf? }   -- a line of hint text on its own
// Any field may have:
//   help: 'small hint text'
//   examples: { rows: [['code', 'what it does'], …], notes?: ['…'] }
//             -- a "?" button by the label opens a box of syntax examples
//   showIf: (values) => boolean   -- hidden (and still keeps its value) when false
//
// buildForm(container, schema) returns { getValues, setValues, reset }.

export function defaultValues(schema) {
  const values = {};
  walk(schema, (f) => {
    if (f.key) values[f.key] = f.default ?? (f.type === 'checkbox' ? false : '');
  });
  return values;
}

function walk(fields, fn) {
  for (const f of fields) {
    fn(f);
    if (f.type === 'group' || f.type === 'row') walk(f.fields, fn);
  }
}

export function buildForm(container, schema, { onChange } = {}) {
  container.replaceChildren();
  const inputs = new Map(); // key -> { field, el }
  const conditional = []; // { field, wrapper }
  const rows = []; // row elements, re-columned as their fields show and hide

  function makeField(f, parent, helpAfter = null) {
    if (f.type === 'row') {
      const row = document.createElement('div');
      // a row of only checkboxes lines up along the top (long labels wrap down)
      row.className = f.fields.every((c) => c.type === 'checkbox') ? 'form-row form-row-checks' : 'form-row';
      const helps = [];
      f.fields.forEach((child) => makeField(child, row, helps));
      parent.append(row, ...helps);
      // help under a row hides with the row
      if (f.showIf) helps.forEach((h) => conditional.push({ field: f, wrapper: h }));
      rows.push({ row, fixed: !!f.fixed, count: f.fields.length });
      if (f.showIf) conditional.push({ field: f, wrapper: row });
      return;
    }
    if (f.type === 'group') {
      const fs = document.createElement('fieldset');
      fs.className = 'form-group';
      const details = document.createElement('details');
      details.open = !f.collapsed;
      const summary = document.createElement('summary');
      summary.textContent = f.label;
      details.append(summary);
      const body = document.createElement('div');
      body.className = 'form-group-body';
      details.append(body);
      fs.append(details);
      f.fields.forEach((child) => makeField(child, body));
      parent.append(fs);
      if (f.showIf) conditional.push({ field: f, wrapper: fs });
      return;
    }

    if (f.type === 'note') {
      const note = document.createElement('small');
      note.className = 'form-help';
      note.textContent = f.text;
      parent.append(note);
      if (f.showIf) conditional.push({ field: f, wrapper: note });
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = `form-field form-field-${f.type}`;
    const id = `opt-${f.key}`;
    let el;

    if (f.type === 'checkbox') {
      const label = document.createElement('label');
      el = document.createElement('input');
      el.type = 'checkbox';
      el.id = id;
      el.checked = !!f.default;
      label.append(el, document.createTextNode(' ' + f.label));
      wrapper.append(label);
    } else {
      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = f.label;
      if (f.examples) {
        const head = document.createElement('div');
        head.className = 'form-label-row';
        head.append(label, ...examplesBox(f, id, wrapper));
        wrapper.append(head);
      } else wrapper.append(label);
      if (f.type === 'select') {
        el = document.createElement('select');
        for (const o of f.options) {
          const opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.label;
          el.append(opt);
        }
        el.value = f.default ?? f.options[0].value;
      } else if (f.type === 'textarea') {
        el = document.createElement('textarea');
        el.rows = f.rows ?? 4;
        el.value = f.default ?? '';
        el.spellcheck = false;
      } else {
        el = document.createElement('input');
        el.type = f.type === 'number' ? 'number' : 'text';
        if (f.step !== undefined) el.step = f.step;
        if (f.min !== undefined) el.min = f.min;
        if (f.max !== undefined) el.max = f.max;
        if (f.placeholder) el.placeholder = f.placeholder;
        el.value = f.default ?? '';
        el.spellcheck = false;
      }
      el.id = id;
      wrapper.append(el);
    }

    if (f.help) {
      const help = document.createElement('small');
      help.className = 'form-help';
      help.textContent = f.help;
      // in a row, the help goes under the whole row so the fields stay in line
      if (helpAfter) {
        helpAfter.push(help);
        if (f.showIf) conditional.push({ field: f, wrapper: help });
      } else wrapper.append(help);
    }

    el.addEventListener(f.type === 'checkbox' || f.type === 'select' ? 'change' : 'input', () => {
      updateVisibility();
      onChange?.(getValues());
    });
    inputs.set(f.key, { field: f, el });
    if (f.showIf) conditional.push({ field: f, wrapper });
    parent.append(wrapper);
  }

  /** The "?" button and its box of examples (the box goes after the input). */
  function examplesBox(f, id, wrapper) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'help-toggle';
    btn.textContent = '?';
    btn.title = 'Show examples';
    btn.setAttribute('aria-label', `Examples for ${f.label}`);
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', `${id}-examples`);
    const box = document.createElement('div');
    box.className = 'examples-box';
    box.id = `${id}-examples`;
    box.hidden = true;
    const table = document.createElement('table');
    for (const [code, text] of f.examples.rows) {
      const tr = document.createElement('tr');
      const c = document.createElement('td');
      const k = document.createElement('code');
      k.textContent = code;
      c.append(k);
      const t = document.createElement('td');
      t.textContent = text;
      tr.append(c, t);
      table.append(tr);
    }
    box.append(table);
    for (const note of f.examples.notes || []) {
      const p = document.createElement('p');
      p.textContent = note;
      box.append(p);
    }
    const show = (open) => {
      box.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      btn.classList.toggle('is-open', open);
    };
    btn.addEventListener('click', () => show(box.hidden));
    box.addEventListener('keydown', (e) => e.key === 'Escape' && (show(false), btn.focus()));
    btn.addEventListener('keydown', (e) => e.key === 'Escape' && show(false));
    // after the input, so the box opens below the box it explains
    queueMicrotask(() => wrapper.append(box));
    return [btn];
  }

  function getValues() {
    const values = {};
    for (const [key, { field, el }] of inputs) {
      if (field.type === 'checkbox') values[key] = el.checked;
      else if (field.type === 'number') values[key] = el.value === '' ? null : Number(el.value);
      else values[key] = el.value;
    }
    return values;
  }

  function setValues(values) {
    for (const [key, v] of Object.entries(values)) {
      const entry = inputs.get(key);
      if (!entry) continue;
      if (entry.field.type === 'checkbox') entry.el.checked = !!v;
      else entry.el.value = v ?? '';
    }
    updateVisibility();
  }

  function updateVisibility() {
    const values = getValues();
    const shown = new Map(); // an element is hidden if any of its conditions says so
    for (const { field, wrapper } of conditional) shown.set(wrapper, (shown.get(wrapper) ?? true) && !!field.showIf(values));
    for (const [wrapper, ok] of shown) wrapper.hidden = !ok;
    // a row is as many columns wide as it has fields showing
    for (const { row, fixed, count } of rows) {
      const shown = [...row.children].filter((c) => !c.hidden).length;
      row.classList.toggle('is-empty', shown === 0);
      row.style.gridTemplateColumns = `repeat(${fixed ? count : Math.max(1, shown)}, minmax(0, 1fr))`;
    }
  }

  schema.forEach((f) => makeField(f, container));
  updateVisibility();

  return {
    getValues,
    setValues,
    reset: () => setValues(defaultValues(schema)),
  };
}
