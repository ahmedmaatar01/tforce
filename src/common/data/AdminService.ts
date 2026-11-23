import { IApprovalRule, ICategory, IDepartment, IEmployee, IFormField, IPerson, IRequest, IService, RequestStatus } from '../models';
import {
  ApprovalLogCols as L,
  ApprovalRulesCols as R,
  CategoriesCols as C,
  DepartmentsCols as D,
  EmployeesCols as E,
  Lists,
  RequestsCols as Q,
  ServiceCatalogCols as S,
  ServiceFormFieldsCols as F
} from '../schema';
import { DataService } from './DataService';
import { toApprovalRule, toCategory, toDepartment, toEmployee, toFormField, toRequest, toService } from './mappers';
import { RawItem } from './SpRest';

/** Everything the admin screens need, read fresh. */
export interface IAdminData {
  services: IService[];
  categories: ICategory[];
  departments: IDepartment[];
  employees: IEmployee[];
  fields: IFormField[];
  rules: IApprovalRule[];
}

export interface IRef {
  id?: number;
  name: string;
}

/** A service being edited: like IService, plus the raw FieldType kept as typed in the list. */
export type ServiceInput = Omit<IService, 'id'> & { id?: number };
export type CategoryInput = Omit<ICategory, 'id'> & { id?: number };
export type DepartmentInput = Omit<IDepartment, 'id'> & { id?: number };
export type EmployeeInput = Omit<IEmployee, 'id'> & { id?: number };
export type FieldInput = Omit<IFormField, 'id' | 'type'> & { id?: number; typeValue: string };
export type RuleInput = Omit<IApprovalRule, 'id'> & { id?: number };

export interface IRequestUpdate {
  status: RequestStatus;
  currentStep: number;
  currentApprovers: IPerson[];
  priority?: string;
  resolutionNote?: string;
  comment?: string;
}

/**
 * Writes for the Request Admin web part (WP4).
 * Converts people and lookups to whatever column type each list really uses
 * (person column, lookup column, or plain text).
 */
export class AdminService {
  public readonly data: DataService;

  public constructor(data: DataService) {
    this.data = data;
  }

  private get rest(): DataService['rest'] {
    return this.data.rest;
  }

  // ---------- Reading ----------

  public async loadAll(): Promise<IAdminData> {
    [Lists.ServiceCatalog, Lists.Categories, Lists.Departments, Lists.Employees, Lists.ServiceFormFields, Lists.ApprovalRules].forEach(l => this.rest.invalidate(l));
    const safe = <T>(p: Promise<T[]>): Promise<T[]> => p.catch(() => [] as T[]);
    const [services, categories, departments, employees, fields, rules] = await Promise.all([
      this.rest.getItems(Lists.ServiceCatalog).then(items => items.map(toService)),
      safe(this.rest.getItems(Lists.Categories).then(items => items.map(toCategory))),
      safe(this.rest.getItems(Lists.Departments).then(items => items.map(toDepartment))),
      safe(this.rest.getItems(Lists.Employees).then(items => items.map(toEmployee))),
      this.rest.getItems(Lists.ServiceFormFields).then(items => items.map(toFormField)),
      this.rest.getItems(Lists.ApprovalRules).then(items => items.map(toApprovalRule))
    ]);
    return {
      services: services.sort((a, b) => a.name.localeCompare(b.name)),
      categories: categories.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
      departments: departments.sort((a, b) => a.name.localeCompare(b.name)),
      employees: employees.sort((a, b) => a.name.localeCompare(b.name)),
      fields,
      rules
    };
  }

  /** Raw FieldType text of every form field (the mapped type loses list-specific spellings). */
  public async fieldTypeValues(): Promise<Record<number, string>> {
    const items = await this.rest.getItems(Lists.ServiceFormFields);
    const map: Record<number, string> = {};
    items.forEach(i => {
      map[i.Id] = String(i[F.FieldType] || '');
    });
    return map;
  }

