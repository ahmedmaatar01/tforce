import { FieldValue, FieldValues, IFormField, IPersonValue } from '../models';

export type Operator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'notcontains' | 'empty' | 'notempty';

const OPERATOR_WORDS: Record<string, Operator> = {
  '=': '=',
  '==': '=',
  'eq': '=',
  'is': '=',
  'equals': '=',
  'equal to': '=',
  'is equal to': '=',
  '!=': '!=',
  '<>': '!=',
  'ne': '!=',
  'is not': '!=',
  'not equals': '!=',
  'not equal to': '!=',
  'is not equal to': '!=',
  '>': '>',
  'gt': '>',
  'greater than': '>',
  'is greater than': '>',
  '>=': '>=',
  'ge': '>=',
  'greater than or equal to': '>=',
  'is greater than or equal to': '>=',
  'at least': '>=',
  '<': '<',
  'lt': '<',
  'less than': '<',
  'is less than': '<',
  '<=': '<=',
  'le': '<=',
  'less than or equal to': '<=',
  'is less than or equal to': '<=',
  'at most': '<=',
  'contains': 'contains',
  'does not contain': 'notcontains',
  'not contains': 'notcontains',
  'is empty': 'empty',
  'empty': 'empty',
  'is not empty': 'notempty',
  'not empty': 'notempty',
  'has value': 'notempty'
};

/** Turns "greater than", "GT", ">" ... into one operator. Returns undefined when unknown. */
export function normalizeOperator(op: string | undefined): Operator | undefined {
  if (!op) return undefined;
  return OPERATOR_WORDS[op.trim().toLowerCase().replace(/\s+/g, ' ')];
}

function isPerson(v: unknown): v is IPersonValue {
  return !!v && typeof v === 'object' && !Array.isArray(v) && 'email' in (v as object);
}

/** Converts a stored field value to a comparable primitive. */
export function toComparable(value: FieldValue): string | number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return value.length === 0 ? undefined : value.length;
  if (isPerson(value)) return value.email ? value.email.toLowerCase() : value.name.toLowerCase();
  const s = String(value).trim();
  return s === '' ? undefined : s;
}

