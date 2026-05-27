export interface VsCodeApi {
  postMessage: (msg: unknown) => void;
}

declare global {
  interface Window {
    vscode?: VsCodeApi;
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

let cached: VsCodeApi | undefined;

/** VS Code allows acquireVsCodeApi() only once per webview. */
export function getVsCodeApi(): VsCodeApi | undefined {
  if (cached) {
    return cached;
  }
  if (window.vscode) {
    cached = window.vscode;
    return cached;
  }
  const api = window.acquireVsCodeApi?.();
  if (api) {
    cached = api;
    window.vscode = api;
  }
  return cached;
}