  /** Choices of a Choice column, or the defaults when the column is free text. */
  public async choices(list: string, column: string, defaults: string[]): Promise<string[]> {
    const c = await this.rest.getChoices(list, column).catch(() => [] as string[]);
    return c.length ? c : defaults;
  }

  public async getAllRequests(): Promise<IRequest[]> {
    const [items, services] = await Promise.all([
      this.rest.getItems(Lists.Requests, { orderBy: 'Created', ascending: false, cache: false }),
      this.data.getServices().catch(() => [] as IService[])
    ]);
    const names: Record<string, string> = {};
    services.forEach(s => {
      names[s.serviceId] = s.name;
    });
    return items.map(i => {
      const r = toRequest(i);
      return { ...r, serviceName: names[r.serviceId] || r.serviceName };
    });
  }

  // ---------- Column conversions ----------

  /** People -> person column IDs, or "email; email" for a text column. */
  private async _people(list: string, column: string, people: IPerson[]): Promise<unknown> {
    const fields = await this.rest.getFields(list);
    const info = fields[column];
    if (!info) return undefined;
    if (info.type === 'User' || info.type === 'UserMulti') {
      const ids: number[] = [];
      for (const p of people) {
        if (p.id !== undefined) ids.push(p.id);
        else if (p.email) ids.push(await this.rest.ensureUser(p.email));
      }
      if (info.type === 'User') return ids.length ? ids[0] : null;
      return ids;
    }
    return people.map(p => p.email || p.name).filter(Boolean).join('; ');
  }

  /** A name -> lookup ID (found among the candidates) for a lookup column, or the name for a text/choice column. */
  private async _ref(list: string, column: string, name: string | undefined, candidates: IRef[]): Promise<unknown> {
    const fields = await this.rest.getFields(list);
    const info = fields[column];
    if (!info) return undefined;
    const n = (name || '').trim();
    if (info.type === 'Lookup' || info.type === 'LookupMulti') {
      if (!n) return info.type === 'Lookup' ? null : [];
      const match = candidates.filter(c => c.name.toLowerCase() === n.toLowerCase())[0];
      if (!match || match.id === undefined) throw new Error(`"${n}" was not found for ${column}.`);
      return info.type === 'Lookup' ? match.id : [match.id];
    }
    return n || null;
  }

  /** Matches values to the real column types (e.g. a Yes/No written to a text column becomes "Yes"). */
  private async _coerce(list: string, body: RawItem): Promise<RawItem> {
    const fields = await this.rest.getFields(list);
    const out: RawItem = {};
    Object.keys(body).forEach(k => {
      const v = body[k];
      const info = fields[k];
      if (!info && v !== null && v !== undefined) {
        throw new Error(`Column "${k}" was not found in list "${list}". Check its internal name in list settings. The value was not saved.`);
      }
      if (!info || v === null || v === undefined) {
        out[k] = v;
        return;
      }
      const t = info.type;
      if (typeof v === 'boolean' && t !== 'Boolean') out[k] = v ? 'Yes' : 'No';
      else if (typeof v === 'number' && (t === 'Text' || t === 'Note' || t === 'Choice')) out[k] = String(v);
      else if (typeof v === 'string' && (t === 'Number' || t === 'Currency' || t === 'Integer')) {
        const n = parseFloat(v);
        out[k] = isNaN(n) ? null : n;
      } else out[k] = v;
    });
    return out;
  }

  private async _save(list: string, id: number | undefined, raw: RawItem): Promise<number> {
    const body = await this._coerce(list, raw);
    if (id !== undefined) {
      await this.rest.updateItem(list, id, body);
      return id;
    }
    const added = await this.rest.addItem(list, body);
    return added.Id as number;
  }

  // ---------- Categories ----------

