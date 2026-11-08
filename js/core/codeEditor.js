// SPDX-License-Identifier: CC0-1.0
// Minimal editable code box (a textarea with a few conveniences).
// Ctrl/Cmd+Enter calls onRun; Tab inserts two spaces.

export function createCodeEditor(textarea, { onRun } = {}) {
  textarea.spellcheck = false;
  textarea.setAttribute('autocapitalize', 'off');
  textarea.setAttribute('autocomplete', 'off');

  textarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onRun?.();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: t, value } = textarea;
      textarea.value = value.slice(0, s) + '  ' + value.slice(t);
      textarea.selectionStart = textarea.selectionEnd = s + 2;
    }
  });

  return {
    getValue: () => textarea.value,
    setValue: (v) => {
      textarea.value = v;
    },
    focus: () => textarea.focus(),
  };
}
