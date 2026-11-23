# Requests Web Parts: Development Brief

Site: https://tforcesa.sharepoint.com/sites/TForceHub
Lists: all lists use the prefix `webpartsTF_` (test lists, created by the team).

Goal: employees can request any service from a web part, pick options from lists, and follow every request step by step. Each request type can have its own form fields and its own approval steps, configured from lists.

---

## 1. Design principles (apply everywhere)

These are the most important rules. Check every screen against them.

1. **Simple first.** One task per screen. No more than 6 fields visible at once when possible.
2. **Plain English labels.** Use "Request", "Approve", "Send back", "Cancel". Avoid technical terms like "RequestID", "FieldKey", "StepNo".
3. **Show the answer, not the setup.** Employees see the service name, the status and the next step. They never see configuration.
4. **Tell the user what happens next.** After submitting: "Your request TKT-1024 was sent to your manager for approval."
5. **Clear errors next to the field.** "Please enter a cost centre" under the field, not a generic popup.
6. **Mobile and narrow layouts.** Each web part works at 360px width. No horizontal scrolling.
7. **Fast.** Show a spinner while loading. Load each list once per page view, not once per click.
8. **Accessible.** Labels on every input, keyboard navigation, colour is never the only signal (use text + icon for status).
9. **Consistent status colours and words** everywhere (see section 4).
10. **No dead ends.** Every error or empty state has a next action ("Browse services", "Try again").

---

## 2. Lists (already created)

| List | Purpose |
|---|---|
| `webpartsTF_ServiceCatalog` | Services employees can request (one row per service) |
| `webpartsTF_ServiceFormFields` | Form fields for each service (one row per field) |
| `webpartsTF_ApprovalRules` | Approval steps for each service (one row per step) |
| `webpartsTF_Requests` | Each submitted request |
| `webpartsTF_ApprovalLog` | History of approval decisions (append only) |
| `webpartsTF_Employees` | Employee directory (name, email, manager, department) |
| `webpartsTF_Departments` | Departments and hierarchy |
| `webpartsTF_Categories` | Service categories |

The column names are listed in the Lists setup file. Use internal names exactly as created (no spaces).

---

## 3. Web parts to build

| # | Web part | Who uses it | Priority |
|---|---|---|---|
| WP1 | **Service Catalogue & Request Form** | All employees | MVP |
| WP2 | **My Requests** | All employees | MVP |
| WP3 | **Approvals & Queue** | Approvers and service team | MVP |
| WP4 | **Request Admin** | Administrators | Later (use list forms first) |

---

## 4. Shared status model

| Status | Plain English shown to users | Colour | Icon |
|---|---|---|---|
| Submitted | Sent | Blue | Paper plane |
| Pending Approval | Waiting for approval | Amber | Clock |
| Returned | Needs your update | Orange | Pencil |
| Approved | Approved | Green | Tick |
| Rejected | Not approved | Red | Cross |
| In Progress | Being handled | Blue | Gear |
| Resolved | Done, please confirm | Green | Check |
| Closed | Closed | Grey | Lock |
| Cancelled | Cancelled | Grey | Bin |

---

## 5. WP1: Service Catalogue & Request Form

### 5.1 Screen 1: Choose a service
- Title: **"What do you need?"**
- Search box at the top. Filters by name or description.
- Category tabs (from `Category`): All, Hardware, Software, Network, Email, Printer, Access request, Cybersecurity, Other.
- Service cards: icon, name, one-line description, expected response time (from `SLAHours`, shown as "Usually within 24 hours").
- Only show services where `IsActive = Yes` and the current user is in `AllowedRequesters`.
- Empty state: "No services found. Try another word or category."

### 5.2 Screen 2: Fill the form
- Title: the service name. Subtitle: the service description.
- Fields come from `webpartsTF_ServiceFormFields` for that `ServiceID`, ordered by `SortOrder`.
- Render each field by `FieldType`:

