# TForce Custom Webparts

One SPFx solution (SPFx 1.24.1, React 18, Fluent UI 8, Heft toolchain) with the three MVP web parts from [docs/webparts-dev-brief.md](docs/webparts-dev-brief.md).

| Web part | Toolbox name | Default title |
|---|---|---|
| WP1 | Service Catalogue & Request Form | What do you need? |
| WP2 | My Requests | My requests |
| WP3 | Approvals & Queue | Waiting for my decision |

All three appear in the page toolbox under the **TForce Custom Webparts** group. They ship in one bundle, so they share one data layer and one cache per page view.

## Commands

Node 22 or 24 is required.

```bash
npm install
npm start          # local dev server, then open the hosted workbench on TForceHub
npm run build      # build + unit tests + package -> sharepoint/solution/tforce-custom-webparts.sppkg
npx heft test      # unit tests only (validation, conditions, approval steps)
```

To test it live, edit `config/serve.json` and set `initialPage` to `https://tforcesa.sharepoint.com/sites/TForceHub/_layouts/workbench.aspx`.

## Deploy

1. Run `npm run build`.
2. Upload `sharepoint/solution/tforce-custom-webparts.sppkg` to the App Catalog (tenant or site collection).
3. Add the web parts to pages on TForceHub, for example a "Services" page (WP1), a "My requests" page (WP2) and an "Approvals" page (WP3).
4. In the property pane, set **My requests page** on WP1 and **Service catalogue page** on WP2, so the buttons link to each other.

## Code layout

```
src/common/
  schema.ts            list titles + column internal names (the ONLY place names live)
  models.ts            typed models
  status.ts            shared status model (brief section 4)
  data/SpRest.ts       SharePoint REST wrapper, cache per page view, column metadata
  data/mappers.ts      list item -> model
  data/DataService.ts  reads/writes used by the web parts, approver resolution, decisions
  logic/               pure logic + unit tests (no SharePoint needed)
    conditions.ts      VisibleIf and approval-rule conditions
    validation.ts      required / min / max / regex / 25 MB attachments
    approvals.ts       applicable steps, parallel steps, progress strip
    requestActions.ts  cancel / resubmit / confirm rules (open point 1)
  components/          shared UI: dynamic form, status badge, progress strip, empty/error states
src/webparts/
  serviceCatalogue/    WP1
  myRequests/          WP2
  approvalsQueue/      WP3
```

## List columns used (please check against the Lists setup file)

The Lists setup file was not available when this was built. The names below come from the brief. If a column has a different internal name, change it in `src/common/schema.ts` only.

The data layer reads each list's column metadata, so:
- person and lookup columns are expanded automatically,
- a write to a column that does not exist is skipped with a console warning, not an error.

Reads that **filter** on a column (`Status`, `CurrentApprover`, `RequestID`) still need that column to exist.

| List | Columns |
|---|---|
| ServiceCatalog | Title (service name), ServiceID, Description, Category, Icon, SLAHours, IsActive, AllowedRequesters (person/group, or text such as "All" or a department name; empty = everyone) |
| ServiceFormFields | Title (label), ServiceID, FieldKey, FieldType, Required, SortOrder, ChoiceSource (list title, uses its Title column), Choices (values separated by `;` or new lines), HelpText, Placeholder, ValidationRegex, ValidationMessage, MinValue, MaxValue, VisibleIf |
| ApprovalRules | Title (step name), ServiceID, StepNo, ApproverType, ApproverValue, Mode, ConditionField, ConditionOperator, ConditionValue, RequiredChecks, ReminderHours, EscalateHours, EscalateToBackup |
| Requests | Title (service name), RequestID (`TKT-<item id>`), ServiceID, Status, CurrentStep, CurrentApprover (person, single or multi; **set by the flow**), SubmittedOn, FieldValues (multi-line text, JSON), Priority, ResolutionNote. The requester is the built-in Created By. |
| ApprovalLog | Title, RequestID (text, or lookup to Requests), StepNo, Decision, Approver (person), Comment, DecisionOn |
| Employees | Title (full name), Email, Manager (person or email text), Department |
| Departments | Title, Head (person), ParentDepartment |
| Categories | Title, Icon, SortOrder, ServiceTeam (person/group: who handles the queue for this category) |

### ApproverType values understood

| ApproverType contains | Approver |
|---|---|
| `Manager` | Requester's Manager from Employees |
| `Department` / `Head` | Head of the department in ApproverValue (or the requester's department) |
| `Field` / `Form` | Person picked in the form field named in ApproverValue |
| `Group` / `Team` / `Role` / `Queue` | Name in ApproverValue (shown as text) |
| anything else, e.g. `Person` | Email(s) in ApproverValue, separated by `;` |

If an approver can't be found, submission is blocked. Employees see "This service is not set up correctly". Site admins also see the exact reason.

### Condition syntax

`VisibleIf` takes forms like `Cost > 5000`, `Type = Shared mailbox`, `Urgent = Yes and Cost >= 1000`, or `Type is not empty`. AND binds tighter than OR. Operators: `= != > >= < <= contains`, plus words such as `greater than` and `is empty`. Fields can be referenced by FieldKey or by label. An expression that can't be read shows the field rather than hiding it.

`ConditionOperator` in ApprovalRules accepts the same symbols or words.

## Who writes what (contract with the Power Automate flow)

| Action | Web part writes | Flow is expected to |
|---|---|---|
| Submit | Request: Status = Submitted, CurrentStep = first applicable step, SubmittedOn, FieldValues; attachments | Set Status = Pending Approval and CurrentApprover, send notifications, reminders, escalation |
| Approve | ApprovalLog entry. Request: next applicable CurrentStep (Status stays Pending Approval), or Status = Approved after the last step. Parallel steps wait for every approver. | Set CurrentApprover for the new step, notify |
| Send back / Reject | ApprovalLog entry. Status = Returned / Rejected. | Notify the requester |
| Update and resubmit | FieldValues, Status = Submitted, CurrentStep = first step. Log "Resubmitted". | Restart approvals |
| Cancel / Start working / Mark as resolved / Confirm | Status = Cancelled / In Progress / Resolved (+ ResolutionNote) / Closed, plus a log entry | Notify |

If the flow should own step changes instead, change `DataService.recordDecision` only.

## Open points coded as defaults (brief section 14)

1. **Cancel:** allowed until the first approval decision. See `src/common/logic/requestActions.ts`.
2. **Rejected:** treated as closed, with no resubmit.
3. **Fulfilment:** the `Categories.ServiceTeam` column. Site admins without a team see the whole queue.
4. **Arabic:** not done. Text is in English in the components.
5. **Attachments:** max 25 MB per file, any type. See `MAX_ATTACHMENT_BYTES` in `validation.ts`.

## Deep links

- WP1 `?service=<ServiceID>` opens the form for that service.
- WP2 `?requestId=<item id>` opens that request. The "View my requests" button uses this.
