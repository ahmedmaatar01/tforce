import { IApprovalLogEntry, IRequest } from '../models';

export interface IActionState {
  /** Show the button at all. */
  visible: boolean;
  allowed: boolean;
  /** Short reason shown next to a disabled button. */
  reason?: string;
}

export interface IRequestActions {
  cancel: IActionState;
  resubmit: IActionState;
  confirm: IActionState;
}

/**
 * Which actions the requester can take (brief 6.2).
 *
 * Cancel rule (open point 1, to confirm with the client): a request can be
 * cancelled until the first approval decision (counted again after a send back). Change it here only.
 */
export function requestActions(request: IRequest, log: IApprovalLogEntry[]): IRequestActions {
  const s = request.status;
  // Only approvals since the last time the request was sent back count: after Returned/Resubmitted it starts again.
  const sorted = log.slice().sort((a, b) => a.decisionOn.getTime() - b.decisionOn.getTime());
  let lastReset = -1;
  sorted.forEach((e, i) => {
    const d = (e.decision || '').toLowerCase();
    if (d === 'returned' || d === 'resubmitted') lastReset = i;
  });
  const anyApproval = sorted.slice(lastReset + 1).some(e => (e.decision || '').toLowerCase() === 'approved');

  let cancel: IActionState;
  if (s === 'Cancelled') cancel = { visible: false, allowed: false };
  else if (s === 'Closed' || s === 'Rejected') cancel = { visible: true, allowed: false, reason: 'This request is already closed' };
  else if (s === 'Approved' || anyApproval) cancel = { visible: true, allowed: false, reason: "You can't cancel this after approval" };
  else if (s === 'In Progress' || s === 'Resolved') cancel = { visible: true, allowed: false, reason: 'The team is already working on this' };
  else cancel = { visible: true, allowed: true };

  const resubmit: IActionState = s === 'Returned'
    ? { visible: true, allowed: true }
    : { visible: false, allowed: false, reason: 'Only possible when the request is sent back to you' };

  const confirm: IActionState = s === 'Resolved'
    ? { visible: true, allowed: true }
    : { visible: false, allowed: false, reason: 'Only possible when the team marks it as done' };

  return { cancel, resubmit, confirm };
}
