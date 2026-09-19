export const rupees = (paise: number) => Math.round(paise) / 100;
export const gstFor = (paise: number, pct: number) => Math.round((paise * pct) / 100);
export function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function ymd(d: Date) { return d.toISOString().slice(0, 10); }
export function agedMonths(milledOn: Date) { return Math.max(0, Math.floor((Date.now() - milledOn.getTime()) / (30 * 86400000))); }
