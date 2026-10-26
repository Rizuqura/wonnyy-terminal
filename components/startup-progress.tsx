type StartupProgressProps = {
  progress: number;
  label: string;
  error: string | null;
  onContinue: () => void;
};

export function StartupProgress({
  progress,
  label,
  error,
  onContinue,
}: StartupProgressProps) {
  return (
    <section className="startup-screen" aria-label="QTerminal startup">
      <div className="startup-card">
        <img
          className="startup-brand"
          src="./qterminal-logo.png"
          alt=""
          width={56}
          height={56}
        />
        <h1>QTerminal</h1>
        <p className="startup-version">1.0.0 Victoria</p>
        <p role="status" aria-live="polite">
          {label}
        </p>
        <progress aria-label="Startup progress" max={100} value={progress} />
        <div className="startup-caption">
          <span>Preparing your workspace</span>
          <span>{progress}%</span>
        </div>
        {error && (
          <p className="startup-error" role="alert">
            {error}
          </p>
        )}
        <button type="button" onClick={onContinue}>
          Continue to workspace
        </button>
      </div>
    </section>
  );
}
