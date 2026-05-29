import * as vscode from "vscode";
import { ConnectionManager } from "../connectionManager";
import {
  connectionDialectIcon,
  formatConnectionExplorerDescription,
  formatTagsTooltip,
  normalizeTags,
} from "../connectionTags";
import { PythonClient } from "../pythonClient";
import { ConnectionProfile, SchemaNodePayload, toRpcConnection } from "../types";
import {
  filterSchemaNodes,
  objectFilterKey,
} from "./objectNameFilter";

export type ExplorerItemType =
  | "connections-root"
  | "connection"
  | "folder"
  | "schema"
  | "database"
  | "table"
  | "view"
  | "function"
  | "procedure"
  | "column";

export class ExplorerTreeItem extends vscode.TreeItem {
  constructor(
    public readonly node: SchemaNodePayload | null,
    public readonly connectionId: string | null,
    public readonly itemType: ExplorerItemType,
    collapsible: vscode.TreeItemCollapsibleState,
    connectionProfile?: ConnectionProfile,
    extensionUri?: vscode.Uri
  ) {
    super(
      node?.label ?? (connectionId ? connectionId : "Connections"),
      collapsible
    );
    this.contextValue = itemType;
    if (itemType === "connections-root") {
      this.iconPath = new vscode.ThemeIcon("server-environment");
    } else if (itemType === "connection") {
      const tags = normalizeTags(connectionProfile?.tags);
      const endpoint = connectionProfile
        ? `${connectionProfile.host}:${connectionProfile.port}`
        : undefined;

      if (connectionProfile && endpoint && extensionUri) {
        this.id = `connection:${connectionProfile.id}`;
        this.label = connectionProfile.name;
        this.iconPath = connectionDialectIcon(connectionProfile.dialect, extensionUri);
        this.description = formatConnectionExplorerDescription(tags, endpoint);
      }

      if (connectionProfile) {
        if (tags.length > 0) {
          const tagMd = formatTagsTooltip(tags);
          if (tagMd) {
            tagMd.appendMarkdown(
              `\n\n${connectionProfile.host}:${connectionProfile.port}`
            );
            this.tooltip = tagMd;
          }
        } else {
          this.tooltip = `${connectionProfile.name}\n${connectionProfile.host}:${connectionProfile.port}`;
        }
      }
    } else if (itemType === "table" || itemType === "view") {
      this.iconPath = new vscode.ThemeIcon(itemType === "view" ? "eye" : "table");
      this.tooltip = "Click to preview data";
    } else if (itemType === "function") {
      this.iconPath = new vscode.ThemeIcon("symbol-method");
    } else if (itemType === "procedure") {
      this.iconPath = new vscode.ThemeIcon("symbol-event");
    } else if (itemType === "column") {
      this.iconPath = new vscode.ThemeIcon("symbol-field");
    } else {
      this.iconPath = new vscode.ThemeIcon("folder");
    }
  }

  get qualifiedName(): string | undefined {
    if (!this.node || !this.connectionId) {
      return undefined;
    }
    const path = this.node.path;
    if (path[0] === "schemas" && path.length >= 3) {
      return `${path[1]}.${path[2]}`;
    }
    if (path[0] === "schemas" && path.length >= 4) {
      return `${path[1]}.${path[2]}.${path[3]}`;
    }
    if (path[0] === "databases" && path.length >= 3) {
      return `${path[1]}.${path[2]}`;
    }
    if (path[0] === "databases" && path.length >= 4) {
      return `${path[1]}.${path[2]}.${path[3]}`;
    }
    return this.node.label.split(":")[0];
  }
}

