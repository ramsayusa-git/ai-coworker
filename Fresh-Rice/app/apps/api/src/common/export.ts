import { Response } from 'express';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export type ExportFormat = 'json' | 'csv' | 'xlsx' | 'pdf';
export type ExportOpts = { name: string; title?: string; subtitle?: string; columns?: { key: string; label?: string; money?: boolean; width?: number }[]; totals?: string[] };

const isMoneyKey = (k: string) => /paise$/i.test(k);
const label = (k: string) => k.replace(/Paise$/, ' (₹)').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const fmtCell = (v: any, money: boolean) => v == null ? '' : money ? (Number(v) / 100).toFixed(2) : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'object' ? JSON.stringify(v) : String(v);

function columnsFor(rows: any[], opts: ExportOpts) {
  if (opts.columns) return opts.columns.map((c) => ({ key: c.key, label: c.label || label(c.key), money: c.money ?? isMoneyKey(c.key), width: c.width }));
  const keys = rows.length ? Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object' || rows[0][k] instanceof Date || rows[0][k] === null) : [];
  return keys.map((k) => ({ key: k, label: label(k), money: isMoneyKey(k), width: undefined as number | undefined }));
}

function totalsRow(rows: any[], cols: ReturnType<typeof columnsFor>, opts: ExportOpts) {
  if (!opts.totals?.length) return null;
  const t: any = {}; for (const c of cols) t[c.key] = opts.totals.includes(c.key) ? rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0) : '';
  t[cols[0].key] = 'TOTAL'; return t;
}

/** Send `rows` to the client in the requested format. JSON when format is missing/unknown (so existing callers are unchanged). */
export async function sendExport(res: Response, rows: any[], format: string | undefined, opts: ExportOpts): Promise<any> {
  const f = (format || 'json').toLowerCase() as ExportFormat;
  const cols = columnsFor(rows, opts); const total = totalsRow(rows, cols, opts);
  const stamp = new Date().toISOString().slice(0, 10); const fname = `${opts.name}-${stamp}`;
  if (f === 'csv') {
    const all = total ? [...rows, total] : rows;
    const body = [cols.map((c) => JSON.stringify(c.label)).join(','), ...all.map((r) => cols.map((c) => JSON.stringify(fmtCell(r[c.key], c.money))).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename=${fname}.csv`); res.send('﻿' + body); return;
  }
  if (f === 'xlsx') {
    const wb = new ExcelJS.Workbook(); wb.creator = 'FreshRice'; const ws = wb.addWorksheet(opts.title || opts.name);
    ws.columns = cols.map((c) => ({ header: c.label, key: c.key, width: c.width || Math.max(12, Math.min(40, c.label.length + 4)) }));
    ws.getRow(1).font = { bold: true }; ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4ECD8' } };
    for (const r of rows) ws.addRow(Object.fromEntries(cols.map((c) => [c.key, c.money ? (r[c.key] == null ? null : Number(r[c.key]) / 100) : r[c.key] instanceof Date ? r[c.key] : r[c.key] ?? ''])));
    for (const c of cols) if (c.money) ws.getColumn(c.key).numFmt = '₹#,##0.00';
    if (total) { const tr = ws.addRow(Object.fromEntries(cols.map((c) => [c.key, c.money && total[c.key] !== '' ? Number(total[c.key]) / 100 : total[c.key]]))); tr.font = { bold: true }; }
    ws.views = [{ state: 'frozen', ySplit: 1 }]; ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', `attachment; filename=${fname}.xlsx`);
    res.send(Buffer.from(await wb.xlsx.writeBuffer())); return;
  }
  if (f === 'pdf') {
    // Buffer the whole PDF, then send once: Nest's passthrough response would otherwise end the stream
    // while pdfkit is still writing (ERR_STREAM_WRITE_AFTER_END takes the whole process down).
    const landscape = cols.length > 6; const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 36 });
    const chunks: Buffer[] = []; doc.on('data', (c: Buffer) => chunks.push(c)); const done = new Promise<Buffer>((ok) => doc.on('end', () => ok(Buffer.concat(chunks))));
    const W = doc.page.width - 72; const colW = W / cols.length;
    const header = () => { doc.fontSize(15).fillColor('#1d5133').text(`FreshRice — ${opts.title || opts.name}`, { continued: false }); doc.fontSize(9).fillColor('#555').text(`${opts.subtitle ? opts.subtitle + ' · ' : ''}Generated ${new Date().toLocaleString('en-IN')} · ${rows.length} rows`); doc.moveDown(0.6); headRow(); };
    const headRow = () => { const y = doc.y; doc.rect(36, y - 2, W, 16).fill('#f4ecd8'); doc.fillColor('#000').fontSize(8).font('Helvetica-Bold'); cols.forEach((c, i) => doc.text(c.label, 38 + i * colW, y + 1, { width: colW - 4, ellipsis: true, align: c.money ? 'right' : 'left' })); doc.font('Helvetica').moveDown(0.9); };
    header();
    const all = total ? [...rows, total] : rows;
    all.forEach((r, idx) => {
      if (doc.y > doc.page.height - 60) { doc.addPage(); header(); }
      const y = doc.y; const isTotal = total && idx === all.length - 1; if (isTotal) doc.font('Helvetica-Bold');
      if (idx % 2 === 0 && !isTotal) doc.rect(36, y - 2, W, 14).fill('#fbf8f1');
      doc.fillColor('#000').fontSize(8); cols.forEach((c, i) => doc.text(fmtCell(r[c.key], c.money), 38 + i * colW, y, { width: colW - 4, ellipsis: true, align: c.money ? 'right' : 'left' }));
      doc.font('Helvetica').moveDown(0.85);
    });
    doc.end();
    const pdf = await done;
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename=${fname}.pdf`); res.setHeader('Content-Length', String(pdf.length));
    res.send(pdf); return;
  }
  res.json(rows);
}
