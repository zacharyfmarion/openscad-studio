import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./contexts/ThemeContext";
import { initFormatter } from "./utils/formatter";
import "./index.css";

// Initialize tree-sitter WASM as early as possible
initFormatter().catch((error) => {
  console.error('[main] Failed to initialize formatter:', error);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
