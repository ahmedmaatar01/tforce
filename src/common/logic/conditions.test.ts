import { compare, evaluateExpression, evaluateRuleCondition, normalizeOperator, parseClause, visibleFields } from './conditions';
import { IFormField } from '../models';

function field(key: string, extra: Partial<IFormField> = {}): IFormField {
  return { id: key.length, serviceId: 'S1', key, label: key, type: 'text', required: false, sortOrder: 1, choices: [], ...extra };
}

describe('normalizeOperator', () => {
  it('reads symbols and words', () => {
    expect(normalizeOperator('>')).toBe('>');
    expect(normalizeOperator('Greater than')).toBe('>');
    expect(normalizeOperator('equals')).toBe('=');
    expect(normalizeOperator('<>')).toBe('!=');
    expect(normalizeOperator('is not empty')).toBe('notempty');
    expect(normalizeOperator('banana')).toBeUndefined();
  });
});

describe('parseClause', () => {
  it('parses the brief examples', () => {
    expect(parseClause('Cost > 5000')).toEqual({ field: 'Cost', operator: '>', value: '5000' });
    expect(parseClause('Type = Shared mailbox')).toEqual({ field: 'Type', operator: '=', value: 'Shared mailbox' });
  });
  it('parses word operators and multi-word field names', () => {
    expect(parseClause('Request type is not empty')).toEqual({ field: 'Request type', operator: 'notempty', value: '' });
    expect(parseClause('Cost >= 10')).toEqual({ field: 'Cost', operator: '>=', value: '10' });
  });
  it('returns undefined for text without an operator', () => {
    expect(parseClause('just words')).toBeUndefined();
  });
});

describe('compare', () => {
  it('compares numbers numerically', () => {
    expect(compare(6000, '>', '5000')).toBe(true);
    expect(compare('900', '>', '5000')).toBe(false);
    expect(compare('5,500', '>', '5000')).toBe(true);
  });
  it('compares text without case', () => {
    expect(compare('Shared Mailbox', '=', 'shared mailbox')).toBe(true);
    expect(compare('Shared Mailbox', '!=', 'shared mailbox')).toBe(false);
    expect(compare('Laptop and dock', 'contains', 'DOCK')).toBe(true);
  });
  it('treats yes/no and booleans the same', () => {
    expect(compare(true, '=', 'Yes')).toBe(true);
    expect(compare(false, '=', 'yes')).toBe(false);
    expect(compare(true, '=', 'true')).toBe(true);
  });
  it('handles empty values', () => {
    expect(compare(undefined, '>', '5000')).toBe(false);
    expect(compare('', 'empty', undefined)).toBe(true);
    expect(compare(undefined, '!=', 'x')).toBe(true);
    expect(compare('a', 'notempty', undefined)).toBe(true);
  });
  it('compares ISO dates', () => {
    expect(compare('2026-12-01', '>', '2026-11-30')).toBe(true);
  });
  it('compares people by email', () => {
    expect(compare({ name: 'Sara', email: 'Sara@x.com' }, '=', 'sara@x.com')).toBe(true);
  });
});

describe('evaluateExpression', () => {
  const fields = [field('Cost', { type: 'number' }), field('Type', { type: 'choice' }), field('Urgent', { type: 'yesno', label: 'Is it urgent' })];

  it('is true when there is no expression', () => {
    expect(evaluateExpression(undefined, {}).result).toBe(true);
    expect(evaluateExpression('  ', {}).result).toBe(true);
  });
  it('evaluates single clauses', () => {
    expect(evaluateExpression('Cost > 5000', { Cost: 6000 }, fields).result).toBe(true);
    expect(evaluateExpression('Cost > 5000', { Cost: 10 }, fields).result).toBe(false);
    expect(evaluateExpression('Type = Shared mailbox', { Type: 'Shared mailbox' }, fields).result).toBe(true);
  });
  it('supports AND / OR (AND binds tighter)', () => {
    const v = { Cost: 6000, Type: 'Laptop', Urgent: false };
    expect(evaluateExpression('Cost > 5000 and Type = Laptop', v, fields).result).toBe(true);
    expect(evaluateExpression('Cost > 5000 and Type = Phone', v, fields).result).toBe(false);
    expect(evaluateExpression('Type = Phone or Cost > 5000', v, fields).result).toBe(true);
    expect(evaluateExpression('Type = Phone or Urgent = Yes and Cost > 1', v, fields).result).toBe(false);
  });
  it('finds fields by label as well as key', () => {
    expect(evaluateExpression('Is it urgent = Yes', { Urgent: true }, fields).result).toBe(true);
  });
  it('fails open (shows the field) when the expression cannot be read', () => {
    const r = evaluateExpression('Missing > 5', {}, fields);
    expect(r.valid).toBe(false);
    expect(r.result).toBe(true);
    expect(evaluateExpression('nonsense', {}, fields).valid).toBe(false);
  });
});

describe('evaluateRuleCondition', () => {
  it('applies when no condition is set', () => {
    expect(evaluateRuleCondition(undefined, undefined, undefined, {})).toBe(true);
  });
  it('uses word operators from the list', () => {
    expect(evaluateRuleCondition('Cost', 'greater than', '5000', { Cost: 7000 })).toBe(true);
    expect(evaluateRuleCondition('Cost', 'greater than', '5000', { Cost: 100 })).toBe(false);
    expect(evaluateRuleCondition('Type', undefined, 'Laptop', { Type: 'laptop' })).toBe(true);
  });
});

describe('visibleFields', () => {
  it('hides fields whose VisibleIf is false', () => {
    const fields = [field('Cost', { type: 'number' }), field('Justification', { visibleIf: 'Cost > 5000' })];
    expect(visibleFields(fields, { Cost: 100 }).map(f => f.key)).toEqual(['Cost']);
    expect(visibleFields(fields, { Cost: 9000 }).map(f => f.key)).toEqual(['Cost', 'Justification']);
  });
});
