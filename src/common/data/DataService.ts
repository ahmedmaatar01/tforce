import { WebPartContext } from '@microsoft/sp-webpart-base';
import {
  FieldValues,
  IApprovalLogEntry,
  IApprovalRule,
  ICategory,
  ICurrentUser,
  IDepartment,
  IEmployee,
  IFileValue,
  IFormField,
  IPerson,
  IRequest,
  IService,
  RequestStatus
} from '../models';
import { ApprovalLogCols as L, Lists, RequestIdPrefix, RequestsCols as Q } from '../schema';
import { applicableSteps, findStep, IApprovalStep, isStepComplete, nextStep } from '../logic/approvals';
import { lookupValue } from '../logic/conditions';
import { approverKind } from '../logic/adminChecks';
import {
  person,
  text,
  toApprovalRule,
  toCategory,
  toDepartment,
  toEmployee,
  toFormField,
  toLogEntry,
  toRequest,
  toService
} from './mappers';
import { odataString, RawItem, SpRest } from './SpRest';

export interface IApproverResult {
  approvers: IPerson[];
  /** Admin-only explanation when no approver could be found. */
  problem?: string;
}

export interface ISubmitResult {
  request: IRequest;
  firstStep?: IApprovalStep;
  firstApprovers: IPerson[];
  /** Files that could not be uploaded (the request itself was saved). */
  failedFiles: string[];
}

export interface IDecisionResult {
  newStatus: RequestStatus;
  next?: IApprovalStep;
}

/** An error whose message can be shown to the user as is. Nothing was saved when it is thrown. */
export class UserFacingError extends Error {
  /** Technical detail for site admins. */
  public readonly adminDetail?: string;
  public constructor(message: string, adminDetail?: string) {
    super(message);
    // The project compiles to ES5: without this, "instanceof UserFacingError" is false.
    Object.setPrototypeOf(this, UserFacingError.prototype);
    this.name = 'UserFacingError';
    this.adminDetail = adminDetail;
  }
}

let shared: { key: string; service: DataService } | undefined;

/**
 * Data layer shared by all TForce web parts.
 * Every configuration list is read once per page view and filtered in memory.
 */
export class DataService {
  public readonly rest: SpRest;
  private readonly _ctx: WebPartContext;

  private constructor(ctx: WebPartContext) {
    this._ctx = ctx;
    this.rest = new SpRest(ctx.spHttpClient, ctx.pageContext.web.absoluteUrl);
  }

  /** One instance per site for the whole page. */
  public static get(ctx: WebPartContext): DataService {
    const key = ctx.pageContext.web.absoluteUrl;
    if (!shared || shared.key !== key) shared = { key, service: new DataService(ctx) };
    return shared.service;
  }

  // ---------- Current user ----------

  public async getCurrentUser(): Promise<ICurrentUser> {
    const u = await this.rest.getCurrentUser();
    const groups = (u.Groups && (u.Groups.results || u.Groups)) || [];
    return {
      id: u.Id,
      name: u.Title,
      email: String(u.Email || this._ctx.pageContext.user.email || '').toLowerCase(),
      loginName: u.LoginName,
      isSiteAdmin: !!u.IsSiteAdmin,
      groupIds: groups.map((g: { Id: number }) => g.Id)
    };
  }

  // ---------- Configuration lists (read once per page view) ----------

