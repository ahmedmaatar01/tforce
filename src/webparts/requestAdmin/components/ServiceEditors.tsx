import * as React from 'react';
import { Dropdown, Icon, IDropdownOption, TextField, Toggle } from '@fluentui/react';
import styles from './RequestAdmin.module.scss';
import common from '../../../common/components/Common.module.scss';
import { IApprovalRule, ICategory, IDepartment, IEmployee, IFormField, IPerson, IService } from '../../../common/models';
import { AdminService, FieldInput, RuleInput, ServiceInput } from '../../../common/data/AdminService';
import {
  APPROVER_KIND_HELP,
  approverKind,
  buildCondition,
  checkField,
  checkRule,
  checkService,
  Errors,
  fieldTypeLabel,
  ISimpleCondition,
  makeFieldKey,
  makeServiceId,
  OPERATORS,
  operatorOption,
  operatorToStore,
  parseSimpleCondition
} from '../../../common/logic/adminChecks';
import { normalizeOperator, Operator } from '../../../common/logic/conditions';
import { toFieldType } from '../../../common/data/mappers';
import { EditPanel, numText, parseNumber, PeopleInput, saveError } from './AdminParts';

function hasErrors(e: Errors): boolean {
  return Object.keys(e).length > 0;
}

// =====================================================================
// Service details
// =====================================================================

export const ServicePanel: React.FC<{
  admin: AdminService;
  service?: IService;
  services: IService[];
  categories: ICategory[];
  employees: IEmployee[];
  allowedIsPeople: boolean;
  onSaved: (serviceId: string) => void;
  onDismiss: () => void;
}> = ({ admin, service, services, categories, employees, allowedIsPeople, onSaved, onDismiss }) => {
  const isNew = !service;
  const [s, setS] = React.useState<ServiceInput>(
    service || {
      serviceId: '',
      name: '',
      description: '',
      category: categories[0] ? categories[0].name : '',
      icon: '',
      slaHours: 24,
      isActive: true,
      allowedRequesters: [],
      allowedRequestersText: ''
    }
  );
  const [idTouched, setIdTouched] = React.useState(!isNew);
  const [errors, setErrors] = React.useState<Errors>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  const set = (patch: Partial<ServiceInput>): void => setS(prev => ({ ...prev, ...patch }));
  const others = services.filter(o => !service || o.id !== service.id);

  const save = async (): Promise<void> => {
    const e = checkService(s, others.map(o => o));
    setErrors(e);
    if (hasErrors(e)) return;
    setBusy(true);
    setError(undefined);
    try {
      await admin.saveService(s, categories);
      onSaved(s.serviceId);
    } catch (err) {
      setError(saveError(err));
      setBusy(false);
    }
  };

  const categoryOptions: IDropdownOption[] = categories.map(c => ({ key: c.name, text: c.name }));
  if (s.category && !categories.some(c => c.name === s.category)) categoryOptions.push({ key: s.category, text: s.category });

  return (
    <EditPanel title={isNew ? 'New service' : `Edit ${service!.name}`} isOpen busy={busy} error={error} onSave={save} onDismiss={onDismiss}>
      <TextField
        label="Name"
        required
        value={s.name}
        errorMessage={errors.name}
        onChange={(_, v) => set(idTouched ? { name: v || '' } : { name: v || '', serviceId: makeServiceId(v || '', others.map(o => o.serviceId)) })}
      />
      <TextField
        label="Service code"
        required
        value={s.serviceId}
        disabled={!isNew}
        errorMessage={errors.serviceId}
        description={isNew ? 'Links the form fields and approval steps to this service. Cannot be changed later.' : 'Cannot be changed: form fields and steps use it.'}
        onFocus={e => e.currentTarget.select()}
        onChange={(_, v) => {
          setIdTouched(true);
          set({ serviceId: (v || '').toUpperCase() });
        }}
      />
      <TextField label="Short description" multiline rows={3} value={s.description} onChange={(_, v) => set({ description: v || '' })} />
      {categories.length ? (
        <Dropdown label="Category" options={categoryOptions} selectedKey={s.category || undefined} onChange={(_, o) => set({ category: String(o!.key) })} />
      ) : (
        <TextField label="Category" value={s.category} description="Add categories in the Categories tab to pick from a list." onChange={(_, v) => set({ category: v || '' })} />
      )}
      <TextField
        label="Icon"
        value={s.icon || ''}
        description="A Fluent UI icon name, for example Laptop, Mail, Print, Lock."
        onChange={(_, v) => set({ icon: v || '' })}
        onRenderSuffix={() => <Icon iconName={s.icon || 'Puzzle'} aria-hidden="true" />}
      />
      <TextField
        label="Usual response time (hours)"
        type="number"
        min={0}
        value={numText(s.slaHours)}
        errorMessage={errors.slaHours}
        description='Shown to employees as "Usually within 24 hours".'
        onChange={(_, v) => set({ slaHours: parseNumber(v) })}
      />
      <Toggle label="Employees can request it" onText="Yes, shown in the catalogue" offText="No, hidden" checked={s.isActive} onChange={(_, c) => set({ isActive: !!c })} />
      {allowedIsPeople ? (
        <PeopleInput
          label="Who can request it"
          allowGroups
          people={s.allowedRequesters}
          help="Leave empty to let everyone request it."
          onChange={p => set({ allowedRequesters: p })}
        />
      ) : (
        <TextField
          label="Who can request it"
          value={s.allowedRequestersText || ''}
          description='Leave empty for everyone. Or list emails and/or department names separated by ";".'
          onChange={(_, v) => set({ allowedRequestersText: v || '' })}
        />
      )}
    </EditPanel>
  );
};