  public async saveCategory(c: CategoryInput): Promise<number> {
    return this._save(Lists.Categories, c.id, {
      [C.Title]: c.name.trim(),
      [C.Icon]: c.icon || null,
      [C.SortOrder]: c.sortOrder,
      [C.ServiceTeam]: await this._people(Lists.Categories, C.ServiceTeam, c.serviceTeam)
    });
  }

  public deleteCategory(id: number): Promise<void> {
    return this.rest.deleteItem(Lists.Categories, id);
  }

  // ---------- Departments ----------

  public async saveDepartment(d: DepartmentInput, departments: IDepartment[]): Promise<number> {
    return this._save(Lists.Departments, d.id, {
      [D.Title]: d.name.trim(),
      [D.Head]: await this._people(Lists.Departments, D.Head, d.head ? [d.head] : []),
      [D.ParentDepartment]: await this._ref(Lists.Departments, D.ParentDepartment, d.parent, departments)
    });
  }

  public deleteDepartment(id: number): Promise<void> {
    return this.rest.deleteItem(Lists.Departments, id);
  }

  // ---------- Employees ----------

  public async saveEmployee(e: EmployeeInput, departments: IDepartment[]): Promise<number> {
    return this._save(Lists.Employees, e.id, {
      [E.Title]: e.name.trim(),
      [E.Email]: e.email.trim().toLowerCase(),
      [E.Manager]: await this._people(Lists.Employees, E.Manager, e.manager ? [e.manager] : []),
      [E.Department]: await this._ref(Lists.Employees, E.Department, e.department, departments)
    });
  }

  public deleteEmployee(id: number): Promise<void> {
    return this.rest.deleteItem(Lists.Employees, id);
  }

  // ---------- Services ----------

  public async saveService(s: ServiceInput, categories: ICategory[]): Promise<number> {
    const fields = await this.rest.getFields(Lists.ServiceCatalog);
    const allowedIsPeople = fields[S.AllowedRequesters] && fields[S.AllowedRequesters].type.indexOf('User') === 0;
    return this._save(Lists.ServiceCatalog, s.id, {
      [S.Title]: s.name.trim(),
      [S.ServiceID]: s.serviceId.trim(),
      [S.Description]: s.description || null,
      [S.Category]: await this._ref(Lists.ServiceCatalog, S.Category, s.category, categories),
      [S.Icon]: s.icon || null,
      [S.SLAHours]: s.slaHours === undefined ? null : s.slaHours,
      [S.IsActive]: s.isActive,
      [S.AllowedRequesters]: allowedIsPeople
        ? await this._people(Lists.ServiceCatalog, S.AllowedRequesters, s.allowedRequesters)
        : (s.allowedRequestersText || '').trim() || null
    });
  }

  /** Deletes a service with its form fields and approval steps. */
  public async deleteService(service: IService, fields: IFormField[], rules: IApprovalRule[]): Promise<void> {
    for (const f of fields) await this.rest.deleteItem(Lists.ServiceFormFields, f.id);
    for (const r of rules) await this.rest.deleteItem(Lists.ApprovalRules, r.id);
    await this.rest.deleteItem(Lists.ServiceCatalog, service.id);
  }

  // ---------- Form fields ----------

  public saveField(f: FieldInput): Promise<number> {
    const num = (n: number | undefined): number | null => (n === undefined || isNaN(n) ? null : n);
    return this._save(Lists.ServiceFormFields, f.id, {
      [F.Title]: f.label.trim(),
      [F.ServiceID]: f.serviceId,
      [F.FieldKey]: f.key.trim(),
      [F.FieldType]: f.typeValue,
      [F.Required]: f.required,
      [F.SortOrder]: f.sortOrder,
      [F.ChoiceSource]: f.choiceSource || null,
      [F.Choices]: f.choices.length ? f.choices.join('\n') : null,
      [F.HelpText]: f.helpText || null,
      [F.Placeholder]: f.placeholder || null,
      [F.ValidationRegex]: f.validationRegex || null,
      [F.ValidationMessage]: f.validationMessage || null,
      [F.MinValue]: num(f.minValue),
      [F.MaxValue]: num(f.maxValue),
      [F.VisibleIf]: f.visibleIf || null
    });
  }

