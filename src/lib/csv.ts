export function toCsv(rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}
