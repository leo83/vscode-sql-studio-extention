import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

declare global {
  interface Window {
    __SQL_STUDIO_MODE__?: import("./types").WebviewMode;
    __SQL_STUDIO_RESULT__?: import("./types").QueryExecuteResult;
    __SQL_STUDIO_CONNECTION__?: import("./types").ConnectionDialogInit;
    __SQL_STUDIO_DIAGRAM__?: import("./types").SchemaDiagramInit;
    __SQL_STUDIO_TABLE_LAYOUTS__?: Record<string, import("./tableLayout").TableLayout>;
    acquireVsCodeApi?: () => { postMessage: (msg: unknown) => void };
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
