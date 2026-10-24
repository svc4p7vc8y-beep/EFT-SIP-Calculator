export function serializeCsv(rows) {
  return '\uFEFF' + rows.map((row) => row.map((cell) => {
    let value = String(cell ?? '');
    if (/^\s*[=+@-]/.test(value)) value = "'" + value;
    return '"' + value.replaceAll('"', '""') + '"';
  }).join(';')).join('\r\n');
}
