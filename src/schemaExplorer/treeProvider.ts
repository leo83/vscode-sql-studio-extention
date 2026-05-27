import * as vscode from "vscode";
import { ConnectionManager } from "../connectionManager";
import {
  connectionIcon,
  formatTagsDescription,
  formatTagsTooltip,
  normalizeTags,
} from "../connectionTags";
import { PythonClient } from "../pythonClient";
import { ConnectionProfile, SchemaNodePayload, toRpcConnection } from "../types";

export type ExplorerItemType =
  | "connections-root"
  | "connection"
  | "folder"
  | "schema"
  | "database"
  | "table"
  | "view"
  | "column";

export class ExplorerTreeItem extends vscode.TreeItem {
  constructor(
    public readonly node: SchemaNodePayload | null,
    public readonly connectionId: string | null,
    public readonly itemType: ExplorerItemType,
    collapsible: vscode.TreeItemCollapsibleState,
    connectionProfile?: ConnectionProfile
  ) {
    super(
      node?.label ?? (connectionId ? connectionId : "Connections"),
      collapsible
    );
    this.contextValue = itemType === "view" ? "table" : itemType;
    if (itemType === "connections-root") {
      this.iconPath = new vscode.ThemeIcon("server-environment");
    } else if (itemType === "connection") {
      this.iconPath = connectionIcon();
      const tags = normalizeTags(connectionProfile?.tags);
      const tagDesc = formatTagsDescription(tags);
      const dialectDesc = connectionProfile
        ? `${connectionProfile.dialect} — ${connectionProfile.host}:${connectionProfile.port}`
        : undefined;
      this.description = tagDesc ?? dialectDesc;

      if (connectionProfile) {
        if (tags.length > 0) {
          const tagMd = formatTagsTooltip(tags);
          if (tagMd) {
            tagMd.appendMarkdown(
              `\n\n${connectionProfile.dialect} @ ${connectionProfile.host}:${connectionProfile.port}`
            );
            this.tooltip = tagMd;
          }
        } else {
          this.tooltip = `${connectionProfile.name} (${connectionProfile.dialect})`;
        }
      }
    } else if (itemType === "table" || itemType === "view") {
      this.iconPath = new vscode.ThemeIcon("table");
      this.tooltip = "Click to preview data";
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
    if (path[0] === "databases" && path.length >= 3) {
      return `${path[1]}.${path[2]}`;
    }
    return this.node.label.split(":")[0];
  }
}

export class SchemaExplorerProvider implements vscode.TreeDataProvider<ExplorerTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ExplorerTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly connections: ConnectionManager,
    private readonly python: PythonClient
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ExplorerTreeItem): vscode.TreeItem {
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
            p
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
      const nodes = await this.python.request<SchemaNodePayload[]>(
        "schema/listChildren",
        { connection: toRpcConnection(conn), path: element.node.path }
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
    }

    return [];
  }
}