| FieldType | Control |
|---|---|
| text | Single-line text box |
| multiline | Multi-line text box |
| choice | Drop-down (values from `ChoiceSource` list, or column choices) |
| lookup | Searchable drop-down from the list named in `ChoiceSource` |
| person | Person picker (from `webpartsTF_Employees`) |
| date | Date picker |
| number | Number box (respects `MinValue` and `MaxValue`) |
| yesno | Toggle (Yes/No) |
| attachment | File upload (max 25 MB) |

- **Required:** `Required = Yes` shows a red asterisk and blocks submit.
- **Validation:** `ValidationRegex`, `MinValue`, `MaxValue`. Show the error text under the field.
- **Conditional fields:** `VisibleIf` (examples: `Cost > 5000`, `Type = Shared mailbox`). Hidden fields are not validated and not saved.
- **Buttons:** "Submit request" (primary), "Cancel" (secondary, asks "Discard this request?" if anything is filled in).
- Progress: 1 page is enough for MVP. Do not add wizards yet.

### 5.3 Screen 3: Confirmation
- "Sent. Your request **TKT-1024** is with your manager."
- Show the first approver's name and the expected next step.
- Buttons: "View my requests" (opens WP2), "Request something else".

### 5.4 Behaviour on submit
1. Create an item in `webpartsTF_Requests` with `Status = Submitted`, `CurrentStep = 1`, `SubmittedOn = now`, and `FieldValues` as JSON of the visible field values.
2. The approval flow (Power Automate) reads `webpartsTF_ApprovalRules` and takes over.
3. If saving fails: keep the form data, show "Could not send. Your answers are saved, please try again."

---

## 6. WP2: My Requests

### 6.1 Screen 1: My requests list
- Title: **"My requests"**
- Tabs: Open, Closed, All.
- Each row: request ID, service name, status (coloured badge), submitted date, "Waiting for: [name]" when the status is Pending Approval.
- Sort by most recent first.
- Empty state: "You have no requests yet." Button: "Request something".

### 6.2 Screen 2: Request details
- Header: request ID, service name, status badge.
- **Progress strip:** one circle per step from `webpartsTF_ApprovalRules`, with the step name. Completed steps show a tick and the date, current step is highlighted, future steps are grey.
- **"Waiting for" box:** "Waiting for Sarah Ahmed (Finance) since 3 Nov, 10:20. Due in 6 hours."
- **History:** from `webpartsTF_ApprovalLog`, one line per decision: "Approved by Khalid Al-Saud, 3 Nov, 14:02. Comment: OK".
- **Request details:** the submitted fields, shown as label and value (hidden fields are not shown).
- **Actions:**
  - "Cancel request" (only when the rules allow it, see section 9).
  - "Update and resubmit" (only when Status = Returned).
  - "Confirm it is resolved" (only when Status = Resolved).
- Buttons must be disabled with a short reason when not allowed (e.g., "You can't cancel this after approval").

---

## 7. WP3: Approvals & Queue

### 7.1 Screen 1: To approve
- Title: **"Waiting for my decision"**
- Count badge: "3 requests need you".
- Each card: request ID, requester name, service, submitted date, amount if any, due date.
- Expand a card to show the submitted fields and the `RequiredChecks` text (what the approver must confirm).
- Buttons: **Approve**, **Send back** (asks for a comment), **Reject** (asks for a comment).
- Comment box is required for Send back and Reject. Max 500 characters.
- After a decision, the card disappears with a short message: "Approved. Next step: IT team."

### 7.2 Screen 2: Service team queue (for fulfilment)
- Tabs: New, In progress, Resolved.
- Each row: request ID, service, requester, priority, age, status.
- Actions: "Start working" (sets In Progress), "Mark as resolved" (adds a note, sets Resolved).
- Filter by category and priority.

### 7.3 Visibility rules
- Approvers see only requests where they are the current approver.
- Service team sees requests for the categories they handle.
- Admins see everything (through the list views for now).

---

## 8. WP4: Request Admin (later)

For the MVP, administrators use the standard list forms for `ServiceCatalog`, `ServiceFormFields` and `ApprovalRules`. Build WP4 only after WP1 to WP3 are tested.

