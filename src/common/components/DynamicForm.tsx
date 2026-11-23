import * as React from 'react';
import {
  ComboBox,
  DatePicker,
  DayOfWeek,
  Dropdown,
  IconButton,
  Icon,
  Label,
  TextField,
  Toggle
} from '@fluentui/react';
import styles from './Common.module.scss';
import { FieldValue, FieldValues, IFileValue, IFormField, IPersonValue } from '../models';
import { visibleFields } from '../logic/conditions';
import { MAX_ATTACHMENT_BYTES, ValidationErrors } from '../logic/validation';
import { formatDate } from '../logic/format';
import { UserPicker } from './UserPicker';

export interface IDynamicFormProps {
  fields: IFormField[];
  values: FieldValues;
  errors: ValidationErrors;
  disabled?: boolean;
  /** Loads options for choice/lookup fields from the list named in ChoiceSource. */
  loadOptions: (listTitle: string) => Promise<string[]>;
  onChange: (key: string, value: FieldValue) => void;
}

function toDateValue(v: FieldValue): Date | undefined {
  if (!v || typeof v !== 'string') return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

// eslint-disable-next-line @rushstack/no-new-null -- Fluent DatePicker passes null
function toIsoDate(d: Date | null | undefined): string | undefined {
  if (!d) return undefined;
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${d.getFullYear()}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FieldError: React.FC<{ id: string; message?: string }> = ({ id, message }) =>
  message ? (
    <div id={id} className={styles.fieldError} role="alert">
      <Icon iconName="ErrorBadge" aria-hidden="true" />
      <span>{message}</span>
    </div>
  ) : null;

/** Options for choice and lookup fields: from ChoiceSource list, or from the Choices column. */
function useOptions(field: IFormField, loadOptions: (listTitle: string) => Promise<string[]>): { options: string[]; loading: boolean; failed: boolean } {
  const [state, setState] = React.useState<{ options: string[]; loading: boolean; failed: boolean }>({
    options: field.choices,
    loading: !!field.choiceSource && (field.type === 'choice' || field.type === 'lookup'),
    failed: false
  });
  React.useEffect(() => {
    if (!field.choiceSource || (field.type !== 'choice' && field.type !== 'lookup')) return;
    let alive = true;
    loadOptions(field.choiceSource)
      .then(options => alive && setState({ options: options.length ? options : field.choices, loading: false, failed: false }))
      .catch(() => alive && setState({ options: field.choices, loading: false, failed: !field.choices.length }));
    return () => {
      alive = false;
    };
  }, [field.choiceSource, field.type]);
  return state;
}

const FieldControl: React.FC<{
  field: IFormField;
  value: FieldValue;
  error?: string;
  disabled?: boolean;
  loadOptions: (listTitle: string) => Promise<string[]>;
  onChange: (value: FieldValue) => void;
}> = ({ field, value, error, disabled, loadOptions, onChange }) => {
  const id = `tf-field-${field.id}`;
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const describedBy = [error ? errorId : '', field.helpText ? helpId : ''].filter(Boolean).join(' ') || undefined;
  const { options, loading, failed } = useOptions(field, loadOptions);
  const help = field.helpText ? <div id={helpId} className={styles.help}>{field.helpText}</div> : null;
  const optionsHint = loading ? 'Loading options...' : failed ? 'Options could not be loaded. Please try again later.' : field.placeholder || 'Choose an option';

  switch (field.type) {
    case 'multiline':
    case 'text':
    case 'number':
      return (
        <div>
          <TextField
            id={id}
            label={field.label}
            required={field.required}
            multiline={field.type === 'multiline'}
            autoAdjustHeight={field.type === 'multiline'}
            rows={field.type === 'multiline' ? 4 : undefined}
            type={field.type === 'number' ? 'number' : 'text'}
            inputMode={field.type === 'number' ? 'decimal' : undefined}
            min={field.type === 'number' ? field.minValue : undefined}
            max={field.type === 'number' ? field.maxValue : undefined}
            placeholder={field.placeholder}
            value={value === undefined ? '' : String(value)}
            disabled={disabled}
            onChange={(_, v) => onChange(v)}
            errorMessage={error}
            aria-describedby={field.helpText ? helpId : undefined}
          />
          {help}
        </div>
      );

    case 'choice':
      return (
        <div>
          <Dropdown
            id={id}
            label={field.label}
            required={field.required}
            placeholder={optionsHint}
            options={options.map(o => ({ key: o, text: o }))}
            selectedKey={typeof value === 'string' && value ? value : null}
            disabled={disabled || loading}
            onChange={(_, o) => onChange(o ? String(o.key) : undefined)}
            errorMessage={error}
            aria-describedby={field.helpText ? helpId : undefined}
          />
          {help}
        </div>
      );

    case 'lookup':
      return (
        <div>
          <ComboBox
            id={id}
            label={field.label}
            required={field.required}
            placeholder={loading ? 'Loading options...' : field.placeholder || 'Type to search'}
            options={options.map(o => ({ key: o, text: o }))}
            selectedKey={typeof value === 'string' && value ? value : null}
            allowFreeform={false}
            autoComplete="on"
            useComboBoxAsMenuWidth
            disabled={disabled || loading}
            onChange={(_, o) => onChange(o ? String(o.key) : undefined)}
            errorMessage={error}
            aria-describedby={field.helpText ? helpId : undefined}
          />
          {help}
        </div>
      );

    case 'person': {
      const p = value as IPersonValue | undefined;
      return (
        <div id={id} aria-describedby={field.helpText ? helpId : undefined}>
          <UserPicker
            label={field.label}
            required={field.required}
            single
            disabled={disabled}
            placeholder={field.placeholder}
            people={p && (p.email || p.name) ? [{ name: p.name, email: p.email }] : []}
            error={error}
            onChange={people => {
              const first = people[0];
              onChange(first ? { name: first.name, email: first.email || '' } : undefined);
            }}
          />
          {help}
        </div>
      );
    }

    case 'date':
      return (
        <div>
          <DatePicker
            id={id}
            label={field.label}
            isRequired={field.required}
            placeholder={field.placeholder || 'Choose a date'}
            ariaLabel={field.label}
            firstDayOfWeek={DayOfWeek.Sunday}
            value={toDateValue(value)}
            formatDate={d => formatDate(d || undefined)}
            disabled={disabled}
            allowTextInput={false}
            onSelectDate={d => onChange(toIsoDate(d))}
            textField={{ errorMessage: error, 'aria-describedby': describedBy }}
          />
          {help}
        </div>
      );

    case 'yesno':
      return (
        <div>
          <Toggle
            id={id}
            label={field.label}
            onText="Yes"
            offText="No"
            checked={value === true}
            disabled={disabled}
            onChange={(_, checked) => onChange(!!checked)}
            aria-describedby={describedBy}
          />
          {help}
          <FieldError id={errorId} message={error} />
        </div>
      );

    case 'attachment': {
      const files = (Array.isArray(value) ? value : []) as IFileValue[];
      return (
        <div>
          <Label htmlFor={id} required={field.required}>{field.label}</Label>
          <input
            id={id}
            type="file"
            multiple
            disabled={disabled}
            aria-describedby={describedBy}
            aria-invalid={!!error}
            onChange={e => {
              const picked = Array.from(e.target.files || []).map(f => ({ name: f.name, size: f.size, file: f }));
              const merged = files.filter(f => !picked.some(p => p.name === f.name)).concat(picked);
              onChange(merged);
              e.target.value = '';
            }}
          />
          <div className={styles.help}>Up to {MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB per file.</div>
          {files.length > 0 && (
            <ul className={styles.fileList} aria-label={`${field.label}: chosen files`}>
              {files.map(f => (
                <li key={f.name}>
                  <Icon iconName="Attach" aria-hidden="true" />
                  <span>{f.name} ({formatSize(f.size)})</span>
                  <IconButton
                    iconProps={{ iconName: 'Cancel' }}
                    title={`Remove ${f.name}`}
                    ariaLabel={`Remove ${f.name}`}
                    disabled={disabled}
                    onClick={() => onChange(files.filter(x => x.name !== f.name))}
                  />
                </li>
              ))}
            </ul>
          )}
          {help}
          <FieldError id={errorId} message={error} />
        </div>
      );
    }

    default:
      return null;
  }
};

/** Renders the configured fields of a service. Hidden fields (VisibleIf false) are not rendered. */
export const DynamicForm: React.FC<IDynamicFormProps> = ({ fields, values, errors, disabled, loadOptions, onChange }) => {
  const shown = visibleFields(fields, values);
  return (
    <div className={styles.form}>
      {shown.map(f => (
        <FieldControl
          key={f.id}
          field={f}
          value={values[f.key]}
          error={errors[f.key]}
          disabled={disabled}
          loadOptions={loadOptions}
          onChange={v => onChange(f.key, v)}
        />
      ))}
    </div>
  );
};
