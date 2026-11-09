// SPDX-License-Identifier: CC0-1.0
// Saves a diagram (its type, the options that differ from the defaults and,
// optionally, hand-edited code) in the page address, so it can be shared or
// bookmarked and rebuilt later. Everything lives after the "#", so it is
// never sent to the server.
//
//   https://…/diagrams/#type=piecewise&o=<options>&c=<code>
//
// <options> and <code> are UTF-8 text, base64url-encoded.

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Only the values that differ from the defaults (keeps links short). */
export function changedValues(values, defaults) {
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    const blank = (x) => x === '' || x === null || x === undefined;
    if (v !== defaults[k] && !(blank(v) && blank(defaults[k]))) out[k] = v;
  }
  return out;
}

/** Build the "#…" part of a share link. */
export function encodeShareHash({ type, values = {}, code = null }) {
  const params = new URLSearchParams();
  params.set('type', type);
  if (Object.keys(values).length) params.set('o', toBase64Url(JSON.stringify(values)));
  if (code) params.set('c', toBase64Url(code));
  return '#' + params.toString();
}

/** Read a share link's "#…" part. Returns null if there is nothing to restore. */
export function decodeShareHash(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const type = params.get('type');
  if (!type) return null;
  const result = { type, values: {}, code: null };
  try {
    if (params.get('o')) result.values = JSON.parse(fromBase64Url(params.get('o')));
    if (params.get('c')) result.code = fromBase64Url(params.get('c'));
  } catch (e) {
    throw new Error('This link looks damaged, so its settings could not be read.');
  }
  return result;
}
