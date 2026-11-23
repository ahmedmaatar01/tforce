import * as React from 'react';
import { Dropdown, Icon, IconButton, MessageBar, MessageBarType, PrimaryButton, SearchBox, TextField } from '@fluentui/react';
import styles from './RequestAdmin.module.scss';
import { ICategory, IDepartment, IEmployee } from '../../../common/models';
import { AdminService, CategoryInput, DepartmentInput, EmployeeInput, IAdminData } from '../../../common/data/AdminService';
import { EmptyState } from '../../../common/components/Shared';
import { Confirm, EditPanel, numText, parseNumber, PeopleInput, saveError } from './AdminParts';

interface ITabProps {
  admin: AdminService;
  data: IAdminData;
  reload: () => Promise<void>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Shared delete flow: confirm, delete, reload. */
function useDelete(reload: () => Promise<void>): {
  target?: { name: string; run: () => Promise<void> };
  ask: (name: string, run: () => Promise<void>) => void;
  busy: boolean;
  error?: string;
  clearError: () => void;
  confirm: () => Promise<void>;
  cancel: () => void;
} {
  const [target, setTarget] = React.useState<{ name: string; run: () => Promise<void> } | undefined>();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  return {
    target,
    busy,
    error,
    clearError: () => setError(undefined),
    ask: (name, run) => setTarget({ name, run }),
    cancel: () => setTarget(undefined),
    confirm: async () => {
      if (!target) return;
      setBusy(true);
      try {
        await target.run();
        await reload();
      } catch (e) {
        setError(saveError(e).replace('Could not save', 'Could not delete'));
      } finally {
        setBusy(false);
        setTarget(undefined);
      }
    }
  };
}

const ItemRow: React.FC<{ icon: string; title: string; meta: (string | undefined)[]; onEdit: () => void; onDelete: () => void }> = ({ icon, title, meta, onEdit, onDelete }) => (
  <li className={styles.item}>
    <Icon iconName={icon} aria-hidden="true" />
    <div className={styles.itemMain}>
      <span className={styles.itemTitle}>{title}</span>
      <span className={styles.itemMeta}>
        {meta.filter(Boolean).map((m, i) => (
          <span key={i}>{m}</span>
        ))}
      </span>
    </div>
    <div className={styles.itemActions}>
      <IconButton iconProps={{ iconName: 'Edit' }} title={`Edit ${title}`} ariaLabel={`Edit ${title}`} onClick={onEdit} />
      <IconButton iconProps={{ iconName: 'Delete' }} title={`Delete ${title}`} ariaLabel={`Delete ${title}`} onClick={onDelete} />
    </div>
  </li>
);

// =====================================================================
// Categories
// =====================================================================

const CategoryPanel: React.FC<{ admin: AdminService; data: IAdminData; value: CategoryInput; onSaved: () => void; onDismiss: () => void }> = ({ admin, data, value, onSaved, onDismiss }) => {
  const [c, setC] = React.useState<CategoryInput>(value);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const set = (p: Partial<CategoryInput>): void => setC(prev => ({ ...prev, ...p }));

  const save = async (): Promise<void> => {
    const e: Record<string, string> = {};
    if (!c.name.trim()) e.name = 'Please enter a name';
    else if (data.categories.some(o => o.id !== c.id && o.name.toLowerCase() === c.name.trim().toLowerCase())) e.name = 'This category already exists';
    if (isNaN(c.sortOrder)) e.sortOrder = 'Enter a number';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setError(undefined);
    try {
      await admin.saveCategory(c);
      onSaved();
    } catch (err) {
      setError(saveError(err));
      setBusy(false);
    }
  };

  const renamed = value.id !== undefined && value.name !== c.name && data.services.some(s => s.category.toLowerCase() === value.name.toLowerCase());

  return (
    <EditPanel title={value.id === undefined ? 'New category' : `Edit ${value.name}`} isOpen busy={busy} error={error} onSave={save} onDismiss={onDismiss}>
      <TextField label="Name" required value={c.name} errorMessage={errors.name} onChange={(_, v) => set({ name: v || '' })} />
      {renamed && <MessageBar messageBarType={MessageBarType.warning} isMultiline>Services using &quot;{value.name}&quot; keep the old name. Update them after renaming.</MessageBar>}
      <TextField
        label="Icon"
        value={c.icon || ''}
        description="A Fluent UI icon name, for example Devices3, Mail, Lock."
        onChange={(_, v) => set({ icon: v || '' })}
        onRenderSuffix={() => <Icon iconName={c.icon || 'Tag'} aria-hidden="true" />}
      />
      <TextField label="Order" type="number" value={numText(c.sortOrder)} errorMessage={errors.sortOrder} description="Smaller numbers come first." onChange={(_, v) => set({ sortOrder: parseNumber(v) ?? 999 })} />
      <PeopleInput
        label="Service team"
        allowGroups
        people={c.serviceTeam}
        help="People who handle approved requests of this category. They see them in the Approvals & Queue web part."
        onChange={p => set({ serviceTeam: p })}
      />
    </EditPanel>
  );
};

export const CategoriesTab: React.FC<ITabProps> = ({ admin, data, reload }) => {
  const [editing, setEditing] = React.useState<CategoryInput | undefined>();
  const [blocked, setBlocked] = React.useState<string | undefined>();
  const del = useDelete(reload);

  const askDelete = (c: ICategory): void => {
    const used = data.services.filter(s => s.category.toLowerCase() === c.name.toLowerCase());
    if (used.length) setBlocked(`"${c.name}" is used by ${used.length} service(s): ${used.map(s => s.name).join(', ')}. Move them to another category first.`);
    else del.ask(c.name, () => admin.deleteCategory(c.id));
  };

  const nextOrder = (data.categories.length ? Math.max(...data.categories.map(c => (c.sortOrder === 999 ? 0 : c.sortOrder))) : 0) + 10;

  return (
    <>
      <div className={styles.header}>
        <span className={styles.itemMeta}>Categories are the tabs employees see in the catalogue. The service team of a category sees its requests in their queue.</span>
        <PrimaryButton iconProps={{ iconName: 'Add' }} text="Add a category" onClick={() => setEditing({ name: '', icon: '', sortOrder: nextOrder, serviceTeam: [] })} />
      </div>
      {blocked && <MessageBar messageBarType={MessageBarType.blocked} isMultiline onDismiss={() => setBlocked(undefined)}>{blocked}</MessageBar>}
      {del.error && <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={del.clearError}>{del.error}</MessageBar>}
      {data.categories.length === 0 ? (
        <EmptyState icon="Tag" title="No categories yet." text="For example Hardware, Software, Access request." actionText="Add a category" onAction={() => setEditing({ name: '', icon: '', sortOrder: 10, serviceTeam: [] })} />
      ) : (
        <ul className={styles.items}>
          {data.categories.map(c => {
            const count = data.services.filter(s => s.category.toLowerCase() === c.name.toLowerCase()).length;
            return (
              <ItemRow
                key={c.id}
                icon={c.icon || 'Tag'}
                title={c.name}
                meta={[
                  `${count} service${count === 1 ? '' : 's'}`,
                  c.serviceTeam.length ? `Team: ${c.serviceTeam.map(p => p.name).join(', ')}` : 'No service team',
                  `Order ${c.sortOrder === 999 ? '-' : c.sortOrder}`
                ]}
                onEdit={() => setEditing({ ...c })}
                onDelete={() => askDelete(c)}
              />
            );
          })}
        </ul>
      )}
      {editing && <CategoryPanel admin={admin} data={data} value={editing} onDismiss={() => setEditing(undefined)} onSaved={async () => { setEditing(undefined); await reload(); }} />}
      <Confirm hidden={!del.target} busy={del.busy} title="Delete this category?" text={`"${del.target ? del.target.name : ''}" will be deleted.`} confirmText="Delete" onConfirm={del.confirm} onCancel={del.cancel} />
    </>
  );
};

// =====================================================================
// Departments
// =====================================================================

const DepartmentPanel: React.FC<{ admin: AdminService; data: IAdminData; value: DepartmentInput; onSaved: () => void; onDismiss: () => void }> = ({ admin, data, value, onSaved, onDismiss }) => {
  const [d, setD] = React.useState<DepartmentInput>(value);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const set = (p: Partial<DepartmentInput>): void => setD(prev => ({ ...prev, ...p }));
  const others = data.departments.filter(o => o.id !== d.id);

  const save = async (): Promise<void> => {
    const e: Record<string, string> = {};
    if (!d.name.trim()) e.name = 'Please enter a name';
    else if (others.some(o => o.name.toLowerCase() === d.name.trim().toLowerCase())) e.name = 'This department already exists';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setError(undefined);
    try {
      await admin.saveDepartment(d, data.departments);
      onSaved();
    } catch (err) {
      setError(saveError(err));
      setBusy(false);
    }
  };

  return (
    <EditPanel title={value.id === undefined ? 'New department' : `Edit ${value.name}`} isOpen busy={busy} error={error} onSave={save} onDismiss={onDismiss}>
      <TextField label="Name" required value={d.name} errorMessage={errors.name} onChange={(_, v) => set({ name: v || '' })} />
      <PeopleInput label="Head" single people={d.head ? [d.head] : []} onChange={p => set({ head: p[0] })} />
      <Dropdown
        label="Part of"
        options={[{ key: '', text: '(none)' }].concat(others.map(o => ({ key: o.name, text: o.name })))}
        selectedKey={d.parent || ''}
        onChange={(_, o) => set({ parent: String(o!.key) || undefined })}
      />
    </EditPanel>
  );
};

export const DepartmentsTab: React.FC<ITabProps> = ({ admin, data, reload }) => {
  const [editing, setEditing] = React.useState<DepartmentInput | undefined>();
  const del = useDelete(reload);

  return (
    <>
      <div className={styles.header}>
        <span className={styles.itemMeta}>The head of a department approves the steps set to &quot;Department head&quot;.</span>
        <PrimaryButton iconProps={{ iconName: 'Add' }} text="Add a department" onClick={() => setEditing({ name: '' })} />
      </div>
      {del.error && <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={del.clearError}>{del.error}</MessageBar>}
      {data.departments.length === 0 ? (
        <EmptyState icon="Org" title="No departments yet." actionText="Add a department" onAction={() => setEditing({ name: '' })} />
      ) : (
        <ul className={styles.items}>
          {data.departments.map(d => {
            const count = data.employees.filter(e => (e.department || '').toLowerCase() === d.name.toLowerCase()).length;
            return (
              <ItemRow
                key={d.id}
                icon="Org"
                title={d.name}
                meta={[d.head ? `Head: ${d.head.name}` : 'No head set', d.parent ? `Part of ${d.parent}` : undefined, `${count} employee${count === 1 ? '' : 's'}`]}
                onEdit={() => setEditing({ ...d })}
                onDelete={() => del.ask(d.name, () => admin.deleteDepartment(d.id))}
              />
            );
          })}
        </ul>
      )}
      {editing && <DepartmentPanel admin={admin} data={data} value={editing} onDismiss={() => setEditing(undefined)} onSaved={async () => { setEditing(undefined); await reload(); }} />}
      <Confirm
        hidden={!del.target}
        busy={del.busy}
        title="Delete this department?"
        text={`"${del.target ? del.target.name : ''}" will be deleted. Employees and approval steps that name it must be updated.`}
        confirmText="Delete"
        onConfirm={del.confirm}
        onCancel={del.cancel}
      />
    </>
  );
};

// =====================================================================
// Employees
// =====================================================================

const EmployeePanel: React.FC<{ admin: AdminService; data: IAdminData; value: EmployeeInput; onSaved: () => void; onDismiss: () => void }> = ({ admin, data, value, onSaved, onDismiss }) => {
  const [e, setE] = React.useState<EmployeeInput>(value);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const set = (p: Partial<EmployeeInput>): void => setE(prev => ({ ...prev, ...p }));
  const others: IEmployee[] = data.employees.filter(o => o.id !== e.id);

  const save = async (): Promise<void> => {
    const errs: Record<string, string> = {};
    if (!e.name.trim()) errs.name = 'Please enter a name';
    if (!EMAIL_RE.test(e.email.trim())) errs.email = 'Please enter a valid email';
    else if (others.some(o => o.email === e.email.trim().toLowerCase())) errs.email = 'This email is already in the list';
    if (e.manager && e.manager.email && e.manager.email.toLowerCase() === e.email.trim().toLowerCase()) errs.manager = 'An employee cannot be their own manager';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(undefined);
    try {
      await admin.saveEmployee(e, data.departments);
      onSaved();
    } catch (err) {
      setError(saveError(err));
      setBusy(false);
    }
  };

  const deptOptions = [{ key: '', text: '(none)' }].concat(data.departments.map((d: IDepartment) => ({ key: d.name, text: d.name })));
  if (e.department && !data.departments.some(d => d.name === e.department)) deptOptions.push({ key: e.department, text: e.department });

  return (
    <EditPanel title={value.id === undefined ? 'New employee' : `Edit ${value.name}`} isOpen busy={busy} error={error} onSave={save} onDismiss={onDismiss}>
      <PeopleInput
        label="Find the person"
        single
        people={e.email ? [{ name: e.name || e.email, email: e.email }] : []}
        help="Fills in the name and email. You can still edit them below."
        onChange={p => p[0] && set({ name: p[0].name, email: p[0].email || '' })}
      />
      <TextField label="Full name" required value={e.name} errorMessage={errors.name} onChange={(_, v) => set({ name: v || '' })} />
      <TextField label="Email" required type="email" value={e.email} errorMessage={errors.email} onChange={(_, v) => set({ email: v || '' })} />
      <PeopleInput label="Manager" single people={e.manager ? [e.manager] : []} error={errors.manager} onChange={p => set({ manager: p[0] })} />
      {data.departments.length ? (
        <Dropdown label="Department" options={deptOptions} selectedKey={e.department || ''} onChange={(_, o) => set({ department: String(o!.key) || undefined })} />
      ) : (
        <TextField label="Department" value={e.department || ''} onChange={(_, v) => set({ department: v || undefined })} />
      )}
    </EditPanel>
  );
};
export const EmployeesTab: React.FC<ITabProps> = ({ admin, data, reload }) => {
  const [editing, setEditing] = React.useState<EmployeeInput | undefined>();
  const [search, setSearch] = React.useState('');
  const del = useDelete(reload);
  const q = search.trim().toLowerCase();
  const shown = data.employees.filter(e => !q || e.name.toLowerCase().indexOf(q) >= 0 || e.email.indexOf(q) >= 0 || (e.department || '').toLowerCase().indexOf(q) >= 0);
  const blank: EmployeeInput = { name: '', email: '' };

  return (
    <>
      <div className={styles.header}>
        <SearchBox placeholder="Search employees" value={search} onChange={(_, v) => setSearch(v || '')} styles={{ root: { flex: '1 1 240px', maxWidth: 400 } }} />
        <PrimaryButton iconProps={{ iconName: 'Add' }} text="Add an employee" onClick={() => setEditing(blank)} />
      </div>
      <div className={styles.itemMeta} style={{ marginBottom: 8 }}>Used to find each requester&apos;s manager and department.</div>
      {del.error && <MessageBar messageBarType={MessageBarType.error} isMultiline onDismiss={del.clearError}>{del.error}</MessageBar>}
      {data.employees.length === 0 ? (
        <EmptyState icon="People" title="No employees yet." actionText="Add an employee" onAction={() => setEditing(blank)} />
      ) : shown.length === 0 ? (
        <EmptyState icon="Search" title="Nobody found." actionText="Clear search" onAction={() => setSearch('')} />
      ) : (
        <ul className={styles.items}>
          {shown.map(e => (
            <ItemRow
              key={e.id}
              icon="Contact"
              title={e.name}
              meta={[e.email, e.department, e.manager ? `Manager: ${e.manager.name}` : 'No manager set']}
              onEdit={() => setEditing({ ...e })}
              onDelete={() => del.ask(e.name, () => admin.deleteEmployee(e.id))}
            />
          ))}
        </ul>
      )}
      {editing && <EmployeePanel admin={admin} data={data} value={editing} onDismiss={() => setEditing(undefined)} onSaved={async () => { setEditing(undefined); await reload(); }} />}
      <Confirm hidden={!del.target} busy={del.busy} title="Delete this employee?" text={`"${del.target ? del.target.name : ''}" will be removed from the directory.`} confirmText="Delete" onConfirm={del.confirm} onCancel={del.cancel} />
    </>
  );
};

