import * as React from 'react';
import { Pivot, PivotItem } from '@fluentui/react';
import common from '../../../common/components/Common.module.scss';
import { ICurrentUser } from '../../../common/models';
import { DataService } from '../../../common/data/DataService';
import { AdminService, IAdminData } from '../../../common/data/AdminService';
import { ApprovalRulesCols, Lists, ServiceCatalogCols, ServiceFormFieldsCols } from '../../../common/schema';
import { DEFAULT_APPROVER_TYPES, DEFAULT_FIELD_TYPES, OPERATORS } from '../../../common/logic/adminChecks';
import { EmptyState, ErrorState, friendlyError, Loading, queryParam, setQueryParam } from '../../../common/components/Shared';
import { IAdminChoices, rememberService, ServicesTab } from './ServicesTab';
import { CategoriesTab, DepartmentsTab, EmployeesTab } from './ListTabs';
import { RequestsTab } from './RequestsTab';

export interface IRequestAdminProps {
  data: DataService;
  title: string;
  /** Extra administrators: people (emails) and SharePoint groups (IDs). Site admins always have access. */
  admins: { emails: string[]; groupIds: number[] };
}

interface ILoaded {
  user: ICurrentUser;
  data: IAdminData;
  typeValues: Record<number, string>;
  choices: IAdminChoices;
}

const TABS = ['services', 'categories', 'departments', 'employees', 'requests'];

/** WP4: Request Admin (brief section 8). Configure services, form fields, approval steps and the reference lists. */
const RequestAdmin: React.FC<IRequestAdminProps> = ({ data, title, admins }) => {
  const admin = React.useMemo(() => new AdminService(data), [data]);
  const [loaded, setLoaded] = React.useState<ILoaded | undefined>();
  const [denied, setDenied] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; detail: string } | undefined>();
  const [attempt, setAttempt] = React.useState(0);
  const [tab, setTab] = React.useState(() => {
    const t = queryParam('adminTab');
    return t && TABS.indexOf(t) >= 0 ? t : 'services';
  });
  const [openService, setOpenService] = React.useState<string | undefined>(() => queryParam('adminService'));

  const loadData = React.useCallback(async (): Promise<Omit<ILoaded, 'user'>> => {
    const [all, typeValues, fieldTypes, approverTypes, operators, fields] = await Promise.all([
      admin.loadAll(),
      admin.fieldTypeValues(),
      admin.choices(Lists.ServiceFormFields, ServiceFormFieldsCols.FieldType, DEFAULT_FIELD_TYPES),
      admin.choices(Lists.ApprovalRules, ApprovalRulesCols.ApproverType, DEFAULT_APPROVER_TYPES),
      admin.choices(Lists.ApprovalRules, ApprovalRulesCols.ConditionOperator, []),
      data.rest.getFields(Lists.ServiceCatalog)
    ]);
    const allowed = fields[ServiceCatalogCols.AllowedRequesters];
    return {
      data: all,
      typeValues,
      choices: {
        fieldTypes,
        approverTypes,
        operators: operators.length ? operators : OPERATORS.map(o => o.symbol),
        allowedIsPeople: !!allowed && allowed.type.indexOf('User') === 0
      }
    };
  }, [admin]);

  React.useEffect(() => {
    let alive = true;
    setError(undefined);
    (async () => {
      const user = await data.getCurrentUser();
      const allowed = user.isSiteAdmin || admins.emails.indexOf(user.email) >= 0 || admins.groupIds.some(id => user.groupIds.indexOf(id) >= 0);
      if (!allowed) {
        if (alive) setDenied(true);
        return;
      }
      const rest = await loadData();
      if (alive) setLoaded({ user, ...rest });
    })().catch(e => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [attempt]);

  const reload = React.useCallback(async () => {
    const rest = await loadData();
    setLoaded(prev => (prev ? { ...prev, ...rest } : prev));
  }, [loadData]);

  const header = <h2 className={common.title}>{title}</h2>;

  if (denied) {
    return (
      <section className={common.root}>
        {header}
        <EmptyState icon="Lock" title="This page is for administrators." text="Ask a site owner if you need to change the request set-up." />
      </section>
    );
  }
  if (error) {
    return (
      <section className={common.root}>
        {header}
        <ErrorState message="We could not load the set-up." adminDetail={error.detail} onRetry={() => setAttempt(a => a + 1)} />
      </section>
    );
  }
  if (!loaded) {
    return (
      <section className={common.root}>
        {header}
        <Loading label="Loading the set-up..." />
      </section>
    );
  }

  const openSvc = (id: string | undefined): void => {
    setOpenService(id);
    rememberService(id);
  };

  return (
    <section className={common.root}>
      {header}
      <p className={common.subtitle}>Set up what employees can request, the form they fill in and who approves it.</p>
      <Pivot
        selectedKey={tab}
        onLinkClick={item => {
          const key = (item && item.props.itemKey) || 'services';
          setTab(key);
          setQueryParam('adminTab', key === 'services' ? undefined : key);
        }}
        overflowBehavior="menu"
        styles={{ root: { marginBottom: 16 } }}
      >
        <PivotItem itemKey="services" headerText="Services" itemIcon="Puzzle" itemCount={loaded.data.services.length} />
        <PivotItem itemKey="categories" headerText="Categories" itemIcon="Tag" itemCount={loaded.data.categories.length} />
        <PivotItem itemKey="departments" headerText="Departments" itemIcon="Org" itemCount={loaded.data.departments.length} />
        <PivotItem itemKey="employees" headerText="Employees" itemIcon="People" itemCount={loaded.data.employees.length} />
        <PivotItem itemKey="requests" headerText="Requests" itemIcon="Inbox" />
      </Pivot>

      {tab === 'services' && (
        <ServicesTab
          admin={admin}
          data={loaded.data}
          typeValues={loaded.typeValues}
          choices={loaded.choices}
          openServiceId={openService}
          onOpenService={openSvc}
          reload={reload}
        />
      )}
      {tab === 'categories' && <CategoriesTab admin={admin} data={loaded.data} reload={reload} />}
      {tab === 'departments' && <DepartmentsTab admin={admin} data={loaded.data} reload={reload} />}
      {tab === 'employees' && <EmployeesTab admin={admin} data={loaded.data} reload={reload} />}
      {tab === 'requests' && <RequestsTab admin={admin} data={loaded.data} user={loaded.user} />}
    </section>
  );
};

export default RequestAdmin;
