import * as React from 'react';
import { ActionButton, DefaultButton, Icon, IconButton, MessageBar, MessageBarType, Panel, PanelType, PrimaryButton, SearchBox } from '@fluentui/react';
import common from '../../../common/components/Common.module.scss';
import styles from './RequestAdmin.module.scss';
import { FieldValue, FieldValues, IApprovalRule, IFormField, IService } from '../../../common/models';
import { AdminService, IAdminData } from '../../../common/data/AdminService';
import {
  approverKind,
  fieldTypeLabel,
  fieldUsage,
  moveField,
  moveStep,
  operatorOption,
  serviceWarnings,
  stepNumbers
} from '../../../common/logic/adminChecks';
import { normalizeOperator } from '../../../common/logic/conditions';
import { validateForm, ValidationErrors } from '../../../common/logic/validation';
import { applicableSteps } from '../../../common/logic/approvals';
import { DynamicForm } from '../../../common/components/DynamicForm';
import { EmptyState, setQueryParam } from '../../../common/components/Shared';
import { Confirm, MoveButtons, saveError } from './AdminParts';
import { FieldPanel, ServicePanel, StepPanel } from './ServiceEditors';

export interface IAdminChoices {
  fieldTypes: string[];
  approverTypes: string[];
  operators: string[];
  allowedIsPeople: boolean;
}

export interface IServicesTabProps {
  admin: AdminService;
  data: IAdminData;
  typeValues: Record<number, string>;
  choices: IAdminChoices;
  openServiceId?: string;
  onOpenService: (serviceId: string | undefined) => void;
  reload: () => Promise<void>;
}

// =====================================================================
// Form preview: try the form and see which steps would apply
// =====================================================================

