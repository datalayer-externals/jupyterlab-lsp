import { CompletionHandler } from '@jupyterlab/completer';
import { LabIcon } from '@jupyterlab/ui-components';
import * as lsProtocol from 'vscode-languageserver-types';
import { until_ready } from '../../utils';

import { ILSPConnection } from '@jupyterlab/lsp';

/**
 * To be upstreamed
 */
export interface ICompletionsSource {
  /**
   * The name displayed in the GUI
   */
  name: string;
  /**
   * The higher the number the higher the priority
   */
  priority: number;
  /**
   * The icon to be displayed if no type icon is present
   */
  fallbackIcon?: LabIcon;
}

/**
 * To be upstreamed
 */
export interface IExtendedCompletionItem
  extends CompletionHandler.ICompletionItem {
  insertText: string;
  sortText: string;
  source?: ICompletionsSource;
}

namespace CompletionItem {
  export interface IOptions {
    /**
     * Type of this completion item.
     */
    type: string;
    /**
     * LabIcon object for icon to be rendered with completion type.
     */
    icon: LabIcon;
    match: lsProtocol.CompletionItem;
    connection: ILSPConnection;
    showDocumentation: boolean;
  }
}

export class CompletionItem implements IExtendedCompletionItem {
  private _detail: string | undefined;
  private _documentation: string | undefined;
  private _is_documentation_markdown: boolean;
  private _requested_resolution: boolean;
  private _resolved: boolean;
  /**
   * Self-reference to make sure that the instance for will remain accessible
   * after any copy operation (whether via spread syntax or Object.assign)
   * performed by the JupyterLab completer internals.
   */
  public self: CompletionItem;
  public element: HTMLLIElement;
  private _currentInsertText: string;

  get isDocumentationMarkdown(): boolean {
    return this._is_documentation_markdown;
  }

  /**
   * User facing completion.
   * If insertText is not set, this will be inserted.
   */
  public label: string;

  public source: ICompletionsSource;

  private match: lsProtocol.CompletionItem;

  constructor(protected options: CompletionItem.IOptions) {
    const match = options.match;
    this.label = match.label;
    this._setDocumentation(match.documentation);
    this._requested_resolution = false;
    this._resolved = false;
    this._detail = match.detail;
    this.match = match;
    this.self = this;
  }

  get type() {
    return this.options.type;
  }

  private _setDocumentation(
    documentation: string | lsProtocol.MarkupContent | undefined
  ) {
    if (lsProtocol.MarkupContent.is(documentation)) {
      this._documentation = documentation.value;
      this._is_documentation_markdown = documentation.kind === 'markdown';
    } else {
      this._documentation = documentation;
      this._is_documentation_markdown = false;
    }
  }

  /**
   * Completion to be inserted.
   */
  get insertText(): string {
    return this._currentInsertText || this.match.insertText || this.match.label;
  }

  set insertText(text: string) {
    this._currentInsertText = text;
  }

  get sortText(): string {
    return this.match.sortText || this.match.label;
  }

  get filterText(): string | undefined {
    return this.match.filterText;
  }

  private _supportsResolution() {
    const connection = this.options.connection;

    if (!connection) {
      console.debug('No connection to determine resolution support');
    }

    // @ts-ignore TODO
    return connection.serverCapabilities?.completionProvider?.resolveProvider;
  }

  get detail(): string | undefined {
    return this._detail;
  }

  public needsResolution(): boolean {
    if (this.documentation) {
      return false;
    }

    if (this._resolved) {
      return false;
    }

    if (this._requested_resolution) {
      return false;
    }

    return this._supportsResolution();
  }

  public isResolved() {
    return this._resolved;
  }

  /**
   * Resolve (fetch) details such as documentation.
   */
  public async resolve(): Promise<CompletionItem> {
    if (this._resolved) {
      return Promise.resolve(this);
    }
    if (!this._supportsResolution()) {
      return Promise.resolve(this);
    }
    if (this._requested_resolution) {
      return until_ready(() => this._resolved, 100, 50).then(() => this);
    }

    const connection = this.options.connection;

    this._requested_resolution = true;

    const resolvedCompletionItem = await connection.clientRequests[
      'completionItem/resolve'
    ].request(this.match);

    if (resolvedCompletionItem === null) {
      return this;
    }
    this._setDocumentation(resolvedCompletionItem?.documentation);
    this._detail = resolvedCompletionItem?.detail;
    // TODO: implement in pylsp and enable with proper LSP communication
    // this.label = resolvedCompletionItem.label;
    this._resolved = true;
    return this;
  }

  /**
   * A human-readable string with additional information
   * about this item, like type or symbol information.
   */
  get documentation(): string | undefined {
    if (!this.options.showDocumentation) {
      return undefined;
    }
    if (this._documentation) {
      return this._documentation;
    }
    return undefined;
  }

  /**
   * Indicates if the item is deprecated.
   */
  get deprecated(): boolean {
    if (this.match.deprecated) {
      return this.match.deprecated;
    }
    return (
      this.match.tags != null &&
      this.match.tags.some(
        tag => tag == lsProtocol.CompletionItemTag.Deprecated
      )
    );
  }
}
