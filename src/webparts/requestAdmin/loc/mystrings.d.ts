declare interface IRequestAdminWebPartStrings {
  PropertyPaneDescription: string;
  BasicGroupName: string;
  DefaultTitle: string;
  TitleFieldLabel: string;
  AdminEmailsFieldLabel: string;
  AdminEmailsFieldDescription: string;
}

declare module 'RequestAdminWebPartStrings' {
  const strings: IRequestAdminWebPartStrings;
  export = strings;
}
