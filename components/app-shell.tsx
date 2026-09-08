"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { DocumentWorkspace } from "./document-workspace";
import { ChatPanel, type ChatPanelProps } from "./chat-panel";
import { PlanetScene } from "./planet-scene";
import { PlanetDetails } from "./planet-details";
import { KnowledgeSidebar } from "./knowledge-sidebar";
import { StatusBar } from "./status-bar";
import { TopBar } from "./top-bar";
import { StationPanel } from "./station-panel";
import { buildGraphFromVault } from "../lib/planet-vault";
import {
  stationProjection,
  type StationMatchMode,
} from "../lib/station-projection";
import { getChatUnavailableReason } from "../features/chat/context-readiness";
import type {
  BrainScope,
  ContextPackage,
  StationState,
  VaultEntry,
  VaultFile,
  VaultPdfFile,
  VaultSnapshot,
  VaultSearchResult,
} from "../types/electron";

import { useChatRuntime } from "../features/chat/use-chat-runtime";
import { ModelSettings } from "../features/model-settings/model-settings";
import { useConfirmation } from "../features/dialogs/use-confirmation";

type View = "workspace" | "planet";

function requireVaultBridge() {
  const vault = window.wonnyyDesktop?.vault;
  if (
    !vault?.getSnapshot ||
    !vault.rescan ||
    !vault.selectFolder ||
    !vault.readPdf ||
    !vault.search
  ) {
    throw new Error(
      "The Wonnyy desktop bridge is outdated. Stop the running app and restart npm run dev.",
    );
  }
  return vault;
}

function requireKnowledgeBridge() {
  const desktop = window.wonnyyDesktop;
  if (
    !desktop?.stations?.getState ||
    !desktop.context?.buildPackage ||
    !desktop.ai?.chat
  )
    throw new Error(
      "The Wonnyy desktop bridge is outdated. Stop the app and restart npm run dev.",
    );
  return desktop;
}

