import * as React from 'react';
import { DefaultButton, Dialog, DialogFooter, DialogType, Icon, MessageBar, MessageBarType, Pivot, PivotItem, PrimaryButton } from '@fluentui/react';
import styles from '../../../common/components/Common.module.scss';
import { DataService } from '../../../common/data/DataService';
import { IApprovalLogEntry, ICurrentUser, IEmployee, IFormField, IRequest, IService } from '../../../common/models';
import { isOpenStatus } from '../../../common/status';
import { applicableSteps, findStep, IApprovalStep, stepProgress } from '../../../common/logic/approvals';
import { requestActions } from '../../../common/logic/requestActions';
import { addHours, formatDate, formatDateTime, formatDue } from '../../../common/logic/format';
import { ActionButton, EmptyState, ErrorState, Loading, StatusBadge, friendlyError, queryParam, setQueryParam } from '../../../common/components/Shared';
import { FieldValuesView, HistoryList, ProgressStrip } from '../../../common/components/RequestParts';
import { RequestForm } from '../../../common/components/RequestForm';
import { ContactButton } from '../../../common/components/ContactButton';

export interface IMyRequestsProps {
  data: DataService;
  title: string;
  catalogPageUrl?: string;
}

type Tab = 'open' | 'closed' | 'all';

function names(people: { name: string }[]): string {
  return people.map(p => p.name).join(', ');
}

// ---------------------------------------------------------------------------
// Screen 2: request details
// ---------------------------------------------------------------------------

interface IDetails {
  request: IRequest;
  service?: IService;
  fields: IFormField[];
  steps: IApprovalStep[];
  log: IApprovalLogEntry[];
  employees: IEmployee[];
}

