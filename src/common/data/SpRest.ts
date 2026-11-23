import { SPHttpClient, SPHttpClientResponse, ISPHttpClientOptions } from '@microsoft/sp-http';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type RawItem = Record<string, any>;

export interface IFieldInfo {
  internalName: string;
  type: string; // TypeAsString: Text, Note, Number, Boolean, User, UserMulti, Lookup, LookupMulti, Choice, MultiChoice, DateTime...
  readOnly: boolean;
}

export interface IQuery {
  filter?: string;
  orderBy?: string;
  ascending?: boolean;
  top?: number;
  /** Set to false to always read fresh data (default: cached for this page view). */
  cache?: boolean;
}

const JSON_HEADERS = {
  Accept: 'application/json;odata=nometadata',
  'Content-Type': 'application/json;odata=nometadata',
  'odata-version': ''
};

/** Cache shared by every web part on the page (all web parts live in one bundle). */
const pageCache: Map<string, Promise<any>> = new Map();

export class SpRestError extends Error {
  public readonly status: number;
  public readonly list?: string;
  public constructor(message: string, status: number, list?: string) {
    super(message);
    this.status = status;
    this.list = list;
  }
}

/** Escapes a value for use inside an OData string literal. */
export function odataString(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Small wrapper over the SharePoint REST API.
 * - Reads each list's column metadata once, so person and lookup columns are expanded automatically.
 * - Caches GET requests for the page view; writes clear the cache of the list they touch.
 */
export class SpRest {
  private readonly _client: SPHttpClient;
  private readonly _webUrl: string;

  public constructor(client: SPHttpClient, webUrl: string) {
    this._client = client;
    this._webUrl = webUrl.replace(/\/$/, '');
  }

  public get webUrl(): string {
    return this._webUrl;
  }

  private _listUrl(listTitle: string): string {
    return `${this._webUrl}/_api/web/lists/getbytitle(${odataString(listTitle)})`;
  }

  private async _readError(res: SPHttpClientResponse, list?: string): Promise<SpRestError> {
    let detail = '';
    try {
      const body = await res.json();
      detail = (body && (body['odata.error'] || body.error) && ((body['odata.error'] || body.error).message.value || (body['odata.error'] || body.error).message)) || '';
    } catch {
      detail = res.statusText;
    }
    return new SpRestError(`${list ? `[${list}] ` : ''}${detail || `HTTP ${res.status}`}`, res.status, list);
  }

  private async _get(url: string, list?: string): Promise<any> {
    const res = await this._client.get(url, SPHttpClient.configurations.v1, { headers: JSON_HEADERS });
    if (!res.ok) throw await this._readError(res, list);
    return res.json();
  }

  private _cached<T>(key: string, load: () => Promise<T>, useCache: boolean = true): Promise<T> {
    if (useCache && pageCache.has(key)) return pageCache.get(key) as Promise<T>;
    const p = load();
    pageCache.set(key, p);
    // Do not keep failed requests in the cache, so "Try again" really tries again.
    p.catch(() => pageCache.delete(key));
    return p;
  }

  /** Clears cached reads for one list (or everything). */
  public invalidate(listTitle?: string): void {
    if (!listTitle) {
      pageCache.clear();
      return;
    }
    const prefix = `${this._webUrl}|${listTitle}|items`;
    Array.from(pageCache.keys()).forEach(k => {
      if (k.indexOf(prefix) === 0) pageCache.delete(k);
    });
  }

  /** Column metadata for a list, keyed by internal name. */
  public getFields(listTitle: string): Promise<Record<string, IFieldInfo>> {
    return this._cached(`${this._webUrl}|${listTitle}|fields`, async () => {
      const url = `${this._listUrl(listTitle)}/fields?$select=InternalName,TypeAsString,ReadOnlyField&$filter=Hidden eq false`;
      const data = await this._get(url, listTitle);
      const map: Record<string, IFieldInfo> = {};
      (data.value || []).forEach((f: any) => {
        map[f.InternalName] = { internalName: f.InternalName, type: f.TypeAsString, readOnly: !!f.ReadOnlyField };
      });
      return map;
    });
  }

  /** Reads items. Person and lookup columns come back as objects ({ Id, Title, EMail }). */
  public getItems(listTitle: string, query: IQuery = {}): Promise<RawItem[]> {
    const key = `${this._webUrl}|${listTitle}|items|${JSON.stringify({ ...query, cache: undefined })}`;
    return this._cached(key, async () => {
      const fields = await this.getFields(listTitle);
      const select: string[] = ['*', 'Author/Id', 'Author/Title', 'Author/EMail'];
      const expand: string[] = ['Author'];
      Object.keys(fields).forEach(name => {
        const t = fields[name].type;
        if (name === 'Author' || name === 'Editor') return;
        // Built-in read-only "lookups" (ItemChildCount, FolderChildCount, AppAuthor, AppEditor) cannot be expanded.
        if (fields[name].readOnly) return;
        if (t === 'User' || t === 'UserMulti') {
          select.push(`${name}/Id`, `${name}/Title`, `${name}/EMail`);
          expand.push(name);
        } else if (t === 'Lookup' || t === 'LookupMulti') {
          select.push(`${name}/Id`, `${name}/Title`);
          expand.push(name);
        }
      });
      const parts = [`$select=${select.join(',')}`, `$expand=${expand.join(',')}`, `$top=${query.top || 5000}`];
      if (query.filter) parts.push(`$filter=${encodeURIComponent(query.filter)}`);
      if (query.orderBy) parts.push(`$orderby=${query.orderBy} ${query.ascending === false ? 'desc' : 'asc'}`);
      let url: string | undefined = `${this._listUrl(listTitle)}/items?${parts.join('&')}`;
      const items: RawItem[] = [];
      // Follow paging only when no explicit limit was asked for.
      while (url) {
        const data: any = await this._get(url, listTitle);
        items.push(...(data.value || []));
        url = !query.top && data['odata.nextLink'] ? data['odata.nextLink'] : undefined;
      }
      return items;
    }, query.cache !== false);
  }

  public async getItem(listTitle: string, id: number): Promise<RawItem | undefined> {
    const items = await this.getItems(listTitle, { filter: `Id eq ${id}`, top: 1, cache: false });
    return items[0];
  }

  /**
   * Converts { Column: value } into a REST payload:
   * person/lookup columns are written as ColumnId, columns that do not exist are skipped.
   */
  private async _payload(listTitle: string, data: RawItem): Promise<RawItem> {
    const fields = await this.getFields(listTitle);
    const body: RawItem = {};
    Object.keys(data).forEach(name => {
      const value = data[name];
      if (value === undefined) return;
      const info = fields[name];
      if (!info) {
        console.warn(`[TForce] Column "${name}" does not exist in ${listTitle}. Value not saved.`);
        return;
      }
      if (info.type === 'User' || info.type === 'Lookup') body[`${name}Id`] = value === null ? null : Number(value);
      else if (info.type === 'UserMulti' || info.type === 'LookupMulti') body[`${name}Id`] = Array.isArray(value) ? value.map(Number) : value === null ? [] : [Number(value)];
      else if (info.type === 'MultiChoice') body[name] = Array.isArray(value) ? value : [value];
      else body[name] = value;
    });
    return body;
  }

  private async _post(url: string, body: any, extraHeaders: Record<string, string> = {}, list?: string): Promise<SPHttpClientResponse> {
    const options: ISPHttpClientOptions = {
      headers: { ...JSON_HEADERS, ...extraHeaders },
      body: typeof body === 'string' || body instanceof ArrayBuffer ? body : JSON.stringify(body)
    };
    const res = await this._client.post(url, SPHttpClient.configurations.v1, options);
    if (!res.ok) throw await this._readError(res, list);
    return res;
  }

  public async addItem(listTitle: string, data: RawItem): Promise<RawItem> {
    const body = await this._payload(listTitle, data);
    const res = await this._post(`${this._listUrl(listTitle)}/items`, body, {}, listTitle);
    this.invalidate(listTitle);
    return res.json();
  }

  public async updateItem(listTitle: string, id: number, data: RawItem): Promise<void> {
    const body = await this._payload(listTitle, data);
    await this._post(`${this._listUrl(listTitle)}/items(${id})`, body, { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }, listTitle);
    this.invalidate(listTitle);
  }

  public async deleteItem(listTitle: string, id: number): Promise<void> {
    await this._post(`${this._listUrl(listTitle)}/items(${id})`, undefined, { 'IF-MATCH': '*', 'X-HTTP-Method': 'DELETE' }, listTitle);
    this.invalidate(listTitle);
  }

  /** Allowed values of a Choice column ([] for other column types or when the column does not exist). */
  public getChoices(listTitle: string, column: string): Promise<string[]> {
    return this._cached(`${this._webUrl}|${listTitle}|choices|${column}`, async () => {
      const fields = await this.getFields(listTitle);
      const info = fields[column];
      if (!info || (info.type !== 'Choice' && info.type !== 'MultiChoice')) return [];
      const f = await this._get(`${this._listUrl(listTitle)}/fields/getbyinternalnameortitle(${odataString(column)})`, listTitle);
      return (f.Choices && (f.Choices.results || f.Choices)) || [];
    });
  }

  /** Makes sure a person (by email or login name) exists on the site and returns their site user ID. */
  public ensureUser(logonName: string): Promise<number> {
    return this._cached(`${this._webUrl}|ensureuser|${logonName.toLowerCase()}`, async () => {
      const res = await this._post(`${this._webUrl}/_api/web/ensureuser`, { logonName });
      const u = await res.json();
      return u.Id as number;
    });
  }

  /** Site user IDs of the people in a SharePoint group (by group name). Throws when the group does not exist. */
  public getGroupMemberIds(groupName: string): Promise<number[]> {
    return this._cached(`${this._webUrl}|groupusers|${groupName.toLowerCase()}`, async () => {
      const data = await this._get(`${this._webUrl}/_api/web/sitegroups/getbyname(${odataString(groupName)})/users?$select=Id,PrincipalType`);
      return ((data.value || []) as { Id: number; PrincipalType: number }[]).filter(u => u.PrincipalType === 1).map(u => u.Id);
    });
  }

  public async addAttachment(listTitle: string, id: number, file: File): Promise<void> {
    const buffer = await file.arrayBuffer();
    const name = file.name.replace(/'/g, "''");
    await this._post(`${this._listUrl(listTitle)}/items(${id})/AttachmentFiles/add(FileName='${encodeURIComponent(name)}')`, buffer, { 'Content-Type': 'application/octet-stream' }, listTitle);
  }

  /** The signed-in user with SharePoint group membership. */
  public getCurrentUser(): Promise<RawItem> {
    return this._cached(`${this._webUrl}|currentuser`, () =>
      this._get(`${this._webUrl}/_api/web/currentuser?$select=Id,Title,Email,LoginName,IsSiteAdmin,Groups/Id,Groups/Title&$expand=Groups`)
    );
  }
}
