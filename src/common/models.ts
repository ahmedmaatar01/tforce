export interface IPerson {
  id?: number;
  name: string;
  email?: string;
}

export interface ICategory {
  id: number;
  name: string;
  icon?: string;
  sortOrder: number;
  serviceTeam: IPerson[];
}

export interface IService {
  id: number;
  serviceId: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  slaHours?: number;
  isActive: boolean;
  /** People or groups allowed to request. Empty means everyone. */
  allowedRequesters: IPerson[];
  /** Text form of AllowedRequesters when the column is not a person column. */
  allowedRequestersText?: string;
}

export type FieldType =
  | 'text'
  | 'multiline'
  | 'choice'
  | 'lookup'
  | 'person'
  | 'date'
  | 'number'
  | 'yesno'
  | 'attachment';

export interface IFormField {
  id: number;
  serviceId: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  sortOrder: number;
  choiceSource?: string;
  choices: string[];
  helpText?: string;
  placeholder?: string;
  validationRegex?: string;
  validationMessage?: string;
  minValue?: number;
  maxValue?: number;
  visibleIf?: string;
}

export interface IApprovalRule {
  id: number;
  serviceId: string;
  stepNo: number;
  stepName: string;
  approverType: string;
  approverValue?: string;
  mode: 'Sequential' | 'Parallel';
  conditionField?: string;
  conditionOperator?: string;
  conditionValue?: string;
  requiredChecks?: string;
  reminderHours?: number;
  escalateHours?: number;
  escalateToBackup?: string;
}

/** A person picked in a form, stored in FieldValues. */
export interface IPersonValue {
  name: string;
  email: string;
}

/** An uploaded file chosen in a form (only the names are stored in FieldValues). */
export interface IFileValue {
  name: string;
  size: number;
  file?: File;
}

export type FieldValue = string | number | boolean | IPersonValue | IFileValue[] | undefined;
export type FieldValues = Record<string, FieldValue>;

export type RequestStatus =
  | 'Submitted'
  | 'Pending Approval'
  | 'Returned'
  | 'Approved'
  | 'Rejected'
  | 'In Progress'
  | 'Resolved'
  | 'Closed'
  | 'Cancelled';

export interface IRequest {
  id: number;
  requestId: string;
  serviceId: string;
  serviceName: string;
  status: RequestStatus;
  currentStep: number;
  currentApprovers: IPerson[];
  submittedOn: Date;
  modifiedOn: Date;
  fieldValues: FieldValues;
  priority?: string;
  resolutionNote?: string;
  requester: IPerson;
}

export type Decision = 'Approved' | 'Returned' | 'Rejected' | 'Cancelled' | 'Started' | 'Resolved' | 'Closed' | 'Resubmitted';

export interface IApprovalLogEntry {
  id: number;
  requestId: string;
  stepNo: number;
  decision: string;
  approver?: IPerson;
  comment?: string;
  decisionOn: Date;
}

export interface IEmployee {
  id: number;
  name: string;
  email: string;
  manager?: IPerson;
  department?: string;
}

export interface IDepartment {
  id: number;
  name: string;
  head?: IPerson;
  parent?: string;
}

export interface ICurrentUser {
  id: number;
  name: string;
  email: string;
  loginName: string;
  isSiteAdmin: boolean;
  groupIds: number[];
}
