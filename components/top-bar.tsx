export function TopBar({
  view,
  onChangeView,
  onChangeVault,
  settingsOpen,
  onOpenSettings,
  aiTerminalOpen,
  onOpenAi,
}: Readonly<{
  view: "workspace" | "planet";
  onChangeView: (view: "workspace" | "planet") => void;
  onChangeVault: () => void;
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
        <span className="version">ver 0.0.3</span>
      </div>
      <nav className="top-nav" aria-label="Primary">
        <button className="nav-item" onClick={onChangeVault}>
          CHANGE VAULT
        </button>
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
