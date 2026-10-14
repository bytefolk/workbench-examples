import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DemoAuthGate } from "./components/DemoAuthGate";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DemoAuthGate>
      {(user, onLogout) => <App user={user} onLogout={onLogout} />}
    </DemoAuthGate>
  </StrictMode>,
);
