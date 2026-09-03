export function TopBar({ view, onToggleView, onChangeVault }: Readonly<{ view: "workspace" | "planet"; onToggleView: () => void; onChangeVault: () => void }>) {
  return (
    <header className="top-bar">
      <div className="brand">
        <span className="brand-mark">W</span>
        <span>WONNYY</span>
        <span className="version">ver 0.0.1</span>
      </div>
      <nav className="top-nav" aria-label="Primary">
        <button className="nav-item" onClick={onChangeVault}>
          CHANGE VAULT
        </button>
        <button className={`nav-item${view === "workspace" ? " active" : ""}`} onClick={() => view !== "workspace" && onToggleView()}>
          WORKSPACE
        </button>
        <button className={`nav-item${view === "planet" ? " active" : ""}`} onClick={() => view !== "planet" && onToggleView()}>
          PLANET VIEW
        </button>
        <button className="nav-item">AI TERMINAL</button>
        <button className="nav-item">SETTINGS</button>
      </nav>
      <div className="top-actions">
        <div className="quick-open">⌘K&nbsp; Quick Open</div>
      </div>
    </header>
  );
}
