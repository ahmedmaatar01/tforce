import * as React from 'react';
import { DefaultButton, Dropdown, Icon, MessageBar, MessageBarType, Pivot, PivotItem, PrimaryButton, TextField } from '@fluentui/react';
import styles from '../../../common/components/Common.module.scss';
import { DataService, UserFacingError } from '../../../common/data/DataService';
import { ICurrentUser, IFormField, IRequest, IService } from '../../../common/models';
import { RequestsCols } from '../../../common/schema';
import { applicableSteps, findStep, IApprovalStep } from '../../../common/logic/approvals';
import { addHours, findAmount, formatAge, formatDate, formatDue } from '../../../common/logic/format';
import { EmptyState, ErrorState, Loading, StatusBadge, friendlyError } from '../../../common/components/Shared';
import { FieldValuesView } from '../../../common/components/RequestParts';

export interface IApprovalsQueueProps {
  data: DataService;
  title: string;
}

const MAX_COMMENT = 500;

interface IRequestInfo {
  request: IRequest;
  service?: IService;
  fields: IFormField[];
  steps: IApprovalStep[];
  /** When the current step started (last history line not about this step, or the submit date). */
  stepStart: Date;
}

async function withConfig(data: DataService, requests: IRequest[]): Promise<IRequestInfo[]> {
  return Promise.all(
    requests.map(async request => {
      const [service, fields, rules, log] = await Promise.all([
        data.getService(request.serviceId),
        data.getFormFields(request.serviceId),
        data.getApprovalRules(request.serviceId),
        data.getLog(request)
      ]);
      const earlier = log.filter(e => !(e.stepNo === request.currentStep && (e.decision || '').toLowerCase() === 'approved'));
      const last = earlier[earlier.length - 1];
      const stepStart = last && last.decisionOn > request.submittedOn ? last.decisionOn : request.submittedOn;
      return { request, service, fields, steps: applicableSteps(rules, request.fieldValues, fields), stepStart };
    })
  );
}

// ---------------------------------------------------------------------------
// Screen 1: to approve
// ---------------------------------------------------------------------------

type DecisionKind = 'Approved' | 'Returned' | 'Rejected';

