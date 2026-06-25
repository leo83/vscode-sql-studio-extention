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
  private startPromise: Promise<void> | null = null;
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
    context.subscriptions.push(this.outputChannel);
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
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.launchBackend().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private launchBackend(): Promise<void> {
    const uv = this.getUvCommand();
    const pythonDir = this.getPythonProjectDir();
    const args = ["run", "--directory", pythonDir, "sql-studio-server"];

    this.outputChannel.appendLine(`Starting backend: ${uv} ${args.join(" ")}`);

    return new Promise((resolve, reject) => {
      const child = spawn(uv, args, {
        cwd: this.extensionPath,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          // Force UTF-8 stdio so non-ASCII (e.g. Cyrillic) query text is not
          // mangled by the locale code page on Windows. The backend also
          // reconfigures its streams; this is belt-and-suspenders.
          PYTHONUTF8: "1",
          PYTHONIOENCODING: "utf-8",
        },
        stdio: "pipe",
      });

      this.process = child;

      child.on("error", (err) => {
        this.outputChannel.appendLine(`Backend spawn failed: ${err.message}`);
        this.process = null;
        this.rejectAllPending(new Error(`Failed to launch ${uv}: ${err.message}`));
        reject(new Error(`Failed to launch ${uv}: ${err.message}`));
      });

      child.stderr.on("data", (chunk: Buffer) => {
        this.outputChannel.append(chunk.toString());
      });

      const rl = readline.createInterface({ input: child.stdout });
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

      child.on("exit", (code) => {
        this.outputChannel.appendLine(`Python server exited with code ${code}`);
        this.process = null;
        this.rejectAllPending(new Error("Python server stopped"));
      });

      void this.request<{ status: string }>("health", {}, { timeoutMs: 20_000 })
        .then(() => {
          this.outputChannel.appendLine("Backend ready.");
          resolve();
        })
        .catch((err) => {
          this.process?.kill();
          this.process = null;
          reject(err);
        });
    });
  }

  private rejectAllPending(error: Error): void {
    for (const [, pending] of this.pending) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  async request<T>(
    method: string,
    params: Record<string, unknown>,
    options?: { timeoutMs?: number }
  ): Promise<T> {
    if (!this.process) {
      await this.start();
    }
    if (!this.process) {
      throw new Error("Failed to start Python backend via uv");
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    const timeoutMs = options?.timeoutMs;
    return new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (fn: () => void) => {
        if (timer) {
          clearTimeout(timer);
        }
        this.pending.delete(id);
        fn();
      };
      this.pending.set(id, {
        resolve: (v) => finish(() => resolve(v as T)),
        reject: (e) => finish(() => reject(e)),
      });
      if (timeoutMs && timeoutMs > 0) {
        timer = setTimeout(() => {
          const pending = this.pending.get(id);
          if (pending) {
            finish(() =>
              reject(new Error(`Request timed out after ${timeoutMs / 1000}s`))
            );
          }
        }, timeoutMs);
      }
      this.process!.stdin.write(payload + "\n");
    });
  }

  dispose(): void {
    this.process?.kill();
    this.process = null;
    this.rejectAllPending(new Error("Python server stopped"));
  }
}