const RequestDetails: React.FC<{ data: DataService; user: ICurrentUser; id: number; onBack: () => void; onChanged: () => void }> = ({ data, user, id, onBack, onChanged }) => {
  const [details, setDetails] = React.useState<IDetails | undefined>();
  const [error, setError] = React.useState<{ message: string; detail: string } | undefined>();
  const [notFound, setNotFound] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: MessageBarType; text: string } | undefined>();
  const [confirm, setConfirm] = React.useState<'cancel' | 'close' | undefined>();
  const [editing, setEditing] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    setError(undefined);
    (async () => {
      const request = await data.getRequest(id);
      if (!request || (request.requester.id !== undefined && request.requester.id !== user.id && !user.isSiteAdmin)) {
        if (alive) setNotFound(true);
        return;
      }
      const [service, fields, rules, log, employees] = await Promise.all([
        data.getService(request.serviceId),
        data.getFormFields(request.serviceId),
        data.getApprovalRules(request.serviceId),
        data.getLog(request),
        data.getEmployees().catch(() => [] as IEmployee[])
      ]);
      if (!alive) return;
      setDetails({ request, service, fields, steps: applicableSteps(rules, request.fieldValues, fields), log, employees });
    })().catch(e => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [id, attempt]);

  if (notFound) {
    return <EmptyState icon="SearchIssue" title="We could not find this request." text="It may have been removed, or it belongs to someone else." actionText="Back to my requests" onAction={onBack} />;
  }
  if (error) return <ErrorState message="We could not load this request." adminDetail={user.isSiteAdmin ? error.detail : undefined} onRetry={() => setAttempt(a => a + 1)} />;
  if (!details) return <Loading label="Loading request..." />;

  const { request, service, fields, steps, log, employees } = details;
  const actions = requestActions(request, log);
  const progress = stepProgress(request, steps, log);

  const reload = (text: string): void => {
    setMessage({ type: MessageBarType.success, text });
    setBusy(false);
    setConfirm(undefined);
    onChanged();
    setAttempt(a => a + 1);
  };

  const run = async (action: () => Promise<void>, done: string): Promise<void> => {
    setBusy(true);
    setMessage(undefined);
    try {
      await action();
      reload(done);
    } catch (e) {
      console.error('[TForce] Action failed', e);
      setBusy(false);
      setConfirm(undefined);
      setMessage({ type: MessageBarType.error, text: 'That did not work. Please try again.' });
    }
  };

  // ----- Update and resubmit -----
  if (editing) {
    const lastReturn = log.filter(e => e.decision.toLowerCase() === 'returned').slice(-1)[0];
    const svc: IService = service || {
      id: 0, serviceId: request.serviceId, name: request.serviceName, description: '', category: 'Other', isActive: true, allowedRequesters: []
    };
    return (
      <RequestForm
        data={data}
        user={user}
        service={svc}
        initialValues={request.fieldValues}
        submitText="Send again"
        notice={lastReturn ? `${lastReturn.approver ? lastReturn.approver.name : 'The approver'} sent this back${lastReturn.comment ? `: "${lastReturn.comment}"` : '.'}` : undefined}
        onCancel={() => setEditing(false)}
        onSubmit={async s => {
          await data.resubmitRequest(request, s.values, s.files, s.steps, s.firstApprovers, user.id);
          setEditing(false);
          reload(`Sent again. Your request ${request.requestId} is back with ${names(s.firstApprovers) || 'the approver'}.`);
        }}
      />
    );
  }

  // ----- Waiting for box -----
  let waiting: React.ReactNode = null;
  if (request.status === 'Pending Approval' || request.status === 'Submitted') {
    const current = findStep(steps, request.currentStep);
    const approverText = request.currentApprovers.length
      ? request.currentApprovers
          .map(p => {
            const emp = employees.filter(e => !!p.email && e.email === p.email.toLowerCase())[0];
            return emp && emp.department ? `${p.name} (${emp.department})` : p.name;
          })
          .join(', ')
      : current
        ? current.name
        : '';
    const since = log.length ? log[log.length - 1].decisionOn : request.submittedOn;
    const hours = current ? current.rules.map(r => r.escalateHours || r.reminderHours || 0).filter(h => h > 0)[0] : undefined;
    const dueHours = hours || (service && service.slaHours);
    if (approverText) {
      waiting = (
        <div className={styles.waitingBox} role="status">
          <Icon iconName="Clock" aria-hidden="true" /> Waiting for <strong>{approverText}</strong> since {formatDateTime(since)}.
          {dueHours ? ` ${formatDue(addHours(since, dueHours))}.` : ''}
          <ContactButton people={request.currentApprovers} subject={`About my request ${request.requestId} (${request.serviceName})`} />
        </div>
      );
    } else if (request.status === 'Submitted') {
      waiting = (
        <div className={styles.waitingBox} role="status">
          <Icon iconName="Send" aria-hidden="true" /> Sent on {formatDateTime(request.submittedOn)}. It will reach the first approver shortly.
        </div>
      );
    }
  }

  return (
    <div>
      <DefaultButton iconProps={{ iconName: 'Back' }} text="My requests" onClick={onBack} styles={{ root: { marginBottom: 12 } }} />
      <div className={styles.headerRow}>
        <h2 className={styles.title} style={{ margin: 0 }}>{request.serviceName}</h2>
        <StatusBadge status={request.status} />
      </div>
      <p className={styles.muted}>
        {request.requestId} · Sent {formatDateTime(request.submittedOn)}
      </p>

      {message && (
        <MessageBar messageBarType={message.type} isMultiline onDismiss={() => setMessage(undefined)}>
          {message.text}
        </MessageBar>
      )}

      {request.status === 'Returned' && (
        <MessageBar messageBarType={MessageBarType.warning} isMultiline>
          This request was sent back to you. Please update it and send it again.
        </MessageBar>
      )}
      {request.status === 'Resolved' && (
        <MessageBar messageBarType={MessageBarType.success} isMultiline>
          The team marked this as done{request.resolutionNote ? `: "${request.resolutionNote}"` : ''}. Please confirm it is resolved.
        </MessageBar>
      )}

      <h3 className={styles.sectionTitle}>Progress</h3>
      <ProgressStrip progress={progress} />
      {waiting}

      <div className={styles.actions}>
        {actions.resubmit.visible && <ActionButton primary text="Update and resubmit" allowed={actions.resubmit.allowed} busy={busy} onClick={() => setEditing(true)} />}
        {actions.confirm.visible && <ActionButton primary text="Confirm it is resolved" allowed={actions.confirm.allowed} busy={busy} onClick={() => setConfirm('close')} />}
        {actions.cancel.visible && <ActionButton text="Cancel request" allowed={actions.cancel.allowed} reason={actions.cancel.reason} busy={busy} onClick={() => setConfirm('cancel')} />}
      </div>

      <h3 className={styles.sectionTitle}>History</h3>
      <HistoryList entries={log} />

      <h3 className={styles.sectionTitle}>Request details</h3>
      <FieldValuesView fields={fields} values={request.fieldValues} />

      <Dialog
        hidden={confirm !== 'cancel'}
        onDismiss={() => setConfirm(undefined)}
        dialogContentProps={{ type: DialogType.normal, title: 'Cancel this request?', subText: `${request.requestId} will be stopped. This cannot be undone.` }}
        modalProps={{ isBlocking: true }}
      >
        <DialogFooter>
          <PrimaryButton text="Cancel request" disabled={busy} onClick={() => run(() => data.setStatus(request, 'Cancelled', 'Cancelled', user.id), `${request.requestId} was cancelled.`)} />
          <DefaultButton text="Keep it" disabled={busy} onClick={() => setConfirm(undefined)} />
        </DialogFooter>
      </Dialog>
      <Dialog
        hidden={confirm !== 'close'}
        onDismiss={() => setConfirm(undefined)}
        dialogContentProps={{ type: DialogType.normal, title: 'Is it resolved?', subText: 'Confirming will close the request.' }}
        modalProps={{ isBlocking: true }}
      >
        <DialogFooter>
          <PrimaryButton text="Yes, close it" disabled={busy} onClick={() => run(() => data.setStatus(request, 'Closed', 'Closed', user.id), `Thank you. ${request.requestId} is closed.`)} />
          <DefaultButton text="Not yet" disabled={busy} onClick={() => setConfirm(undefined)} />
        </DialogFooter>
      </Dialog>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Screen 1: my requests list
// ---------------------------------------------------------------------------

const RequestRow: React.FC<{ request: IRequest; onOpen: () => void }> = ({ request, onOpen }) => (
  <button type="button" className={styles.row} onClick={onOpen}>
    <span className={styles.rowMain}>
      <span className={styles.cardTitle}>{request.serviceName}</span>
      <span className={styles.rowMeta}>
        <span>{request.requestId}</span>
        <span>Sent {formatDate(request.submittedOn)}</span>
        {request.status === 'Pending Approval' && request.currentApprovers.length > 0 && (
          <span>Waiting for: {names(request.currentApprovers)}</span>
        )}
      </span>
    </span>
    <StatusBadge status={request.status} />
  </button>
);

/** WP2: My Requests (brief section 6). */
const MyRequests: React.FC<IMyRequestsProps> = ({ data, title, catalogPageUrl }) => {
  const [user, setUser] = React.useState<ICurrentUser | undefined>();
  const [requests, setRequests] = React.useState<IRequest[] | undefined>();
  const [error, setError] = React.useState<{ message: string; detail: string } | undefined>();
  const [attempt, setAttempt] = React.useState(0);
  const [tab, setTab] = React.useState<Tab>('open');
  const [openId, setOpenId] = React.useState<number | undefined>(() => {
    const q = queryParam('requestId');
    return q && /^\d+$/.test(q) ? Number(q) : undefined;
  });

  React.useEffect(() => {
    let alive = true;
    setError(undefined);
    (async () => {
      const u = await data.getCurrentUser();
      const list = await data.getMyRequests(u.id, attempt > 0);
      if (!alive) return;
      setUser(u);
      setRequests(list.sort((a, b) => b.submittedOn.getTime() - a.submittedOn.getTime()));
    })().catch(e => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [attempt]);

  // Falls back to the site home page so the empty state is never a dead end.
  const catalogueUrl = catalogPageUrl || data.rest.webUrl;
  const goToCatalogue = (): void => {
    window.location.href = catalogueUrl;
  };

  if (error) {
    return (
      <section className={styles.root}>
        <h2 className={styles.title}>{title}</h2>
        <ErrorState message="We could not load your requests." onRetry={() => setAttempt(a => a + 1)} />
      </section>
    );
  }
  if (!user || !requests) {
    return (
      <section className={styles.root}>
        <h2 className={styles.title}>{title}</h2>
        <Loading label="Loading your requests..." />
      </section>
    );
  }

  if (openId !== undefined) {
    return (
      <section className={styles.root}>
        <RequestDetails
          data={data}
          user={user}
          id={openId}
          onBack={() => {
            setQueryParam('requestId', undefined);
            setOpenId(undefined);
          }}
          onChanged={() => setAttempt(a => a + 1)}
        />
      </section>
    );
  }

  const open = requests.filter(r => isOpenStatus(r.status));
  const closed = requests.filter(r => !isOpenStatus(r.status));
  const shown = tab === 'open' ? open : tab === 'closed' ? closed : requests;

  return (
    <section className={styles.root}>
      <div className={styles.headerRow}>
        <h2 className={styles.title}>{title}</h2>
        {requests.length > 0 && <DefaultButton iconProps={{ iconName: 'Add' }} text="Request something" onClick={goToCatalogue} />}
      </div>
      {requests.length === 0 ? (
        <EmptyState icon="Inbox" title="You have no requests yet." actionText="Request something" onAction={goToCatalogue} />
      ) : (
        <>
          <Pivot aria-label="Filter requests" selectedKey={tab} onLinkClick={i => i && setTab(i.props.itemKey as Tab)} styles={{ root: { marginBottom: 8 } }}>
            <PivotItem headerText={`Open (${open.length})`} itemKey="open" />
            <PivotItem headerText={`Closed (${closed.length})`} itemKey="closed" />
            <PivotItem headerText={`All (${requests.length})`} itemKey="all" />
          </Pivot>
          {shown.length === 0 ? (
            <EmptyState
              icon="Inbox"
              title={tab === 'open' ? 'You have no open requests.' : 'You have no closed requests.'}
              actionText="Show all"
              onAction={() => setTab('all')}
              secondaryText="Request something"
              onSecondary={goToCatalogue}
            />
          ) : (
            <div role="list" aria-label="My requests">
              {shown.map(r => (
                <div role="listitem" key={r.id}>
                  <RequestRow
                    request={r}
                    onOpen={() => {
                      setQueryParam('requestId', String(r.id));
                      setOpenId(r.id);
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default MyRequests;
