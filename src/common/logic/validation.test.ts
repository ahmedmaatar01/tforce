import { hasAnyInput, MAX_ATTACHMENT_BYTES, validateField, validateForm, valuesToSave } from './validation';
import { IFormField } from '../models';

function field(key: string, extra: Partial<IFormField> = {}): IFormField {
  return { id: 1, serviceId: 'S1', key, label: key, type: 'text', required: false, sortOrder: 1, choices: [], ...extra };
}

describe('validateField', () => {
  it('requires required fields with a plain message', () => {
    expect(validateField(field('CostCentre', { label: 'Cost centre', required: true }), '')).toBe('Please enter cost centre');
    expect(validateField(field('Dept', { label: 'Department', required: true, type: 'choice' }), undefined)).toBe('Please choose department');
    expect(validateField(field('Files', { label: 'A quote', required: true, type: 'attachment' }), [])).toBe('Please add a quote');
  });
  it('does not require a yes/no toggle (No is an answer)', () => {
    expect(validateField(field('Urgent', { type: 'yesno', required: true }), undefined)).toBeUndefined();
  });
  it('ignores empty optional fields', () => {
    expect(validateField(field('Note', { validationRegex: '^\\d+$' }), '')).toBeUndefined();
  });
  it('checks number min and max', () => {
    const f = field('Qty', { type: 'number', minValue: 1, maxValue: 10 });
    expect(validateField(f, '0')).toBe('Please enter 1 or more');
    expect(validateField(f, 11)).toBe('Please enter 10 or less');
    expect(validateField(f, '5')).toBeUndefined();
    expect(validateField(f, 'abc')).toBe('Please enter a number');
  });
  it('checks the regex and uses the configured message', () => {
    const f = field('CostCentre', { label: 'Cost centre', validationRegex: '^CC-\\d{4}$', validationMessage: 'Use the format CC-1234' });
    expect(validateField(f, 'CC-12')).toBe('Use the format CC-1234');
    expect(validateField(f, 'CC-1234')).toBeUndefined();
    expect(validateField({ ...f, validationMessage: undefined }, 'x')).toBe('Please check the format of cost centre');
  });
  it('never blocks on a broken regex', () => {
    expect(validateField(field('X', { validationRegex: '([' }), 'anything')).toBeUndefined();
  });
  it('limits attachment size to 25 MB', () => {
    const f = field('Files', { type: 'attachment' });
    expect(validateField(f, [{ name: 'big.zip', size: MAX_ATTACHMENT_BYTES + 1 }])).toBe('big.zip is larger than 25 MB');
    expect(validateField(f, [{ name: 'ok.pdf', size: 1000 }])).toBeUndefined();
  });
  it('uses min/max as length for text', () => {
    expect(validateField(field('Why', { minValue: 10 }), 'short')).toBe('Please enter at least 10 characters');
  });
});

describe('validateForm', () => {
  const fields = [
    field('Cost', { type: 'number', required: true }),
    field('Justification', { required: true, visibleIf: 'Cost > 5000' })
  ];
  it('does not validate hidden fields', () => {
    expect(validateForm(fields, { Cost: 100 })).toEqual({});
  });
  it('validates fields once they become visible', () => {
    expect(Object.keys(validateForm(fields, { Cost: 9000 }))).toEqual(['Justification']);
  });
  it('reports every invalid field', () => {
    expect(Object.keys(validateForm(fields, {}))).toEqual(['Cost']);
  });
});

describe('valuesToSave', () => {
  it('keeps only visible values, converts numbers and stores file names only', () => {
    const fields = [
      field('Cost', { type: 'number' }),
      field('Justification', { visibleIf: 'Cost > 5000' }),
      field('Urgent', { type: 'yesno' }),
      field('Files', { type: 'attachment' })
    ];
    const saved = valuesToSave(fields, {
      Cost: '100',
      Justification: 'left over from before',
      Files: [{ name: 'a.pdf', size: 10, file: {} as File }]
    });
    expect(saved).toEqual({ Cost: 100, Urgent: false, Files: [{ name: 'a.pdf', size: 10 }] });
  });
});

describe('hasAnyInput', () => {
  it('detects whether the user filled anything', () => {
    expect(hasAnyInput({})).toBe(false);
    expect(hasAnyInput({ A: '', B: false })).toBe(false);
    expect(hasAnyInput({ A: 'x' })).toBe(true);
    expect(hasAnyInput({ B: true })).toBe(true);
  });
});