export function AppShell() {
  const { confirm, confirmation } = useConfirmation();
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openedFile, setOpenedFile] = useState<VaultFile | VaultPdfFile | null>(
    null,
  );
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [view, setView] = useState<View>("planet");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(193);
  const [pdfSearchResults, setPdfSearchResults] = useState<VaultSearchResult[]>(
    [],
  );
  const [isSearchingPdf, setIsSearchingPdf] = useState(false);
  const [stationState, setStationState] = useState<StationState | null>(null);
  const [activeStationIds, setActiveStationIds] = useState<Set<string>>(
    new Set(),
  );
  const [stationMatchMode, setStationMatchMode] =
    useState<StationMatchMode>("any");
  const [stationBusy, setStationBusy] = useState(false);
  const [stationError, setStationError] = useState<string | null>(null);
  const [brainScope, setBrainScope] = useState<BrainScope | null>(null);
  const [brainScopeError, setBrainScopeError] = useState<string | null>(null);
  const [brainScopeBusy, setBrainScopeBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState<"ai" | "general" | null>(
    null,
  );
  const brainScopeOwnerId = useRef<string | null>(null);
  const sidebarResizeStart = useRef<{ x: number; width: number } | null>(null);
  const vaultLoadVersion = useRef(0);

  const graph = useMemo(
    () => (snapshot ? buildGraphFromVault(snapshot) : null),
    [snapshot],
  );
  const projection = useMemo(
    () =>
      graph
        ? stationProjection(
            graph,
            stationState?.stations ?? [],
            stationState?.assignments ?? [],
            activeStationIds,
            stationMatchMode,
          )
        : null,
    [graph, stationState, activeStationIds, stationMatchMode],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const primarySelectedId = selectedIds.at(-1) ?? null;
  const selectedKnowledgePaths = useMemo(
    () => selectedIds.filter((id) => id !== graph?.rootId),
    [selectedIds, graph],
  );
  const activeContextIds = useMemo(
    () =>
      new Set(
        stationState?.activeContext
          .filter((entry) => !entry.missing)
          .map((entry) => entry.relativePath) ?? [],
      ),
    [stationState],
  );
  const chatUnavailableReason = useMemo(
    () =>
      getChatUnavailableReason({
        vaultStatus: snapshot?.status ?? null,
        brainScope,
        brainScopeBusy,
        brainScopeError,
      }),
    [brainScope, brainScopeBusy, brainScopeError, snapshot?.status],
  );

  useEffect(() => {
    if (!stationState) return;
    const validStationIds = new Set(
      stationState.stations.map((station) => station.id),
    );
    setActiveStationIds((current) => {
      const next = new Set(
        [...current].filter((id) => validStationIds.has(id)),
      );
      return next.size === current.size ? current : next;
    });
  }, [stationState]);

  useEffect(() => {
    if (snapshot?.status !== "ready" || !stationState) {
      setBrainScope(null);
      return;
    }
    let cancelled = false;
    brainScopeOwnerId.current ??= globalThis.crypto.randomUUID();
    setBrainScopeBusy(true);
    void requireKnowledgeBridge()
      .context.prepareBrainScope({
        ownerId: brainScopeOwnerId.current,
        activeStationIds: [...activeStationIds],
        matchMode: stationMatchMode,
      })
      .then((scope) => {
        if (!cancelled) {
          setBrainScope(scope);
          setBrainScopeError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setBrainScope(null);
          setBrainScopeError(
            error instanceof Error
              ? error.message
              : "Brain scope could not be prepared.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setBrainScopeBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeStationIds, snapshot, stationMatchMode, stationState]);

  const loadStationState = useCallback(
    async (version = vaultLoadVersion.current) => {
      try {
        const state = await requireKnowledgeBridge().stations.getState();
        if (version !== vaultLoadVersion.current) return;
        setStationState(state);
        setStationError(null);
      } catch (error) {
        if (version !== vaultLoadVersion.current) return;
        setStationError(
          error instanceof Error
            ? error.message
            : "Knowledge Stations could not be loaded.",
        );
      }
    },
    [],
  );

  const applySnapshot = useCallback((next: VaultSnapshot) => {
    setSnapshot(next);
    setSelectedIds([]);
    setOpenedFile(null);
    setWorkspaceError(null);
    setFocusId(null);
    setPdfSearchResults([]);
    setVaultError(null);
  }, []);

  const rescanVault = useCallback(async () => {
    const version = ++vaultLoadVersion.current;
    setIsScanning(true);
    try {
      const next = await requireVaultBridge().rescan();
      if (version !== vaultLoadVersion.current) return;
      applySnapshot(next);
      await loadStationState(version);
    } catch (error) {
      if (version !== vaultLoadVersion.current) return;
      setVaultError(
        error instanceof Error
          ? error.message
          : "Wonnyy could not scan the active vault.",
      );
    } finally {
      if (version === vaultLoadVersion.current) setIsScanning(false);
    }
  }, [applySnapshot, loadStationState]);

  useEffect(() => {
    void rescanVault();
  }, [rescanVault]);

  const changeVault = useCallback(async () => {
    const version = ++vaultLoadVersion.current;
    setIsScanning(true);
    try {
      const bridge = requireVaultBridge();
      const selected = await bridge.selectFolder();
      if (version !== vaultLoadVersion.current) return;
      // Cancelling the picker still needs a snapshot if it superseded startup.
      const next = selected ?? (await bridge.getSnapshot());
      if (version !== vaultLoadVersion.current) return;
      applySnapshot(next);
      if (selected) setActiveStationIds(new Set());
      await loadStationState(version);
    } catch (error) {
      if (version !== vaultLoadVersion.current) return;
      setVaultError(
        error instanceof Error
          ? error.message
          : "Wonnyy could not change the active vault.",
      );
    } finally {
      if (version === vaultLoadVersion.current) setIsScanning(false);
    }
  }, [applySnapshot, loadStationState]);

  const stationMutation = useCallback(
    async (operation: () => Promise<StationState>) => {
      setStationBusy(true);
      setStationError(null);
      try {
        setStationState(await operation());
      } catch (error) {
        setStationError(
          error instanceof Error
            ? error.message
            : "Knowledge Station update failed.",
        );
      } finally {
        setStationBusy(false);
      }
    },
    [],
  );

  const clearActiveContext = useCallback(() => {
    void stationMutation(() => requireKnowledgeBridge().context.clear());
  }, [stationMutation]);

  const addSelectedToContext = useCallback(async () => {
    if (!selectedKnowledgePaths.length) return;
    const version = vaultLoadVersion.current;
    setStationBusy(true);
    setStationError(null);
    try {
      const bridge = requireKnowledgeBridge();
      const preview = await bridge.context.preview(selectedKnowledgePaths);
      if (version !== vaultLoadVersion.current) return;
      const sample = preview.files.slice(0, 6).join("\n");
      const remainder =
        preview.files.length > 6
          ? `\n…and ${preview.files.length - 6} more`
          : "";
      if (
        (await confirm(
          `Add ${preview.files.length} file(s) to Active Context?\nEstimated ~${preview.estimatedTokens.toLocaleString()} tokens\n\n${sample}${remainder}`,
          "Add to Active Context",
        )) &&
        version === vaultLoadVersion.current
      )
        setStationState(await bridge.context.add(selectedKnowledgePaths));
    } catch (error) {
      setStationError(
        error instanceof Error ? error.message : "Context preview failed.",
      );
    } finally {
      setStationBusy(false);
    }
  }, [selectedKnowledgePaths, confirm]);

  const selectEntry = useCallback((id: string | null, additive = false) => {
    if (!id) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds((current) => {
      if (!additive) return [id];
      return current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
    });
  }, []);

  const selectExplorerEntry = useCallback(
    (entry: VaultEntry, additive: boolean) => {
      selectEntry(entry.relativePath, additive);
      if (entry.kind === "folder" && !additive) setFocusId(entry.relativePath);
    },
    [selectEntry],
  );

  const openVaultFile = useCallback(async (relativePath: string) => {
    setWorkspaceError(null);
    try {
      const vault = requireVaultBridge();
      setOpenedFile(
        relativePath.toLocaleLowerCase().endsWith(".pdf")
          ? await vault.readPdf(relativePath)
          : await vault.read(relativePath),
      );
      setView("workspace");
    } catch (error) {
      setOpenedFile(null);
      setWorkspaceError(
        error instanceof Error
          ? error.message
          : "Wonnyy could not open this file.",
      );
      setView("workspace");
    }
  }, []);

  const searchPdfText = useCallback(async (query: string) => {
    if (!query.trim()) {
      setPdfSearchResults([]);
      setIsSearchingPdf(false);
      return;
    }
    setIsSearchingPdf(true);
    try {
      setPdfSearchResults(await requireVaultBridge().search(query));
    } catch {
      setPdfSearchResults([]);
    } finally {
      setIsSearchingPdf(false);
    }
  }, []);

  const openPlanetFile = useCallback(
    (id: string) => {
      const node = graph?.byId.get(id);
      if (node?.type === "file" && node.fileType !== "other")
        void openVaultFile(node.path);
    },
    [graph, openVaultFile],
  );

  const chat = useChatRuntime({
    vaultPath: snapshot?.status === "ready" ? snapshot.rootPath : null,
    contextKey: JSON.stringify(
      brainScope?.sources.map(({ id, contentHash, missing, changed }) => ({
        id,
        contentHash,
        missing,
        changed,
      })) ?? [],
    ),
    scope: {
      activeStationIds: [...activeStationIds],
      matchMode: stationMatchMode,
    },
    unavailableReason: chatUnavailableReason,
    onKnowledgeChange: loadStationState,
  });
  const chatProps: Omit<ChatPanelProps, "variant"> = {
    controller: chat,
    onOpenSource: (relativePath) => {
      void openVaultFile(relativePath);
    },
  };

  const startSidebarResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      sidebarResizeStart.current = { x: event.clientX, width: sidebarWidth };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [sidebarWidth],
  );

  const resizeSidebar = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = sidebarResizeStart.current;
      if (!start) return;
      const maxWidth = Math.min(460, Math.max(260, window.innerWidth * 0.38));
      setSidebarWidth(
        Math.round(
          Math.min(
            maxWidth,
            Math.max(160, start.width + event.clientX - start.x),
          ),
        ),
      );
    },
    [],
  );

  const stopSidebarResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      sidebarResizeStart.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    },
    [],
  );

  const vaultSidebar = (
    <div className="sidebar-slot">
      <KnowledgeSidebar
        snapshot={snapshot}
        isScanning={isScanning}
        error={vaultError}
        selectedIds={selectedSet}
        pdfSearchResults={pdfSearchResults}
        isSearchingPdf={isSearchingPdf}
        onSearchPdf={searchPdfText}
        onRescan={() => void rescanVault()}
        onChangeVault={() => void changeVault()}
        onSelect={selectExplorerEntry}
        onOpen={(entry) => void openVaultFile(entry.relativePath)}
        onOpenSearchResult={(relativePath) => void openVaultFile(relativePath)}
      />
      <div
        className="sidebar-resize-handle"
        role="separator"
        aria-label="Resize knowledge vault"
        aria-orientation="vertical"
        onPointerDown={startSidebarResize}
        onPointerMove={resizeSidebar}
        onPointerUp={stopSidebarResize}
        onPointerCancel={stopSidebarResize}
      />
    </div>
  );

  return (
    <main
      className="app-shell"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <TopBar
        settingsOpen={settingsOpen === "general"}
        aiTerminalOpen={settingsOpen === "ai"}
        onOpenSettings={() => setSettingsOpen("general")}
        onOpenAi={() => {
          setSettingsOpen("ai");
          chat.refreshModels();
        }}
        view={view}
        onChangeView={(next) => {
          setSettingsOpen(null);
          setView(next);
        }}
        onChangeVault={() => void changeVault()}
      />
      {settingsOpen === "ai" ? (
        <ModelSettings
          chat={chat}
          onClose={() => {
            setSettingsOpen(null);
            setView("workspace");
          }}
        />
      ) : settingsOpen === "general" ? (
        <section className="model-settings" aria-label="Settings">
          <header>
            <h1>Settings</h1>
          </header>
          <h2>Knowledge vault</h2>
          <p>{snapshot?.rootPath ?? "No vault selected"}</p>
          <button onClick={() => void changeVault()}>
            Change vault folder
          </button>
          <h2>AI model setup</h2>
          <p>
            Manage local models, generation settings, and readiness in AI
            Terminal.
          </p>
          <button onClick={() => setSettingsOpen("ai")}>
            Open AI Terminal
          </button>
        </section>
      ) : view === "planet" ? (
        <div className="workspace-grid planet-grid">
          {vaultSidebar}
          {projection ? (
            <PlanetScene
              graph={projection.graph}
              selectedIds={selectedSet}
              onSelect={selectEntry}
              onOpenFile={openPlanetFile}
              focusId={focusId}
              onFocus={setFocusId}
              stationMatchIds={projection.matches}
              activeContextIds={activeContextIds}
              projectionIds={projection.visible}
              stationClusters={projection.clusters}
              chatProps={chatProps}
            />
          ) : (
            <section className="planet-view">
              <div className="planet-view-header">
                <span>PLANET VIEW</span>
                <span className="planet-view-hint">Vault unavailable</span>
              </div>
              <div className="planet-canvas">
                <div className="planet-empty">
                  <span className="planet-orb large" />
                  {vaultError ??
                    snapshot?.message ??
                    "No active vault is available."}
                </div>
              </div>
            </section>
          )}
          <aside className="planet-detail-panel">
            <div className="planet-header">
              <span>DETAILS + CONTEXT</span>
              {primarySelectedId ? (
                <button
                  aria-label="Clear selection"
                  onClick={() => selectEntry(null)}
                >
                  ×
                </button>
              ) : null}
            </div>
            <div className="planet-detail-scroll">
              <PlanetDetails
                graph={graph}
                selected={
                  graph && primarySelectedId
                    ? (graph.byId.get(primarySelectedId) ?? null)
                    : null
                }
                onOpenFile={openPlanetFile}
                onExplore={setFocusId}
              />
              <StationPanel
                state={stationState}
                brainScope={brainScope}
                brainScopeBusy={brainScopeBusy}
                brainScopeError={brainScopeError}
                selectedPaths={selectedKnowledgePaths}
                activeStationIds={activeStationIds}
                matchMode={stationMatchMode}
                busy={stationBusy}
                error={stationError}
                onCreate={(name) =>
                  void stationMutation(() =>
                    requireKnowledgeBridge().stations.create(name),
                  )
                }
                onRename={(id, name) =>
                  void stationMutation(() =>
                    requireKnowledgeBridge().stations.rename(id, name),
                  )
                }
                onDelete={(id) =>
                  void stationMutation(() =>
                    requireKnowledgeBridge().stations.delete(id),
                  )
                }
                onAssign={(stationId, assigned) =>
                  void stationMutation(() =>
                    requireKnowledgeBridge().stations.setAssignments(
                      selectedKnowledgePaths,
                      stationId,
                      assigned,
                    ),
                  )
                }
                onToggleFilter={(stationId) =>
                  setActiveStationIds((current) => {
                    const next = new Set(current);
                    if (next.has(stationId)) next.delete(stationId);
                    else next.add(stationId);
                    return next;
                  })
                }
                onMatchMode={setStationMatchMode}
                onAddContext={() => void addSelectedToContext()}
                onRemoveContext={(path) =>
                  void stationMutation(() =>
                    requireKnowledgeBridge().context.remove([path]),
                  )
                }
                onClearContext={clearActiveContext}
                onBuildPackage={() =>
                  requireKnowledgeBridge().context.buildPackage() as Promise<ContextPackage>
                }
              />
            </div>
          </aside>
        </div>
      ) : (
        <div
          className={`workspace-grid${openedFile && "data" in openedFile && !workspaceError ? " workspace-grid-pdf" : ""}`}
        >
          {vaultSidebar}
          <DocumentWorkspace
            file={openedFile}
            error={workspaceError}
            onClose={() => {
              setOpenedFile(null);
              setWorkspaceError(null);
            }}
          />
          {!(openedFile && "data" in openedFile && !workspaceError) && (
            <ChatPanel {...chatProps} />
          )}
        </div>
      )}
      <StatusBar view={view} snapshot={snapshot} isScanning={isScanning} />
      {confirmation}
    </main>
  );
}
