import { FieldValue, IFileValue, IFormField, IPersonValue } from '../models';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "3 Nov 2026" (year omitted when it is the current year). */
export function formatDate(d: Date | undefined, now: Date = new Date()): string {
  if (!d || isNaN(d.getTime())) return '';
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** "3 Nov, 10:20" */
export function formatDateTime(d: Date | undefined, now: Date = new Date()): string {
  if (!d || isNaN(d.getTime())) return '';
  return `${formatDate(d, now)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "Usually within 24 hours" / "Usually within 3 days" */
export function formatSla(hours: number | undefined): string {
  if (!hours || hours <= 0) return '';
  if (hours < 48) return `Usually within ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `Usually within ${days} days`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** "6 hours", "2 days", "45 minutes" */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(Math.abs(ms) / 60000));
  if (minutes < 60) return plural(Math.max(1, minutes), 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 48) return plural(hours, 'hour');
  return plural(Math.round(hours / 24), 'day');
}

/** "Due in 6 hours" or "Overdue by 2 days" */
export function formatDue(due: Date | undefined, now: Date = new Date()): string {
  if (!due) return '';
  const diff = due.getTime() - now.getTime();
  return diff >= 0 ? `Due in ${formatDuration(diff)}` : `Overdue by ${formatDuration(diff)}`;
}

/** "2 days" since a date (used for queue age). */
export function formatAge(since: Date, now: Date = new Date()): string {
  return formatDuration(now.getTime() - since.getTime());
}

export function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 3600000);
}

function isPersonValue(v: unknown): v is IPersonValue {
  return !!v && typeof v === 'object' && !Array.isArray(v) && 'email' in (v as object);
}

/** Shows a stored field value as plain text for the employee. */
export function formatFieldValue(field: IFormField | undefined, value: FieldValue): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return (value as IFileValue[]).map(f => f.name).join(', ');
  if (isPersonValue(value)) return value.name || value.email;
  if (field && field.type === 'date') {
    const d = new Date(String(value));
    return isNaN(d.getTime()) ? String(value) : formatDate(d);
  }
  if (typeof value === 'number') return value.toLocaleString('en-US');
  return String(value);
}

/** Finds an "amount" for approval cards: a number field named like cost, amount, price or budget. */
export function findAmount(fields: IFormField[], values: Record<string, FieldValue>): string | undefined {
  const field = fields.filter(f => f.type === 'number' && /amount|cost|price|budget|value|total/i.test(`${f.key} ${f.label}`) && values[f.key] !== undefined)[0];
  if (!field) return undefined;
  return `${field.label}: ${formatFieldValue(field, values[field.key])}`;
}
