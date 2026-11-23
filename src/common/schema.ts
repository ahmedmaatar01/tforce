/**
 * List titles and column internal names used by all TForce web parts.
 *
 * The brief requires the same names as the lists (no renaming in code), so the
 * values below are the internal names as created on TForceHub. If a column was
 * created with a different internal name, change it here only.
 *
 * Built-in columns (Id, Title, Author, Created) are used where the brief does
 * not name a dedicated column (for example the requester is the item Author).
 */
export const Lists = {
  ServiceCatalog: 'webpartsTF_ServiceCatalog',
  ServiceFormFields: 'webpartsTF_ServiceFormFields',
  ApprovalRules: 'webpartsTF_ApprovalRules',
  Requests: 'webpartsTF_Requests',
  ApprovalLog: 'webpartsTF_ApprovalLog',
  Employees: 'webpartsTF_Employees',
  Departments: 'webpartsTF_Departments',
  Categories: 'webpartsTF_Categories'
} as const;

export type ListKey = keyof typeof Lists;

export const ServiceCatalogCols = {
  Title: 'Title',
  ServiceID: 'ServiceID',
  Description: 'Description',
  Category: 'Category',
  Icon: 'Icon',
  SLAHours: 'SLAHours',
  IsActive: 'IsActive',
  AllowedRequesters: 'AllowedRequesters'
} as const;

export const ServiceFormFieldsCols = {
  Title: 'Title', // label shown to the employee
  ServiceID: 'ServiceID',
  FieldKey: 'FieldKey',
  FieldType: 'FieldType',
  Required: 'Required',
  SortOrder: 'SortOrder',
  ChoiceSource: 'ChoiceSource',
  Choices: 'Choices', // "column choices": values separated by ; or new lines
  HelpText: 'HelpText',
  Placeholder: 'Placeholder',
  ValidationRegex: 'ValidationRegex',
  ValidationMessage: 'ValidationMessage',
  MinValue: 'MinValue',
  MaxValue: 'MaxValue',
  VisibleIf: 'VisibleIf'
} as const;

export const ApprovalRulesCols = {
  Title: 'Title', // step name shown in the progress strip
  ServiceID: 'ServiceID',
  StepNo: 'StepNo',
  ApproverType: 'ApproverType',
  ApproverValue: 'ApproverValue',
  Mode: 'Mode',
  ConditionField: 'ConditionField',
  ConditionOperator: 'ConditionOperator',
  ConditionValue: 'ConditionValue',
  RequiredChecks: 'RequiredChecks',
  ReminderHours: 'ReminderHours',
  EscalateHours: 'EscalateHours',
  EscalateToBackup: 'EscalateToBackup'
} as const;

export const RequestsCols = {
  Title: 'Title', // service name
  RequestID: 'RequestID', // e.g. TKT-1024
  ServiceID: 'ServiceID',
  Status: 'Status',
  CurrentStep: 'CurrentStep',
  CurrentApprover: 'CurrentApprover', // set by the approval flow
  SubmittedOn: 'SubmittedOn',
  FieldValues: 'FieldValues', // JSON of the visible field values
  Priority: 'Priority',
  ResolutionNote: 'ResolutionNote',
  Requester: 'Author' // built-in "Created By"
} as const;

export const ApprovalLogCols = {
  Title: 'Title',
  RequestID: 'RequestID',
  StepNo: 'StepNo',
  Decision: 'Decision',
  Approver: 'Approver',
  Comment: 'Comment',
  DecisionOn: 'DecisionOn'
} as const;

export const EmployeesCols = {
  Title: 'Title', // full name
  Email: 'Email',
  Manager: 'Manager',
  Department: 'Department'
} as const;

export const DepartmentsCols = {
  Title: 'Title',
  Head: 'Head',
  ParentDepartment: 'ParentDepartment'
} as const;

export const CategoriesCols = {
  Title: 'Title',
  Icon: 'Icon',
  SortOrder: 'SortOrder',
  ServiceTeam: 'ServiceTeam' // people who fulfil requests for this category
} as const;

/** Prefix used to build request IDs from the list item ID. */
export const RequestIdPrefix = 'TKT-';