  public deleteField(id: number): Promise<void> {
    return this.rest.deleteItem(Lists.ServiceFormFields, id);
  }

  public async setSortOrders(changes: { id: number; sortOrder: number }[]): Promise<void> {
    for (const c of changes) await this.rest.updateItem(Lists.ServiceFormFields, c.id, { [F.SortOrder]: c.sortOrder });
  }

  // ---------- Approval rules ----------

  public saveRule(r: RuleInput): Promise<number> {
    const num = (n: number | undefined): number | null => (n === undefined || isNaN(n) ? null : n);
    const hasCondition = !!(r.conditionField || '').trim();
    return this._save(Lists.ApprovalRules, r.id, {
      [R.Title]: r.stepName.trim(),
      [R.ServiceID]: r.serviceId,
      [R.StepNo]: r.stepNo,
      [R.ApproverType]: r.approverType,
      [R.ApproverValue]: r.approverValue || null,
      [R.Mode]: r.mode,
      [R.ConditionField]: hasCondition ? r.conditionField : null,
      [R.ConditionOperator]: hasCondition ? r.conditionOperator || null : null,
      [R.ConditionValue]: hasCondition ? r.conditionValue || null : null,
      [R.RequiredChecks]: r.requiredChecks || null,
      [R.ReminderHours]: num(r.reminderHours),
      [R.EscalateHours]: num(r.escalateHours),
      [R.EscalateToBackup]: r.escalateToBackup || null
    });
  }

  public deleteRule(id: number): Promise<void> {
    return this.rest.deleteItem(Lists.ApprovalRules, id);
  }

  public async setStepNumbers(changes: { id: number; stepNo: number }[]): Promise<void> {
    for (const c of changes) await this.rest.updateItem(Lists.ApprovalRules, c.id, { [R.StepNo]: c.stepNo });
  }

  // ---------- Requests ----------

  /** Admin change of a request's state. Written to the approval log so the history stays complete. */
  public async updateRequest(request: IRequest, u: IRequestUpdate, adminUserId: number): Promise<void> {
    await this.rest.updateItem(Lists.Requests, request.id, {
      [Q.Status]: u.status,
      [Q.CurrentStep]: u.currentStep,
      [Q.CurrentApprover]: await this._people(Lists.Requests, Q.CurrentApprover, u.currentApprovers),
      [Q.Priority]: u.priority || null,
      [Q.ResolutionNote]: u.resolutionNote || null
    });

    const changes: string[] = [];
    if (u.status !== request.status) changes.push(`status ${request.status} → ${u.status}`);
    if (u.currentStep !== request.currentStep) changes.push(`step ${request.currentStep} → ${u.currentStep}`);
    const before = request.currentApprovers.map(p => p.name).join(', ');
    const after = u.currentApprovers.map(p => p.name).join(', ');
    if (before !== after) changes.push(`approver ${before || '(none)'} → ${after || '(none)'}`);
    if (!changes.length && !u.comment) return;

    const logFields = await this.rest.getFields(Lists.ApprovalLog).catch(() => ({} as Record<string, { type: string }>));
    const info = logFields[L.RequestID];
    await this.rest.addItem(Lists.ApprovalLog, {
      [L.Title]: `${request.requestId} - Admin update`,
      [L.RequestID]: info && info.type.indexOf('Lookup') === 0 ? request.id : request.requestId,
      [L.StepNo]: u.currentStep,
      [L.Decision]: 'Admin update',
      [L.Approver]: adminUserId,
      [L.Comment]: [changes.length ? `Changed ${changes.join(', ')}.` : '', u.comment || ''].filter(Boolean).join(' '),
      [L.DecisionOn]: new Date().toISOString()
    }).catch(e => console.warn('[TForce] Could not write the admin change to the approval log.', e));
  }
}
