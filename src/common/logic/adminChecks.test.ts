import {
  approverKind,
  buildCondition,
  checkField,
  checkRule,
  conditionFields,
  fieldUsage,
  makeFieldKey,
  makeServiceId,
  moveField,
  moveStep,
  operatorToStore,
  parseSimpleCondition
} from './adminChecks';
import { IApprovalRule, IFormField } from '../models';

function field(id: number, key: string, extra: Partial<IFormField> = {}): IFormField {
  return { id, serviceId: 'S1', key, label: key, type: 'text', required: false, sortOrder: id * 10, choices: [], ...extra };
}

function rule(id: number, stepNo: number, extra: Partial<IApprovalRule> = {}): IApprovalRule {
  return { id, serviceId: 'S1', stepNo, stepName: `Step ${stepNo}`, approverType: 'Manager', mode: 'Sequential', ...extra };
}

describe('approverKind', () => {
  it('classifies approver types like the runtime does', () => {
    expect(approverKind('Manager')).toBe('manager');
    expect(approverKind('Line manager')).toBe('manager');
    expect(approverKind('Department manager')).toBe('department');
    expect(approverKind('Department head')).toBe('department');
    expect(approverKind('Form field')).toBe('field');
    expect(approverKind('Group')).toBe('group');
    expect(approverKind('Specific person')).toBe('person');
  });
});

describe('ids', () => {
  it('builds service codes and field codes that are unique', () => {
    expect(makeServiceId('Laptop request', [])).toBe('LAPTOP-REQUEST');
    expect(makeServiceId('Laptop request', ['LAPTOP-REQUEST'])).toBe('LAPTOP-REQUEST-2');
    expect(makeServiceId('Accès réseau', [])).toBe('ACCES-RESEAU');
    expect(makeFieldKey('Cost centre', [])).toBe('CostCentre');
    expect(makeFieldKey('Cost centre', ['costcentre'])).toBe('CostCentre2');
    expect(makeFieldKey('2nd approver', [])).toBe('F2ndApprover');
  });
});

describe('conditions', () => {
  it('round-trips a simple condition', () => {
    const c = parseSimpleCondition('Cost > 5000');
    expect(c).toEqual({ field: 'Cost', op: '>', value: '5000' });
    expect(buildCondition(c!)).toBe('Cost > 5000');
    expect(buildCondition({ field: 'Notes', op: 'empty', value: 'x' })).toBe('Notes is empty');
    expect(parseSimpleCondition('Notes is empty')).toEqual({ field: 'Notes', op: 'empty', value: '' });
  });

  it('treats and/or expressions as advanced', () => {
    expect(parseSimpleCondition('A = 1 and B = 2')).toBeUndefined();
    expect(conditionFields('A = 1 and B = 2 or C > 3').fields).toEqual(['A', 'B', 'C']);
  });

  it('stores operators as the list choice when there is one', () => {
    expect(operatorToStore('>', ['Equals', 'Greater than', 'Less than'])).toBe('Greater than');
    expect(operatorToStore('>', [])).toBe('>');
  });
});

describe('checkField', () => {
  const others = [field(1, 'Cost', { type: 'number' }), field(2, 'Type', { type: 'choice', choices: ['A', 'B'] })];

  it('blocks a duplicate code and a condition on a missing field', () => {
    expect(checkField({ id: 3, key: 'cost', label: 'Again', type: 'text' }, others).key).toBeDefined();
    expect(checkField({ id: 3, key: 'Notes', label: 'Notes', type: 'text', visibleIf: 'Budget > 10' }, others).visibleIf).toContain('Budget');
    expect(checkField({ id: 3, key: 'Notes', label: 'Notes', type: 'text', visibleIf: 'Cost > 10' }, others)).toEqual({});
  });

  it('needs options for drop-downs and a valid pattern', () => {
    expect(checkField({ id: 3, key: 'Pick', label: 'Pick', type: 'choice', choices: [] }, others).choices).toBeDefined();
    expect(checkField({ id: 3, key: 'Pick', label: 'Pick', type: 'choice', choices: [], choiceSource: 'webpartsTF_Departments' }, others).choices).toBeUndefined();
    expect(checkField({ id: 3, key: 'Code', label: 'Code', type: 'text', validationRegex: '([' }, others).validationRegex).toBeDefined();
  });
});

describe('checkRule', () => {
  const fields = [field(1, 'Cost', { type: 'number' }), field(2, 'Approver', { type: 'person' })];

  it('blocks rules that refer to fields that do not exist', () => {
    expect(checkRule(rule(1, 1, { conditionField: 'Budget', conditionOperator: '>', conditionValue: '1' }), fields, []).conditionField).toBeDefined();
    expect(checkRule(rule(1, 1, { conditionField: 'Cost', conditionOperator: '>', conditionValue: '1' }), fields, [])).toEqual({});
    expect(checkRule(rule(1, 1, { approverType: 'Form field', approverValue: 'Cost' }), fields, []).approverValue).toContain('not a person');
    expect(checkRule(rule(1, 1, { approverType: 'Form field', approverValue: 'Approver' }), fields, [])).toEqual({});
  });

  it('needs a value for people and groups', () => {
    expect(checkRule(rule(1, 1, { approverType: 'Person' }), fields, []).approverValue).toBeDefined();
    expect(checkRule(rule(1, 1, { approverType: 'Group', approverValue: 'IT team' }), fields, [])).toEqual({});
  });
});

describe('fieldUsage', () => {
  it('finds where a field is used', () => {
    const cost = field(1, 'Cost');
    const fields = [cost, field(2, 'Reason', { visibleIf: 'Cost > 100' })];
    const rules = [rule(1, 2, { conditionField: 'cost', conditionOperator: '>', conditionValue: '5000' })];
    expect(fieldUsage(cost, fields, rules)).toHaveLength(2);
    expect(fieldUsage(fields[1], fields, rules)).toHaveLength(0);
  });
});

describe('reordering', () => {
  it('moves a whole step (with its parallel approvers) and renumbers', () => {
    const rules = [rule(1, 1), rule(2, 2), rule(3, 2), rule(4, 5)];
    expect(moveStep(rules, 2, -1)).toEqual([
      { id: 1, stepNo: 2 },
      { id: 2, stepNo: 1 },
      { id: 3, stepNo: 1 },
      { id: 4, stepNo: 3 }
    ]);
    expect(moveStep(rules, 1, -1)).toEqual([]);
  });

  it('moves a field and renumbers sort orders by 10', () => {
    const fields = [field(1, 'A'), field(2, 'B'), field(3, 'C')];
    expect(moveField(fields, 3, -1)).toEqual([
      { id: 3, sortOrder: 20 },
      { id: 2, sortOrder: 30 }
    ]);
  });
});
