import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Version } from '@microsoft/sp-core-library';
import { type IPropertyPaneConfiguration, PropertyPaneLabel, PropertyPaneTextField } from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { IPropertyFieldGroupOrPerson, PrincipalType, PropertyFieldPeoplePicker } from '@pnp/spfx-property-controls/lib/PropertyFieldPeoplePicker';
import { IReadonlyTheme } from '@microsoft/sp-component-base';

import * as strings from 'RequestAdminWebPartStrings';
import RequestAdmin, { IRequestAdminProps } from './components/RequestAdmin';
import { DataService } from '../../common/data/DataService';
import { applyTheme } from '../../common/theme';
import { PickerContext, pickerContext } from '../../common/components/UserPicker';

export interface IRequestAdminWebPartProps {
  title: string;
  /** People and SharePoint groups who can use the web part (besides site admins). */
  admins?: IPropertyFieldGroupOrPerson[];
  /** Older setting (emails as text), still honoured. */
  adminEmails?: string;
}

/** Splits the picked administrators into emails (people) and SharePoint group IDs. */
function toAdmins(picked: IPropertyFieldGroupOrPerson[] | undefined, legacy: string | undefined): IRequestAdminProps['admins'] {
  const emails = (legacy || '').split(/[;,\n]/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const groupIds: number[] = [];
  (picked || []).forEach(p => {
    const email = (p.email || '').trim() || ((p.login || '').split('|').pop() || '');
    if (email.indexOf('@') > 0) emails.push(email.toLowerCase());
    else if (p.id && /^\d+$/.test(String(p.id))) groupIds.push(Number(p.id));
  });
  return { emails, groupIds };
}

export default class RequestAdminWebPart extends BaseClientSideWebPart<IRequestAdminWebPartProps> {
  private _root: Root | undefined;

  public render(): void {
    const element: React.ReactElement<IRequestAdminProps> = React.createElement(RequestAdmin, {
      data: DataService.get(this.context),
      title: this.properties.title || strings.DefaultTitle,
      admins: toAdmins(this.properties.admins, this.properties.adminEmails)
    });
    if (!this._root) this._root = createRoot(this.domElement);
    this._root.render(React.createElement(PickerContext.Provider, { value: pickerContext(this.context) }, element));
  }

  protected onThemeChanged(currentTheme: IReadonlyTheme | undefined): void {
    applyTheme(this.domElement, currentTheme);
  }

  protected onDispose(): void {
    this._root?.unmount();
    this._root = undefined;
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: { description: strings.PropertyPaneDescription },
          groups: [
            {
              groupName: strings.BasicGroupName,
              groupFields: [
                PropertyPaneTextField('title', { label: strings.TitleFieldLabel }),
                PropertyFieldPeoplePicker('admins', {
                  key: 'adminsPicker',
                  label: strings.AdminEmailsFieldLabel,
                  context: this.context,
                  initialData: this.properties.admins || [],
                  allowDuplicate: false,
                  multiSelect: true,
                  principalType: [PrincipalType.Users, PrincipalType.SharePoint],
                  properties: this.properties,
                  onPropertyChange: this.onPropertyPaneFieldChanged.bind(this),
                  deferredValidationTime: 0,
                  searchTextLimit: 2
                }),
                PropertyPaneLabel('adminsHelp', { text: strings.AdminEmailsFieldDescription })
              ]
            }
          ]
        }
      ]
    };
  }
}
