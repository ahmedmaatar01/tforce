import * as React from 'react';
import {
  DefaultButton,
  Dialog,
  DialogFooter,
  DialogType,
  IconButton,
  MessageBar,
  MessageBarType,
  Panel,
  PanelType,
  PrimaryButton
} from '@fluentui/react';
import common from '../../../common/components/Common.module.scss';
import styles from './RequestAdmin.module.scss';
import { friendlyError } from '../../../common/components/Shared';

/** Turns a save error into a short message (with the SharePoint detail, since only admins see this web part). */
export function saveError(e: unknown): string {
  const { detail } = friendlyError(e);
  return `Could not save. ${detail}`;
}

/** Side panel with Save / Cancel. */
export const EditPanel: React.FC<{
  title: string;
  isOpen: boolean;
  busy: boolean;
  error?: string;
  saveText?: string;
  wide?: boolean;
  onSave: () => void;
  onDismiss: () => void;
  children?: React.ReactNode;
}> = ({ title, isOpen, busy, error, saveText, wide, onSave, onDismiss, children }) => (
  <Panel
    isOpen={isOpen}
    headerText={title}
    type={wide ? PanelType.medium : PanelType.smallFixedFar}
    isLightDismiss={false}
    closeButtonAriaLabel="Close"
    onDismiss={() => !busy && onDismiss()}
    isFooterAtBottom
    onRenderFooterContent={() => (
      <div className={common.toolbar} style={{ marginBottom: 0 }}>
        <PrimaryButton text={busy ? 'Saving...' : saveText || 'Save'} disabled={busy} onClick={onSave} />
        <DefaultButton text="Cancel" disabled={busy} onClick={onDismiss} />
      </div>
    )}
  >
    <div className={styles.panelBody}>
      {error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline>
          {error}
        </MessageBar>
      )}
      {children}
    </div>
  </Panel>
);

/** "Are you sure?" dialog. */
export const Confirm: React.FC<{
  title: string;
  text: string;
  confirmText: string;
  hidden: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ title, text, confirmText, hidden, busy, onConfirm, onCancel }) => (
  <Dialog hidden={hidden} onDismiss={onCancel} dialogContentProps={{ type: DialogType.normal, title, subText: text }} modalProps={{ isBlocking: true }}>
    <DialogFooter>
      <PrimaryButton text={busy ? 'Please wait...' : confirmText} disabled={busy} onClick={onConfirm} />
      <DefaultButton text="Cancel" disabled={busy} onClick={onCancel} />
    </DialogFooter>
  </Dialog>
);

/** Searchable people picker (name or email). Kept under this name for the admin screens. */
export { UserPicker as PeopleInput } from '../../../common/components/UserPicker';

/** Small up/down buttons used to reorder fields and steps. */
export const MoveButtons: React.FC<{ name: string; first: boolean; last: boolean; disabled?: boolean; onMove: (d: -1 | 1) => void }> = ({ name, first, last, disabled, onMove }) => (
  <span className={styles.moveButtons}>
    <IconButton iconProps={{ iconName: 'ChevronUp' }} title={`Move ${name} up`} ariaLabel={`Move ${name} up`} disabled={disabled || first} onClick={() => onMove(-1)} />
    <IconButton iconProps={{ iconName: 'ChevronDown' }} title={`Move ${name} down`} ariaLabel={`Move ${name} down`} disabled={disabled || last} onClick={() => onMove(1)} />
  </span>
);

/** Parses a number box. Empty -> undefined. */
export function parseNumber(v: string | undefined): number | undefined {
  const t = (v || '').trim().replace(',', '.');
  if (!t) return undefined;
  const n = parseFloat(t);
  return isNaN(n) ? NaN : n;
}

export function numText(n: number | undefined): string {
  return n === undefined || isNaN(n) ? '' : String(n);
}