  public async getCategories(): Promise<ICategory[]> {
    const items = await this.rest.getItems(Lists.Categories);
    return items.map(toCategory).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  public async getServices(): Promise<IService[]> {
    const items = await this.rest.getItems(Lists.ServiceCatalog);
    return items.map(toService).sort((a, b) => a.name.localeCompare(b.name));
  }

  public async getService(serviceId: string): Promise<IService | undefined> {
    return (await this.getServices()).filter(s => s.serviceId === serviceId)[0];
  }

  public async getFormFields(serviceId: string): Promise<IFormField[]> {
    const items = await this.rest.getItems(Lists.ServiceFormFields);
    return items
      .map(toFormField)
      .filter(f => f.serviceId === serviceId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public async getApprovalRules(serviceId: string): Promise<IApprovalRule[]> {
    const items = await this.rest.getItems(Lists.ApprovalRules);
    return items
      .map(toApprovalRule)
      .filter(r => r.serviceId === serviceId)
      .sort((a, b) => a.stepNo - b.stepNo);
  }

  public async getEmployees(): Promise<IEmployee[]> {
    const items = await this.rest.getItems(Lists.Employees);
    return items.map(toEmployee).sort((a, b) => a.name.localeCompare(b.name));
  }

  public async getEmployeeByEmail(email: string | undefined): Promise<IEmployee | undefined> {
    if (!email) return undefined;
    const e = email.toLowerCase();
    return (await this.getEmployees()).filter(x => x.email === e)[0];
  }

  public async getDepartments(): Promise<IDepartment[]> {
    const items = await this.rest.getItems(Lists.Departments);
    return items.map(toDepartment);
  }

  /** Options for choice/lookup fields read from the list named in ChoiceSource (Title column). */
  public async getChoiceOptions(listTitle: string): Promise<string[]> {
    const items = await this.rest.getItems(listTitle);
    const values = items.map(i => text(i.Title)).filter(Boolean);
    return values.filter((v, idx) => values.indexOf(v) === idx).sort((a, b) => a.localeCompare(b));
  }

  /** Services the current user may request: active and AllowedRequesters empty or containing the user. */
  public canRequest(service: IService, user: ICurrentUser, employee?: IEmployee): boolean {
    if (!service.isActive) return false;
    if (service.allowedRequesters.length) {
      return service.allowedRequesters.some(p =>
        (p.id !== undefined && (p.id === user.id || user.groupIds.indexOf(p.id) >= 0)) ||
        (!!p.email && p.email.toLowerCase() === user.email)
      );
    }
    const t = (service.allowedRequestersText || '').trim().toLowerCase();
    if (!t || t === 'all' || t === 'everyone' || t === 'all employees') return true;
    const tokens = t.split(/[;,\n]/).map(s => s.trim()).filter(Boolean);
    const dept = ((employee && employee.department) || '').toLowerCase();
    return tokens.some(tok => tok === user.email || (!!dept && tok === dept));
  }

  // ---------- Approvers ----------

  /** Works out who approves a rule for a requester (brief section 9: ApproverType + ApproverValue). */
  public async resolveApprovers(rule: IApprovalRule, requesterEmail: string, values: FieldValues, fields: IFormField[]): Promise<IApproverResult> {
    const kind = approverKind(rule.approverType);
    const value = (rule.approverValue || '').trim();
    const requester = await this.getEmployeeByEmail(requesterEmail);
    const fromEmail = async (email: string): Promise<IPerson | undefined> => {
      const p = person(email);
      if (!p || !p.email) return p;
      const emp = await this.getEmployeeByEmail(p.email);
      return emp ? { name: emp.name, email: emp.email } : p;
    };

    if (kind === 'manager') {
      if (!requester) return { approvers: [], problem: `${requesterEmail} is not in ${Lists.Employees}, so their manager is unknown.` };
      if (!requester.manager) return { approvers: [], problem: `${requester.name} has no Manager in ${Lists.Employees}.` };
      const m = requester.manager.email ? await fromEmail(requester.manager.email) : requester.manager;
      return { approvers: m ? [m] : [] };
    }

    if (kind === 'department') {
      const deptName = (value || (requester && requester.department) || '').toLowerCase();
      const dept = (await this.getDepartments()).filter(d => d.name.toLowerCase() === deptName)[0];
      if (!dept || !dept.head) return { approvers: [], problem: `No Head found in ${Lists.Departments} for department "${deptName || '(none)'}".` };
      return { approvers: [dept.head] };
    }

    if (kind === 'field') {
      const { value: v } = lookupValue(value, values, fields);
      const p = v && typeof v === 'object' && !Array.isArray(v) ? { name: (v as IPerson).name, email: (v as IPerson).email } : person(v as string);
      if (!p) return { approvers: [], problem: `Form field "${value}" has no person in it.` };
      return { approvers: [p] };
    }

    if (kind === 'group') {
      if (!value) return { approvers: [], problem: `Step ${rule.stepNo} has ApproverType "${rule.approverType}" but no ApproverValue.` };
      return { approvers: [{ name: value }] };
    }

    // Person / Specific person / email(s) in ApproverValue
    const emails = value.split(/[;,\n]/).map(s => s.trim()).filter(Boolean);
    if (!emails.length) return { approvers: [], problem: `Step ${rule.stepNo} has no ApproverValue.` };
    const resolved = (await Promise.all(emails.map(fromEmail))).filter(Boolean) as IPerson[];
    return { approvers: resolved };
  }

  /** Approvers for a whole step (all rules of the step). */
  public async resolveStepApprovers(step: IApprovalStep, requesterEmail: string, values: FieldValues, fields: IFormField[]): Promise<IApproverResult> {
    const results = await Promise.all(step.rules.map(r => this.resolveApprovers(r, requesterEmail, values, fields)));
    const problem = results.map(r => r.problem).filter(Boolean).join(' ');
    const approvers: IPerson[] = [];
    results.forEach(r => r.approvers.forEach(a => approvers.push(a)));
    return { approvers, problem: problem || undefined };
  }

  /**
   * SharePoint user IDs for approvers, so they can be saved in the CurrentApprover person column.
   * People: by ID or email (ensureUser). A name without email (ApproverType "Group"): members of the SharePoint group with that name.
   */
  public async approverIds(people: IPerson[]): Promise<{ ids: number[]; problem?: string }> {
    const ids: number[] = [];
    const problems: string[] = [];
    for (const p of people) {
      try {
        if (p.id !== undefined) ids.push(p.id);
        else if (p.email) ids.push(await this.rest.ensureUser(p.email));
        else {
          const members = await this.rest.getGroupMemberIds(p.name);
          if (!members.length) problems.push(`The SharePoint group "${p.name}" has no members.`);
          members.forEach(id => ids.push(id));
        }
      } catch {
        problems.push(p.email
          ? `${p.name} (${p.email}) is not a user of this SharePoint site.`
          : `No SharePoint group named "${p.name}" was found on this site.`);
      }
    }
    const distinct = ids.filter((id, i) => ids.indexOf(id) === i);
    return { ids: distinct, problem: problems.length ? problems.join(' ') : undefined };
  }

  /** Checks every applicable step has an approver (and the first step's can be assigned). Returns an admin-only problem description, or undefined. */
  public async checkApprovers(steps: IApprovalStep[], requesterEmail: string, values: FieldValues, fields: IFormField[]): Promise<{ problem?: string; first: IPerson[] }> {
    let first: IPerson[] = [];
    for (let i = 0; i < steps.length; i++) {
      const r = await this.resolveStepApprovers(steps[i], requesterEmail, values, fields);
      if (r.problem || !r.approvers.length) return { problem: r.problem || `Step ${steps[i].stepNo} has no approver.`, first };
      if (i === 0) {
        // The first step is assigned on submit, so its approvers must be real site users (or a SharePoint group).
        // Later steps are checked when the previous step is approved.
        const ids = await this.approverIds(r.approvers);
        if (ids.problem || !ids.ids.length) return { problem: `Step ${steps[i].stepNo} (${steps[i].name}): ${ids.problem || 'no approver can be assigned.'}`, first };
        first = r.approvers;
      }
    }
    return { first };
  }

  /** IDs for the first step's approvers, or an error (nothing is saved). */
  private async _firstApproverIds(steps: IApprovalStep[], firstApprovers: IPerson[]): Promise<number[]> {
    if (!steps.length) return [];
    const r = await this.approverIds(firstApprovers);
    if (r.problem || !r.ids.length) {
      throw new UserFacingError('We could not find who approves this request. Nothing was sent. Please ask the IT team to check the set-up.', r.problem);
    }
    return r.ids;
  }

  // ---------- Requests ----------

  private async _serviceNames(): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    (await this.getServices()).forEach(s => {
      map[s.serviceId] = s.name;
    });
    return map;
  }

  private async _toRequests(items: Record<string, unknown>[]): Promise<IRequest[]> {
    const names = await this._serviceNames();
    return items.map(i => {
      const r = toRequest(i);
      return { ...r, serviceName: names[r.serviceId] || r.serviceName };
    });
  }

  public async getMyRequests(userId: number, fresh: boolean = false): Promise<IRequest[]> {
    const items = await this.rest.getItems(Lists.Requests, {
      filter: `${Q.Requester}Id eq ${userId}`,
      orderBy: 'Created',
      ascending: false,
      cache: !fresh
    });
    return this._toRequests(items);
  }

  public async getRequest(id: number): Promise<IRequest | undefined> {
    const item = await this.rest.getItem(Lists.Requests, id);
    return item ? (await this._toRequests([item]))[0] : undefined;
  }

  public async findRequestByRequestId(requestId: string): Promise<IRequest | undefined> {
    const items = await this.rest.getItems(Lists.Requests, { filter: `${Q.RequestID} eq ${odataString(requestId)}`, top: 1, cache: false });
    return items[0] ? (await this._toRequests(items))[0] : undefined;
  }

  /** Requests where the current user is the current approver. */
  public async getRequestsToApprove(userId: number): Promise<IRequest[]> {
    // Until the Requests list has a Status column and a person column CurrentApprover,
    // nothing can be waiting for anyone: show the empty state instead of an error.
    const fields = await this.rest.getFields(Lists.Requests);
    const approver = fields[Q.CurrentApprover];
    if (!fields[Q.Status] || !approver || (approver.type !== 'User' && approver.type !== 'UserMulti')) {
      console.warn(`[TForce] ${Lists.Requests} needs a "${Q.Status}" column and a person column "${Q.CurrentApprover}" for approvals. Showing no requests.`);
      return [];
    }
    const items = await this.rest.getItems(Lists.Requests, {
      filter: `${Q.Status} eq 'Pending Approval' and ${Q.CurrentApprover}/Id eq ${userId}`,
      orderBy: 'Created',
      ascending: true,
      cache: false
    });
    return this._toRequests(items);
  }

  /** Approved, in progress and resolved requests for the service team queue. */
  public async getQueue(): Promise<IRequest[]> {
    const items = await this.rest.getItems(Lists.Requests, {
      filter: `${Q.Status} eq 'Approved' or ${Q.Status} eq 'In Progress' or ${Q.Status} eq 'Resolved'`,
      orderBy: 'Created',
      ascending: true,
      cache: false
    });
    return this._toRequests(items);
  }

  public async getLog(request: IRequest): Promise<IApprovalLogEntry[]> {
    const fields = await this.rest.getFields(Lists.ApprovalLog);
    const info = fields[L.RequestID];
    const filter = info && info.type.indexOf('Lookup') === 0
      ? `${L.RequestID}/Id eq ${request.id}`
      : `${L.RequestID} eq ${odataString(request.requestId)}`;
    const items = await this.rest.getItems(Lists.ApprovalLog, { filter, orderBy: 'Created', ascending: true, cache: false });
    return items.map(toLogEntry).map(e => ({ ...e, requestId: request.requestId }));
  }

  private async _addLog(request: IRequest, stepNo: number, decision: string, comment: string | undefined, userId: number): Promise<void> {
    const fields = await this.rest.getFields(Lists.ApprovalLog);
    const info = fields[L.RequestID];
    await this.rest.addItem(Lists.ApprovalLog, {
      [L.Title]: `${request.requestId} - ${decision}`,
      [L.RequestID]: info && info.type.indexOf('Lookup') === 0 ? request.id : request.requestId,
      [L.StepNo]: stepNo,
      [L.Decision]: decision,
      [L.Approver]: userId,
      [L.Comment]: comment || undefined,
      [L.DecisionOn]: new Date().toISOString()
    });
  }

  /**
   * Creates the request (brief 5.4) and assigns it to the first step's approvers
   * (Status = Pending Approval, CurrentApprover set), so it shows in their queue straight away.
   * With no approval step it goes to the service team (Status = Approved).
   * A Power Automate flow can still send notifications on these changes.
   */
  public async submitRequest(service: IService, values: FieldValues, files: IFileValue[], steps: IApprovalStep[], firstApprovers: IPerson[]): Promise<ISubmitResult> {
    const approverIds = await this._firstApproverIds(steps, firstApprovers);
    const added = await this.rest.addItem(Lists.Requests, {
      [Q.Title]: service.name,
      [Q.ServiceID]: service.serviceId,
      [Q.Status]: steps.length ? 'Pending Approval' : 'Approved',
      [Q.CurrentStep]: steps.length ? steps[0].stepNo : 1,
      [Q.CurrentApprover]: approverIds,
      [Q.SubmittedOn]: new Date().toISOString(),
      [Q.FieldValues]: JSON.stringify(values),
      [Q.Priority]: typeof values.Priority === 'string' ? values.Priority : undefined
    });
    const id = added.Id as number;
    const requestId = `${RequestIdPrefix}${id}`;
    await this.rest.updateItem(Lists.Requests, id, { [Q.RequestID]: requestId });

    const failedFiles: string[] = [];
    for (const f of files) {
      if (!f.file) continue;
      try {
        await this.rest.addAttachment(Lists.Requests, id, f.file);
      } catch {
        failedFiles.push(f.name);
      }
    }
    const request = toRequest({ ...added, [Q.RequestID]: requestId });
    return { request: { ...request, serviceName: service.name }, firstStep: steps[0], firstApprovers, failedFiles };
  }

  /** Requester updates a returned request and sends it again from the first step, to the first step's approvers. */
  public async resubmitRequest(request: IRequest, values: FieldValues, files: IFileValue[], steps: IApprovalStep[], firstApprovers: IPerson[], userId: number): Promise<void> {
    const approverIds = await this._firstApproverIds(steps, firstApprovers);
    await this.rest.updateItem(Lists.Requests, request.id, {
      [Q.Status]: steps.length ? 'Pending Approval' : 'Approved',
      [Q.CurrentStep]: steps.length ? steps[0].stepNo : 1,
      [Q.CurrentApprover]: approverIds,
      [Q.FieldValues]: JSON.stringify(values)
    });
    for (const f of files) {
      if (f.file) await this.rest.addAttachment(Lists.Requests, request.id, f.file);
    }
    try {
      await this._addLog(request, 0, 'Resubmitted', undefined, userId);
    } catch (e) {
      // The request itself was sent again; only the history line is missing.
      console.error('[TForce] Could not add the Resubmitted log line', e);
    }
  }

  public async setStatus(request: IRequest, status: RequestStatus, logDecision: string, userId: number, comment?: string, extra: Record<string, unknown> = {}): Promise<void> {
    await this.rest.updateItem(Lists.Requests, request.id, { [Q.Status]: status, ...extra });
    await this._addLog(request, request.currentStep, logDecision, comment, userId);
  }

  /**
   * Records an approver decision (brief 7.1).
   * - Approve: moves to the next applicable step (and assigns its approvers), or to Approved when none is left.
   *   Parallel steps wait until every approver of the step has approved.
   * - Send back: Status = Returned (CurrentApprover = requester). Reject: Status = Rejected.
   * Checks first that the request is still waiting for this user at this step, works out the
   * next approvers before writing anything, and puts the request back if the log line cannot be saved.
   */
  public async recordDecision(request: IRequest, decision: 'Approved' | 'Returned' | 'Rejected', comment: string, user: ICurrentUser): Promise<IDecisionResult> {
    const fresh = await this.getRequest(request.id);
    const isMine = (p: IPerson): boolean => p.id === user.id || (!!p.email && p.email.toLowerCase() === user.email);
    if (!fresh || fresh.status !== 'Pending Approval' || fresh.currentStep !== request.currentStep || !fresh.currentApprovers.some(isMine)) {
      throw new UserFacingError('This request was already handled or has moved on. Nothing was saved. Refresh the page to see the latest.');
    }
    const stepNo = fresh.currentStep;
    const currentIds = fresh.currentApprovers.map(p => p.id).filter(id => id !== undefined) as number[];
    const before: RawItem = { [Q.Status]: fresh.status, [Q.CurrentStep]: fresh.currentStep, [Q.CurrentApprover]: currentIds };

    let update: RawItem;
    let result: IDecisionResult;
    if (decision === 'Returned') {
      update = { [Q.Status]: 'Returned', [Q.CurrentApprover]: fresh.requester.id !== undefined ? [fresh.requester.id] : [] };
      result = { newStatus: 'Returned' };
    } else if (decision === 'Rejected') {
      update = { [Q.Status]: 'Rejected', [Q.CurrentApprover]: [] };
      result = { newStatus: 'Rejected' };
    } else {
      const [rules, fields, log] = await Promise.all([
        this.getApprovalRules(fresh.serviceId),
        this.getFormFields(fresh.serviceId),
        this.getLog(fresh)
      ]);
      const steps = applicableSteps(rules, fresh.fieldValues, fields);
      const current = findStep(steps, stepNo);
      if (current && !isStepComplete(current, log, user.email)) {
        // Parallel step: the others still have to approve. This user is done.
        update = { [Q.CurrentApprover]: currentIds.filter(id => id !== user.id) };
        result = { newStatus: 'Pending Approval', next: current };
      } else {
        const next = nextStep(steps, stepNo);
        if (next) {
          const found = await this.resolveStepApprovers(next, fresh.requester.email || '', fresh.fieldValues, fields);
          const ids = found.problem ? { ids: [] as number[], problem: found.problem } : await this.approverIds(found.approvers);
          if (ids.problem || !ids.ids.length) {
            throw new UserFacingError(
              `We could not find who approves the next step (${next.name}). Nothing was saved. Please ask the IT team to check the set-up.`,
              ids.problem
            );
          }
          update = { [Q.CurrentStep]: next.stepNo, [Q.Status]: 'Pending Approval', [Q.CurrentApprover]: ids.ids };
          result = { newStatus: 'Pending Approval', next };
        } else {
          update = { [Q.Status]: 'Approved', [Q.CurrentApprover]: [] };
          result = { newStatus: 'Approved' };
        }
      }
    }

    await this.rest.updateItem(Lists.Requests, fresh.id, update);
    try {
      await this._addLog(fresh, stepNo, decision, comment, user.id);
    } catch (e) {
      // Keep the request and its history consistent: undo the change.
      try {
        await this.rest.updateItem(Lists.Requests, fresh.id, before);
      } catch (undoError) {
        console.error('[TForce] Could not undo the request change after the log failed', undoError);
      }
      throw e;
    }
    return result;
  }

  /** People in the service team, per category name (lower case). */
  public async getTeamCategories(user: ICurrentUser): Promise<string[]> {
    const cats = await this.getCategories();
    return cats
      .filter(c => c.serviceTeam.some(p =>
        (p.id !== undefined && (p.id === user.id || user.groupIds.indexOf(p.id) >= 0)) || (!!p.email && p.email.toLowerCase() === user.email)
      ))
      .map(c => c.name.toLowerCase());
  }
}