export class SchemaExplorerProvider implements vscode.TreeDataProvider<ExplorerTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ExplorerTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly objectNameFilters = new Map<string, string>();

  constructor(
    private readonly connections: ConnectionManager,
    private readonly python: PythonClient,
    private readonly extensionUri: vscode.Uri
  ) {}

  getObjectNameFilter(connectionId: string, path: string[]): string | undefined {
    return this.objectNameFilters.get(objectFilterKey(connectionId, path));
  }

  clearObjectNameFilter(item: ExplorerTreeItem): void {
    if (
      !item.connectionId ||
      !item.node ||
      (item.itemType !== "schema" && item.itemType !== "database")
    ) {
      return;
    }

    const key = objectFilterKey(item.connectionId, item.node.path);
    if (!this.objectNameFilters.has(key)) {
      return;
    }
    this.objectNameFilters.delete(key);
    this.refreshNode(item);
  }

  async promptObjectNameFilter(item: ExplorerTreeItem): Promise<void> {
    if (
      !item.connectionId ||
      !item.node ||
      (item.itemType !== "schema" && item.itemType !== "database")
    ) {
      return;
    }

    const key = objectFilterKey(item.connectionId, item.node.path);
    const current = this.objectNameFilters.get(key) ?? "";
    const value = await vscode.window.showInputBox({
      title: `Filter objects in ${item.label}`,
      placeHolder: "Show objects whose name contains…",
      prompt: current
        ? `Active filter: "${current}". Clear the field or use Reset filter.`
        : "Leave empty to show all objects.",
      value: current,
    });
    if (value === undefined) {
      return;
    }

    const trimmed = value.trim();
    if (trimmed) {
      this.objectNameFilters.set(key, trimmed);
    } else {
      this.objectNameFilters.delete(key);
    }
    this.refreshNode(item);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  refreshNode(item: ExplorerTreeItem): void {
    this._onDidChangeTreeData.fire(item);
  }

  getTreeItem(element: ExplorerTreeItem): vscode.TreeItem {
    if (
      (element.itemType === "schema" || element.itemType === "database") &&
      element.connectionId &&
      element.node
    ) {
      const filter = this.getObjectNameFilter(
        element.connectionId,
        element.node.path
      );
      if (filter) {
        element.contextValue = `${element.itemType}.filtered`;
        element.description = `$(filter-filled) ${filter}`;
        const baseTooltip =
          typeof element.tooltip === "string"
            ? element.tooltip
            : String(element.label);
        element.tooltip = `${baseTooltip}\n\nFiltered by: "${filter}"\nUse $(close) to reset.`;
      } else {
        element.contextValue = element.itemType;
        element.description = undefined;
      }
    }
    return element;
  }

  async getChildren(element?: ExplorerTreeItem): Promise<ExplorerTreeItem[]> {
    if (!element) {
      return [
        new ExplorerTreeItem(
          null,
          null,
          "connections-root",
          vscode.TreeItemCollapsibleState.Expanded
        ),
      ];
    }

    if (element.itemType === "connections-root") {
      const profiles = this.connections.listProfiles();
      return profiles.map(
        (p) =>
          new ExplorerTreeItem(
            {
              id: p.id,
              label: p.name,
              node_type: "connection",
              path: [],
              has_children: true,
            },
            p.id,
            "connection",
            vscode.TreeItemCollapsibleState.Collapsed,
            p,
            this.extensionUri
          )
      );
    }

    if (element.itemType === "connection" && element.connectionId) {
      const conn = await this.connections.getConnectionWithSecret(element.connectionId);
      if (!conn) {
        return [];
      }
      try {
        const nodes = await this.python.request<SchemaNodePayload[]>(
          "schema/listChildren",
          { connection: toRpcConnection(conn), path: [] }
        );
        return nodes.map(
          (n) =>
            new ExplorerTreeItem(
              n,
              element.connectionId,
              n.node_type as ExplorerItemType,
              n.has_children
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
            )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Schema load failed: ${msg}`);
        return [];
      }
    }

    if (element.connectionId && element.node?.has_children) {
      const conn = await this.connections.getConnectionWithSecret(element.connectionId);
      if (!conn || !element.node) {
        return [];
      }
      try {
        const nodes = await this.python.request<SchemaNodePayload[]>(
          "schema/listChildren",
          { connection: toRpcConnection(conn), path: element.node.path }
        );
        const filtered = filterSchemaNodes(
          nodes,
          this.getObjectNameFilter(element.connectionId, element.node.path)
        );
        return filtered.map(
          (n) =>
            new ExplorerTreeItem(
              n,
              element.connectionId,
              n.node_type as ExplorerItemType,
              n.has_children
                  ? vscode.TreeItemCollapsibleState.Collapsed
                  : vscode.TreeItemCollapsibleState.None
            )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Schema load failed: ${msg}`);
        return [];
      }
    }

    return [];
  }
}
