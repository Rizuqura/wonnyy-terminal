export function TopBar({
  view,
  onChangeView,
  settingsOpen,
  onOpenSettings,
  aiTerminalOpen,
  onOpenAi,
}: Readonly<{
  view: "workspace" | "planet";
  onChangeView: (view: "workspace" | "planet") => void;
  settingsOpen: boolean;
  onOpenSettings: () => void;
  aiTerminalOpen: boolean;
  onOpenAi: () => void;
}>) {
  return (
    <header className="top-bar">
      <div className="brand">
        <span className="brand-mark">W</span>
        <span>WONNYY</span>
        <span className="version">Amadeus 0.0.6</span>
      </div>
      <nav className="top-nav" aria-label="Primary">
        <button
          className={`nav-item${!settingsOpen && !aiTerminalOpen && view === "workspace" ? " active" : ""}`}
          onClick={() => onChangeView("workspace")}
        >
          WORKSPACE
        </button>
        <button
          className={`nav-item${!settingsOpen && !aiTerminalOpen && view === "planet" ? " active" : ""}`}
          onClick={() => onChangeView("planet")}
        >
          PLANET VIEW
        </button>
        <button
          className={`nav-item${aiTerminalOpen ? " active" : ""}`}
          aria-current={aiTerminalOpen ? "page" : undefined}
          onClick={onOpenAi}
        >
          AI TERMINAL
        </button>
        <button
          className={`nav-item${settingsOpen ? " active" : ""}`}
          onClick={onOpenSettings}
        >
          SETTINGS
        </button>
      </nav>
      <div className="top-actions">
        <div className="quick-open">⌘K&nbsp; Quick Open</div>
      </div>
    </header>
  );
}
