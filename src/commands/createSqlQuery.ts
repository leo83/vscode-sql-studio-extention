import * as vscode from "vscode";
import { ConnectionManager } from "../connectionManager";
import { ConnectionProfile, languageForDialect } from "../types";

function defaultQueryContent(profile: ConnectionProfile): string {
  return [
    `-- Connection: ${profile.name} (${profile.dialect})`,
    "",
    "SELECT 1",
    "",
  ].join("\n");
}

async function resolveConnection(
  connections: ConnectionManager,
  connectionId?: string
): Promise<ConnectionProfile | undefined> {
  if (connectionId) {
    return connections.getProfile(connectionId);
  }

  const activeId = connections.getActiveConnectionId();
  if (activeId) {
    const active = connections.getProfile(activeId);
    if (active) {
      return active;
    }
  }

  const profiles = connections.listProfiles();
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

  if (profiles.length === 1) {
    return profiles[0];
  }

  const picked = await vscode.window.showQuickPick(
    profiles.map((p) => ({
      label: p.name,
      description: `${p.dialect} — ${p.host}:${p.port}`,
      profile: p,
    })),
    { title: "Select connection for SQL query", placeHolder: "Connection" }
  );
  return picked?.profile;
}

export async function createSqlQuery(
  connections: ConnectionManager,
  connectionId?: string
): Promise<void> {
  const profile = await resolveConnection(connections, connectionId);
  if (!profile) {
    return;
  }

  const doc = await vscode.workspace.openTextDocument({
    content: defaultQueryContent(profile),
    language: languageForDialect(profile.dialect),
  });
  await connections.assignConnectionToDocument(doc, profile.id);
  await vscode.window.showTextDocument(doc, { preview: false });
}
