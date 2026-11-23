import * as React from 'react';
import { Icon } from '@fluentui/react';
import styles from './Common.module.scss';
import { FieldValues, IApprovalLogEntry, IFormField } from '../models';
import { IStepProgress } from '../logic/approvals';
import { formatDate, formatDateTime, formatFieldValue } from '../logic/format';

/** Submitted fields as label + value. Only fields that were saved (visible) are shown. */
export const FieldValuesView: React.FC<{ fields: IFormField[]; values: FieldValues }> = ({ fields, values }) => {
  const rows = fields
    .filter(f => values[f.key] !== undefined && formatFieldValue(f, values[f.key]) !== '')
    .map(f => ({ label: f.label, value: formatFieldValue(f, values[f.key]) }));
  if (!rows.length) return <div className={styles.muted}>No details were added.</div>;
  return (
    <dl className={styles.values}>
      {rows.map(r => (
        <React.Fragment key={r.label}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
};

/** One circle per approval step: done (tick + date), current (highlighted), future (grey). */
export const ProgressStrip: React.FC<{ progress: IStepProgress[] }> = ({ progress }) => {
  if (!progress.length) return <div className={styles.muted}>No approval needed for this request.</div>;
  return (
    <ol className={styles.strip} aria-label="Approval steps">
      {progress.map((p, i) => {
        const circleClass =
          p.state === 'done' ? styles.circleDone : p.state === 'current' ? styles.circleCurrent : p.state === 'stopped' ? styles.circleStopped : '';
        const stateText =
          p.state === 'done' ? 'Done' : p.state === 'current' ? 'Current step' : p.state === 'stopped' ? 'Stopped here' : 'Not started';
        return (
          <li
            key={p.step.stepNo}
            className={`${styles.stripStep} ${p.state === 'done' || p.state === 'current' ? styles.stripDone : ''}`}
            aria-current={p.state === 'current' ? 'step' : undefined}
          >
            <span className={`${styles.stripCircle} ${circleClass}`} aria-hidden="true">
              {p.state === 'done' ? <Icon iconName="CheckMark" /> : p.state === 'stopped' ? <Icon iconName="Cancel" /> : i + 1}
            </span>
            <span className={styles.stripText}>
              <span className={styles.stripLabel}>{p.step.name}</span>
              <span className={styles.stripDate}>
                {stateText}
                {p.completedOn ? `, ${formatDate(p.completedOn)}` : ''}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
};

const DECISION_WORDS: Record<string, { text: string; icon: string }> = {
  approved: { text: 'Approved by', icon: 'CheckMark' },
  returned: { text: 'Sent back by', icon: 'Edit' },
  rejected: { text: 'Not approved by', icon: 'Cancel' },
  cancelled: { text: 'Cancelled by', icon: 'Delete' },
  started: { text: 'Work started by', icon: 'Settings' },
  resolved: { text: 'Marked as done by', icon: 'Completed' },
  closed: { text: 'Confirmed as resolved by', icon: 'Lock' },
  resubmitted: { text: 'Updated and sent again by', icon: 'Send' }
};

/** "Approved by Khalid Al-Saud, 3 Nov, 14:02. Comment: OK" */
export const HistoryList: React.FC<{ entries: IApprovalLogEntry[] }> = ({ entries }) => {
  if (!entries.length) return <div className={styles.muted}>No decisions yet.</div>;
  return (
    <ul className={styles.history}>
      {entries.map(e => {
        const w = DECISION_WORDS[(e.decision || '').toLowerCase()] || { text: `${e.decision} by`, icon: 'Info' };
        return (
          <li key={e.id}>
            <Icon iconName={w.icon} aria-hidden="true" />
            <span>
              {w.text} {e.approver ? e.approver.name : 'someone'}, {formatDateTime(e.decisionOn)}.
              {e.comment ? ` Comment: ${e.comment}` : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
};