const ApprovalCard: React.FC<{
  info: IRequestInfo;
  onDecide: (decision: DecisionKind, comment: string) => Promise<void>;
}> = ({ info, onDecide }) => {
  const { request, service, fields, steps, stepStart } = info;
  const [expanded, setExpanded] = React.useState(false);
  const [mode, setMode] = React.useState<DecisionKind | undefined>();
  const [comment, setComment] = React.useState('');
  const [commentError, setCommentError] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState<string | undefined>();

  const step = findStep(steps, request.currentStep);
  const checks = step ? step.rules.map(r => r.requiredChecks).filter(Boolean).join('\n') : '';
  const amount = findAmount(fields, request.fieldValues);
  const hours = step ? step.rules.map(r => r.escalateHours || r.reminderHours || 0).filter(h => h > 0)[0] : undefined;
  const dueHours = hours || (service && service.slaHours);
  const due = dueHours ? formatDue(addHours(stepStart, dueHours)) : '';
  const detailsId = `tf-approval-${request.id}`;

  const decide = async (decision: DecisionKind): Promise<void> => {
    if (decision !== 'Approved' && !comment.trim()) {
      setMode(decision);
      setCommentError(decision === 'Returned' ? 'Please say what the requester should change' : 'Please give a reason');
      return;
    }
    setBusy(true);
    setFailed(undefined);
    try {
      await onDecide(decision, comment.trim());
    } catch (e) {
      console.error('[TForce] Decision failed', e);
      setFailed(e instanceof UserFacingError ? e.message : 'Your decision was not saved. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.headerRow} style={{ justifyContent: 'space-between' }}>
        <div className={styles.cardBody}>
          <span className={styles.cardTitle}>{request.serviceName}</span>
          <span className={styles.rowMeta}>
            <span>{request.requestId}</span>
            <span><Icon iconName="Contact" aria-hidden="true" /> {request.requester.name}</span>
            <span>Sent {formatDate(request.submittedOn)}</span>
            {amount && <span>{amount}</span>}
            {due && <span><Icon iconName="Clock" aria-hidden="true" /> {due}</span>}
          </span>
        </div>
        <DefaultButton
          text={expanded ? 'Hide details' : 'Show details'}
          iconProps={{ iconName: expanded ? 'ChevronUp' : 'ChevronDown' }}
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded(!expanded)}
        />
      </div>

      {expanded && (
        <div id={detailsId} style={{ marginTop: 12 }}>
          {step && <div className={styles.muted}>Step: {step.name}</div>}
          {checks && (
            <div className={styles.checksBox}>
              <strong>Please check before you approve:</strong>
              <div>{checks}</div>
            </div>
          )}
          <FieldValuesView fields={fields} values={request.fieldValues} />
        </div>
      )}

      {failed && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline styles={{ root: { marginTop: 8 } }}>
          {failed}
        </MessageBar>
      )}

      {mode && (
        <div style={{ marginTop: 12 }}>
          <TextField
            label={mode === 'Returned' ? 'What should the requester change?' : mode === 'Rejected' ? 'Reason' : 'Comment (optional)'}
            required={mode !== 'Approved'}
            multiline
            rows={3}
            maxLength={MAX_COMMENT}
            value={comment}
            disabled={busy}
            onChange={(_, v) => {
              setComment(v || '');
              setCommentError(undefined);
            }}
            errorMessage={commentError}
            description={`${comment.length}/${MAX_COMMENT} characters`}
          />
        </div>
      )}

      <div className={styles.actions} style={{ marginTop: 12 }}>
        {!mode ? (
          <>
            <PrimaryButton text="Approve" iconProps={{ iconName: 'CheckMark' }} disabled={busy} onClick={() => { setMode('Approved'); setCommentError(undefined); }} />
            <DefaultButton text="Send back" iconProps={{ iconName: 'Edit' }} disabled={busy} onClick={() => setMode('Returned')} />
            <DefaultButton text="Reject" iconProps={{ iconName: 'Cancel' }} disabled={busy} onClick={() => setMode('Rejected')} />
          </>
        ) : (
          <>
            <PrimaryButton
              text={busy ? 'Saving...' : mode === 'Approved' ? 'Approve' : mode === 'Returned' ? 'Send back' : 'Reject'}
              disabled={busy}
              onClick={() => decide(mode)}
            />
            <DefaultButton text="Back" disabled={busy} onClick={() => { setMode(undefined); setCommentError(undefined); }} />
          </>
        )}
      </div>
    </div>
  );
};

