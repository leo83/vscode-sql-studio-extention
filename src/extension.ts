import * as vscode from "vscode";
import { accentColorsAffectConfiguration } from "./accentColors";
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
import {
  createSqlQueryForObject,
  exportObjectData,
  sampleObjectData,
  showObjectDescription,
} from "./commands/objectCommands";
import { getSchemaDbml, showSchemaDiagram } from "./commands/schemaCommands";
import { ConnectionStatusBar } from "./connectionStatusBar";
import { maybePromptConnectionForDocument } from "./sqlConnectionPrompt";
import { buildPreviewSql } from "./sqlUtils";
import {
  ensureSqlStudioLanguage,
  findSqlStudioEditorReady,
  isSqlFileDocument,
} from "./sqlDocument";
import { languageForDialect } from "./types";

let pythonClient: PythonClient;
let connectionManager: ConnectionManager;
let queryRunner: QueryRunner;
let resultsPanel: ResultsPanel;
let explorerProvider: SchemaExplorerProvider;
let connectionStatusBar: ConnectionStatusBar;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const log = vscode.window.createOutputChannel("SQL Studio");
  context.subscriptions.push(log);
  log.appendLine("Activating SQL Studio…");

  pythonClient = new PythonClient(context);
  connectionManager = new ConnectionManager(context, pythonClient);
  await connectionManager.initialize();

  explorerProvider = new SchemaExplorerProvider(
    connectionManager,
    pythonClient,
    context.extensionUri
  );

  connectionManager.setOnProfilesChanged(() => {
    explorerProvider.refresh();
  });

  let explorerView: vscode.TreeView<ExplorerTreeItem>;
  try {
    explorerView = vscode.window.createTreeView("sqlStudio.explorer", {
      treeDataProvider: explorerProvider,
      showCollapseAll: true,
    });
    context.subscriptions.push(explorerView);
    log.appendLine("Database Explorer tree view registered.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.appendLine(`Failed to register Database Explorer: ${msg}`);
    vscode.window.showErrorMessage(`SQL Studio: Database Explorer failed to start: ${msg}`);
    return;
  }

  void startPythonBackend(log);

  explorerView.onDidChangeVisibility((event) => {
    if (event.visible) {
      explorerProvider.refresh();
    }
  });
  explorerProvider.refresh();

  for (const doc of vscode.workspace.textDocuments) {
    if (isSqlFileDocument(doc)) {
      try {
        await ensureSqlStudioLanguage(doc);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.appendLine(`Language association skipped for ${doc.uri.fsPath}: ${msg}`);
      }
    }
  }
  resultsPanel = new ResultsPanel(context, pythonClient);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("sqlStudio.results", resultsPanel, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );
  queryRunner = new QueryRunner(pythonClient, connectionManager, resultsPanel);
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
    connectionStatusBar,
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (accentColorsAffectConfiguration(event)) {
        resultsPanel.refreshAccentStyles();
        connectionManager.refreshAccentStyles();
      }
    }),
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
    vscode.commands.registerCommand("sqlStudio.showExecutionPlan", async () => {
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
      await queryRunner.explainAtCursor(editor);
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
      "sqlStudio.manageConnectionTags",
      async (item: ExplorerTreeItem) => {
        const id = item.connectionId;
        if (!id) {
          return;
        }
        await connectionManager.manageConnectionTags(id);
        explorerProvider.refresh();
        connectionStatusBar.refresh();
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
          connectionManager.markDatabaseConnectionActive(id);
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
        const profile = item.connectionId
          ? connectionManager.getProfile(item.connectionId)
          : undefined;
        const previewSql = profile
          ? buildPreviewSql(profile.dialect, qn, 100)
          : `SELECT *\nFROM ${qn}\nLIMIT 100;`;
        const doc = await vscode.workspace.openTextDocument({
          content: `${previewSql}\n`,
          language: profile
            ? languageForDialect(profile.dialect)
            : "sql-studio-sql",
        });
        if (item.connectionId) {
          await connectionManager.assignConnectionToDocument(doc, item.connectionId);
        }
        await vscode.window.showTextDocument(doc);
      }
    ),
    vscode.commands.registerCommand(
      "sqlStudio.showObjectDescription",
      async (item: ExplorerTreeItem) => {
        await showObjectDescription(connectionManager, pythonClient, item);
      }
    ),
    vscode.commands.registerCommand(
      "sqlStudio.sampleData",
      async (item: ExplorerTreeItem) => {
        await sampleObjectData(queryRunner, item);
      }
    ),
    vscode.commands.registerCommand(
      "sqlStudio.exportObjectData",
      async (item: ExplorerTreeItem) => {
        await exportObjectData(connectionManager, pythonClient, item);
      }
    ),
    vscode.commands.registerCommand(
      "sqlStudio.createSqlQueryForObject",
      async (item: ExplorerTreeItem) => {
        await createSqlQueryForObject(connectionManager, item);
      }
    ),
    vscode.commands.registerCommand("sqlStudio.refreshExplorer", () =>
      explorerProvider.refresh()
    ),
    vscode.commands.registerCommand(
      "sqlStudio.filterSchemaObjects",
      async (item: ExplorerTreeItem) => {
        await explorerProvider.promptObjectNameFilter(item);
      }
    ),
    vscode.commands.registerCommand(
      "sqlStudio.editSchemaObjectFilter",
      async (item: ExplorerTreeItem) => {
        await explorerProvider.promptObjectNameFilter(item);
      }
    ),
    vscode.commands.registerCommand(
      "sqlStudio.clearSchemaObjectFilter",
      (item: ExplorerTreeItem) => {
        explorerProvider.clearObjectNameFilter(item);
      }
    ),
    vscode.commands.registerCommand("sqlStudio.cancelQuery", () =>
      queryRunner.cancelRunningQuery()
    ),
    vscode.commands.registerCommand(
      "sqlStudio.disconnectConnection",
      async (item: ExplorerTreeItem) => {
        const id = item.connectionId;
        if (!id) {
          return;
        }
        const profile = connectionManager.getProfile(id);
        const name = profile?.name ?? item.label;
        try {
          await connectionManager.disconnectFromDatabase(id);
          explorerProvider.refresh();
          vscode.window.showInformationMessage(`Disconnected from ${name}.`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Disconnect failed: ${msg}`);
        }
      }
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
    vscode.commands.registerCommand("sqlStudio.askAgentFix", askAgentFix),
    vscode.commands.registerCommand(
      "sqlStudio.showSchemaDiagram",
      (item: ExplorerTreeItem) =>
        showSchemaDiagram(context, connectionManager, pythonClient, item)
    ),
    vscode.commands.registerCommand(
      "sqlStudio.getSchemaDbml",
      (item: ExplorerTreeItem) =>
        getSchemaDbml(connectionManager, pythonClient, item)
    )
  );

  log.appendLine("SQL Studio activated.");
}

function startPythonBackend(log: vscode.OutputChannel): void {
  void pythonClient
    .start()
    .then(() => {
      explorerProvider.refresh();
      log.appendLine("Python backend started.");
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      log.appendLine(`Python backend failed: ${msg}`);
      vscode.window.showWarningMessage(
        `SQL Studio backend not started: ${msg}. Set sqlStudio.uvPath or run: cd python && uv sync`
      );
    });
}

export function deactivate(): void {
  connectionStatusBar?.dispose();
  pythonClient?.dispose();
}
