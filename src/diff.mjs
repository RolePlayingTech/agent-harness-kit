/** Minimal unified line diff (LCS). Inputs are small generated files. */
export function unifiedDiff(before, after, path, context = 3) {
  const a = before === null ? [] : before.split('\n');
  const b = after === null ? [] : after.split('\n');
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { ops.push({ t: ' ', s: a[i], ai: i, bj: j }); i++; j++; }
    else if (i < n && (j === m || lcs[i + 1][j] >= lcs[i][j + 1])) { ops.push({ t: '-', s: a[i], ai: i, bj: j }); i++; }
    else { ops.push({ t: '+', s: b[j], ai: i, bj: j }); j++; }
  }
  const changed = ops.map((o, k) => (o.t !== ' ' ? k : -1)).filter((k) => k >= 0);
  if (!changed.length) return '';
  const hunks = [];
  let start = Math.max(0, changed[0] - context);
  let end = Math.min(ops.length - 1, changed[0] + context);
  for (const k of changed.slice(1)) {
    if (k - context <= end + 1) end = Math.min(ops.length - 1, k + context);
    else { hunks.push([start, end]); start = Math.max(0, k - context); end = Math.min(ops.length - 1, k + context); }
  }
  hunks.push([start, end]);
  const lines = [`--- ${before === null ? '/dev/null' : `a/${path}`}`, `+++ ${after === null ? '/dev/null' : `b/${path}`}`];
  for (const [s, e] of hunks) {
    const slice = ops.slice(s, e + 1);
    const aStart = slice[0].ai + 1;
    const bStart = slice[0].bj + 1;
    const aLen = slice.filter((o) => o.t !== '+').length;
    const bLen = slice.filter((o) => o.t !== '-').length;
    lines.push(`@@ -${aLen ? aStart : aStart - 1},${aLen} +${bLen ? bStart : bStart - 1},${bLen} @@`);
    for (const o of slice) lines.push(`${o.t}${o.s}`);
  }
  return lines.join('\n');
}
