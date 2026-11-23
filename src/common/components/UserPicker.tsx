import * as React from 'react';
import { IPersonaProps } from '@fluentui/react';
import { IPeoplePickerContext, PeoplePicker, PrincipalType } from '@pnp/spfx-controls-react/lib/PeoplePicker';
import styles from './Common.module.scss';
import { IPerson } from '../models';

/**
 * SharePoint context for the people picker. Each web part wraps its root in
 * <PickerContext.Provider value={pickerContext(this.context)}>.
 */
export const PickerContext = React.createContext<IPeoplePickerContext | undefined>(undefined);

export function pickerContext(ctx: { pageContext: { web: { absoluteUrl: string } }; msGraphClientFactory: IPeoplePickerContext['msGraphClientFactory']; spHttpClient: IPeoplePickerContext['spHttpClient'] }): IPeoplePickerContext {
  return { absoluteUrl: ctx.pageContext.web.absoluteUrl, msGraphClientFactory: ctx.msGraphClientFactory, spHttpClient: ctx.spHttpClient };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;

/** Picker result -> IPerson. With ensureUser the id is the site user ID (what person columns need). */
function toPerson(p: IPersonaProps & { id?: string; loginName?: string }): IPerson {
  const secondary = p.secondaryText || '';
  const login = p.loginName || '';
  const fromLogin = login.split('|').pop() || '';
  const email = EMAIL_RE.test(secondary) ? secondary : EMAIL_RE.test(fromLogin) ? fromLogin : undefined;
  const id = p.id !== undefined && /^\d+$/.test(String(p.id)) ? Number(p.id) : undefined;
  return { id, name: p.text || email || login, email: email ? email.toLowerCase() : undefined };
}

function sameList(a: IPerson[], b: IPerson[]): boolean {
  const k = (l: IPerson[]): string => l.map(p => (p.email || p.name).toLowerCase()).sort().join(';');
  return k(a) === k(b);
}

export interface IUserPickerProps {
  label: string;
  people: IPerson[];
  single?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** Also allow SharePoint groups (e.g. "who can request", service team). */
  allowGroups?: boolean;
  error?: string;
  help?: string;
  placeholder?: string;
  onChange: (people: IPerson[]) => void;
}

/** Searchable people picker (name or email, whole organisation), based on the PnP PeoplePicker. */
export const UserPicker: React.FC<IUserPickerProps> = ({ label, people, single, required, disabled, allowGroups, error, help, placeholder, onChange }) => {
  const context = React.useContext(PickerContext);
  // The PnP picker only reads defaultSelectedUsers when it mounts: remount it when the value changes from outside.
  const lastEmitted = React.useRef<IPerson[]>(people);
  const [version, setVersion] = React.useState(0);
  React.useEffect(() => {
    if (!sameList(people, lastEmitted.current)) {
      lastEmitted.current = people;
      setVersion(v => v + 1);
    }
  }, [people]);

  if (!context) return <div className={styles.fieldError}>People picker is not available here.</div>;

  return (
    <div>
      <PeoplePicker
        key={version}
        context={context}
        titleText={label}
        required={required}
        disabled={disabled}
        personSelectionLimit={single ? 1 : 50}
        principalTypes={allowGroups ? [PrincipalType.User, PrincipalType.SharePointGroup] : [PrincipalType.User]}
        ensureUser
        resolveDelay={300}
        suggestionsLimit={8}
        placeholder={placeholder || 'Search by name or email'}
        defaultSelectedUsers={people.map(p => p.email || p.name).filter(Boolean)}
        errorMessage={error}
        onChange={items => {
          const next = items.map(i => toPerson(i as IPersonaProps & { id?: string; loginName?: string }));
          lastEmitted.current = next;
          onChange(next);
        }}
      />
      {help && <div className={styles.help}>{help}</div>}
    </div>
  );
};
