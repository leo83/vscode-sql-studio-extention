import * as vscode from "vscode";
import { PythonClient } from "./pythonClient";
import {
  ConnectionProfile,
  ConnectionWithSecret,
  secretKeyForConnection,
} from "./types";
import { ConnectionDialog } from "./webview/connectionDialog";

const STORAGE_KEY = "sqlStudio.connections";
const ACTIVE_KEY = "sqlStudio.activeConnectionId";

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

  private async persist(): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, this.profiles);
  }
}
