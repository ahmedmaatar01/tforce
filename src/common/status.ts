import { RequestStatus } from './models';

export interface IStatusInfo {
  label: string;
  /** Text colour, background colour. Always shown with text + icon. */
  color: string;
  background: string;
  /** Fluent UI icon name. */
  icon: string;
}

/** Shared status model (brief section 4). Use these words and colours everywhere. */
export const StatusInfo: Record<RequestStatus, IStatusInfo> = {
  Submitted: { label: 'Sent', color: '#0b5394', background: '#deecf9', icon: 'Send' },
  'Pending Approval': { label: 'Waiting for approval', color: '#7a5200', background: '#fff4ce', icon: 'Clock' },
  Returned: { label: 'Needs your update', color: '#8a3707', background: '#fde7d9', icon: 'Edit' },
  Approved: { label: 'Approved', color: '#0b6a0b', background: '#dff6dd', icon: 'CheckMark' },
  Rejected: { label: 'Not approved', color: '#a4262c', background: '#fde7e9', icon: 'Cancel' },
  'In Progress': { label: 'Being handled', color: '#0b5394', background: '#deecf9', icon: 'Settings' },
  Resolved: { label: 'Done, please confirm', color: '#0b6a0b', background: '#dff6dd', icon: 'Completed' },
  Closed: { label: 'Closed', color: '#484644', background: '#edebe9', icon: 'Lock' },
  Cancelled: { label: 'Cancelled', color: '#484644', background: '#edebe9', icon: 'Delete' }
};

export const ClosedStatuses: RequestStatus[] = ['Closed', 'Cancelled', 'Rejected'];

export function isOpenStatus(status: RequestStatus): boolean {
  return ClosedStatuses.indexOf(status) < 0;
}

export function toStatus(value: unknown): RequestStatus {
  const s = String(value || '').trim();
  return (Object.prototype.hasOwnProperty.call(StatusInfo, s) ? s : 'Submitted') as RequestStatus;
}

export function statusInfo(status: RequestStatus): IStatusInfo {
  return StatusInfo[status] || StatusInfo.Submitted;
}
