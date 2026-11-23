import { FieldValue, FieldValues, IFileValue, IFormField } from '../models';
import { visibleFields } from './conditions';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export type ValidationErrors = Record<string, string>;

export function isEmptyValue(value: FieldValue): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'number') return isNaN(value);
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return !(value as { email?: string; name?: string }).email && !(value as { name?: string }).name;
  return false;
}

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.substring(1) : s;
}

function requiredMessage(field: IFormField): string {
  const label = lowerFirst(field.label);
  switch (field.type) {
    case 'choice':
    case 'lookup':
    case 'person':
    case 'date':
      return `Please choose ${label}`;
    case 'attachment':
      return `Please add ${label}`;
    case 'yesno':
      return `Please answer ${label}`;
    default:
      return `Please enter ${label}`;
  }
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/** Validates one field. Returns an error message, or undefined when valid. */
export function validateField(field: IFormField, value: FieldValue): string | undefined {
  const empty = isEmptyValue(value);
  if (empty) {
    // A yes/no toggle always has an answer (No when untouched).
    if (field.required && field.type !== 'yesno') return requiredMessage(field);
    return undefined;
  }

  switch (field.type) {
    case 'number': {
      const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
      if (isNaN(n)) return field.validationMessage || 'Please enter a number';
      if (field.minValue !== undefined && n < field.minValue) {
        return field.validationMessage || `Please enter ${formatNumber(field.minValue)} or more`;
      }
      if (field.maxValue !== undefined && n > field.maxValue) {
        return field.validationMessage || `Please enter ${formatNumber(field.maxValue)} or less`;
      }
      break;
    }
    case 'date': {
      if (isNaN(Date.parse(String(value)))) return 'Please choose a valid date';
      break;
    }
    case 'attachment': {
      const files = value as IFileValue[];
      const tooBig = files.filter(f => f.size > MAX_ATTACHMENT_BYTES);
      if (tooBig.length) return `${tooBig[0].name} is larger than 25 MB`;
      break;
    }
    case 'text':
    case 'multiline': {
      const s = String(value);
      if (field.minValue !== undefined && s.trim().length < field.minValue) {
        return field.validationMessage || `Please enter at least ${field.minValue} characters`;
      }
      if (field.maxValue !== undefined && s.length > field.maxValue) {
        return field.validationMessage || `Please use ${field.maxValue} characters or fewer`;
      }
      break;
    }
    default:
      break;
  }

  if (field.validationRegex && (field.type === 'text' || field.type === 'multiline' || field.type === 'number')) {
    let re: RegExp | undefined;
    try {
      // The pattern comes from the ServiceFormFields list (admin configuration), by design.
      // eslint-disable-next-line @rushstack/security/no-unsafe-regexp
      re = new RegExp(field.validationRegex);
    } catch {
      re = undefined; // a broken regex in configuration must not block employees
    }
    if (re && !re.test(String(value))) {
      return field.validationMessage || `Please check the format of ${lowerFirst(field.label)}`;
    }
  }
  return undefined;
}

/** Validates all visible fields. Hidden fields are never validated. */
export function validateForm(fields: IFormField[], values: FieldValues): ValidationErrors {
  const errors: ValidationErrors = {};
  for (const field of visibleFields(fields, values)) {
    const error = validateField(field, values[field.key]);
    if (error) errors[field.key] = error;
  }
  return errors;
}

/** Keeps only visible, non-empty values. Files are stored by name only. */
export function valuesToSave(fields: IFormField[], values: FieldValues): FieldValues {
  const result: FieldValues = {};
  for (const field of visibleFields(fields, values)) {
    const v = values[field.key];
    if (field.type === 'yesno') {
      result[field.key] = v === true;
      continue;
    }
    if (isEmptyValue(v)) continue;
    if (field.type === 'attachment') {
      result[field.key] = (v as IFileValue[]).map(f => ({ name: f.name, size: f.size }));
    } else if (field.type === 'number') {
      result[field.key] = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    } else {
      result[field.key] = v;
    }
  }
  return result;
}

/** True when the employee typed or chose anything (used for "Discard this request?"). */
export function hasAnyInput(values: FieldValues): boolean {
  return Object.keys(values).some(k => {
    const v = values[k];
    return typeof v === 'boolean' ? v : !isEmptyValue(v);
  });
}
