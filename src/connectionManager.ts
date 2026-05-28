import * as vscode from "vscode";
import { PythonClient } from "./pythonClient";
import {
  ConnectionTag,
  formatTagsBracketPlain,
  normalizeTags,
  promptTagColor,
  tagBracketIconUri,
  tagColorLabel,
} from "./connectionTags";
import {
  ConnectionProfile,
  ConnectionWithSecret,
  secretKeyForConnection,
} from "./types";
import { ConnectionDialog } from "./webview/connectionDialog";

const STORAGE_KEY = "sqlStudio.connections";
const ACTIVE_KEY = "sqlStudio.activeConnectionId";
const DOCUMENT_CONNECTIONS_KEY = "sqlStudio.documentConnections";

export class ConnectionManager {
  private profiles: ConnectionProfile[] = [];
  private dialog: ConnectionDialog | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly python?: PythonClient
  ) {}

  async initialize(): Promise<void> {
    this.profiles =
      this.context.globalState.get<ConnectionProfile[]>(STORAGE_KEY) ?? [];
  }

  listProfiles(): ConnectionProfile[] {
    return [...this.profiles];
  }

  getProfile(id: string): ConnectionProfile | undefined {
    return this.profiles.find((p) => p.id === id);
  }

  getActiveConnectionId(): string | undefined {
    return this.context.globalState.get<string>(ACTIVE_KEY);
  }

  async setActiveConnectionId(id: string): Promise<void> {
    await this.context.globalState.update(ACTIVE_KEY, id);
  }

  async getActiveConnectionWithSecret(): Promise<ConnectionWithSecret | undefined> {
    const id = this.getActiveConnectionId();
    if (!id) {
      return undefined;
    }
    return this.getConnectionWithSecret(id);
  }

  getDocumentConnectionId(uri: vscode.Uri): string | undefined {
    const map =
      this.context.workspaceState.get<Record<string, string>>(
        DOCUMENT_CONNECTIONS_KEY
      ) ?? {};
    return map[uri.toString()];
  }

  async setDocumentConnectionId(
    uri: vscode.Uri,
    connectionId: string | undefined
  ): Promise<void> {
    const map = {
      ...(this.context.workspaceState.get<Record<string, string>>(
        DOCUMENT_CONNECTIONS_KEY
      ) ?? {}),
    };
    const key = uri.toString();
    if (connectionId) {
      map[key] = connectionId;
    } else {
      delete map[key];
    }
    await this.context.workspaceState.update(DOCUMENT_CONNECTIONS_KEY, map);
  }

  async promptSelectConnection(options?: {
    title?: string;
    placeHolder?: string;
    forDocumentUri?: vscode.Uri;
  }): Promise<ConnectionProfile | undefined> {
    const profiles = this.listProfiles();
    if (profiles.length === 0) {
      const picked = await vscode.window.showWarningMessage(
        "No connections. Add a connection first.",
        "Add Connection"
      );
      if (picked === "Add Connection") {
        await vscode.commands.executeCommand("sqlStudio.addConnection");
      }
      return undefined;
    }

    const currentId = options?.forDocumentUri
      ? this.getDocumentConnectionId(options.forDocumentUri)
      : this.getActiveConnectionId();

    const items = profiles.map((p) => {
      const tagDesc = formatTagsBracketPlain(p.tags);
      return {
        label: p.name,
        description: tagDesc ?? `${p.host}:${p.port}`,
        detail: p.id === currentId ? "Current for this editor" : undefined,
        profile: p,
      };
    });

    const picked = await vscode.window.showQuickPick(items, {
      title: options?.title ?? "SQL Studio: Select Connection",
      placeHolder:
        options?.placeHolder ?? "Connection used to run queries in this file",
    });
    return picked?.profile;
  }

  /** Per-file binding, then workspace active connection, then quick pick. */
  async resolveConnectionForDocument(
    document?: vscode.TextDocument,
    options?: { promptIfMissing?: boolean }
  ): Promise<ConnectionWithSecret | undefined> {
    const promptIfMissing = options?.promptIfMissing ?? true;

    if (document) {
      const docConnId = this.getDocumentConnectionId(document.uri);
      if (docConnId) {
        const conn = await this.getConnectionWithSecret(docConnId);
        if (conn) {
          return conn;
        }
      }
    }

    const active = await this.getActiveConnectionWithSecret();
    if (active) {
      return active;
    }

    if (!promptIfMissing) {
      return undefined;
    }

    const profile = await this.promptSelectConnection({
      forDocumentUri: document?.uri,
    });
    if (!profile) {
      return undefined;
    }

    if (document) {
      await this.setDocumentConnectionId(document.uri, profile.id);
    }
    await this.setActiveConnectionId(profile.id);
    return this.getConnectionWithSecret(profile.id);
  }

  async assignConnectionToDocument(
    document: vscode.TextDocument,
    connectionId: string
  ): Promise<ConnectionWithSecret | undefined> {
    const conn = await this.getConnectionWithSecret(connectionId);
    if (!conn) {
      return undefined;
    }
    await this.setDocumentConnectionId(document.uri, connectionId);
    await this.setActiveConnectionId(connectionId);
    return conn;
  }

  async getConnectionWithSecret(id: string): Promise<ConnectionWithSecret | undefined> {
    const profile = this.getProfile(id);
    if (!profile) {
      return undefined;
    }
    const password =
      (await this.context.secrets.get(secretKeyForConnection(id))) ?? "";
    return { ...profile, password };
  }

  async saveConnection(
    profile: ConnectionProfile,
    password: string,
    previousId?: string
  ): Promise<void> {
    const idx = this.profiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) {
      this.profiles[idx] = profile;
    } else {
      this.profiles.push(profile);
    }
    if (previousId && previousId !== profile.id) {
      await this.deleteConnection(previousId, false);
    }
    await this.context.secrets.store(
      secretKeyForConnection(profile.id),
      password
    );
    await this.persist();
  }

  async deleteConnection(id: string, persist = true): Promise<void> {
    this.profiles = this.profiles.filter((p) => p.id !== id);
    await this.context.secrets.delete(secretKeyForConnection(id));
    if (this.getActiveConnectionId() === id) {
      await this.context.globalState.update(ACTIVE_KEY, undefined);
    }
    if (persist) {
      await this.persist();
    }
  }

  refreshAccentStyles(): void {
    this.dialog?.refreshAccentStyles();
  }

  private getDialog(): ConnectionDialog {
    if (!this.dialog) {
      this.dialog = new ConnectionDialog(this.context, this.python);
    }
    return this.dialog;
  }

  async promptNewOrEdit(existing?: ConnectionProfile): Promise<ConnectionWithSecret | undefined> {
    const result = await this.getDialog().open(existing);
    if (!result) {
      return undefined;
    }
    await this.saveConnection(result, result.password, existing?.id);
    if (!this.getActiveConnectionId()) {
      await this.setActiveConnectionId(result.id);
    }
    return result;
  }

  async manageConnectionTags(connectionId: string): Promise<void> {
    const profile = this.getProfile(connectionId);
    if (!profile) {
      return;
    }

    let tags = [...normalizeTags(profile.tags)];

    while (true) {
      const items: vscode.QuickPickItem[] = [
        { label: "$(add) Add tag…", alwaysShow: true },
        ...tags.map((tag) => ({
          label: tag.name,
          description: tagColorLabel(tag.color),
          iconPath: tagBracketIconUri(tag),
          tag,
        })),
      ];
      if (tags.length > 0) {
        items.push({ label: "$(clear-all) Clear all tags", alwaysShow: true });
      }

      const picked = await vscode.window.showQuickPick(items, {
        title: `Tags: ${profile.name}`,
        placeHolder: "Add, remove, or clear connection tags",
      });
      if (!picked) {
        return;
      }

      if (picked.label.startsWith("$(add)")) {
        const name = await vscode.window.showInputBox({
          title: "Tag name",
          placeHolder: "e.g. prod, analytics",
          validateInput: (v) => {
            const trimmed = v.trim();
            if (!trimmed) {
              return "Name is required";
            }
            if (tags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
              return "Tag already exists";
            }
            return null;
          },
        });
        if (!name) {
          continue;
        }

        const color = await promptTagColor("Tag color");
        if (!color) {
          continue;
        }

        tags = [...tags, { name: name.trim(), color }];
        await this.updateProfileTags(connectionId, tags);
        continue;
      }

      if (picked.label.startsWith("$(clear-all)")) {
        await this.updateProfileTags(connectionId, []);
        return;
      }

      const existing = tags.find((t) => t.name === picked.label);
      if (!existing) {
        continue;
      }

      const action = await vscode.window.showQuickPick(
        [
          { label: "$(edit) Change color", action: "color" as const },
          { label: "$(trash) Remove tag", action: "remove" as const },
        ],
        {
          title: `Tag: ${existing.name}`,
          placeHolder: `Current color: ${tagColorLabel(existing.color)}`,
        }
      );
      if (!action) {
        continue;
      }

      if (action.action === "remove") {
        tags = tags.filter((t) => t.name !== existing.name);
        await this.updateProfileTags(connectionId, tags);
        continue;
      }

      const nextColor = await promptTagColor(`Color for “${existing.name}”`, existing.color);
      if (!nextColor) {
        continue;
      }
      tags = tags.map((t) =>
        t.name === existing.name ? { ...t, color: nextColor } : t
      );
      await this.updateProfileTags(connectionId, tags);
    }
  }

  async updateProfileTags(connectionId: string, tags: ConnectionTag[]): Promise<void> {
    const profile = this.getProfile(connectionId);
    if (!profile) {
      return;
    }
    const updated: ConnectionProfile = {
      ...profile,
      tags: normalizeTags(tags),
    };
    const idx = this.profiles.findIndex((p) => p.id === connectionId);
    if (idx >= 0) {
      this.profiles[idx] = updated;
      await this.persist();
    }
  }

  private async persist(): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, this.profiles);
  }

  async disconnectFromDatabase(connectionId: string): Promise<void> {
    if (!this.python) {
      return;
    }
    await this.python.request("connection/disconnect", { connectionId });
  }
}
