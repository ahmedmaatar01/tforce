import { FieldValues, IApprovalLogEntry, IApprovalRule, IFormField, IRequest } from '../models';
import { evaluateRuleCondition } from './conditions';

export interface IApprovalStep {
  stepNo: number;
  name: string;
  mode: 'Sequential' | 'Parallel';
  rules: IApprovalRule[];
}

/**
 * Returns the approval steps that apply to a request, in order.
 * Steps whose condition is false are skipped (and never shown).
 * Rules with the same StepNo form one step (approved together when Mode = Parallel).
 */
export function applicableSteps(rules: IApprovalRule[], values: FieldValues, fields?: IFormField[]): IApprovalStep[] {
  const applying = rules.filter(r =>
    evaluateRuleCondition(r.conditionField, r.conditionOperator, r.conditionValue, values, fields)
  );
  const byStep: Record<number, IApprovalRule[]> = {};
  for (const r of applying) {
    (byStep[r.stepNo] = byStep[r.stepNo] || []).push(r);
  }
  return Object.keys(byStep)
    .map(Number)
    .sort((a, b) => a - b)
    .map(stepNo => {
      const group = byStep[stepNo];
      const names = group.map(r => r.stepName).filter((n, i, all) => !!n && all.indexOf(n) === i);
      return {
        stepNo,
        name: names.join(' + ') || `Step ${stepNo}`,
        mode: group.some(r => r.mode === 'Parallel') ? 'Parallel' : 'Sequential',
        rules: group
      } as IApprovalStep;
    });
}

export function findStep(steps: IApprovalStep[], stepNo: number): IApprovalStep | undefined {
  return steps.filter(s => s.stepNo === stepNo)[0];
}

/** The first applicable step after the given step number, or undefined when none is left. */
export function nextStep(steps: IApprovalStep[], afterStepNo: number): IApprovalStep | undefined {
  return steps.filter(s => s.stepNo > afterStepNo)[0];
}

function sameText(a?: string, b?: string): boolean {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

/** Approval decisions recorded for one step, since the last time the request was sent back. */
export function approvalsForStep(log: IApprovalLogEntry[], stepNo: number): IApprovalLogEntry[] {
  const sorted = log.slice().sort((a, b) => a.decisionOn.getTime() - b.decisionOn.getTime());
  let lastReset = -1;
  sorted.forEach((e, i) => {
    if (sameText(e.decision, 'Returned') || sameText(e.decision, 'Resubmitted')) lastReset = i;
  });
  return sorted.slice(lastReset + 1).filter(e => e.stepNo === stepNo && sameText(e.decision, 'Approved'));
}

/** A step is complete when one approver approved it (sequential) or every rule's approver did (parallel). */
export function isStepComplete(step: IApprovalStep, log: IApprovalLogEntry[], extraApproverEmail?: string): boolean {
  const approvals = approvalsForStep(log, step.stepNo);
  const approvers = approvals.map(a => ((a.approver && (a.approver.email || a.approver.name)) || '').toLowerCase());
  if (extraApproverEmail) approvers.push(extraApproverEmail.toLowerCase());
  const distinct = approvers.filter((a, i) => approvers.indexOf(a) === i);
  if (step.mode !== 'Parallel') return distinct.length > 0;
  return distinct.length >= step.rules.length;
}

export type StepState = 'done' | 'current' | 'future' | 'stopped';

export interface IStepProgress {
  step: IApprovalStep;
  state: StepState;
  completedOn?: Date;
  completedBy?: string;
}

const AFTER_APPROVAL = ['Approved', 'In Progress', 'Resolved', 'Closed'];

/** Builds the progress strip for a request (brief 6.2). */
export function stepProgress(request: IRequest, steps: IApprovalStep[], log: IApprovalLogEntry[]): IStepProgress[] {
  const allDone = AFTER_APPROVAL.indexOf(request.status) >= 0;
  const stopped = request.status === 'Rejected' || request.status === 'Cancelled';
  return steps.map(step => {
    const approvals = approvalsForStep(log, step.stepNo);
    const last = approvals[approvals.length - 1];
    let state: StepState;
    if (allDone || step.stepNo < request.currentStep) state = 'done';
    else if (step.stepNo === request.currentStep) state = stopped ? 'stopped' : 'current';
    else state = 'future';
    return {
      step,
      state,
      completedOn: state === 'done' && last ? last.decisionOn : undefined,
      completedBy: state === 'done' && last && last.approver ? last.approver.name : undefined
    };
  });
}
