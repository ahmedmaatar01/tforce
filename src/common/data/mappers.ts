/* eslint-disable @typescript-eslint/no-explicit-any */
import { FieldType, FieldValues, IApprovalLogEntry, IApprovalRule, ICategory, IDepartment, IEmployee, IFormField, IPerson, IRequest, IService } from '../models';
import {
  ApprovalLogCols as L,
  ApprovalRulesCols as R,
  CategoriesCols as C,
  DepartmentsCols as D,
  EmployeesCols as E,
  RequestsCols as Q,
  ServiceCatalogCols as S,
  ServiceFormFieldsCols as F
} from '../schema';
import { toStatus } from '../status';
import { RawItem } from './SpRest';

export function text(v: any): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object' && !Array.isArray(v)) return String(v.Title || v.Label || '');
  if (Array.isArray(v)) return v.map(text).join('; ');
  return String(v).trim();
}

export function optText(v: any): string | undefined {
  const t = text(v);
  return t ? t : undefined;
}

export function num(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? undefined : n;
}

export function bool(v: any, fallback: boolean = false): boolean {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return ['yes', 'true', '1', 'y'].indexOf(String(v).trim().toLowerCase()) >= 0;
}

export function date(v: any): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

const EMAIL_RE = /[^\s<>;,]+@[^\s<>;,]+/;

/** Reads a person from an expanded person column, a lookup, or a text value containing an email. */
export function person(v: any): IPerson | undefined {
  if (!v) return undefined;
  if (Array.isArray(v)) return person(v[0]);
  if (typeof v === 'object') {
    if (v.results) return person(v.results[0]);
    if (!v.Title && !v.EMail) return undefined;
    return { id: num(v.Id), name: v.Title || v.EMail, email: v.EMail || undefined };
  }
  const s = String(v).trim();
  if (!s) return undefined;
  const m = EMAIL_RE.exec(s);
  return m ? { name: s.replace(m[0], '').replace(/[<>()]/g, '').trim() || m[0], email: m[0] } : { name: s };
}

export function people(v: any): IPerson[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(person).filter(Boolean) as IPerson[];
  if (typeof v === 'object' && v.results) return people(v.results);
  if (typeof v === 'string') return v.split(/[;\n]/).map(person).filter(Boolean) as IPerson[];
  const p = person(v);
  return p ? [p] : [];
}

export function list(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(text).filter(Boolean);
  return String(v).split(/[;\n]/).map(s => s.trim()).filter(Boolean);
}

const FIELD_TYPES: FieldType[] = ['text', 'multiline', 'choice', 'lookup', 'person', 'date', 'number', 'yesno', 'attachment'];

export function toFieldType(v: any): FieldType {
  const t = text(v).toLowerCase().replace(/[\s_-]/g, '');
  const aliases: Record<string, FieldType> = {
    singleline: 'text', string: 'text', note: 'multiline', textarea: 'multiline', dropdown: 'choice',
    people: 'person', user: 'person', datetime: 'date', boolean: 'yesno', toggle: 'yesno', file: 'attachment', attachments: 'attachment'
  };
  if (FIELD_TYPES.indexOf(t as FieldType) >= 0) return t as FieldType;
  return aliases[t] || 'text';
}

export function toCategory(i: RawItem): ICategory {
  return {
    id: i.Id,
    name: text(i[C.Title]),
    icon: optText(i[C.Icon]),
    sortOrder: num(i[C.SortOrder]) ?? 999,
    serviceTeam: people(i[C.ServiceTeam])
  };
}

export function toService(i: RawItem): IService {
  const allowed = i[S.AllowedRequesters];
  const isPeopleColumn = allowed && typeof allowed === 'object';
  return {
    id: i.Id,
    serviceId: text(i[S.ServiceID]) || String(i.Id),
    name: text(i[S.Title]),
    description: text(i[S.Description]),
    category: text(i[S.Category]) || 'Other',
    icon: optText(i[S.Icon]),
    slaHours: num(i[S.SLAHours]),
    isActive: bool(i[S.IsActive], true),
    allowedRequesters: isPeopleColumn ? people(allowed) : [],
    allowedRequestersText: isPeopleColumn ? undefined : optText(allowed)
  };
}