When built, it should:
- Show services as cards, with an "Edit" button.
- Edit fields with a simple form: name, type, required, options.
- Edit approval steps as a numbered list: drag to reorder, pick approver type from a drop-down, set the condition with plain choices ("When Cost is greater than 5000").
- Preview the form before publishing.
- Block saving when a rule refers to a field that does not exist.

---

## 9. Configurable rules (how behaviour is controlled)

These are read from the lists. Never hard-code them in the web part.

| Setting | Where | Effect |
|---|---|---|
| Form fields and order | `ServiceFormFields` | What the employee fills in |
| Required, min, max, regex | `ServiceFormFields` | Validation |
| Visible only when | `ServiceFormFields.VisibleIf` | Conditional fields |
| Approval steps | `ApprovalRules` (StepNo) | Order of approvals |
| Approver | `ApproverType` + `ApproverValue` | Who approves each step |
| Sequential or parallel | `ApprovalRules.Mode` | Whether steps wait for each other |
| Step condition | `ConditionField`, `ConditionOperator`, `ConditionValue` | Skip a step when not needed |
| Checks for approver | `ApprovalRules.RequiredChecks` | Text shown on the approval card |
| Reminder and escalation | `ReminderHours`, `EscalateHours`, `EscalateToBackup` | Follow-up timing |
| Cancel and edit rules | To be confirmed with the client | Shown in WP2 |

**Rules for the validation engine:**
- A field is validated only when it is visible.
- A step with a false condition is skipped and its row is not shown in the progress strip.
- A missing approver blocks submission and shows an admin-only error message.

---

## 10. Technical setup

- SharePoint Framework (SPFx), React and TypeScript.
- One solution with three web parts (WP1 to WP3), sharing one data layer.
- Data layer: a small service file that reads and writes the lists through the SharePoint REST API, with a cache per page view.
- Use the same field names as the lists (no renaming in code).
- Use Fluent UI components for consistency with SharePoint.
- Unit tests for the validation and condition logic (no SharePoint needed).
- Test on the TForceHub test lists only (`webpartsTF_...`).

---

## 11. Build order

1. **Data layer and config reader.** Read `ServiceCatalog` and `ServiceFormFields`. Test with console output.
2. **WP1 Screen 1 (catalogue).** Service cards, categories, search.
3. **WP1 Screen 2 (form).** All field types, validation, conditional fields. Unit tests for validation.
4. **WP1 submit.** Create the request item. Confirm screen.
5. **WP2 list and details.** Progress strip from `ApprovalRules`, history from `ApprovalLog`.
6. **WP3 approvals.** Approve, send back, reject with comments.
7. **Approval flow (Power Automate).** Built in parallel with steps 4 to 6.
8. **WP3 service queue.**
9. **Polish.** Empty states, error messages, mobile layout, accessibility check.
10. **UAT.** Test with 2 or 3 real users on the test site.

---

## 12. Definition of done (per web part)

- [ ] Works at 360px and 1280px width.
- [ ] All text in English, plain words, no technical IDs shown to users.
- [ ] Every error has a clear message next to the cause.
- [ ] Every empty state has a next action.
- [ ] Keyboard usable, labels on all inputs.
- [ ] Loads in under 2 seconds on the test site.
- [ ] Reads all rules from lists (no hard-coded fields, approvers or services).
- [ ] Tested with at least 3 services and 2 approval paths.

---

## 13. Working with Claude Code

- Put this file at `docs/webparts-dev-brief.md` in the repo.
- Start each session with: "Read docs/webparts-dev-brief.md. Work on build step 2 only. Stop when its definition of done is met."
- Keep one branch per web part.
- Update the checkboxes after each session.

---

## 14. Open points (to confirm with the client, do not block the start)

1. Who can cancel a request, and until which step?
2. When a request is rejected, is it closed or can the requester resubmit?
3. Who fulfils requests for each category?
4. Is Arabic needed later?
5. Maximum attachment size and file types.