function asNumber(v: string | number | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return isNaN(v) ? undefined : v;
  const cleaned = v.replace(/[,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return undefined;
  return parseFloat(cleaned);
}

function asDate(v: string | number | undefined): number | undefined {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return undefined;
  const t = Date.parse(v);
  return isNaN(t) ? undefined : t;
}

function normalizeText(v: string | number): string {
  const s = String(v).trim().toLowerCase();
  if (s === 'true') return 'yes';
  if (s === 'false') return 'no';
  return s;
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) return t.substring(1, t.length - 1);
  return t;
}

/** Compares a stored value to the expected text from configuration. */
export function compare(actualRaw: FieldValue, op: Operator, expectedRaw: string | undefined): boolean {
  const actual = toComparable(actualRaw);
  const expected = expectedRaw === undefined ? undefined : stripQuotes(expectedRaw);

  if (op === 'empty') return actual === undefined;
  if (op === 'notempty') return actual !== undefined;
  if (actual === undefined) return op === '!=' ? (expected || '') !== '' : (expected || '') === '' && op === '=';

  const exp = expected === undefined ? '' : expected;

  // Numbers first, then dates, then text.
  const an = asNumber(actual);
  const en = asNumber(exp);
  let a: number | string;
  let e: number | string;
  if (an !== undefined && en !== undefined) {
    a = an;
    e = en;
  } else {
    const ad = asDate(actual);
    const ed = asDate(exp);
    if (ad !== undefined && ed !== undefined) {
      a = ad;
      e = ed;
    } else {
      a = normalizeText(actual);
      e = normalizeText(exp);
    }
  }

  switch (op) {
    case '=': return a === e;
    case '!=': return a !== e;
    case '>': return a > e;
    case '>=': return a >= e;
    case '<': return a < e;
    case '<=': return a <= e;
    case 'contains': return String(a).indexOf(String(e)) >= 0;
    case 'notcontains': return String(a).indexOf(String(e)) < 0;
    default: return true;
  }
}

/** Finds a field value by FieldKey or by label (case-insensitive). */
export function lookupValue(name: string, values: FieldValues, fields?: IFormField[]): { found: boolean; value: FieldValue } {
  const n = name.trim().toLowerCase();
  for (const k of Object.keys(values)) {
    if (k.toLowerCase() === n) return { found: true, value: values[k] };
  }
  if (fields) {
    for (const f of fields) {
      if (f.key.toLowerCase() === n || f.label.trim().toLowerCase() === n) {
        return { found: true, value: values[f.key] };
      }
    }
  }
  return { found: false, value: undefined };
}

export interface IClause {
  field: string;
  operator: Operator;
  value?: string;
}

const CLAUSE_RE = /^(.+?)\s*(>=|<=|!=|<>|==|=|>|<|\s(?:is not empty|is empty|does not contain|contains|greater than or equal to|less than or equal to|greater than|less than|is not|is))(?:\s+|$)(.*)$/i;

/** Parses "Cost > 5000" or "Type = Shared mailbox". Returns undefined when it cannot be read. */
export function parseClause(text: string): IClause | undefined {
  const m = CLAUSE_RE.exec(text.trim());
  if (!m) return undefined;
  const operator = normalizeOperator(m[2]);
  if (!operator) return undefined;
  const field = m[1].trim();
  if (!field) return undefined;
  return { field, operator, value: m[3] !== undefined ? m[3].trim() : undefined };
}

export interface IExpressionResult {
  /** False when the expression could not be read; result is then true (fail open). */
  valid: boolean;
  result: boolean;
  error?: string;
}

/**
 * Evaluates a VisibleIf expression such as "Cost > 5000" or
 * "Type = Shared mailbox and Urgent = Yes". AND binds tighter than OR.
 * An empty expression is always true.
 */
export function evaluateExpression(expression: string | undefined, values: FieldValues, fields?: IFormField[]): IExpressionResult {
  if (!expression || !expression.trim()) return { valid: true, result: true };
  const orParts = expression.split(/\s+or\s+|\s*\|\|\s*/i);
  let anyTrue = false;
  for (const orPart of orParts) {
    const andParts = orPart.split(/\s+and\s+|\s*&&\s*/i);
    let allTrue = true;
    for (const part of andParts) {
      const clause = parseClause(part);
      if (!clause) return { valid: false, result: true, error: `Cannot read condition "${part.trim()}"` };
      const { found, value } = lookupValue(clause.field, values, fields);
      if (!found && fields && !fields.some(f => f.key.toLowerCase() === clause.field.toLowerCase() || f.label.toLowerCase() === clause.field.toLowerCase())) {
        return { valid: false, result: true, error: `Unknown field "${clause.field}"` };
      }
      if (!compare(value, clause.operator, clause.value)) {
        allTrue = false;
        break;
      }
    }
    if (allTrue) {
      anyTrue = true;
      break;
    }
  }
  return { valid: true, result: anyTrue };
}

/**
 * Evaluates an approval rule condition (ConditionField, ConditionOperator, ConditionValue).
 * No condition means the step always applies. An unreadable operator applies the step.
 */
export function evaluateRuleCondition(
  field: string | undefined,
  operator: string | undefined,
  value: string | undefined,
  values: FieldValues,
  fields?: IFormField[]
): boolean {
  if (!field || !field.trim()) return true;
  const op = normalizeOperator(operator || '=');
  if (!op) return true;
  const { value: actual } = lookupValue(field, values, fields);
  return compare(actual, op, value);
}

/** Returns only the fields that are visible for the current values. */
export function visibleFields(fields: IFormField[], values: FieldValues): IFormField[] {
  return fields.filter(f => evaluateExpression(f.visibleIf, values, fields).result);
}