export function toFormField(i: RawItem): IFormField {
  return {
    id: i.Id,
    serviceId: text(i[F.ServiceID]),
    key: text(i[F.FieldKey]) || `field${i.Id}`,
    label: text(i[F.Title]) || text(i[F.FieldKey]),
    type: toFieldType(i[F.FieldType]),
    required: bool(i[F.Required]),
    sortOrder: num(i[F.SortOrder]) ?? 999,
    choiceSource: optText(i[F.ChoiceSource]),
    choices: list(i[F.Choices]),
    helpText: optText(i[F.HelpText]),
    placeholder: optText(i[F.Placeholder]),
    validationRegex: optText(i[F.ValidationRegex]),
    validationMessage: optText(i[F.ValidationMessage]),
    minValue: num(i[F.MinValue]),
    maxValue: num(i[F.MaxValue]),
    visibleIf: optText(i[F.VisibleIf])
  };
}

export function toApprovalRule(i: RawItem): IApprovalRule {
  return {
    id: i.Id,
    serviceId: text(i[R.ServiceID]),
    stepNo: num(i[R.StepNo]) ?? 1,
    stepName: text(i[R.Title]),
    approverType: text(i[R.ApproverType]),
    approverValue: optText(i[R.ApproverValue]),
    mode: /parallel/i.test(text(i[R.Mode])) ? 'Parallel' : 'Sequential',
    conditionField: optText(i[R.ConditionField]),
    conditionOperator: optText(i[R.ConditionOperator]),
    conditionValue: optText(i[R.ConditionValue]),
    requiredChecks: optText(i[R.RequiredChecks]),
    reminderHours: num(i[R.ReminderHours]),
    escalateHours: num(i[R.EscalateHours]),
    escalateToBackup: optText(i[R.EscalateToBackup])
  };
}

export function parseFieldValues(v: any): FieldValues {
  if (!v) return {};
  if (typeof v === 'object') return v as FieldValues;
  try {
    const parsed = JSON.parse(String(v));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function toRequest(i: RawItem, serviceName?: string): IRequest {
  const created = date(i.Created) || new Date();
  return {
    id: i.Id,
    requestId: text(i[Q.RequestID]) || `TKT-${i.Id}`,
    serviceId: text(i[Q.ServiceID]),
    serviceName: serviceName || text(i[Q.Title]),
    status: toStatus(text(i[Q.Status])),
    currentStep: num(i[Q.CurrentStep]) ?? 1,
    currentApprovers: people(i[Q.CurrentApprover]),
    submittedOn: date(i[Q.SubmittedOn]) || created,
    modifiedOn: date(i.Modified) || created,
    fieldValues: parseFieldValues(i[Q.FieldValues]),
    priority: optText(i[Q.Priority]),
    resolutionNote: optText(i[Q.ResolutionNote]),
    requester: person(i[Q.Requester]) || { name: 'Unknown' }
  };
}

export function toLogEntry(i: RawItem): IApprovalLogEntry {
  return {
    id: i.Id,
    requestId: text(i[L.RequestID]),
    stepNo: num(i[L.StepNo]) ?? 0,
    decision: text(i[L.Decision]) || text(i[L.Title]),
    approver: person(i[L.Approver]) || person(i.Author),
    comment: optText(i[L.Comment]),
    decisionOn: date(i[L.DecisionOn]) || date(i.Created) || new Date()
  };
}

export function toEmployee(i: RawItem): IEmployee {
  return {
    id: i.Id,
    name: text(i[E.Title]),
    email: text(i[E.Email]).toLowerCase(),
    manager: person(i[E.Manager]),
    department: optText(i[E.Department])
  };
}

export function toDepartment(i: RawItem): IDepartment {
  return {
    id: i.Id,
    name: text(i[D.Title]),
    head: person(i[D.Head]),
    parent: optText(i[D.ParentDepartment])
  };
}
