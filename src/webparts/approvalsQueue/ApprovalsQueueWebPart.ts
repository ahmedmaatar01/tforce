import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Version } from '@microsoft/sp-core-library';
import { type IPropertyPaneConfiguration, PropertyPaneTextField } from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { IReadonlyTheme } from '@microsoft/sp-component-base';

import * as strings from 'ApprovalsQueueWebPartStrings';
import ApprovalsQueue, { IApprovalsQueueProps } from './components/ApprovalsQueue';
import { DataService } from '../../common/data/DataService';
import { applyTheme } from '../../common/theme';
import { PickerContext, pickerContext } from '../../common/components/UserPicker';

export interface IApprovalsQueueWebPartProps {
  title: string;

}

export default class ApprovalsQueueWebPart extends BaseClientSideWebPart<IApprovalsQueueWebPartProps> {
  private _root: Root | undefined;

  public render(): void {
    const element: React.ReactElement<IApprovalsQueueProps> = React.createElement(ApprovalsQueue, {
      data: DataService.get(this.context),

      title: this.properties.title || strings.DefaultTitle
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

                PropertyPaneTextField('title', { label: strings.TitleFieldLabel })
              ]
            }
          ]
        }
      ]
    };
  }
}
