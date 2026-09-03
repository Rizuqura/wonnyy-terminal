import type { VaultSnapshot } from "../types/electron";

export function StatusBar({ view, snapshot, isScanning }: Readonly<{ view: "workspace" | "planet"; snapshot: VaultSnapshot | null; isScanning: boolean }>) {
  const ready = snapshot?.status === "ready" && !isScanning;
  const stamp = snapshot?.lastScannedAt ? new Date(snapshot.lastScannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
  return <footer className="status-bar"><span><i className={`status-dot${ready ? "" : " offline"}`} /> {isScanning ? "SCANNING VAULT" : ready ? "VAULT READY" : "VAULT OFFLINE"}</span><span>{snapshot?.totalFiles ?? 0} FILES</span><span>{snapshot?.totalDirectories ?? 0} DIRECTORIES</span><span>{snapshot?.issues.length ?? 0} WARNINGS</span><span className="status-spacer" /><span>INDEXED {stamp}</span><span className="amber-text">{view.toUpperCase()}</span></footer>;
}