const FormPreview: React.FC<{
  admin: AdminService;
  service: IService;
  fields: IFormField[];
  rules: IApprovalRule[];
  employees: IAdminData['employees'];
  onDismiss: () => void;
}> = ({ admin, service, fields, rules, employees, onDismiss }) => {
  const [values, setValues] = React.useState<FieldValues>({});
  const [errors, setErrors] = React.useState<ValidationErrors>({});
  const [checked, setChecked] = React.useState(false);
  const steps = applicableSteps(rules, values, fields);

  return (
    <Panel isOpen type={PanelType.medium} headerText={`Preview: ${service.name}`} onDismiss={onDismiss} closeButtonAriaLabel="Close">
      <div className={styles.panelBody}>
        <MessageBar>This is a preview. Nothing is saved.</MessageBar>
        <div className={styles.preview}>
          <DynamicForm
            fields={fields}
            values={values}
            errors={errors}
            loadOptions={list => admin.data.getChoiceOptions(list)}
            onChange={(key: string, v: FieldValue) => {
              const next = { ...values, [key]: v };
              setValues(next);
              if (checked) setErrors(validateForm(fields, next));
            }}
          />
          <div className={common.actions}>
            <PrimaryButton
              text="Check answers"
              onClick={() => {
                setChecked(true);
                setErrors(validateForm(fields, values));
              }}
            />
            <DefaultButton
              text="Clear"
              onClick={() => {
                setValues({});
                setErrors({});
                setChecked(false);
              }}
            />
          </div>
          {checked && Object.keys(errors).length === 0 && (
            <MessageBar messageBarType={MessageBarType.success} styles={{ root: { marginTop: 12 } }}>
              All answers are valid. The request could be sent.
            </MessageBar>
          )}
        </div>
        <div className={styles.groupTitle}>Approval steps for these answers</div>
        {steps.length === 0 ? (
          <div className={common.muted}>No approval needed: the request goes straight to the service team.</div>
        ) : (
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {steps.map(s => (
              <li key={s.stepNo}>
                <strong>{s.name}</strong>: {s.rules.map(r => describeApprover(r, fields, employees)).join(s.mode === 'Parallel' ? ' and ' : ' or ')}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Panel>
  );
};

// =====================================================================
// One service: details, form fields, approval steps
// =====================================================================

function fieldName(fields: IFormField[], name: string | undefined): string {
  const n = (name || '').toLowerCase();
  const f = fields.filter(x => x.key.toLowerCase() === n || x.label.toLowerCase() === n)[0];
  return f ? f.label : name || '';
}

export function describeApprover(r: IApprovalRule, fields: IFormField[], employees: IAdminData['employees']): string {
  const v = (r.approverValue || '').trim();
  switch (approverKind(r.approverType)) {
    case 'manager':
      return "The requester's manager";
    case 'department':
      return v ? `Head of ${v}` : "Head of the requester's department";
    case 'field':
      return `The person chosen in "${fieldName(fields, v)}"`;
    case 'group':
      return `Team: ${v || '(not set)'}`;
    default: {
      const names = v
        .split(/[;,\n]/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(email => {
          const e = employees.filter(x => x.email === email.toLowerCase())[0];
          return e ? e.name : email;
        });
      return names.length ? names.join(', ') : '(nobody set)';
    }
  }
}

function describeCondition(r: IApprovalRule, fields: IFormField[]): string | undefined {
  if (!r.conditionField) return undefined;
  const op = operatorOption(normalizeOperator(r.conditionOperator || '='));
  return `Only when ${fieldName(fields, r.conditionField)} ${op ? op.label : r.conditionOperator} ${op && !op.needsValue ? '' : r.conditionValue || ''}`.trim();
}

type Editing =
  | { kind: 'service' }
  | { kind: 'field'; field?: IFormField }
  | { kind: 'rule'; rule?: IApprovalRule; stepNo: number; addingToStep?: boolean }
  | undefined;

type Deleting = { kind: 'service' } | { kind: 'field'; field: IFormField } | { kind: 'rule'; rule: IApprovalRule } | undefined;

const ServiceDetail: React.FC<IServicesTabProps & { service: IService }> = ({ admin, data, typeValues, choices, service, onOpenService, reload }) => {
  const fields = data.fields.filter(f => f.serviceId === service.serviceId).sort((a, b) => a.sortOrder - b.sortOrder);
  const rules = data.rules.filter(r => r.serviceId === service.serviceId).sort((a, b) => a.stepNo - b.stepNo || a.id - b.id);
  const steps = stepNumbers(rules);
  const warnings = serviceWarnings(service, fields, rules, data.departments);

  const [editing, setEditing] = React.useState<Editing>();
  const [deleting, setDeleting] = React.useState<Deleting>();
  const [blocked, setBlocked] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [previewing, setPreviewing] = React.useState(false);

  const run = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await work();
      await reload();
    } catch (e) {
      setError(saveError(e));
    } finally {
      setBusy(false);
    }
  };

  const askDeleteField = (f: IFormField): void => {
    const uses = fieldUsage(f, fields, rules);
    if (uses.length) setBlocked(`"${f.label}" cannot be deleted because it is used in ${uses.join(', ')}. Change those first.`);
    else setDeleting({ kind: 'field', field: f });
  };

  const confirmDelete = async (): Promise<void> => {
    const d = deleting;
    if (!d) return;
    await run(async () => {
      if (d.kind === 'field') await admin.deleteField(d.field.id);
      else if (d.kind === 'rule') await admin.deleteRule(d.rule.id);
      else await admin.deleteService(service, fields, rules);
    });
    setDeleting(undefined);
    if (d.kind === 'service') onOpenService(undefined);
  };

  const nextStepNo = steps.length ? steps[steps.length - 1] + 1 : 1;

  return (
    <>
      <ActionButton className={styles.back} iconProps={{ iconName: 'Back' }} text="All services" onClick={() => onOpenService(undefined)} />
      <div className={styles.header}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
          <span className={common.cardIcon}>
            <Icon iconName={service.icon || 'Puzzle'} aria-hidden="true" />
          </span>
          <div style={{ minWidth: 0 }}>
            <h3 className={common.title} style={{ fontSize: 20, margin: 0 }}>{service.name}</h3>
            <div className={styles.itemMeta}>
              <span>{service.category}</span>
              <span>Code: {service.serviceId}</span>
              {service.slaHours !== undefined && <span>Usually within {service.slaHours} hours</span>}
              {!service.isActive && <span className={`${styles.tag} ${styles.tagOff}`}>Hidden from employees</span>}
            </div>
          </div>
        </div>
        <div className={common.toolbar} style={{ marginBottom: 0 }}>
          <DefaultButton iconProps={{ iconName: 'Edit' }} text="Edit details" onClick={() => setEditing({ kind: 'service' })} />
          <DefaultButton iconProps={{ iconName: 'View' }} text="Preview form" disabled={!fields.length} onClick={() => setPreviewing(true)} />
          <IconButton iconProps={{ iconName: 'Delete' }} title="Delete this service" ariaLabel="Delete this service" onClick={() => setDeleting({ kind: 'service' })} />
        </div>
      </div>
      {service.description && <p className={common.subtitle}>{service.description}</p>}

      {error && <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={() => setError(undefined)}>{error}</MessageBar>}
      {blocked && <MessageBar messageBarType={MessageBarType.blocked} isMultiline onDismiss={() => setBlocked(undefined)}>{blocked}</MessageBar>}
      {warnings.length > 0 && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          <strong>To check before employees use it:</strong>
          <ul className={styles.warnings}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </MessageBar>
      )}

      {/* ---------- Form fields ---------- */}
      <div className={styles.header} style={{ marginTop: 20, marginBottom: 8 }}>
        <h4 className={common.sectionTitle} style={{ margin: 0 }}>Form fields</h4>
        <DefaultButton iconProps={{ iconName: 'Add' }} text="Add a field" onClick={() => setEditing({ kind: 'field' })} />
      </div>
      {fields.length === 0 ? (
        <EmptyState icon="TextField" title="No fields yet." text="Add the questions the employee must answer." actionText="Add a field" onAction={() => setEditing({ kind: 'field' })} />
      ) : (
        <ul className={styles.items}>
          {fields.map((f, i) => (
            <li key={f.id} className={styles.item}>
              <MoveButtons
                name={f.label}
                first={i === 0}
                last={i === fields.length - 1}
                disabled={busy}
                onMove={d => run(() => admin.setSortOrders(moveField(fields, f.id, d)))}
              />
              <div className={styles.itemMain}>
                <span className={styles.itemTitle}>
                  {f.label} {f.required && <span style={{ color: '#a4262c' }} aria-label="required">*</span>}
                </span>
                <span className={styles.itemMeta}>
                  <span>{fieldTypeLabel(typeValues[f.id] || f.type)}</span>
                  <span>Code: {f.key}</span>
                  {f.choices.length > 0 && <span>{f.choices.length} options</span>}
                  {f.choiceSource && <span>Options from list {f.choiceSource}</span>}
                  {f.visibleIf && <span>Shown only when {f.visibleIf}</span>}
                </span>
              </div>
              <div className={styles.itemActions}>
                <IconButton iconProps={{ iconName: 'Edit' }} title={`Edit ${f.label}`} ariaLabel={`Edit ${f.label}`} onClick={() => setEditing({ kind: 'field', field: f })} />
                <IconButton iconProps={{ iconName: 'Delete' }} title={`Delete ${f.label}`} ariaLabel={`Delete ${f.label}`} onClick={() => askDeleteField(f)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ---------- Approval steps ---------- */}
      <div className={styles.header} style={{ marginTop: 24, marginBottom: 8 }}>
        <h4 className={common.sectionTitle} style={{ margin: 0 }}>Approval steps</h4>
        <DefaultButton iconProps={{ iconName: 'Add' }} text="Add a step" onClick={() => setEditing({ kind: 'rule', stepNo: nextStepNo })} />
      </div>
      {steps.length === 0 ? (
        <EmptyState
          icon="Flow"
          title="No approval steps yet."
          text="Without steps the request goes straight to the service team."
          actionText="Add a step"
          onAction={() => setEditing({ kind: 'rule', stepNo: 1 })}
        />
      ) : (
        steps.map((no, i) => {
          const group = rules.filter(r => r.stepNo === no);
          const parallel = group.some(r => r.mode === 'Parallel');
          const names = group.map(r => r.stepName).filter((n, j, all) => !!n && all.indexOf(n) === j);
          return (
            <section key={no} className={styles.step} aria-label={`Step ${i + 1}`}>
              <div className={styles.stepHead}>
                <span className={styles.stepNo}>{i + 1}</span>
                <span className={styles.stepTitle}>{names.join(' + ') || `Step ${no}`}</span>
                {group.length > 1 && <span className={styles.tag}>{parallel ? 'Everyone must approve' : 'One approval is enough'}</span>}
                <MoveButtons name={`step ${i + 1}`} first={i === 0} last={i === steps.length - 1} disabled={busy} onMove={d => run(() => admin.setStepNumbers(moveStep(rules, no, d)))} />
                <ActionButton iconProps={{ iconName: 'AddFriend' }} text="Add approver" onClick={() => setEditing({ kind: 'rule', stepNo: no, addingToStep: true })} />
              </div>
              <ul className={styles.items} style={{ border: 0 }}>
                {group.map(r => {
                  const cond = describeCondition(r, fields);
                  return (
                    <li key={r.id} className={styles.item}>
                      <Icon iconName="Contact" aria-hidden="true" />
                      <div className={styles.itemMain}>
                        <span className={styles.itemTitle}>{describeApprover(r, fields, data.employees)}</span>
                        <span className={styles.itemMeta}>
                          <span>{r.approverType}</span>
                          {cond && <span>{cond}</span>}
                          {r.requiredChecks && <span>Has checks for the approver</span>}
                          {r.escalateHours !== undefined && <span>Escalates after {r.escalateHours} h</span>}
                        </span>
                      </div>
                      <div className={styles.itemActions}>
                        <IconButton iconProps={{ iconName: 'Edit' }} title="Edit" ariaLabel={`Edit ${r.stepName}`} onClick={() => setEditing({ kind: 'rule', rule: r, stepNo: r.stepNo })} />
                        <IconButton iconProps={{ iconName: 'Delete' }} title="Delete" ariaLabel={`Delete ${r.stepName}`} onClick={() => setDeleting({ kind: 'rule', rule: r })} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}

      {/* ---------- Panels and dialogs ---------- */}
      {editing && editing.kind === 'service' && (
        <ServicePanel
          admin={admin}
          service={service}
          services={data.services}
          categories={data.categories}
          employees={data.employees}
          allowedIsPeople={choices.allowedIsPeople}
          onDismiss={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await reload();
          }}
        />
      )}
      {editing && editing.kind === 'field' && (
        <FieldPanel
          admin={admin}
          serviceId={service.serviceId}
          field={editing.field}
          typeValue={editing.field ? typeValues[editing.field.id] : undefined}
          fields={fields}
          fieldTypeChoices={choices.fieldTypes}
          onDismiss={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await reload();
          }}
        />
      )}
      {editing && editing.kind === 'rule' && (
        <StepPanel
          admin={admin}
          serviceId={service.serviceId}
          rule={editing.rule}
          stepNo={editing.stepNo}
          addingToStep={editing.addingToStep}
          rules={rules}
          fields={fields}
          departments={data.departments}
          employees={data.employees}
          approverTypes={choices.approverTypes}
          operatorChoices={choices.operators}
          onDismiss={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await reload();
          }}
        />
      )}
      <Confirm
        hidden={!deleting}
        busy={busy}
        title={deleting && deleting.kind === 'service' ? 'Delete this service?' : deleting && deleting.kind === 'field' ? 'Delete this field?' : 'Delete this approver?'}
        text={
          deleting && deleting.kind === 'service'
            ? `"${service.name}" and its ${fields.length} field(s) and ${rules.length} approval rule(s) will be deleted. Existing requests are kept. To only hide it from employees, edit it and switch it off instead.`
            : deleting && deleting.kind === 'field'
              ? `"${deleting.field.label}" will be removed from the form. Answers already sent are kept.`
              : 'This approver will be removed from the step. Requests already in progress may need to be checked.'
        }
        confirmText="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(undefined)}
      />
      {previewing && <FormPreview admin={admin} service={service} fields={fields} rules={rules} onDismiss={() => setPreviewing(false)} employees={data.employees} />}
    </>
  );
};

// =====================================================================
// List of services
// =====================================================================

export const ServicesTab: React.FC<IServicesTabProps> = props => {
  const { admin, data, choices, openServiceId, onOpenService, reload } = props;
  const [search, setSearch] = React.useState('');
  const [adding, setAdding] = React.useState(false);

  const open = openServiceId ? data.services.filter(s => s.serviceId === openServiceId)[0] : undefined;
  if (open) return <ServiceDetail {...props} service={open} />;

  const q = search.trim().toLowerCase();
  const shown = data.services.filter(s => !q || s.name.toLowerCase().indexOf(q) >= 0 || s.serviceId.toLowerCase().indexOf(q) >= 0 || s.category.toLowerCase().indexOf(q) >= 0);

  return (
    <>
      <div className={styles.header}>
        <SearchBox placeholder="Search services" value={search} onChange={(_, v) => setSearch(v || '')} styles={{ root: { flex: '1 1 240px', maxWidth: 400 } }} />
        <PrimaryButton iconProps={{ iconName: 'Add' }} text="Add a service" onClick={() => setAdding(true)} />
      </div>

      {data.services.length === 0 ? (
        <EmptyState icon="Puzzle" title="No services yet." text="Add the first service employees can request." actionText="Add a service" onAction={() => setAdding(true)} />
      ) : shown.length === 0 ? (
        <EmptyState icon="Search" title="No services found." text="Try another word." actionText="Clear search" onAction={() => setSearch('')} />
      ) : (
        <div className={common.grid}>
          {shown.map(s => {
            const fieldCount = data.fields.filter(f => f.serviceId === s.serviceId).length;
            const stepCount = stepNumbers(data.rules.filter(r => r.serviceId === s.serviceId)).length;
            const warn = serviceWarnings(s, data.fields.filter(f => f.serviceId === s.serviceId), data.rules.filter(r => r.serviceId === s.serviceId), data.departments).filter(w => w.indexOf('switched off') < 0).length;
            return (
              <button key={s.id} type="button" className={`${common.card} ${s.isActive ? '' : styles.cardOff}`} onClick={() => onOpenService(s.serviceId)}>
                <span className={common.cardIcon}>
                  <Icon iconName={s.icon || 'Puzzle'} aria-hidden="true" />
                </span>
                <span className={common.cardBody}>
                  <span className={common.cardTitle}>{s.name}</span>
                  <span className={common.cardText}>{s.category}</span>
                  <span className={styles.itemMeta}>
                    <span>{fieldCount} field{fieldCount === 1 ? '' : 's'}</span>
                    <span>{stepCount} step{stepCount === 1 ? '' : 's'}</span>
                  </span>
                  <span className={styles.itemMeta}>
                    {!s.isActive && <span className={`${styles.tag} ${styles.tagOff}`}>Hidden</span>}
                    {warn > 0 && <span className={`${styles.tag} ${styles.tagWarn}`}>{warn} to fix</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {adding && (
        <ServicePanel
          admin={admin}
          services={data.services}
          categories={data.categories}
          employees={data.employees}
          allowedIsPeople={choices.allowedIsPeople}
          onDismiss={() => setAdding(false)}
          onSaved={async id => {
            setAdding(false);
            await reload();
            onOpenService(id);
          }}
        />
      )}
    </>
  );
};

/** Keeps the opened service in the page URL (?adminService=CODE) so a refresh stays on it. */
export function rememberService(serviceId: string | undefined): void {
  setQueryParam('adminService', serviceId);
}
