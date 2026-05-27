import * as vscode from "vscode";
import { ConnectionManager } from "./connectionManager";
import { PythonClient } from "./pythonClient";
import { QueryRunner } from "./queryRunner";
import {
  ExplorerTreeItem,
  SchemaExplorerProvider,
} from "./schemaExplorer/treeProvider";
import { ResultsPanel } from "./webview/resultsPanel";
import {
  askAgentExplain,
  askAgentFix,
  formatActiveDocument,
} from "./commands/agentCommands";
import { createSqlQuery } from "./commands/createSqlQuery";
import { ConnectionStatusBar } from "./connectionStatusBar";
import { maybePromptConnectionForDocument } from "./sqlConnectionPrompt";
import {
  ensureSqlStudioLanguage,
  findSqlStudioEditorReady,
  isSqlFileDocument,
} from "./sqlDocument";

let pythonClient: PythonClient;
let connectionManager: ConnectionManager;
let queryRunner: QueryRunner;
let resultsPanel: ResultsPanel;
let explorerProvider: SchemaExplorerProvider;
let connectionStatusBar: ConnectionStatusBar;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  pythonClient = new PythonClient(context);
  connectionManager = new ConnectionManager(context, pythonClient);
  await connectionManager.initialize();
  for (const doc of vscode.workspace.textDocuments) {
    if (isSqlFileDocument(doc)) {
      await ensureSqlStudioLanguage(doc);
    }
  }
  resultsPanel = new ResultsPanel(context, pythonClient);
  queryRunner = new QueryRunner(pythonClient, connectionManager, resultsPanel);
  explorerProvider = new SchemaExplorerProvider(connectionManager, pythonClient);
  connectionStatusBar = new ConnectionStatusBar(connectionManager);

  const onSqlEditorActive = async (document: vscode.TextDocument): Promise<void> => {
    await ensureSqlStudioLanguage(document);
    await maybePromptConnectionForDocument(connectionManager, document);
    connectionStatusBar.refresh();
  };

  const activeOnStartup = vscode.window.activeTextEditor;
  if (activeOnStartup && isSqlFileDocument(activeOnStartup.document)) {
    void onSqlEditorActive(activeOnStartup.document);
  }

  const explorerView = vscode.window.createTreeView("sqlStudio.explorer", {
    treeDataProvider: explorerProvider,
    showCollapseAll: true,
  });

  explorerView.onDidChangeSelection((event) => {
    const item = event.selection[0];
    if (
      item instanceof ExplorerTreeItem &&
      (item.itemType === "table" || item.itemType === "view") &&
      item.connectionId &&
      item.qualifiedName
    ) {
      void queryRunner.previewTable(item.connectionId, item.qualifiedName);
    }
  });

  context.subscriptions.push(
    pythonClient,
    explorerView,
    connectionStatusBar,
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (isSqlFileDocument(doc)) {
        void ensureSqlStudioLanguage(doc);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && isSqlFileDocument(editor.document)) {
        void onSqlEditorActive(editor.document);
      } else {
        connectionStatusBar.refresh();
      }
    }),
    vscode.commands.registerCommand("sqlStudio.runQuery", async () => {
      const editor = await findSqlStudioEditorReady();
      if (!editor) {
        const picked = await vscode.window.showWarningMessage(
          "Open a .sql file or create a SQL query.",
          "Create SQL Query"
        );
        if (picked === "Create SQL Query") {
          await vscode.commands.executeCommand("sqlStudio.createSqlQuery");
        }
        return;
      }
      await queryRunner.runAtCursor(editor);
    }),
    vscode.commands.registerCommand("sqlStudio.runAllInFile", async () => {
      const editor = await findSqlStudioEditorReady();
      if (!editor) {
        const picked = await vscode.window.showWarningMessage(
          "Open a .sql file or create a SQL query.",
          "Create SQL Query"
        );
        if (picked === "Create SQL Query") {
          await vscode.commands.executeCommand("sqlStudio.createSqlQuery");
        }
        return;
      }
      await queryRunner.runDocument(editor);
    }),
    vscode.commands.registerCommand("sqlStudio.runSelection", async () => {
      const editor = await findSqlStudioEditorReady();
      if (!editor) {
        vscode.window.showWarningMessage("Open a .sql file first.");
        return;
      }
      await queryRunner.runSelection(editor);
    }),
    vscode.commands.registerCommand("sqlStudio.selectConnection", async () => {
      const editor = await findSqlStudioEditorReady();
      const profile = await connectionManager.promptSelectConnection({
        forDocumentUri: editor?.document.uri,
        title: "SQL Studio: Select Connection",
      });
      if (!profile) {
        return;
      }
      if (editor) {
        await connectionManager.assignConnectionToDocument(
          editor.document,
          profile.id
        );
      } else {
        await connectionManager.setActiveConnectionId(profile.id);
      }
      connectionStatusBar.refresh();
      vscode.window.showInformationMessage(
        `Connection: ${profile.name} (${profile.dialect})`
      );
    }),
    vscode.commands.registerCommand("sqlStudio.formatSql", () =>
      formatActiveDocument(pythonClient, connectionManager)
    ),
    vscode.commands.registerCommand("sqlStudio.createSqlQuery", async (item?: ExplorerTreeItem) => {
      await createSqlQuery(connectionManager, item?.connectionId ?? undefined);
    }),
    vscode.commands.registerCommand("sqlStudio.addConnection", async () => {
      await connectionManager.promptNewOrEdit();
      explorerProvider.refresh();
    }),
    vscode.commands.registerCommand(
      "sqlStudio.editConnection",
      async (item: ExplorerTreeItem) => {
        const id = item.connectionId;
        if (!id) {
          return;
        }
        const profile = connectionManager.getProfile(id);
        if (profile) {
          await connectionManager.promptNewOrEdit(profile);
          explorerProvider.refresh();
        }
      }
    ),
    vscode.commands.registerCommand(
      "sqlStudio.deleteConnection",
      async (item: ExplorerTreeItem) => {
        const id = item.connectionId;
        if (!id) {
          return;
        }
        const confirm = await vscode.window.showWarningMessage(
          `Delete connection "${item.label}"?`,
          { modal: true },
          "Delete"
        );
        if (confirm === "Delete") {
          await connectionManager.deleteConnection(id);
          explorerProvider.refresh();
        }
      }
    ),
    vscode.commands.registerCommand(
      "sqlStudio.testConnection",
      async (item: ExplorerTreeItem) => {
        const id = item.connectionId;
        if (!id) {
          return;
        }
        const conn = await connectionManager.getConnectionWithSecret(id);
        if (!conn) {
          return;
        }
        try {
          await pythonClient.request(
            "connection/test",
            {
              connection: {
                id: conn.id,
                dialect: conn.dialect,
                host: conn.host,
                port: conn.port,
                database: conn.database,
                username: conn.username,
                password: conn.password,
                ssl: conn.ssl ?? false,
                read_only: conn.readOnly ?? false,
                clickhouse_interface:
                  conn.dialect === "clickhouse"
                    ? conn.clickhouseInterface
                    : undefined,
              },
            },
            { timeoutMs: 20_000 }
          );
          vscode.window.showInformationMessage(`Connection "${conn.name}" OK`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Connection failed: ${msg}`);
        }
      }
    ),
    vscode.commands.registerCommand(
      "sqlStudio.setActiveConnection",
      async (item: ExplorerTreeItem) => {
        if (item.connectionId) {
          await connectionManager.setActiveConnectionId(item.connectionId);
          const editor = vscode.window.activeTextEditor;
          if (editor && isSqlFileDocument(editor.document)) {
            await connectionManager.assignConnectionToDocument(
              editor.document,
              item.connectionId
            );
          }
          connectionStatusBar.refresh();
          vscode.window.showInformationMessage(`Active connection: ${item.label}`);
        }
      }
    ),
    vscode.commands.registerCommand(
      "sqlStudio.previewData",
      async (item: ExplorerTreeItem) => {
        if (item.connectionId && item.qualifiedName) {
          await queryRunner.previewTable(item.connectionId, item.qualifiedName);
        }
      }
    ),
    vscode.commands.registerCommand(
      "sqlStudio.copyObjectName",
      async (item: ExplorerTreeItem) => {
        const name = item.qualifiedName ?? item.node?.label;
        if (name) {
          await vscode.env.clipboard.writeText(name);
        }
      }
    ),
    vscode.commands.registerCommand(
      "sqlStudio.generateSelect",
      async (item: ExplorerTreeItem) => {
        const qn = item.qualifiedName;
        if (!qn) {
          return;
        }
        const doc = await vscode.workspace.openTextDocument({
          content: `SELECT *\nFROM ${qn}\nLIMIT 100;\n`,
          language: item.node?.path[0] === "databases" ? "sql-studio-clickhouse" : "sql-studio-postgres",
        });
        await vscode.window.showTextDocument(doc);
      }
    ),
    vscode.commands.registerCommand("sqlStudio.refreshExplorer", () =>
      explorerProvider.refresh()
    ),
    vscode.commands.registerCommand("sqlStudio.exportCsv", () =>
      resultsPanel.getLastResult()
        ? vscode.commands.executeCommand("sqlStudio._exportCsv")
        : vscode.window.showWarningMessage("No results to export.")
    ),
    vscode.commands.registerCommand("sqlStudio.exportExcel", () =>
      resultsPanel.getLastResult()
        ? vscode.window.showWarningMessage("Use Export button in results panel.")
        : vscode.window.showWarningMessage("No results to export.")
    ),
    vscode.commands.registerCommand("sqlStudio.askAgentExplain", () =>
      askAgentExplain(connectionManager, pythonClient)
    ),
    vscode.commands.registerCommand("sqlStudio.askAgentFix", askAgentFix)
  );

  try {
    await pythonClient.start();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showWarningMessage(
      `SQL Studio backend not started: ${msg}. Install uv and run: cd python && uv sync`
    );
  }
}

export function deactivate(): void {
  connectionStatusBar?.dispose();
  pythonClient?.dispose();
}
