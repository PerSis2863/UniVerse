import { toCsv } from './csv';

/**
 * Saves rows as a CSV file on this device (Excel opens it with the right accents: a byte-order
 * mark; cells starting with = + - @ are neutralised, see `toCsv`). Browser only.
 */
export function downloadCsv(name: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const url = URL.createObjectURL(new Blob(['﻿' + toCsv(header, rows)], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name.endsWith('.csv') ? name : `${name}.csv` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
