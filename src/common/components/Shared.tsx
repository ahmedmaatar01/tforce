import * as React from 'react';
import { DefaultButton, Icon, PrimaryButton, Spinner, SpinnerSize, TooltipHost } from '@fluentui/react';
import styles from './Common.module.scss';
import { RequestStatus } from '../models';
import { statusInfo } from '../status';

/** Coloured badge with icon + text (colour is never the only signal). */
export const StatusBadge: React.FC<{ status: RequestStatus }> = ({ status }) => {
  const info = statusInfo(status);
  return (
    <span className={styles.badge} style={{ color: info.color, background: info.background }}>
      <Icon iconName={info.icon} aria-hidden="true" />
      <span>{info.label}</span>
    </span>
  );
};

export const Loading: React.FC<{ label?: string }> = ({ label }) => (
  <div className={styles.state} role="status" aria-live="polite">
    <Spinner size={SpinnerSize.large} label={label || 'Loading...'} />
  </div>
);

export interface IStateProps {
  icon?: string;
  title: string;
  text?: string;
  actionText?: string;
  onAction?: () => void;
  secondaryText?: string;
  onSecondary?: () => void;
}

/** Empty state with a next action (no dead ends). */
export const EmptyState: React.FC<IStateProps> = ({ icon, title, text, actionText, onAction, secondaryText, onSecondary }) => (
  <div className={styles.state}>
    <Icon iconName={icon || 'Search'} className={styles.stateIcon} aria-hidden="true" />
    <div className={styles.sectionTitle} style={{ margin: 0 }}>{title}</div>
    {text && <div className={styles.muted}>{text}</div>}
    <div className={styles.toolbar} style={{ justifyContent: 'center', marginTop: 8 }}>
      {actionText && onAction && <PrimaryButton text={actionText} onClick={onAction} />}
      {secondaryText && onSecondary && <DefaultButton text={secondaryText} onClick={onSecondary} />}
    </div>
  </div>
);

export const ErrorState: React.FC<{ message?: string; onRetry: () => void; adminDetail?: string }> = ({ message, onRetry, adminDetail }) => (
  <div className={styles.state} role="alert">
    <Icon iconName="Warning" className={styles.stateIcon} aria-hidden="true" />
    <div className={styles.sectionTitle} style={{ margin: 0 }}>{message || 'Something went wrong while loading.'}</div>
    {adminDetail && <div className={styles.muted}>Admin details: {adminDetail}</div>}
    <PrimaryButton text="Try again" onClick={onRetry} />
  </div>
);

/** A button that, when not allowed, is disabled and shows a short reason under it. */
export const ActionButton: React.FC<{
  text: string;
  primary?: boolean;
  allowed: boolean;
  reason?: string;
  busy?: boolean;
  onClick: () => void;
}> = ({ text, primary, allowed, reason, busy, onClick }) => {
  const Btn = primary ? PrimaryButton : DefaultButton;
  const reasonId = React.useMemo(() => `reason-${Math.random().toString(36).substring(2, 9)}`, []);
  return (
    <div className={styles.actionWithReason}>
      <TooltipHost content={!allowed ? reason : undefined}>
        <Btn text={text} disabled={!allowed || busy} onClick={onClick} aria-describedby={!allowed && reason ? reasonId : undefined} />
      </TooltipHost>
      {!allowed && reason && <span id={reasonId} className={styles.reason}>{reason}</span>}
    </div>
  );
};

/** Turns technical errors into a short, plain message. Admins also get the detail. */
export function friendlyError(e: unknown): { message: string; detail: string } {
  const detail = e instanceof Error ? e.message : String(e);
  if (/403|access denied|unauthori/i.test(detail)) return { message: "You don't have access to this information.", detail };
  if (/404|does not exist/i.test(detail)) return { message: 'Some information could not be found. Please ask the IT team to check the set-up.', detail };
  return { message: 'Something went wrong while loading.', detail };
}

/** Reads ?name= from the page URL. */
export function queryParam(name: string): string | undefined {
  try {
    const v = new URLSearchParams(window.location.search).get(name);
    return v || undefined;
  } catch {
    return undefined;
  }
}

export function setQueryParam(name: string, value: string | undefined): void {
  try {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // ignore: deep links are a convenience only
  }
}
