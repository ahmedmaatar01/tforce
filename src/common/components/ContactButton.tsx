import * as React from 'react';
import { Callout, DirectionalHint, getId, Icon, Link, Text } from '@fluentui/react';
import { IPerson } from '../models';

export interface IContactButtonProps {
  /** People who can be contacted. Anyone without an email is left out. */
  people: IPerson[];
  /** Text sent with the Teams message and used as the email subject, e.g. "About my request REQ-0012". */
  subject?: string;
  label?: string;
}

/** Opens a Teams chat with one or more people, with an optional ready-made message. */
export function teamsChatUrl(emails: string[], message?: string): string {
  const users = emails.map(e => encodeURIComponent(e)).join(',');
  return `https://teams.microsoft.com/l/chat/0/0?users=${users}${message ? `&message=${encodeURIComponent(message)}` : ''}`;
}

export function mailtoUrl(email: string, subject?: string): string {
  return `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
}

const linkRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' };

/** A small "Contact" link that opens a pop-up with "Chat in Teams" and "Send an email" for each person. */
export const ContactButton: React.FC<IContactButtonProps> = ({ people, subject, label = 'Contact' }) => {
  const [open, setOpen] = React.useState(false);
  const buttonId = React.useMemo(() => getId('contact'), []);
  const titleId = React.useMemo(() => getId('contactTitle'), []);
  const reachable = people.filter(p => !!p.email);
  if (!reachable.length) return null;

  return (
    <>
      <Link id={buttonId} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog" styles={{ root: { marginLeft: 8, fontWeight: 600 } }}>
        <Icon iconName="Chat" aria-hidden="true" style={{ marginRight: 4, verticalAlign: 'middle' }} />
        {label}
      </Link>
      {open && (
        <Callout
          target={`#${buttonId}`}
          onDismiss={() => setOpen(false)}
          directionalHint={DirectionalHint.bottomLeftEdge}
          role="dialog"
          ariaLabelledBy={titleId}
          setInitialFocus
          gapSpace={4}
          styles={{ calloutMain: { padding: '12px 16px', minWidth: 240, maxWidth: 340 } }}
        >
          {reachable.map((p, i) => (
            <div key={p.email} style={i > 0 ? { borderTop: '1px solid #edebe9', marginTop: 8, paddingTop: 8 } : undefined}>
              <Text id={i === 0 ? titleId : undefined} block variant="mediumPlus" styles={{ root: { fontWeight: 600 } }}>
                {p.name || p.email}
              </Text>
              <div style={linkRow}>
                <Icon iconName="TeamsLogo" aria-hidden="true" />
                <Link href={teamsChatUrl([p.email!], subject)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                  Chat in Teams
                </Link>
              </div>
              <div style={linkRow}>
                <Icon iconName="Mail" aria-hidden="true" />
                <Link href={mailtoUrl(p.email!, subject)} onClick={() => setOpen(false)} title={p.email}>
                  Send an email
                </Link>
              </div>
            </div>
          ))}
        </Callout>
      )}
    </>
  );
};
