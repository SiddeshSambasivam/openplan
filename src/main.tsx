import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { guardContextMenu } from "./lib/contextMenu";
import { migrateLegacyStorageKeys } from "./lib/storage";
import "./index.css";

// Before anything reads a preference.
migrateLegacyStorageKeys();

// The webview's own menu offers Reload, which has no place in the app.
guardContextMenu(document);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={300}>
      <App />
    </TooltipProvider>
  </React.StrictMode>,
);
