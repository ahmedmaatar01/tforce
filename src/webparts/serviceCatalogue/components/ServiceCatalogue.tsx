import * as React from 'react';
import { Icon, MessageBar, MessageBarType, Pivot, PivotItem, PrimaryButton, DefaultButton, SearchBox } from '@fluentui/react';
import styles from '../../../common/components/Common.module.scss';
import { DataService, ISubmitResult } from '../../../common/data/DataService';
import { ICategory, ICurrentUser, IService } from '../../../common/models';
import { EmptyState, ErrorState, Loading, friendlyError, queryParam, setQueryParam } from '../../../common/components/Shared';
import { RequestForm } from '../../../common/components/RequestForm';
import { formatSla } from '../../../common/logic/format';

export interface IServiceCatalogueProps {
  data: DataService;
  title: string;
  myRequestsPageUrl?: string;
}

interface ICatalogue {
  user: ICurrentUser;
  services: IService[];
  categories: ICategory[];
}

type Screen = { name: 'catalogue' } | { name: 'form'; service: IService } | { name: 'done'; service: IService; result: ISubmitResult };

const ALL = '__all__';

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const ServiceCard: React.FC<{ service: IService; icon: string; onOpen: () => void }> = ({ service, icon, onOpen }) => {
  const sla = formatSla(service.slaHours);
  return (
    <button type="button" className={styles.card} onClick={onOpen} aria-label={`${service.name}. ${service.description}. ${sla}`}>
      <span className={styles.cardIcon} aria-hidden="true">
        <Icon iconName={icon} />
      </span>
      <span className={styles.cardBody}>
        <span className={styles.cardTitle}>{service.name}</span>
        {service.description && <span className={styles.cardText}>{service.description}</span>}
        {sla && (
          <span className={styles.cardText}>
            <Icon iconName="Clock" aria-hidden="true" /> {sla}
          </span>
        )}
      </span>
    </button>
  );
};

