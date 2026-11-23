declare interface IMyRequestsWebPartStrings {
  PropertyPaneDescription: string;
  BasicGroupName: string;
  DefaultTitle: string;
  TitleFieldLabel: string;
  LinkFieldLabel: string;
  LinkFieldDescription: string;
}

declare module 'MyRequestsWebPartStrings' {
  const strings: IMyRequestsWebPartStrings;
  export = strings;
}
