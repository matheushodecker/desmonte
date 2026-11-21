// ---------------------------------------------------------------------------
// highlight.js — realce de sintaxe mínimo para os cartões de código
// Um scanner de um passo: strings, números, palavras-chave, funções (nome
// seguido de "("), propriedades (nome seguido de ":") e pontuação.
// ---------------------------------------------------------------------------
const KEYWORDS = new Set(['const', 'let', 'var', 'return', 'new', 'true', 'false', 'null', 'function', 'if', 'else']);

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const wrap = (cls, s) => `<span class="${cls}">${escape(s)}</span>`;

export function highlight(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) j += src[j] === '\\' ? 2 : 1;
      out += wrap('tk-str', src.slice(i, j + 1));
      i = j + 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      let j = src.indexOf('\n', i);
      if (j < 0) j = src.length;
      out += wrap('tk-punc', src.slice(i, j));
      i = j;
      continue;
    }

    const prev = src[i - 1] || '';
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(next || '') && !/[\w$)\]]/.test(prev))) {
      let j = i + 1;
      while (j < src.length && /[\d.]/.test(src[j])) j++;
      out += wrap('tk-num', src.slice(i, j));
      i = j;
      continue;
    }

    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[\w$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      let k = j;
      while (src[k] === ' ') k++;
      const after = src[k];
      const cls = KEYWORDS.has(word) ? 'tk-kw' : after === '(' ? 'tk-fn' : after === ':' && prev !== '?' ? 'tk-prop' : '';
      out += cls ? wrap(cls, word) : escape(word);
      i = j;
      continue;
    }

    if (ch === '=' && next === '>') {
      out += wrap('tk-kw', '=>');
      i += 2;
      continue;
    }

    if ('{}()[],.:;'.includes(ch)) {
      out += wrap('tk-punc', ch);
      i++;
      continue;
    }

    out += escape(ch);
    i++;
  }
  return out;
}