/** WP1: Service Catalogue & Request Form (brief section 5). */
const ServiceCatalogue: React.FC<IServiceCatalogueProps> = ({ data, title, myRequestsPageUrl }) => {
  const [catalogue, setCatalogue] = React.useState<ICatalogue | undefined>();
  const [error, setError] = React.useState<{ message: string; detail: string } | undefined>();
  const [attempt, setAttempt] = React.useState(0);
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState(ALL);
  const [screen, setScreen] = React.useState<Screen>({ name: 'catalogue' });

  React.useEffect(() => {
    let alive = true;
    setError(undefined);
    (async () => {
      const user = await data.getCurrentUser();
      const [services, categories, employee] = await Promise.all([
        data.getServices(),
        data.getCategories().catch(() => [] as ICategory[]),
        data.getEmployeeByEmail(user.email).catch(() => undefined)
      ]);
      const allowed = services.filter(s => data.canRequest(s, user, employee));
      if (!alive) return;
      setCatalogue({ user, services: allowed, categories });
      // Deep link: ?service=<ServiceID> opens the form directly.
      const wanted = queryParam('service');
      const svc = wanted ? allowed.filter(s => s.serviceId === wanted)[0] : undefined;
      if (svc) setScreen({ name: 'form', service: svc });
    })().catch(e => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (error) {
    return (
      <section className={styles.root}>
        <h2 className={styles.title}>{title}</h2>
        <ErrorState message="We could not load the services." onRetry={() => setAttempt(a => a + 1)} />
      </section>
    );
  }
  if (!catalogue) {
    return (
      <section className={styles.root}>
        <h2 className={styles.title}>{title}</h2>
        <Loading label="Loading services..." />
      </section>
    );
  }

  const backToCatalogue = (): void => {
    setQueryParam('service', undefined);
    setScreen({ name: 'catalogue' });
  };

  // ---------- Screen 2: form ----------
  if (screen.name === 'form') {
    const service = screen.service;
    return (
      <section className={styles.root}>
        <DefaultButton iconProps={{ iconName: 'Back' }} text="All services" onClick={backToCatalogue} styles={{ root: { marginBottom: 12 } }} />
        <RequestForm
          data={data}
          user={catalogue.user}
          service={service}
          onCancel={backToCatalogue}
          onSubmit={async s => {
            const result = await data.submitRequest(service, s.values, s.files, s.steps, s.firstApprovers);
            setQueryParam('service', undefined);
            setScreen({ name: 'done', service, result });
          }}
        />
      </section>
    );
  }

  // ---------- Screen 3: confirmation ----------
  if (screen.name === 'done') {
    const { result, service } = screen;
    const firstRule = result.firstStep && result.firstStep.rules[0];
    const withWhom = !result.firstStep
      ? `the ${service.category} team`
      : firstRule && /manager/i.test(firstRule.approverType) && !/department|dept/i.test(firstRule.approverType)
        ? 'your manager'
        : joinNames(result.firstApprovers.map(p => p.name)) || 'the approver';
    const approverNames = joinNames(result.firstApprovers.map(p => p.name));
    const myRequestsLink = myRequestsPageUrl
      ? `${myRequestsPageUrl}${myRequestsPageUrl.indexOf('?') >= 0 ? '&' : '?'}requestId=${result.request.id}`
      : undefined;
    return (
      <section className={styles.root}>
        <div className={styles.state} role="status" aria-live="polite">
          <Icon iconName="Completed" className={styles.stateIcon} style={{ color: '#107c10' }} aria-hidden="true" />
          <h2 className={styles.title}>
            Sent. Your request <strong>{result.request.requestId}</strong> is with {withWhom}.
          </h2>
          {result.firstStep ? (
            <p className={styles.subtitle}>
              Next step: {result.firstStep.name}
              {approverNames ? ` by ${approverNames}` : ''}. We will let you know when there is a decision.
            </p>
          ) : (
            <p className={styles.subtitle}>No approval is needed. The team will start working on it.</p>
          )}
          {service.slaHours ? <p className={styles.muted}>{formatSla(service.slaHours)}.</p> : null}
          {result.failedFiles.length > 0 && (
            <MessageBar messageBarType={MessageBarType.warning} isMultiline>
              Some files could not be attached: {result.failedFiles.join(', ')}. You can add them later from My requests.
            </MessageBar>
          )}
          <div className={styles.toolbar} style={{ justifyContent: 'center' }}>
            {myRequestsLink && <PrimaryButton text="View my requests" href={myRequestsLink} />}
            <DefaultButton text="Request something else" onClick={backToCatalogue} />
          </div>
        </div>
      </section>
    );
  }

  // ---------- Screen 1: choose a service ----------
  const categoryIcon: Record<string, string> = {};
  catalogue.categories.forEach(c => {
    if (c.icon) categoryIcon[c.name.toLowerCase()] = c.icon;
  });
  // Tabs: categories from the Categories list that have services, then any others used by services.
  const used = catalogue.services.map(s => s.category);
  const tabNames = catalogue.categories.map(c => c.name).filter(n => used.indexOf(n) >= 0);
  used.forEach(n => {
    if (tabNames.indexOf(n) < 0) tabNames.push(n);
  });

  const q = search.trim().toLowerCase();
  const shown = catalogue.services.filter(
    s =>
      (category === ALL || s.category === category) &&
      (!q || s.name.toLowerCase().indexOf(q) >= 0 || s.description.toLowerCase().indexOf(q) >= 0)
  );

  const open = (service: IService): void => {
    setQueryParam('service', service.serviceId);
    setScreen({ name: 'form', service });
  };

  return (
    <section className={styles.root}>
      <h2 className={styles.title}>{title}</h2>
      <div style={{ margin: '12px 0' }}>
        <SearchBox placeholder="Search services" ariaLabel="Search services" value={search} onChange={(_, v) => setSearch(v || '')} />
      </div>
      {tabNames.length > 1 && (
        <Pivot
          aria-label="Service categories"
          selectedKey={category}
          onLinkClick={item => item && setCategory(item.props.itemKey || ALL)}
          overflowBehavior="menu"
          overflowAriaLabel="More categories"
          styles={{ root: { marginBottom: 12 } }}
        >
          <PivotItem headerText="All" itemKey={ALL} />
          {tabNames.map(n => (
            <PivotItem key={n} headerText={n} itemKey={n} />
          ))}
        </Pivot>
      )}
      {catalogue.services.length === 0 ? (
        <EmptyState icon="Shop" title="No services are available to you yet." text="If you need something, please contact the IT team." />
      ) : shown.length === 0 ? (
        <EmptyState
          title="No services found. Try another word or category."
          actionText="Show all services"
          onAction={() => {
            setSearch('');
            setCategory(ALL);
          }}
        />
      ) : (
        <div className={styles.grid}>
          {shown.map(s => (
            <ServiceCard
              key={s.id}
              service={s}
              icon={s.icon || categoryIcon[s.category.toLowerCase()] || 'Settings'}
              onOpen={() => open(s)}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default ServiceCatalogue;
