import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

declare global {
  interface Window {
    __SQL_STUDIO_RESULT__?: import("./types").QueryResult;
    acquireVsCodeApi?: () => { postMessage: (msg: unknown) => void };
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
