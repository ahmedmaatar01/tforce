import * as React from 'react';
import { DefaultButton, Dialog, DialogFooter, DialogType, MessageBar, MessageBarType, PrimaryButton, Spinner, SpinnerSize } from '@fluentui/react';
import styles from './Common.module.scss';
import { DynamicForm } from './DynamicForm';
import { ErrorState, Loading, friendlyError } from './Shared';
import { DataService, UserFacingError } from '../data/DataService';
import { FieldValue, FieldValues, ICurrentUser, IFileValue, IFormField, IPerson, IService } from '../models';
import { applicableSteps, IApprovalStep } from '../logic/approvals';
import { visibleFields } from '../logic/conditions';
import { hasAnyInput, validateForm, ValidationErrors, valuesToSave } from '../logic/validation';

export interface IRequestFormSubmit {
  values: FieldValues;
  files: IFileValue[];
  steps: IApprovalStep[];
  firstApprovers: IPerson[];
}

export interface IRequestFormProps {
  data: DataService;
  user: ICurrentUser;
  service: IService;
  initialValues?: FieldValues;
  submitText?: string;
  /** Message shown at the top, e.g. the approver's comment when a request was sent back. */
  notice?: string;
  onSubmit: (s: IRequestFormSubmit) => Promise<void>;
  onCancel: () => void;
}

interface IConfig {
  fields: IFormField[];
  rulesLoaded: boolean;
  steps: (values: FieldValues) => IApprovalStep[];
}

/** Screen 2 of WP1 (brief 5.2): one page form built from ServiceFormFields. */
export const RequestForm: React.FC<IRequestFormProps> = ({ data, user, service, initialValues, submitText, notice, onSubmit, onCancel }) => {
  const [config, setConfig] = React.useState<IConfig | undefined>();
  const [loadError, setLoadError] = React.useState<{ message: string; detail: string } | undefined>();
  const [values, setValues] = React.useState<FieldValues>(initialValues || {});
  const [showErrors, setShowErrors] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | undefined>();
  const [setupError, setSetupError] = React.useState<string | undefined>();
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    setLoadError(undefined);
    Promise.all([
      data.getFormFields(service.serviceId),
      data.getApprovalRules(service.serviceId)
    ])
      .then(([fields, rules]) => {
        if (!alive) return;
        setConfig({ fields, rulesLoaded: true, steps: v => applicableSteps(rules, v, fields) });
      })
      .catch(e => alive && setLoadError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [service.serviceId, attempt]);

  if (loadError) return <ErrorState message="We could not load this form." adminDetail={user.isSiteAdmin ? loadError.detail : undefined} onRetry={() => setAttempt(a => a + 1)} />;
  if (!config) return <Loading label="Loading the form..." />;

  const errors: ValidationErrors = showErrors ? validateForm(config.fields, values) : {};

  const onChange = (key: string, value: FieldValue): void => {
    setValues(prev => ({ ...prev, [key]: value }));
    setSendError(undefined);
  };

  const focusField = (key: string): void => {
    const field = config.fields.filter(f => f.key === key)[0];
    if (!field) return;
    const el = document.getElementById(`tf-field-${field.id}`) || document.getElementById(`tf-field-${field.id}-input`);
    if (el) el.focus();
  };

  const submit = async (): Promise<void> => {
    setShowErrors(true);
    setSetupError(undefined);
    setSendError(undefined);
    const errs = validateForm(config.fields, values);
    const errorKeys = Object.keys(errs);
    if (errorKeys.length) {
      const firstKey = visibleFields(config.fields, values).map(f => f.key).filter(k => errorKeys.indexOf(k) >= 0)[0];
      focusField(firstKey);
      return;
    }
    setSending(true);
    try {
      const toSave = valuesToSave(config.fields, values);
      const steps = config.steps(toSave);
      const check = await data.checkApprovers(steps, user.email, toSave, config.fields);
      if (check.problem) {
        setSetupError(check.problem);
        setSending(false);
        return;
      }
      const files: IFileValue[] = [];
      visibleFields(config.fields, values)
        .filter(f => f.type === 'attachment' && Array.isArray(values[f.key]))
        .forEach(f => (values[f.key] as IFileValue[]).forEach(file => files.push(file)));
      await onSubmit({ values: toSave, files, steps, firstApprovers: check.first });
    } catch (e) {
      // Keep the answers on screen (brief 5.4.3).
      console.error('[TForce] Submit failed', e);
      if (e instanceof UserFacingError) {
        // Set-up problem found while sending: same message as the check before sending.
        setSetupError(e.adminDetail || e.message);
      } else {
        setSendError('Could not send. Your answers are saved, please try again.');
      }
      setSending(false);
    }
  };

  const cancel = (): void => {
    if (hasAnyInput(values) && !initialValues) setConfirmDiscard(true);
    else onCancel();
  };

  const errorCount = Object.keys(errors).length;

  return (
    <div>
      <h2 className={styles.title}>{service.name}</h2>
      {service.description && <p className={styles.subtitle}>{service.description}</p>}

      {notice && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          {notice}
        </MessageBar>
      )}

      {setupError && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          This service is not set up correctly, so it can&apos;t be sent yet. Please contact the IT team.
          {user.isSiteAdmin && <div>Admin details: {setupError}</div>}
        </MessageBar>
      )}

      {sendError && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {sendError}
        </MessageBar>
      )}

      {errorCount > 0 && (
        <div className={styles.muted} role="status" style={{ margin: '8px 0' }}>
          Please check {errorCount === 1 ? 'the field' : `the ${errorCount} fields`} marked below.
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {config.fields.length === 0 ? (
          <div className={styles.muted}>No details are needed for this service. Just send it.</div>
        ) : (
          <DynamicForm
            fields={config.fields}
            values={values}
            errors={errors}
            disabled={sending}
            loadOptions={listTitle => data.getChoiceOptions(listTitle)}
            onChange={onChange}
          />
        )}
      </div>

      <div className={styles.actions}>
        <PrimaryButton text={sending ? 'Sending...' : submitText || 'Submit request'} disabled={sending} onClick={submit} />
        <DefaultButton text="Cancel" disabled={sending} onClick={cancel} />
        {sending && <Spinner size={SpinnerSize.small} ariaLive="polite" />}
      </div>

      <Dialog
        hidden={!confirmDiscard}
        onDismiss={() => setConfirmDiscard(false)}
        dialogContentProps={{ type: DialogType.normal, title: 'Discard this request?', subText: 'What you filled in will be lost.' }}
        modalProps={{ isBlocking: true }}
      >
        <DialogFooter>
          <PrimaryButton text="Discard" onClick={() => { setConfirmDiscard(false); onCancel(); }} />
          <DefaultButton text="Keep editing" onClick={() => setConfirmDiscard(false)} />
        </DialogFooter>
      </Dialog>
    </div>
  );
};