const ToApprove: React.FC<{ data: DataService; user: ICurrentUser; onCount: (n: number) => void }> = ({ data, user, onCount }) => {
  const [items, setItems] = React.useState<IRequestInfo[] | undefined>();
  const [error, setError] = React.useState<{ message: string; detail: string } | undefined>();
  const [attempt, setAttempt] = React.useState(0);
  const [message, setMessage] = React.useState<string | undefined>();

  React.useEffect(() => {
    let alive = true;
    setError(undefined);
    data
      .getRequestsToApprove(user.id)
      .then(list => withConfig(data, list))
      .then(list => {
        if (!alive) return;
        setItems(list);
        onCount(list.length);
      })
      .catch(e => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (error) return <ErrorState message="We could not load your approvals." adminDetail={user.isSiteAdmin ? error.detail : undefined} onRetry={() => setAttempt(a => a + 1)} />;
  if (!items) return <Loading label="Loading requests..." />;

  const decide = async (info: IRequestInfo, decision: DecisionKind, comment: string): Promise<void> => {
    const result = await data.recordDecision(info.request, decision, comment, user);
    let text: string;
    if (decision === 'Returned') text = `Sent back to ${info.request.requester.name}.`;
    else if (decision === 'Rejected') text = `Not approved. ${info.request.requester.name} will be told.`;
    else if (result.newStatus === 'Approved') text = `Approved. ${info.request.requestId} is fully approved and goes to the ${(info.service && info.service.category) || 'service'} team.`;
    else if (result.next && result.next.stepNo === info.request.currentStep) text = 'Approved. Waiting for the other approvers of this step.';
    else text = `Approved. Next step: ${result.next ? result.next.name : 'the service team'}.`;
    const remaining = items.filter(i => i.request.id !== info.request.id);
    setItems(remaining);
    onCount(remaining.length);
    setMessage(text);
  };

  return (
    <div>
      {message && (
        <MessageBar messageBarType={MessageBarType.success} isMultiline onDismiss={() => setMessage(undefined)} styles={{ root: { marginBottom: 12 } }}>
          {message}
        </MessageBar>
      )}
      <p style={{ margin: '0 0 12px' }} aria-live="polite">
        <span className={styles.countBadge}>
          {items.length === 0 ? 'Nothing needs you right now' : `${items.length} request${items.length === 1 ? ' needs' : 's need'} you`}
        </span>
      </p>
      {items.length === 0 ? (
        <EmptyState icon="CheckboxComposite" title="You're all caught up." text="New requests that need your decision will appear here." actionText="Check again" onAction={() => setAttempt(a => a + 1)} />
      ) : (
        items.map(info => <ApprovalCard key={info.request.id} info={info} onDecide={(d, c) => decide(info, d, c)} />)
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Screen 2: service team queue
// ---------------------------------------------------------------------------

type QueueTab = 'Approved' | 'In Progress' | 'Resolved';
const ANY = '__any__';

const QueueRow: React.FC<{ info: IRequestInfo; onStart: () => Promise<void>; onResolve: (note: string) => Promise<void> }> = ({ info, onStart, onResolve }) => {
  const { request, fields } = info;
  const [expanded, setExpanded] = React.useState(false);
  const [resolving, setResolving] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [noteError, setNoteError] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      await action();
    } catch (e) {
      console.error('[TForce] Queue action failed', e);
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.headerRow} style={{ justifyContent: 'space-between' }}>
        <div className={styles.cardBody}>
          <span className={styles.cardTitle}>{request.serviceName}</span>
          <span className={styles.rowMeta}>
            <span>{request.requestId}</span>
            <span><Icon iconName="Contact" aria-hidden="true" /> {request.requester.name}</span>
            {request.priority && <span>Priority: {request.priority}</span>}
            <span>Age: {formatAge(request.submittedOn)}</span>
          </span>
        </div>
        <StatusBadge status={request.status} />
      </div>

      {expanded && (
        <div style={{ marginTop: 12 }}>
          <FieldValuesView fields={fields} values={request.fieldValues} />
          {request.resolutionNote && <p className={styles.muted}>Note: {request.resolutionNote}</p>}
        </div>
      )}

      {failed && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline styles={{ root: { marginTop: 8 } }}>
          That did not work. Please try again.
        </MessageBar>
      )}

      {resolving && (
        <div style={{ marginTop: 12 }}>
          <TextField
            label="What was done?"
            required
            multiline
            rows={3}
            maxLength={MAX_COMMENT}
            value={note}
            disabled={busy}
            onChange={(_, v) => {
              setNote(v || '');
              setNoteError(undefined);
            }}
            errorMessage={noteError}
            description={`${note.length}/${MAX_COMMENT} characters`}
          />
        </div>
      )}

      <div className={styles.actions} style={{ marginTop: 12 }}>
        {request.status === 'Approved' && <PrimaryButton text="Start working" iconProps={{ iconName: 'Settings' }} disabled={busy} onClick={() => run(onStart)} />}
        {request.status === 'In Progress' && !resolving && (
          <PrimaryButton text="Mark as resolved" iconProps={{ iconName: 'Completed' }} disabled={busy} onClick={() => setResolving(true)} />
        )}
        {resolving && (
          <>
            <PrimaryButton
              text={busy ? 'Saving...' : 'Mark as resolved'}
              disabled={busy}
              onClick={() => {
                if (!note.trim()) {
                  setNoteError('Please add a short note for the requester');
                  return;
                }
                run(() => onResolve(note.trim())).catch(() => undefined);
              }}
            />
            <DefaultButton text="Back" disabled={busy} onClick={() => setResolving(false)} />
          </>
        )}
        <DefaultButton
          text={expanded ? 'Hide details' : 'Show details'}
          iconProps={{ iconName: expanded ? 'ChevronUp' : 'ChevronDown' }}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        />
      </div>
    </div>
  );
};

const ServiceQueue: React.FC<{ data: DataService; user: ICurrentUser; teamCategories: string[] }> = ({ data, user, teamCategories }) => {
  const [items, setItems] = React.useState<IRequestInfo[] | undefined>();
  const [error, setError] = React.useState<{ message: string; detail: string } | undefined>();
  const [attempt, setAttempt] = React.useState(0);
  const [tab, setTab] = React.useState<QueueTab>('Approved');
  const [category, setCategory] = React.useState(ANY);
  const [priority, setPriority] = React.useState(ANY);
  const [message, setMessage] = React.useState<string | undefined>();

  React.useEffect(() => {
    let alive = true;
    setError(undefined);
    data
      .getQueue()
      .then(list => withConfig(data, list))
      .then(list => {
        if (!alive) return;
        // Service team sees the categories it handles; admins see everything.
        const visible = user.isSiteAdmin && !teamCategories.length
          ? list
          : list.filter(i => teamCategories.indexOf(((i.service && i.service.category) || '').toLowerCase()) >= 0);
        setItems(visible);
      })
      .catch(e => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (error) return <ErrorState message="We could not load the queue." adminDetail={user.isSiteAdmin ? error.detail : undefined} onRetry={() => setAttempt(a => a + 1)} />;
  if (!items) return <Loading label="Loading the queue..." />;

  const categories = items.map(i => (i.service && i.service.category) || 'Other').filter((c, idx, all) => all.indexOf(c) === idx).sort();
  const priorities = items.map(i => i.request.priority || '').filter((p, idx, all) => !!p && all.indexOf(p) === idx).sort();
  const filtered = items.filter(
    i =>
      (category === ANY || ((i.service && i.service.category) || 'Other') === category) &&
      (priority === ANY || i.request.priority === priority)
  );
  const count = (s: QueueTab): number => filtered.filter(i => i.request.status === s).length;
  const shown = filtered.filter(i => i.request.status === tab);

  const update = (id: number, status: IRequest['status'], note?: string): void => {
    setItems(items.map(i => (i.request.id === id ? { ...i, request: { ...i.request, status, resolutionNote: note || i.request.resolutionNote } } : i)));
  };

  return (
    <div>
      {message && (
        <MessageBar messageBarType={MessageBarType.success} isMultiline onDismiss={() => setMessage(undefined)} styles={{ root: { marginBottom: 12 } }}>
          {message}
        </MessageBar>
      )}
      <div className={styles.toolbar}>
        <Dropdown
          label="Category"
          selectedKey={category}
          options={[{ key: ANY, text: 'All categories' }].concat(categories.map(c => ({ key: c, text: c })))}
          onChange={(_, o) => setCategory(o ? String(o.key) : ANY)}
          styles={{ root: { minWidth: 160, flex: '1 1 160px' } }}
        />
        <Dropdown
          label="Priority"
          selectedKey={priority}
          options={[{ key: ANY, text: 'All priorities' }].concat(priorities.map(p => ({ key: p, text: p })))}
          onChange={(_, o) => setPriority(o ? String(o.key) : ANY)}
          styles={{ root: { minWidth: 160, flex: '1 1 160px' } }}
        />
      </div>
      <Pivot aria-label="Queue" selectedKey={tab} onLinkClick={i => i && setTab(i.props.itemKey as QueueTab)} styles={{ root: { marginBottom: 8 } }}>
        <PivotItem headerText={`New (${count('Approved')})`} itemKey="Approved" />
        <PivotItem headerText={`In progress (${count('In Progress')})`} itemKey="In Progress" />
        <PivotItem headerText={`Resolved (${count('Resolved')})`} itemKey="Resolved" />
      </Pivot>
      {shown.length === 0 ? (
        <EmptyState
          icon="Inbox"
          title={tab === 'Approved' ? 'No new requests.' : tab === 'In Progress' ? 'Nothing in progress.' : 'No resolved requests waiting for confirmation.'}
          actionText="Check again"
          onAction={() => setAttempt(a => a + 1)}
          secondaryText={category !== ANY || priority !== ANY ? 'Clear filters' : undefined}
          onSecondary={() => {
            setCategory(ANY);
            setPriority(ANY);
          }}
        />
      ) : (
        shown.map(info => (
          <QueueRow
            key={info.request.id}
            info={info}
            onStart={async () => {
              await data.setStatus(info.request, 'In Progress', 'Started', user.id);
              update(info.request.id, 'In Progress');
              setMessage(`${info.request.requestId} is now in progress.`);
            }}
            onResolve={async note => {
              await data.setStatus(info.request, 'Resolved', 'Resolved', user.id, note, { [RequestsCols.ResolutionNote]: note });
              update(info.request.id, 'Resolved', note);
              setMessage(`${info.request.requestId} is marked as resolved. ${info.request.requester.name} will be asked to confirm.`);
            }}
          />
        ))
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Web part root
// ---------------------------------------------------------------------------

/** WP3: Approvals & Queue (brief section 7). */
const ApprovalsQueue: React.FC<IApprovalsQueueProps> = ({ data, title }) => {
  const [state, setState] = React.useState<{ user: ICurrentUser; teamCategories: string[] } | undefined>();
  const [error, setError] = React.useState<{ message: string; detail: string } | undefined>();
  const [attempt, setAttempt] = React.useState(0);
  const [tab, setTab] = React.useState<'approve' | 'queue'>('approve');
  const [count, setCount] = React.useState<number | undefined>();

  React.useEffect(() => {
    let alive = true;
    setError(undefined);
    (async () => {
      const user = await data.getCurrentUser();
      const teamCategories = await data.getTeamCategories(user).catch(() => [] as string[]);
      if (alive) setState({ user, teamCategories });
    })().catch(e => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (error) {
    return (
      <section className={styles.root}>
        <h2 className={styles.title}>{title}</h2>
        <ErrorState onRetry={() => setAttempt(a => a + 1)} />
      </section>
    );
  }
  if (!state) {
    return (
      <section className={styles.root}>
        <h2 className={styles.title}>{title}</h2>
        <Loading />
      </section>
    );
  }

  const showQueue = state.teamCategories.length > 0 || state.user.isSiteAdmin;

  return (
    <section className={styles.root}>
      <h2 className={styles.title}>{tab === 'approve' ? title : 'Service queue'}</h2>
      {showQueue && (
        <Pivot aria-label="Approvals and queue" selectedKey={tab} onLinkClick={i => i && setTab(i.props.itemKey as 'approve' | 'queue')} styles={{ root: { marginBottom: 12 } }}>
          <PivotItem headerText={count === undefined ? 'To approve' : `To approve (${count})`} itemKey="approve" />
          <PivotItem headerText="Service queue" itemKey="queue" />
        </Pivot>
      )}
      {tab === 'approve' || !showQueue ? (
        <ToApprove data={data} user={state.user} onCount={setCount} />
      ) : (
        <ServiceQueue data={data} user={state.user} teamCategories={state.teamCategories} />
      )}
    </section>
  );
};

export default ApprovalsQueue;