// =====================================================================
// Condition builder (shared by fields and steps)
// =====================================================================

const ConditionBuilder: React.FC<{
  fields: IFormField[];
  value: ISimpleCondition;
  errors: { field?: string; op?: string; value?: string };
  onChange: (c: ISimpleCondition) => void;
}> = ({ fields, value, errors, onChange }) => {
  const fieldOptions: IDropdownOption[] = fields.map(f => ({ key: f.key, text: f.label }));
  const picked = fields.filter(f => f.key.toLowerCase() === value.field.toLowerCase() || f.label.toLowerCase() === value.field.toLowerCase())[0];
  if (value.field && !picked) fieldOptions.push({ key: value.field, text: `${value.field} (missing)` });
  const opt = operatorOption(value.op);
  const valueChoices = picked && picked.type === 'yesno' ? ['Yes', 'No'] : picked && picked.choices.length ? picked.choices : undefined;

  return (
    <div className={styles.conditionRow}>
      <Dropdown
        label="Field"
        options={fieldOptions}
        selectedKey={picked ? picked.key : value.field || undefined}
        errorMessage={errors.field}
        onChange={(_, o) => onChange({ ...value, field: String(o!.key) })}
      />
      <Dropdown
        label="Comparison"
        options={OPERATORS.map(o => ({ key: o.op, text: o.label }))}
        selectedKey={value.op}
        errorMessage={errors.op}
        onChange={(_, o) => onChange({ ...value, op: o!.key as Operator })}
      />
      {opt && opt.needsValue ? (
        valueChoices ? (
          <Dropdown
            label="Value"
            options={valueChoices.map(c => ({ key: c, text: c }))}
            selectedKey={value.value || undefined}
            errorMessage={errors.value}
            onChange={(_, o) => onChange({ ...value, value: String(o!.key) })}
          />
        ) : (
          <TextField label="Value" value={value.value} errorMessage={errors.value} onChange={(_, v) => onChange({ ...value, value: v || '' })} />
        )
      ) : (
        <div />
      )}
    </div>
  );
};

// =====================================================================
// Form field
// =====================================================================

