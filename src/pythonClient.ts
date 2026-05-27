import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import * as path from "path";
import * as readline from "readline";
import * as vscode from "vscode";

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

/**
 * Spawns the Python JSON-RPC backend via `uv run` (see python/pyproject.toml).
 */
export class PythonClient implements vscode.Disposable {
  private process: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private outputChannel: vscode.OutputChannel;
  private extensionPath: string;

  constructor(context: vscode.ExtensionContext) {
    this.extensionPath = context.extensionPath;
    this.outputChannel = vscode.window.createOutputChannel("SQL Studio Backend");
  }

  private getUvCommand(): string {
    return vscode.workspace.getConfiguration("sqlStudio").get<string>("uvPath", "uv");
  }

  private getPythonProjectDir(): string {
    return path.join(this.extensionPath, "python");
  }

  async start(): Promise<void> {
    if (this.process) {
      return;
    }
    const uv = this.getUvCommand();
    const pythonDir = this.getPythonProjectDir();
    const args = ["run", "--directory", pythonDir, "sql-studio-server"];

    this.outputChannel.appendLine(`Starting backend: ${uv} ${args.join(" ")}`);

    this.process = spawn(uv, args, {
      cwd: this.extensionPath,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      stdio: "pipe",
    });

    this.process.stderr.on("data", (chunk: Buffer) => {
      this.outputChannel.append(chunk.toString());
    });

    const rl = readline.createInterface({ input: this.process.stdout });
    rl.on("line", (line) => {
      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        const pending = this.pending.get(msg.id);
        if (!pending) {
          return;
        }
        this.pending.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve(msg.result);
        }
      } catch {
        this.outputChannel.appendLine(`Failed to parse RPC response: ${line}`);
      }
    });

    this.process.on("exit", (code) => {
      this.outputChannel.appendLine(`Python server exited with code ${code}`);
      this.process = null;
      for (const [, p] of this.pending) {
        p.reject(new Error("Python server stopped"));
      }
      this.pending.clear();
    });

    await this.request("health", {});
  }

  async request<T>(method: string, params: Record<string, unknown>): Promise<T> {
    if (!this.process) {
      await this.start();
    }
    if (!this.process) {
      throw new Error("Failed to start Python backend via uv");
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.process!.stdin.write(payload + "\n");
    });
  }

  dispose(): void {
    this.process?.kill();
    this.process = null;
    this.outputChannel.dispose();
  }
}
