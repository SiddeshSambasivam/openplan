import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { migrateLegacyStorageKeys } from "./lib/storage";
import "./index.css";

// Before anything reads a preference.
migrateLegacyStorageKeys();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
