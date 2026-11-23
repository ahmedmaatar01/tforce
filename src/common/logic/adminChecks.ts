import { IApprovalRule, IDepartment, IFormField, IService } from '../models';
import { normalizeOperator, Operator, parseClause } from './conditions';
import { toFieldType } from '../data/mappers';

/**
 * Pure helpers for the Request Admin web part (brief section 8).
 * No SharePoint calls here, so everything can be unit tested.
 */

// ---------- Approver types ----------

export type ApproverKind = 'manager' | 'department' | 'field' | 'group' | 'person';

/** Classifies an ApproverType value. Same rules as DataService.resolveApprovers. */
export function approverKind(approverType: string | undefined): ApproverKind {
  const t = (approverType || '').trim().toLowerCase();
  if (/manager/.test(t) && !/department|dept/.test(t)) return 'manager';
  if (/department|dept|head/.test(t)) return 'department';
  if (/field|form/.test(t)) return 'field';
  if (/group|team|role|queue/.test(t)) return 'group';
  return 'person';
}

/** Default ApproverType values, used when the column is not a Choice column. */
export const DEFAULT_APPROVER_TYPES = ['Manager', 'Department head', 'Form field', 'Group', 'Person'];

export const APPROVER_KIND_HELP: Record<ApproverKind, string> = {
  manager: "The requester's manager (from the Employees list).",
  department: "The head of a department. Leave the department empty to use the requester's own department.",
  field: 'A person chosen in the form (pick the person field).',
  group: 'A team or group name. The approval flow decides who in the team approves.',
  person: 'One or more specific people.'
};

// ---------- Field types ----------

export const DEFAULT_FIELD_TYPES = ['text', 'multiline', 'choice', 'lookup', 'person', 'date', 'number', 'yesno', 'attachment'];

export const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Short text',
  multiline: 'Long text',
  choice: 'Drop-down',
  lookup: 'Searchable list',
  person: 'Person',
  date: 'Date',
  number: 'Number',
  yesno: 'Yes / No',
  attachment: 'File upload'
};

/** Label for a FieldType value (works with list choices such as "Single line" too). */
export function fieldTypeLabel(value: string): string {
  const exact = FIELD_TYPE_LABELS[value];
  if (exact) return exact;
  const mapped = FIELD_TYPE_LABELS[toFieldType(value)];
  return mapped && mapped.toLowerCase() !== value.toLowerCase() ? `${value} (${mapped})` : value;
}

// ---------- Operators ----------

export interface IOperatorOption {
  op: Operator;
  label: string;
  /** Written in VisibleIf expressions. */
  symbol: string;
  needsValue: boolean;
}

export const OPERATORS: IOperatorOption[] = [
  { op: '=', label: 'is', symbol: '=', needsValue: true },
  { op: '!=', label: 'is not', symbol: '!=', needsValue: true },
  { op: '>', label: 'is greater than', symbol: '>', needsValue: true },
  { op: '>=', label: 'is at least', symbol: '>=', needsValue: true },
  { op: '<', label: 'is less than', symbol: '<', needsValue: true },
  { op: '<=', label: 'is at most', symbol: '<=', needsValue: true },
  { op: 'contains', label: 'contains', symbol: 'contains', needsValue: true },
  { op: 'notcontains', label: 'does not contain', symbol: 'does not contain', needsValue: true },
  { op: 'empty', label: 'is empty', symbol: 'is empty', needsValue: false },
  { op: 'notempty', label: 'is not empty', symbol: 'is not empty', needsValue: false }
];

export function operatorOption(op: Operator | undefined): IOperatorOption | undefined {
  return OPERATORS.filter(o => o.op === op)[0];
}

/**
 * Value to store in ConditionOperator. When the column is a Choice column,
 * the matching choice is used so SharePoint accepts it.
 */
export function operatorToStore(op: Operator, columnChoices: string[]): string {
  const match = columnChoices.filter(c => normalizeOperator(c) === op)[0];
  if (match) return match;
  const o = operatorOption(op);
  return o ? o.symbol : op;
}

// ---------- VisibleIf builder ----------

export interface ISimpleCondition {
  field: string;
  op: Operator;
  value: string;
}

/** Reads a single-clause VisibleIf ("Cost > 5000"). Returns undefined for empty or complex expressions. */
export function parseSimpleCondition(expression: string | undefined): ISimpleCondition | undefined {
  const e = (expression || '').trim();
  if (!e || /\s(and|or)\s|&&|\|\|/i.test(e)) return undefined;
  const c = parseClause(e);
  return c ? { field: c.field, op: c.operator, value: c.value || '' } : undefined;
}

export function buildCondition(c: ISimpleCondition): string {
  const o = operatorOption(c.op);
  if (!c.field || !o) return '';
  return o.needsValue ? `${c.field} ${o.symbol} ${c.value.trim()}` : `${c.field} ${o.symbol}`;
}