export const FieldPanel: React.FC<{
  admin: AdminService;
  serviceId: string;
  field?: IFormField;
  typeValue?: string;
  fields: IFormField[];
  fieldTypeChoices: string[];
  onSaved: () => void;
  onDismiss: () => void;
}> = ({ admin, serviceId, field, typeValue, fields, fieldTypeChoices, onSaved, onDismiss }) => {
  const isNew = !field;
  const others = fields.filter(f => !field || f.id !== field.id);
  const [f, setF] = React.useState<FieldInput>(() =>
    field
      ? { ...field, typeValue: typeValue || field.type }
      : {
          serviceId,
          key: '',
          label: '',
          typeValue: fieldTypeChoices.filter(c => toFieldType(c) === 'text')[0] || fieldTypeChoices[0] || 'text',
          required: false,
          sortOrder: (fields.length ? Math.max(...fields.map(x => x.sortOrder === 999 ? 0 : x.sortOrder)) : 0) + 10,
          choices: []
        }
  );
  const [keyTouched, setKeyTouched] = React.useState(!isNew);
  const [choicesText, setChoicesText] = React.useState((field ? field.choices : []).join('\n'));
  const initialCondition = parseSimpleCondition(f.visibleIf);
  const [conditionMode, setConditionMode] = React.useState<'always' | 'simple' | 'text'>(
    !f.visibleIf ? 'always' : initialCondition ? 'simple' : 'text'
  );
  const [condition, setCondition] = React.useState<ISimpleCondition>(initialCondition || { field: '', op: '=', value: '' });
  const [errors, setErrors] = React.useState<Errors>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  const set = (patch: Partial<FieldInput>): void => setF(prev => ({ ...prev, ...patch }));
  const kind = toFieldType(f.typeValue);
  const hasOptions = kind === 'choice' || kind === 'lookup';

  const save = async (): Promise<void> => {
    const visibleIf = conditionMode === 'always' ? undefined : conditionMode === 'simple' ? buildCondition(condition) || undefined : (f.visibleIf || '').trim() || undefined;
    const final: FieldInput = {
      ...f,
      visibleIf,
      choices: hasOptions ? choicesText.split(/\n|;/).map(c => c.trim()).filter(Boolean) : [],
      choiceSource: hasOptions ? f.choiceSource : undefined,
      minValue: kind === 'number' ? f.minValue : undefined,
      maxValue: kind === 'number' ? f.maxValue : undefined
    };
    const e = checkField({ ...final, id: field ? field.id : -1, type: kind }, others);
    if (conditionMode === 'simple' && !condition.field) e.visibleIf = 'Choose the field to check';
    if (f.minValue !== undefined && isNaN(f.minValue)) e.minValue = 'Enter a number';
    if (f.maxValue !== undefined && isNaN(f.maxValue)) e.maxValue = 'Enter a number';
    setErrors(e);
    if (hasErrors(e)) return;
    setBusy(true);
    setError(undefined);
    try {
      await admin.saveField(final);
      onSaved();
    } catch (err) {
      setError(saveError(err));
      setBusy(false);
    }
  };

  const conditionFieldErr = errors.visibleIf;

  return (
    <EditPanel title={isNew ? 'New form field' : `Edit "${field!.label}"`} isOpen busy={busy} error={error} onSave={save} onDismiss={onDismiss} wide>
      <TextField
        label="Label shown to the employee"
        required
        value={f.label}
        errorMessage={errors.label}
        onChange={(_, v) => set(keyTouched ? { label: v || '' } : { label: v || '', key: makeFieldKey(v || '', others.map(o => o.key)) })}
      />
      <TextField
        label="Field code"
        required
        value={f.key}
        errorMessage={errors.key}
        description="Used to save the answer and in conditions. Avoid changing it once requests exist."
        onChange={(_, v) => {
          setKeyTouched(true);
          set({ key: (v || '').replace(/\s/g, '') });
        }}
      />
      <div className={styles.twoCols}>
        <Dropdown
          label="Type of answer"
          options={fieldTypeChoices.map(c => ({ key: c, text: fieldTypeLabel(c) }))}
          selectedKey={f.typeValue}
          onChange={(_, o) => set({ typeValue: String(o!.key) })}
        />
        <Toggle label="Required" onText="Yes" offText="No" checked={f.required} onChange={(_, c) => set({ required: !!c })} />
      </div>

      {hasOptions && (
        <>
          <TextField
            label="Options"
            multiline
            rows={5}
            value={choicesText}
            errorMessage={errors.choices}
            description="One option per line."
            onChange={(_, v) => setChoicesText(v || '')}
          />
          <TextField
            label="Or read the options from a list"
            value={f.choiceSource || ''}
            description="Name of a SharePoint list on this site. Its Title column is used. Leave empty to use the options above."
            onChange={(_, v) => set({ choiceSource: v || undefined })}
          />
        </>
      )}

      {kind === 'number' && (
        <div className={styles.twoCols}>
          <TextField label="Minimum" type="number" value={numText(f.minValue)} errorMessage={errors.minValue} onChange={(_, v) => set({ minValue: parseNumber(v) })} />
          <TextField label="Maximum" type="number" value={numText(f.maxValue)} errorMessage={errors.maxValue} onChange={(_, v) => set({ maxValue: parseNumber(v) })} />
        </div>
      )}

      <TextField label="Help text" value={f.helpText || ''} description="Shown under the field." onChange={(_, v) => set({ helpText: v || undefined })} />
      {kind !== 'yesno' && kind !== 'attachment' && (
        <TextField label="Placeholder" value={f.placeholder || ''} description="Example text inside the empty box." onChange={(_, v) => set({ placeholder: v || undefined })} />
      )}

      <div className={styles.groupTitle}>Show this field</div>
      <Dropdown
        label="When"
        options={[
          { key: 'always', text: 'Always' },
          { key: 'simple', text: 'Only when another answer matches' },
          { key: 'text', text: 'Written condition (advanced)' }
        ]}
        selectedKey={conditionMode}
        onChange={(_, o) => setConditionMode(o!.key as 'always' | 'simple' | 'text')}
      />
      {conditionMode === 'simple' && (
        <>
          <ConditionBuilder fields={others} value={condition} errors={{ field: conditionFieldErr }} onChange={setCondition} />
          {others.length === 0 && <div className={common.help}>Add other fields first.</div>}
        </>
      )}
      {conditionMode === 'text' && (
        <TextField
          label="Condition"
          value={f.visibleIf || ''}
          errorMessage={conditionFieldErr}
          description='Examples: "Cost > 5000", "Type = Shared mailbox and Urgent = Yes". Use field codes or labels.'
          onChange={(_, v) => set({ visibleIf: v || undefined })}
        />
      )}
      {conditionMode !== 'always' && <div className={common.help}>Hidden fields are not checked and not saved.</div>}

      {(kind === 'text' || kind === 'multiline') && (
        <>
          <div className={styles.groupTitle}>Check the answer (advanced)</div>
          <TextField
            label="Pattern"
            value={f.validationRegex || ''}
            errorMessage={errors.validationRegex}
            description="A regular expression, e.g. ^CC-[0-9]{4}$ for CC-1234."
            onChange={(_, v) => set({ validationRegex: v || undefined })}
          />
          <TextField
            label="Message when it does not match"
            value={f.validationMessage || ''}
            placeholder="Please enter a cost centre like CC-1234"
            onChange={(_, v) => set({ validationMessage: v || undefined })}
          />
        </>
      )}
    </EditPanel>
  );
};

