import * as crypto from "crypto";
import * as vscode from "vscode";
import {
  ConnectionProfile,
  ConnectionWithSecret,
  Dialect,
  defaultPort,
  secretKeyForConnection,
} from "./types";

const STORAGE_KEY = "sqlStudio.connections";
const ACTIVE_KEY = "sqlStudio.activeConnectionId";

export class ConnectionManager {
  private profiles: ConnectionProfile[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {}

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

  async promptNewOrEdit(existing?: ConnectionProfile): Promise<ConnectionWithSecret | undefined> {
    const dialectPick = await vscode.window.showQuickPick(
      [
        { label: "PostgreSQL", value: "postgres" as Dialect },
        { label: "ClickHouse", value: "clickhouse" as Dialect },
      ],
      { title: "Select database dialect", placeHolder: "Dialect" }
    );
    if (!dialectPick) {
      return undefined;
    }
    const dialect = dialectPick.value;
    const name = await vscode.window.showInputBox({
      title: "Connection name",
      value: existing?.name ?? "",
      validateInput: (v) => (v.trim() ? null : "Name is required"),
    });
    if (!name) {
      return undefined;
    }
    const host = await vscode.window.showInputBox({
      title: "Host",
      value: existing?.host ?? "localhost",
      validateInput: (v) => (v.trim() ? null : "Host is required"),
    });
    if (!host) {
      return undefined;
    }
    const portStr = await vscode.window.showInputBox({
      title: "Port",
      value: String(existing?.port ?? defaultPort(dialect)),
      validateInput: (v) => (/^\d+$/.test(v) ? null : "Port must be a number"),
    });
    if (!portStr) {
      return undefined;
    }
    const database = await vscode.window.showInputBox({
      title: "Database",
      value: existing?.database ?? "default",
      validateInput: (v) => (v.trim() ? null : "Database is required"),
    });
    if (!database) {
      return undefined;
    }
    const username = await vscode.window.showInputBox({
      title: "Username",
      value: existing?.username ?? "default",
      validateInput: (v) => (v.trim() ? null : "Username is required"),
    });
    if (!username) {
      return undefined;
    }
    const password = await vscode.window.showInputBox({
      title: "Password",
      password: true,
      placeHolder: existing ? "Leave empty to keep current password" : "",
    });
    let resolvedPassword = password ?? "";
    if (existing && !resolvedPassword) {
      resolvedPassword =
        (await this.context.secrets.get(secretKeyForConnection(existing.id))) ??
        "";
    }
    const ssl = await vscode.window.showQuickPick(["No", "Yes"], {
      title: "Use SSL?",
      placeHolder: existing?.ssl ? "Yes" : "No",
    });
    const readOnly = await vscode.window.showQuickPick(["No", "Yes"], {
      title: "Read-only connection?",
      placeHolder: existing?.readOnly ? "Yes" : "No",
    });

    const profile: ConnectionProfile = {
      id: existing?.id ?? crypto.randomUUID(),
      name: name.trim(),
      dialect,
      host: host.trim(),
      port: Number(portStr),
      database: database.trim(),
      username: username.trim(),
      ssl: ssl === "Yes",
      readOnly: readOnly === "Yes",
    };
    await this.saveConnection(profile, resolvedPassword, existing?.id);
    if (!this.getActiveConnectionId()) {
      await this.setActiveConnectionId(profile.id);
    }
    return { ...profile, password: resolvedPassword };
  }

  private async persist(): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, this.profiles);
  }
}
