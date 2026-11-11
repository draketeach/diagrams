// SPDX-License-Identifier: CC0-1.0
// Builds an options form from a declarative schema.
//
// Field types:
//   { type: 'group',    label, fields: [...], showIf?, collapsed? }  (groups can nest)
//   { type: 'row',      fields: [...], showIf? }   -- fields side by side
//   { type: 'select',   key, label, options: [{ value, label }], default }
//   { type: 'number',   key, label, default, step?, min?, max? }
//   { type: 'text',     key, label, default, placeholder? }
//   { type: 'textarea', key, label, default, rows? }
//   { type: 'checkbox', key, label, default }
// Any field may have:
//   help: 'small hint text'
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

  function makeField(f, parent) {
    if (f.type === 'row') {
      const row = document.createElement('div');
      row.className = 'form-row';
      row.style.gridTemplateColumns = `repeat(${f.fields.length}, minmax(0, 1fr))`;
      f.fields.forEach((child) => makeField(child, row));
      parent.append(row);
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
      wrapper.append(label);
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
      wrapper.append(help);
    }

    el.addEventListener(f.type === 'checkbox' || f.type === 'select' ? 'change' : 'input', () => {
      updateVisibility();
      onChange?.(getValues());
    });
    inputs.set(f.key, { field: f, el });
    if (f.showIf) conditional.push({ field: f, wrapper });
    parent.append(wrapper);
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
    for (const { field, wrapper } of conditional) {
      wrapper.hidden = !field.showIf(values);
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