/** Field names referenced in a VisibleIf expression. */
export function conditionFields(expression: string | undefined): { fields: string[]; unreadable: string[] } {
  const e = (expression || '').trim();
  if (!e) return { fields: [], unreadable: [] };
  const fields: string[] = [];
  const unreadable: string[] = [];
  e.split(/\s+or\s+|\s*\|\|\s*/i).forEach(orPart =>
    orPart.split(/\s+and\s+|\s*&&\s*/i).forEach(part => {
      const c = parseClause(part);
      if (c) fields.push(c.field);
      else unreadable.push(part.trim());
    })
  );
  return { fields, unreadable };
}

function findField(fields: IFormField[], name: string): IFormField | undefined {
  const n = name.trim().toLowerCase();
  return fields.filter(f => f.key.toLowerCase() === n || f.label.trim().toLowerCase() === n)[0];
}

// ---------- IDs ----------

/** "Laptop request" -> "LAPTOP-REQUEST". */
export function makeServiceId(name: string, existing: string[]): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 30) || 'SERVICE';
  return unique(base, existing, '-');
}

/** "Cost centre" -> "CostCentre". */
export function makeFieldKey(label: string, existing: string[]): string {
  const words = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  let base = words.map(w => w.charAt(0).toUpperCase() + w.substring(1)).join('').substring(0, 40) || 'Field';
  if (/^[0-9]/.test(base)) base = `F${base}`;
  return unique(base, existing, '');
}

function unique(base: string, existing: string[], sep: string): string {
  const taken = existing.map(e => e.toLowerCase());
  if (taken.indexOf(base.toLowerCase()) < 0) return base;
  let i = 2;
  while (taken.indexOf(`${base}${sep}${i}`.toLowerCase()) >= 0) i++;
  return `${base}${sep}${i}`;
}

// ---------- Checks (block saving) ----------

export type Errors = Record<string, string>;

export function checkService(s: Partial<IService>, others: IService[]): Errors {
  const errors: Errors = {};
  if (!(s.name || '').trim()) errors.name = 'Please enter a name';
  const id = (s.serviceId || '').trim();
  if (!id) errors.serviceId = 'Please enter a service code';
  else if (!/^[A-Za-z0-9_-]+$/.test(id)) errors.serviceId = 'Use letters, numbers, - and _ only';
  else if (id.length > 30) errors.serviceId = 'Use 30 characters or fewer';
  else if (others.some(o => o.id !== s.id && o.serviceId.toLowerCase() === id.toLowerCase())) errors.serviceId = 'Another service already uses this code';
  if (s.slaHours !== undefined && (isNaN(s.slaHours) || s.slaHours < 0)) errors.slaHours = 'Enter a number of hours, or leave it empty';
  return errors;
}

/** Checks one form field against the other fields of the same service. */
export function checkField(f: Partial<IFormField> & { typeValue?: string }, others: IFormField[]): Errors {
  const errors: Errors = {};
  const rest = others.filter(o => o.id !== f.id);
  if (!(f.label || '').trim()) errors.label = 'Please enter a label';
  const key = (f.key || '').trim();
  if (!key) errors.key = 'Please enter a field code';
  else if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) errors.key = 'Start with a letter; use letters, numbers and _ only';
  else if (rest.some(o => o.key.toLowerCase() === key.toLowerCase())) errors.key = 'Another field of this service already uses this code';

  const type = f.type || toFieldType(f.typeValue);
  if ((type === 'choice' || type === 'lookup') && !(f.choiceSource || '').trim() && !(f.choices || []).length) {
    errors.choices = 'Add the options, or the name of a list to read them from';
  }
  if (f.minValue !== undefined && f.maxValue !== undefined && f.minValue > f.maxValue) errors.maxValue = 'The maximum must be greater than the minimum';
  if (f.validationRegex) {
    try {
      // eslint-disable-next-line @rushstack/security/no-unsafe-regexp, no-new -- only checks that the admin's pattern compiles
      new RegExp(f.validationRegex);
    } catch {
      errors.validationRegex = 'This pattern is not valid';
    }
  }
  const vis = conditionFields(f.visibleIf);
  if (vis.unreadable.length) errors.visibleIf = `Cannot read "${vis.unreadable[0]}"`;
  else {
    const missing = vis.fields.filter(name => !findField(rest, name));
    if (missing.length) errors.visibleIf = `There is no field "${missing[0]}" in this form`;
  }
  return errors;
}

