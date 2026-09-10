import { useMemo, useState } from "react";
import { useConfirmation } from "../features/dialogs/use-confirmation";
import type { StationMatchMode } from "../lib/station-projection";
import type { BrainScope, ContextPackage, StationState } from "../types/electron";

type Props = {
  state: StationState | null;
  brainScope: BrainScope | null;
  brainScopeBusy: boolean;
  brainScopeError: string | null;
  selectedPaths: string[];
  activeStationIds: ReadonlySet<string>;
  matchMode: StationMatchMode;
  busy: boolean;
  error: string | null;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onAssign: (stationId: string, assigned: boolean) => void;
  onToggleFilter: (stationId: string) => void;
  onMatchMode: (mode: StationMatchMode) => void;
  onAddContext: () => void;
  onAddStationContext: () => void;
  onRemoveContext: (path: string) => void;
  onClearContext: () => void;
  onBuildPackage: () => Promise<ContextPackage>;
};

export function StationPanel(props: Readonly<Props>) {
  const { confirm, confirmation } = useConfirmation();
  const [name, setName] = useState(""); const [query, setQuery] = useState(""); const [packageNotice, setPackageNotice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null); const [editingName, setEditingName] = useState("");
  const selectedAssignments = useMemo(() => props.selectedPaths.map((path) => props.state?.assignments.find((item) => item.relativePath === path)), [props.selectedPaths, props.state]);
  const stations = (props.state?.stations ?? []).filter((station) => station.name.includes(query));
  const submit = () => { if (name.trim()) { props.onCreate(name); setName(""); } };
  const submitRename = (id: string) => { if (editingName.trim()) props.onRename(id, editingName); setEditingId(null); setEditingName(""); };
  const repairOrphans = async () => {
    const bridge = window.wonnyyDesktop?.stations; if (!bridge) return;
    const suggestions = await bridge.suggestions(); const actionable = suggestions.filter((item) => item.candidates.length === 1);
    if (!actionable.length) { setPackageNotice("No unambiguous moved-object matches were found. Assignments remain safely orphaned."); return; }
    let changed = false;
    for (const item of actionable) if (await confirm(`Reattach ${item.relativePath} to ${item.candidates[0]}?`, "Reattach source")) { await bridge.reattach(item.relativePath, item.candidates[0]); changed = true; }
    if (changed) window.location.reload();
  };
  return <div className="station-panel">
    <div className="pd-section-title">KNOWLEDGE STATIONS</div>
    <div className="brain-scope" aria-live="polite">
      <div><span>BRAIN SCOPE</span><b>{props.brainScopeBusy ? "PREPARING" : props.brainScope?.mode.replace("-", " ").toUpperCase() ?? "UNAVAILABLE"}</b></div>
      {props.brainScope ? <><p>{props.brainScope.reason}</p><small>{props.brainScope.sources.filter((source) => !source.missing).length} readable sources · ~{props.brainScope.estimatedTokens.toLocaleString()} tokens</small>{props.brainScope.stationNames.length ? <small>{props.brainScope.stationNames.join(" + ")}</small> : null}</> : null}
      {props.brainScopeError ? <p className="station-error">{props.brainScopeError}</p> : null}
    </div>
    {props.state?.error ? <p className="station-error">{props.state.error}</p> : null}
    {props.error ? <p className="station-error">{props.error}</p> : null}
    <div className="station-create"><input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} placeholder="New Station" disabled={!props.state?.writable || props.busy} /><button onClick={submit} disabled={!props.state?.writable || props.busy}>+</button></div>
    <input className="station-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter Stations" />
    <div className="station-modes"><button className={props.matchMode === "any" ? "on" : ""} onClick={() => props.onMatchMode("any")}>ANY</button><button className={props.matchMode === "all" ? "on" : ""} onClick={() => props.onMatchMode("all")}>ALL</button></div>
    <button className="pd-action" disabled={!props.activeStationIds.size || props.busy} onClick={props.onAddStationContext}>REVIEW STATION CONTEXT</button>
    <p className="context-summary">Review the active ANY/ALL Station matches, then approve their files for chat. New Station members need another review.</p>
    <div className="station-list">{stations.map((station) => {
      const assignedCount = selectedAssignments.filter((assignment) => assignment?.stationIds.includes(station.id)).length; const allAssigned = props.selectedPaths.length > 0 && assignedCount === props.selectedPaths.length; const mixed = assignedCount > 0 && !allAssigned;
      return <div className="station-row" key={station.id}>
        <button className={`station-filter${props.activeStationIds.has(station.id) ? " on" : ""}`} onClick={() => props.onToggleFilter(station.id)} title="Toggle Planet projection">{props.activeStationIds.has(station.id) ? "●" : "○"}</button>
        <button className={`station-assign${allAssigned ? " on" : mixed ? " mixed" : ""}`} disabled={!props.selectedPaths.length || props.busy || !props.state?.writable} onClick={() => props.onAssign(station.id, !allAssigned)} title="Assign to selected knowledge">{allAssigned ? "✓" : mixed ? "–" : "+"}</button>
        {editingId === station.id ? <input className="station-rename" autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitRename(station.id); if (event.key === "Escape") { setEditingId(null); setEditingName(""); } }} aria-label={`Rename ${station.name}`} /> : <span title={station.name}>{station.name}</span>}<small>{station.assignmentCount}</small>
        <button className="station-edit" onClick={() => editingId === station.id ? submitRename(station.id) : (setEditingId(station.id), setEditingName(station.name))}>{editingId === station.id ? "✓" : "✎"}</button>
        <button className="station-edit" onClick={async () => { if (await confirm(`Delete Station “${station.name}” and remove all assignments?`, "Delete Station")) props.onDelete(station.id); }}>×</button>
      </div>;
    })}</div>
    <div className="pd-rule" /><div className="pd-section-title">ACTIVE CONTEXT</div>
    <p className="context-summary">{props.state?.activeContext.length ?? 0} approved sources · ~{(props.state?.contextEstimatedTokens ?? 0).toLocaleString()} tokens</p>
    {(props.state?.contextEstimatedTokens ?? 0) > 100000 ? <p className="station-error">Large context package. Review sources before model use.</p> : null}
    {props.selectedPaths.length ? <button className="pd-action" disabled={props.busy} onClick={props.onAddContext}>REVIEW + ADD SELECTED</button> : null}
    <div className="context-list">{props.state?.activeContext.map((entry) => <div key={entry.relativePath} className={entry.missing ? "missing" : entry.changed ? "changed" : ""}><span>{entry.relativePath}{entry.changed ? " · CHANGED" : ""}</span><button onClick={() => props.onRemoveContext(entry.relativePath)}>×</button></div>)}</div>
    {(props.state?.assignments.some((entry) => entry.missing) ?? false) ? <><p className="station-error">Orphaned assignments are preserved until you confirm a match.</p><button className="station-secondary" onClick={() => void repairOrphans()}>FIND MOVED OBJECTS</button></> : null}
    {(props.state?.activeContext.length ?? 0) > 0 ? <><button className="station-secondary" onClick={props.onClearContext}>CLEAR ALL CONTEXT</button><button className="station-secondary" onClick={() => void props.onBuildPackage().then((value) => setPackageNotice(`${value.sources.length} sources · ~${value.estimatedTokens.toLocaleString()} tokens`))}>BUILD PACKAGE</button></> : null}
    {packageNotice ? <p className="context-summary">Ready: {packageNotice}</p> : null}
    {confirmation}
  </div>;
}
