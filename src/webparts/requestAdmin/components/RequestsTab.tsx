import * as React from 'react';
import { DefaultButton, Dropdown, MessageBar, SearchBox, TextField } from '@fluentui/react';
import common from '../../../common/components/Common.module.scss';
import styles from './RequestAdmin.module.scss';
import { ICurrentUser, IPerson, IRequest, RequestStatus } from '../../../common/models';
import { AdminService, IAdminData, IRequestUpdate } from '../../../common/data/AdminService';
import { StatusInfo, statusInfo } from '../../../common/status';
import { applicableSteps } from '../../../common/logic/approvals';
import { formatDate } from '../../../common/logic/format';
import { EmptyState, ErrorState, friendlyError, Loading, StatusBadge } from '../../../common/components/Shared';
import { EditPanel, PeopleInput, saveError } from './AdminParts';

const STATUSES = Object.keys(StatusInfo) as RequestStatus[];

function show(v: unknown): string {
  if (v === undefined || v === null || v === '') return '-';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object' ? (x as { name?: string }).name : String(x))).join(', ');
  if (typeof v === 'object') return (v as { name?: string; email?: string }).name || (v as { email?: string }).email || JSON.stringify(v);
  return String(v);
}

const RequestPanel: React.FC<{ admin: AdminService; data: IAdminData; user: ICurrentUser; request: IRequest; onSaved: () => void; onDismiss: () => void }> = ({
  admin,
  data,
  user,
  request,
  onSaved,
  onDismiss
}) => {
  const fields = data.fields.filter(f => f.serviceId === request.serviceId).sort((a, b) => a.sortOrder - b.sortOrder);
  const rules = data.rules.filter(r => r.serviceId === request.serviceId);
  const steps = applicableSteps(rules, request.fieldValues, fields);

  const [u, setU] = React.useState<IRequestUpdate>({
    status: request.status,
    currentStep: request.currentStep,
    currentApprovers: request.currentApprovers,
    priority: request.priority,
    resolutionNote: request.resolutionNote,
    comment: ''
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [hint, setHint] = React.useState<string | undefined>();
  const set = (p: Partial<IRequestUpdate>): void => setU(prev => ({ ...prev, ...p }));

  const fillApprovers = async (): Promise<void> => {
    setHint(undefined);
    const step = steps.filter(s => s.stepNo === u.currentStep)[0];
    if (!step) {
      setHint('This step does not apply to this request.');
      return;
    }
    const email = request.requester.email || '';
    const r = await admin.data.resolveStepApprovers(step, email, request.fieldValues, fields);
    if (!r.approvers.length) {
      setHint(r.problem || 'No approver found for this step.');
      return;
    }
    const withEmail: IPerson[] = r.approvers.filter(p => !!p.email);
    if (!withEmail.length) {
      setHint(`The approver is "${r.approvers.map(p => p.name).join(', ')}", which is not a person. The approval flow must pick someone.`);
      return;
    }
    set({ currentApprovers: withEmail, status: u.status === 'Submitted' ? 'Pending Approval' : u.status });
    if (r.problem) setHint(r.problem);
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await admin.updateRequest(request, u, user.id);
      onSaved();
    } catch (e) {
      setError(saveError(e));
      setBusy(false);
    }
  };

  const stepOptions = steps.map(s => ({ key: s.stepNo, text: `${s.stepNo}. ${s.name}` }));
  if (!steps.some(s => s.stepNo === u.currentStep)) stepOptions.unshift({ key: u.currentStep, text: `${u.currentStep} (not a step of this request)` });

  return (
    <EditPanel title={`${request.requestId} · ${request.serviceName}`} isOpen busy={busy} error={error} saveText="Save changes" onSave={save} onDismiss={onDismiss} wide>
      <div className={styles.itemMeta}>
        <span>From {request.requester.name}</span>
        <span>Sent {formatDate(request.submittedOn)}</span>
      </div>
      <MessageBar>Changes are written to the request history. Normally the approval flow and the approvers do this.</MessageBar>

      <div className={styles.twoCols}>
        <Dropdown label="Status" options={STATUSES.map(s => ({ key: s, text: `${statusInfo(s).label} (${s})` }))} selectedKey={u.status} onChange={(_, o) => set({ status: o!.key as RequestStatus })} />
        <Dropdown label="Current step" options={stepOptions} selectedKey={u.currentStep} onChange={(_, o) => set({ currentStep: Number(o!.key) })} />
      </div>
      <PeopleInput label="Waiting for" people={u.currentApprovers} onChange={p => set({ currentApprovers: p })} help='This person sees the request in "Waiting for my decision".' />
      <div>
        <DefaultButton iconProps={{ iconName: 'Flow' }} text="Use the approver from the rules" disabled={!steps.length} onClick={fillApprovers} />
        {hint && <div className={common.help}>{hint}</div>}
      </div>
      <TextField label="Priority" value={u.priority || ''} onChange={(_, v) => set({ priority: v || undefined })} />
      <TextField label="Resolution note" multiline rows={2} value={u.resolutionNote || ''} onChange={(_, v) => set({ resolutionNote: v || undefined })} />
      <TextField label="Reason for the change" multiline rows={2} value={u.comment || ''} description="Saved in the history." onChange={(_, v) => set({ comment: v || '' })} />

      <div className={styles.groupTitle}>Answers</div>
      <dl className={common.values}>
        {(fields.length ? fields.map(f => ({ key: f.key, label: f.label })) : Object.keys(request.fieldValues).map(k => ({ key: k, label: k })))
          .filter(f => request.fieldValues[f.key] !== undefined)
          .map(f => (
            <React.Fragment key={f.key}>
              <dt>{f.label}</dt>
              <dd>{show(request.fieldValues[f.key])}</dd>
            </React.Fragment>
          ))}
      </dl>
    </EditPanel>
  );
};
export const RequestsTab: React.FC<{ admin: AdminService; data: IAdminData; user: ICurrentUser }> = ({ admin, data, user }) => {
  const [requests, setRequests] = React.useState<IRequest[] | undefined>();
  const [error, setError] = React.useState<{ message: string; detail: string } | undefined>();
  const [attempt, setAttempt] = React.useState(0);
  const [status, setStatus] = React.useState<string>('open');
  const [search, setSearch] = React.useState('');
  const [editing, setEditing] = React.useState<IRequest | undefined>();

  React.useEffect(() => {
    let alive = true;
    setError(undefined);
    setRequests(undefined);
    admin
      .getAllRequests()
      .then(r => alive && setRequests(r))
      .catch(e => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (error) return <ErrorState message="We could not load the requests." adminDetail={error.detail} onRetry={() => setAttempt(a => a + 1)} />;
  if (!requests) return <Loading label="Loading requests..." />;

  const q = search.trim().toLowerCase();
  const shown = requests.filter(r => {
    if (status === 'open' && ['Closed', 'Cancelled', 'Rejected'].indexOf(r.status) >= 0) return false;
    if (status !== 'open' && status !== 'all' && r.status !== status) return false;
    return !q || r.requestId.toLowerCase().indexOf(q) >= 0 || r.serviceName.toLowerCase().indexOf(q) >= 0 || r.requester.name.toLowerCase().indexOf(q) >= 0;
  });

  return (
    <>
      <div className={styles.header}>
        <SearchBox placeholder="Search by number, service or person" value={search} onChange={(_, v) => setSearch(v || '')} styles={{ root: { flex: '1 1 240px', maxWidth: 400 } }} />
        <Dropdown
          ariaLabel="Show"
          options={[{ key: 'open', text: 'All open requests' }, { key: 'all', text: 'All requests' }].concat(STATUSES.map(s => ({ key: s, text: statusInfo(s).label })))}
          selectedKey={status}
          onChange={(_, o) => setStatus(String(o!.key))}
          styles={{ root: { minWidth: 200 } }}
        />
        <DefaultButton iconProps={{ iconName: 'Refresh' }} text="Refresh" onClick={() => setAttempt(a => a + 1)} />
      </div>
      {requests.length === 0 ? (
        <EmptyState icon="Inbox" title="No requests yet." text="Requests sent from the Service Catalogue appear here." />
      ) : shown.length === 0 ? (
        <EmptyState icon="Search" title="No requests match." actionText="Show all" onAction={() => { setStatus('all'); setSearch(''); }} />
      ) : (
        <div role="list" className={styles.items}>
          {shown.map(r => (
            <button key={r.id} type="button" role="listitem" className={common.row} onClick={() => setEditing(r)}>
              <span className={common.rowMain}>
                <span className={styles.itemTitle}>{r.requestId} · {r.serviceName}</span>
                <span className={common.rowMeta}>
                  <span>{r.requester.name}</span>
                  <span>Sent {formatDate(r.submittedOn)}</span>
                  <span>Step {r.currentStep}</span>
                  {r.currentApprovers.length > 0 && <span>Waiting for {r.currentApprovers.map(p => p.name).join(', ')}</span>}
                </span>
              </span>
              <StatusBadge status={r.status} />
            </button>
          ))}
        </div>
      )}
      {editing && (
        <RequestPanel
          admin={admin}
          data={data}
          user={user}
          request={editing}
          onDismiss={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setAttempt(a => a + 1);
          }}
        />
      )}
    </>
  );
};