/** Checks one approval rule against the form fields and departments. */
export function checkRule(r: Partial<IApprovalRule>, fields: IFormField[], departments: IDepartment[]): Errors {
  const errors: Errors = {};
  if (!(r.stepName || '').trim()) errors.stepName = 'Please enter a step name';
  if (!r.stepNo || r.stepNo < 1) errors.stepNo = 'Step number must be 1 or more';
  if (!(r.approverType || '').trim()) errors.approverType = 'Please choose who approves';

  const kind = approverKind(r.approverType);
  const value = (r.approverValue || '').trim();
  if (kind === 'field') {
    const f = value ? findField(fields, value) : undefined;
    if (!value) errors.approverValue = 'Choose the person field of the form';
    else if (!f) errors.approverValue = `There is no field "${value}" in this form`;
    else if (f.type !== 'person') errors.approverValue = `"${f.label}" is not a person field`;
  } else if (kind === 'group' && !value) errors.approverValue = 'Enter the team or group name';
  else if (kind === 'person' && !value) errors.approverValue = 'Add at least one person';
  else if (kind === 'department' && value && departments.length && !departments.some(d => d.name.toLowerCase() === value.toLowerCase())) {
    errors.approverValue = `There is no department "${value}"`;
  }

  if ((r.conditionField || '').trim()) {
    if (!findField(fields, r.conditionField || '')) errors.conditionField = `There is no field "${r.conditionField}" in this form`;
    const op = normalizeOperator(r.conditionOperator || '=');
    if (!op) errors.conditionOperator = 'Choose a comparison';
    else if (operatorOption(op)?.needsValue && !(r.conditionValue || '').trim()) errors.conditionValue = 'Enter the value to compare with';
  }
  return errors;
}

/** Where a field is used (VisibleIf of other fields, approval conditions and approvers). Used to block deleting it. */
export function fieldUsage(field: IFormField, fields: IFormField[], rules: IApprovalRule[]): string[] {
  const names = [field.key.toLowerCase(), field.label.trim().toLowerCase()];
  const is = (n: string | undefined): boolean => !!n && names.indexOf(n.trim().toLowerCase()) >= 0;
  const uses: string[] = [];
  fields
    .filter(f => f.id !== field.id && conditionFields(f.visibleIf).fields.some(is))
    .forEach(f => uses.push(`the "show only when" of field "${f.label}"`));
  rules.filter(r => is(r.conditionField)).forEach(r => uses.push(`the condition of step ${r.stepNo} (${r.stepName})`));
  rules
    .filter(r => approverKind(r.approverType) === 'field' && is(r.approverValue))
    .forEach(r => uses.push(`the approver of step ${r.stepNo} (${r.stepName})`));
  return uses;
}

/** Problems with a whole service set-up, shown as warnings on the service page. */
export function serviceWarnings(service: IService, fields: IFormField[], rules: IApprovalRule[], departments: IDepartment[]): string[] {
  const w: string[] = [];
  if (!service.isActive) w.push('This service is switched off, so employees cannot see it.');
  if (!fields.length) w.push('The form has no fields yet.');
  if (!rules.length) w.push('There are no approval steps yet.');
  fields.forEach(f => {
    const e = checkField(f, fields);
    Object.keys(e).forEach(k => w.push(`Field "${f.label}": ${e[k]}.`));
  });
  rules.forEach(r => {
    const e = checkRule(r, fields, departments);
    Object.keys(e).forEach(k => w.push(`Step ${r.stepNo} (${r.stepName || 'no name'}): ${e[k]}.`));
  });
  return w;
}

// ---------- Step ordering ----------

/** Step numbers in use, in order. */
export function stepNumbers(rules: IApprovalRule[]): number[] {
  const nums = rules.map(r => r.stepNo).filter((n, i, all) => all.indexOf(n) === i);
  return nums.sort((a, b) => a - b);
}

/**
 * New StepNo for every rule after moving one step up or down (rules sharing a StepNo move together).
 * Steps are renumbered 1, 2, 3... Returns only the rules whose StepNo changes.
 */
export function moveStep(rules: IApprovalRule[], stepNo: number, direction: -1 | 1): { id: number; stepNo: number }[] {
  const order = stepNumbers(rules);
  const i = order.indexOf(stepNo);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= order.length) return [];
  const swapped = order.slice();
  swapped[i] = order[j];
  swapped[j] = order[i];
  const newNo: Record<number, number> = {};
  swapped.forEach((old, idx) => {
    newNo[old] = idx + 1;
  });
  return rules.filter(r => newNo[r.stepNo] !== r.stepNo).map(r => ({ id: r.id, stepNo: newNo[r.stepNo] }));
}

/** New SortOrder for every field after moving one field up or down. Returns only changed fields. */
export function moveField(fields: IFormField[], id: number, direction: -1 | 1): { id: number; sortOrder: number }[] {
  const sorted = fields.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const i = sorted.map(f => f.id).indexOf(id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= sorted.length) return [];
  const t = sorted[i];
  sorted[i] = sorted[j];
  sorted[j] = t;
  return sorted
    .map((f, idx) => ({ id: f.id, sortOrder: (idx + 1) * 10, old: f.sortOrder }))
    .filter(x => x.sortOrder !== x.old)
    .map(x => ({ id: x.id, sortOrder: x.sortOrder }));
}