// =====================================================================
// Approval step (one rule = one approver of a step)
// =====================================================================

function emailsToPeople(value: string | undefined, employees: IEmployee[]): IPerson[] {
  return (value || '')
    .split(/[;,\n]/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(email => {
      const emp = employees.filter(e => e.email === email.toLowerCase())[0];
      return emp ? { name: emp.name, email: emp.email } : { name: email, email };
    });
}

export const StepPanel: React.FC<{
  admin: AdminService;
  serviceId: string;
  rule?: IApprovalRule;
  /** For a new rule: the step it belongs to. */
  stepNo: number;
  /** True when adding another approver to an existing step. */
  addingToStep?: boolean;
  rules: IApprovalRule[];
  fields: IFormField[];
  departments: IDepartment[];
  employees: IEmployee[];
  approverTypes: string[];
  operatorChoices: string[];
  onSaved: () => void;
  onDismiss: () => void;
}> = ({ admin, serviceId, rule, stepNo, addingToStep, rules, fields, departments, employees, approverTypes, operatorChoices, onSaved, onDismiss }) => {
  const siblings = rules.filter(r => r.stepNo === stepNo && (!rule || r.id !== rule.id));
  const [r, setR] = React.useState<RuleInput>(
    rule || {
      serviceId,
      stepNo,
      stepName: addingToStep && siblings[0] ? siblings[0].stepName : '',
      approverType: approverTypes.filter(t => approverKind(t) === 'manager')[0] || approverTypes[0] || 'Manager',
      approverValue: '',
      mode: addingToStep ? 'Parallel' : 'Sequential'
    }
  );
  const [hasCondition, setHasCondition] = React.useState(!!(rule && rule.conditionField));
  const [condition, setCondition] = React.useState<ISimpleCondition>({
    field: (rule && rule.conditionField) || '',
    op: normalizeOperator((rule && rule.conditionOperator) || '=') || '=',
    value: (rule && rule.conditionValue) || ''
  });
  const [errors, setErrors] = React.useState<Errors>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  const set = (patch: Partial<RuleInput>): void => setR(prev => ({ ...prev, ...patch }));
  const kind = approverKind(r.approverType);
  const personFields = fields.filter(f => f.type === 'person');

  const save = async (): Promise<void> => {
    const final: RuleInput = {
      ...r,
      approverValue: kind === 'manager' ? undefined : r.approverValue,
      conditionField: hasCondition ? condition.field : undefined,
      conditionOperator: hasCondition ? operatorToStore(condition.op, operatorChoices) : undefined,
      conditionValue: hasCondition && operatorOption(condition.op)?.needsValue ? condition.value : undefined
    };
    const e = checkRule(final, fields, departments);
    if (hasCondition && !condition.field) e.conditionField = 'Choose the field to check';
    if (final.reminderHours !== undefined && isNaN(final.reminderHours)) e.reminderHours = 'Enter a number';
    if (final.escalateHours !== undefined && isNaN(final.escalateHours)) e.escalateHours = 'Enter a number';
    setErrors(e);
    if (hasErrors(e)) return;
    setBusy(true);
    setError(undefined);
    try {
      await admin.saveRule(final);
      // Keep the step consistent: every approver of a step shares its name and mode.
      for (const s of siblings) {
        if (s.mode !== final.mode || s.stepName !== final.stepName) await admin.saveRule({ ...s, mode: final.mode, stepName: final.stepName });
      }
      onSaved();
    } catch (err) {
      setError(saveError(err));
      setBusy(false);
    }
  };

  const title = rule ? `Edit step ${stepNo}` : addingToStep ? `Add an approver to step ${stepNo}` : `New step ${stepNo}`;

  return (
    <EditPanel title={title} isOpen busy={busy} error={error} onSave={save} onDismiss={onDismiss} wide>
      <TextField
        label="Step name"
        required
        value={r.stepName}
        errorMessage={errors.stepName}
        placeholder="Manager approval"
        description="Shown to employees in the progress strip."
        onChange={(_, v) => set({ stepName: v || '' })}
      />

      <div className={styles.groupTitle}>Who approves</div>
      <Dropdown
        label="Approver"
        required
        options={approverTypes.map(t => ({ key: t, text: t }))}
        selectedKey={r.approverType}
        errorMessage={errors.approverType}
        onChange={(_, o) => set({ approverType: String(o!.key), approverValue: '' })}
      />
      <div className={common.help} style={{ marginTop: -8 }}>{APPROVER_KIND_HELP[kind]}</div>

      {kind === 'department' && (
        <Dropdown
          label="Department"
          options={[{ key: '', text: "The requester's department" }].concat(departments.map(d => ({ key: d.name, text: d.head ? `${d.name} (head: ${d.head.name})` : `${d.name} (no head set)` })))}
          selectedKey={r.approverValue || ''}
          errorMessage={errors.approverValue}
          onChange={(_, o) => set({ approverValue: String(o!.key) })}
        />
      )}
      {kind === 'field' && (
        <Dropdown
          label="Person field of the form"
          options={personFields.map(f => ({ key: f.key, text: f.label }))}
          selectedKey={personFields.filter(f => f.key.toLowerCase() === (r.approverValue || '').toLowerCase() || f.label.toLowerCase() === (r.approverValue || '').toLowerCase()).map(f => f.key)[0]}
          placeholder={personFields.length ? 'Choose a field' : 'The form has no person field'}
          errorMessage={errors.approverValue}
          onChange={(_, o) => set({ approverValue: String(o!.key) })}
        />
      )}
      {kind === 'group' && (
        <TextField label="Team or group name" required value={r.approverValue || ''} errorMessage={errors.approverValue} onChange={(_, v) => set({ approverValue: v || '' })} />
      )}
      {kind === 'person' && (
        <PeopleInput
          label="People"
          required
          people={emailsToPeople(r.approverValue, employees)}
          error={errors.approverValue}
          onChange={p => set({ approverValue: p.map(x => x.email || x.name).join('; ') })}
        />
      )}

      <Toggle
        label="When this step has several approvers"
        onText="Everyone must approve"
        offText="One approval is enough"
        checked={r.mode === 'Parallel'}
        onChange={(_, c) => set({ mode: c ? 'Parallel' : 'Sequential' })}
      />

      <div className={styles.groupTitle}>When is this step needed?</div>
      <Dropdown
        label="Apply"
        options={[
          { key: 'always', text: 'Always' },
          { key: 'when', text: 'Only when an answer matches' }
        ]}
        selectedKey={hasCondition ? 'when' : 'always'}
        onChange={(_, o) => setHasCondition(o!.key === 'when')}
      />
      {hasCondition && (
        <>
          <ConditionBuilder
            fields={fields}
            value={condition}
            errors={{ field: errors.conditionField, op: errors.conditionOperator, value: errors.conditionValue }}
            onChange={setCondition}
          />
          <div className={common.help}>When the condition is false, the step is skipped and not shown to the employee.</div>
        </>
      )}

      <div className={styles.groupTitle}>For the approver</div>
      <TextField
        label="What the approver must check"
        multiline
        rows={3}
        value={r.requiredChecks || ''}
        description="Shown on the approval card."
        onChange={(_, v) => set({ requiredChecks: v || undefined })}
      />

      <div className={styles.groupTitle}>Reminders (used by the approval flow)</div>
      <div className={styles.twoCols}>
        <TextField label="Remind after (hours)" type="number" value={numText(r.reminderHours)} errorMessage={errors.reminderHours} onChange={(_, v) => set({ reminderHours: parseNumber(v) })} />
        <TextField label="Escalate after (hours)" type="number" value={numText(r.escalateHours)} errorMessage={errors.escalateHours} onChange={(_, v) => set({ escalateHours: parseNumber(v) })} />
      </div>
      <PeopleInput
        label="Backup approver"
        single
        people={emailsToPeople(r.escalateToBackup, employees)}
        help="Gets the request when the approver does not answer in time."
        onChange={p => set({ escalateToBackup: p.map(x => x.email || x.name).join('; ') || undefined })}
      />
      {!rule && !addingToStep && rules.length > 0 && <div className={common.help}>The new step is added at the end. Use the arrows to move it.</div>}
    </EditPanel>
  );
};
