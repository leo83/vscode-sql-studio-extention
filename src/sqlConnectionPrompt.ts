import * as vscode from "vscode";
import { ConnectionManager } from "./connectionManager";
import { isSqlFileDocument } from "./sqlDocument";

/** URIs we already prompted this session (including dismissed). */
const promptedUris = new Set<string>();

export function shouldPromptForConnectionOnOpen(): boolean {
  return vscode.workspace
    .getConfiguration("sqlStudio")
    .get<boolean>("promptForConnectionOnOpen", true);
}

export function resetConnectionPromptSession(): void {
  promptedUris.clear();
}

/**
 * Ask for a connection when a SQL file has no per-file binding.
 * Runs on editor focus, not on every background open, to avoid stacked dialogs.
 */
export async function maybePromptConnectionForDocument(
  connections: ConnectionManager,
  document: vscode.TextDocument,
  options?: { force?: boolean }
): Promise<void> {
  if (!shouldPromptForConnectionOnOpen() && !options?.force) {
    return;
  }
  if (!isSqlFileDocument(document)) {
    return;
  }
  if (connections.getDocumentConnectionId(document.uri)) {
    return;
  }

  const uriKey = document.uri.toString();
  if (!options?.force && promptedUris.has(uriKey)) {
    return;
  }
  promptedUris.add(uriKey);

  const profile = await connections.promptSelectConnection({
    forDocumentUri: document.uri,
    title: "SQL Studio: Connection for this file",
    placeHolder: "Choose which database to use for this SQL script",
  });
  if (!profile) {
    return;
  }

  await connections.assignConnectionToDocument(document, profile.id);
}
