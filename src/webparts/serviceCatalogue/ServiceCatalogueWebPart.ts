import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Version } from '@microsoft/sp-core-library';
import { type IPropertyPaneConfiguration, PropertyPaneTextField } from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { IReadonlyTheme } from '@microsoft/sp-component-base';

import * as strings from 'ServiceCatalogueWebPartStrings';
import ServiceCatalogue, { IServiceCatalogueProps } from './components/ServiceCatalogue';
import { DataService } from '../../common/data/DataService';
import { applyTheme } from '../../common/theme';
import { PickerContext, pickerContext } from '../../common/components/UserPicker';

export interface IServiceCatalogueWebPartProps {
  title: string;
  myRequestsPageUrl: string;
}

export default class ServiceCatalogueWebPart extends BaseClientSideWebPart<IServiceCatalogueWebPartProps> {
  private _root: Root | undefined;

  public render(): void {
    const element: React.ReactElement<IServiceCatalogueProps> = React.createElement(ServiceCatalogue, {
      data: DataService.get(this.context),
      title: this.properties.title || strings.DefaultTitle,
      myRequestsPageUrl: this.properties.myRequestsPageUrl
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
                PropertyPaneTextField('myRequestsPageUrl', {
                  label: strings.MyRequestsPageUrlFieldLabel,
                  description: strings.MyRequestsPageUrlFieldDescription
                })
              ]
            }
          ]
        }
      ]
    };
  }
}
