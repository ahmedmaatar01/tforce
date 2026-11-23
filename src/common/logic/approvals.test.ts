import { applicableSteps, isStepComplete, nextStep, stepProgress } from './approvals';
import { requestActions } from './requestActions';
import { IApprovalLogEntry, IApprovalRule, IRequest } from '../models';

function rule(stepNo: number, extra: Partial<IApprovalRule> = {}): IApprovalRule {
  return { id: stepNo, serviceId: 'S1', stepNo, stepName: `Step ${stepNo}`, approverType: 'Manager', mode: 'Sequential', ...extra };
}

function log(stepNo: number, decision: string, email: string, minutes: number = 0): IApprovalLogEntry {
  return { id: Math.random(), requestId: 'TKT-1', stepNo, decision, approver: { name: email, email }, decisionOn: new Date(2026, 10, 3, 10, minutes) };
}

function request(extra: Partial<IRequest> = {}): IRequest {
  return {
    id: 1, requestId: 'TKT-1', serviceId: 'S1', serviceName: 'Laptop', status: 'Pending Approval', currentStep: 1,
    currentApprovers: [], submittedOn: new Date(), modifiedOn: new Date(), fieldValues: {}, requester: { name: 'Me' }, ...extra
  };
}

const rules = [
  rule(1, { stepName: 'Manager' }),
  rule(2, { stepName: 'Finance', conditionField: 'Cost', conditionOperator: 'greater than', conditionValue: '5000' }),
  rule(3, { stepName: 'IT team' })
];

describe('applicableSteps', () => {
  it('skips steps whose condition is false', () => {
    expect(applicableSteps(rules, { Cost: 100 }).map(s => s.name)).toEqual(['Manager', 'IT team']);
    expect(applicableSteps(rules, { Cost: 9000 }).map(s => s.name)).toEqual(['Manager', 'Finance', 'IT team']);
  });
  it('groups rules with the same StepNo into one parallel step', () => {
    const steps = applicableSteps([rule(1, { stepName: 'Finance', mode: 'Parallel' }), rule(1, { stepName: 'Legal', mode: 'Parallel' })], {});
    expect(steps).toHaveLength(1);
    expect(steps[0].name).toBe('Finance + Legal');
    expect(steps[0].mode).toBe('Parallel');
  });
});

describe('nextStep', () => {
  it('jumps over skipped steps', () => {
    const steps = applicableSteps(rules, { Cost: 100 });
    expect(nextStep(steps, 1)!.name).toBe('IT team');
    expect(nextStep(steps, 3)).toBeUndefined();
  });
});

describe('isStepComplete', () => {
  it('needs one approval for a sequential step', () => {
    const [step] = applicableSteps([rule(1)], {});
    expect(isStepComplete(step, [])).toBe(false);
    expect(isStepComplete(step, [log(1, 'Approved', 'a@x.com')])).toBe(true);
  });
  it('needs every approver for a parallel step', () => {
    const [step] = applicableSteps([rule(1, { mode: 'Parallel' }), rule(1, { mode: 'Parallel' })], {});
    expect(isStepComplete(step, [log(1, 'Approved', 'a@x.com')])).toBe(false);
    expect(isStepComplete(step, [log(1, 'Approved', 'a@x.com')], 'b@x.com')).toBe(true);
    expect(isStepComplete(step, [log(1, 'Approved', 'a@x.com')], 'A@x.com')).toBe(false);
  });
  it('ignores approvals given before the request was sent back', () => {
    const [step] = applicableSteps([rule(1)], {});
    expect(isStepComplete(step, [log(1, 'Approved', 'a@x.com', 1), log(2, 'Returned', 'b@x.com', 2)])).toBe(false);
  });
});

describe('stepProgress', () => {
  const steps = applicableSteps(rules, { Cost: 100 });
  it('marks done, current and future steps', () => {
    const p = stepProgress(request({ currentStep: 3 }), steps, [log(1, 'Approved', 'a@x.com')]);
    expect(p.map(x => x.state)).toEqual(['done', 'current']);
    expect(p[0].completedOn).toBeDefined();
  });
  it('marks everything done once approved', () => {
    expect(stepProgress(request({ status: 'Approved', currentStep: 3 }), steps, []).map(x => x.state)).toEqual(['done', 'done']);
  });
  it('shows where a rejected request stopped', () => {
    expect(stepProgress(request({ status: 'Rejected', currentStep: 1 }), steps, []).map(x => x.state)).toEqual(['stopped', 'future']);
  });
});

describe('requestActions', () => {
  it('allows cancel before any approval', () => {
    expect(requestActions(request({ status: 'Submitted' }), []).cancel.allowed).toBe(true);
  });
  it('blocks cancel after approval with a reason', () => {
    const a = requestActions(request({ status: 'Pending Approval', currentStep: 2 }), [log(1, 'Approved', 'a@x.com')]);
    expect(a.cancel.allowed).toBe(false);
    expect(a.cancel.reason).toBe("You can't cancel this after approval");
  });
  it('offers resubmit only when returned and confirm only when resolved', () => {
    expect(requestActions(request({ status: 'Returned' }), []).resubmit.visible).toBe(true);
    expect(requestActions(request({ status: 'Submitted' }), []).resubmit.visible).toBe(false);
    expect(requestActions(request({ status: 'Resolved' }), []).confirm.visible).toBe(true);
  });
});
