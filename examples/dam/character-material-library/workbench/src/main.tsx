import React from "react";
import ReactDOM from "react-dom/client";
import { AppProvider, useApp } from "./store";
import { Shell } from "./components/Shell";
import { TaskDetail } from "./components/TaskDetail";
import { Overview } from "./pages/Overview";
import { Characters } from "./pages/Characters";
import { Generate } from "./pages/Generate";
import { Tasks } from "./pages/Tasks";
import { Library } from "./pages/Library";
import { Settings } from "./pages/Settings";
import "./styles.css";
function App() {
  const { page, selectedTask } = useApp();
  const pages = {
      overview: Overview,
      characters: Characters,
      generate: Generate,
      tasks: Tasks,
      library: Library,
      settings: Settings,
    },
    Component = pages[page];
  return (
    <Shell>
      <Component />
      {selectedTask && <TaskDetail key={selectedTask} />}
    </Shell>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);
