import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import "./interior.css";
import { AppProvider } from "./store";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);
