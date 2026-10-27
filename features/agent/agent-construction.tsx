"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  AgentConstructionConfig,
  AgentNodeKind,
  AgentAppearanceOptions,
} from "../../types/ai";
import type { ChatController } from "../chat/use-chat-runtime";
import { ConstructionSourcePicker } from "./construction-source-picker";
import { AgentAvatar } from "./agent-avatar";
import "./agent-construction.css";
import { wallpaperStyle } from "../chat/chat-presentation";
const kinds: AgentNodeKind[] = [
  "Context",
  "Personality",
  "Skill",
  "LLM",
  "Workflow",
  "Knowledge",
  "Output",
];
const marks: Record<AgentNodeKind, string> = {
  Context: "▤",
  Personality: "◉",
  Skill: "⚒",
  LLM: "✣",
  Workflow: "⇢",
  Knowledge: "◇",
  Output: "▧",
};
const explanations: Record<AgentNodeKind, string> = {
  Context:
    "Choose a reviewed single file or Context Box as the default research context for new chats. Confirm the source selection when starting a chat.",
  Personality:
    "Use a full file or Context Box of personality notes, tone examples and principles, plus optional preferences. These guide style separately from research evidence.",
  Skill:
    "Attach a full method document or Context Box as reference guidance for this agent.",
  LLM: "Inherit shared Settings, or select a provider/model for this agent. Credentials stay in shared secure settings. Availability is checked before each send.",
  Workflow:
    "Single-pass research through the existing chat runtime. /loop is unavailable; this node cannot enable it.",
  Knowledge:
    "Attach a single file or Context Box to offer its reviewed research sources when creating a new chat. Existing chats are not silently expanded.",
  Output:
    "Attach a full template file or Context Box of output examples. Format preferences cannot override evidence or citation requirements.",
};
export function AgentConstruction({
  chat,
  onDirtyChange,
  onBusyChange,
}: {
  chat: ChatController;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const profile = chat.agent;
  const [config, setConfig] = useState<AgentConstructionConfig | null>(
    profile?.construction?.draft ?? null,
  );
  const [avatar, setAvatar] = useState<string | null | undefined>();
  const storedAppearance =
    profile?.construction?.draftAppearance ?? profile?.appearance;
  const [appearance, setAppearance] = useState<AgentAppearanceOptions>({
    wallpaperMode: storedAppearance?.wallpaperMode ?? "none",
    dim: storedAppearance?.dim ?? 60,
    fontSize: storedAppearance?.fontSize ?? 15,
  });
  const [banner, setBanner] = useState<string | null | undefined>();
  const [wallpaper, setWallpaper] = useState<string | null | undefined>();
  const [selected, setSelected] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [wirePoint, setWirePoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);
  const saving = useRef(false);
  const dirty =
    !!config &&
    (JSON.stringify(config) !== JSON.stringify(profile?.construction?.draft) ||
      avatar !== undefined ||
      banner !== undefined ||
      wallpaper !== undefined ||
      JSON.stringify(appearance) !==
        JSON.stringify({
          wallpaperMode: storedAppearance?.wallpaperMode ?? "none",
          dim: storedAppearance?.dim ?? 60,
          fontSize: storedAppearance?.fontSize ?? 15,
        }));
  useLayoutEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useLayoutEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  if (profile && !profile.construction)
    return <p role="alert">Restart QTerminal to load Agent Construction.</p>;
  if (!profile || !config)
    return <p role="status">Loading agent construction...</p>;
  const construction = profile.construction;
  const node = config.nodes.find((item) => item.id === selected);
  const blocked = busy || chat.busy;
  const update = (patch: Partial<AgentConstructionConfig>) =>
    setConfig((current) => (current ? { ...current, ...patch } : current));
  const updateNode = (
    id: string,
    patch: Partial<AgentConstructionConfig["nodes"][number]>,
  ) =>
    setConfig((current) =>
      current
        ? {
            ...current,
            nodes: current.nodes.map((item) =>
              item.id === id ? { ...item, ...patch } : item,
            ),
          }
        : current,
    );
  const localPoint = (clientX: number, clientY: number) => {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };
  const move = (id: string, x: number, y: number) =>
    updateNode(id, {
      x: Math.max(0, Math.min(880, Math.round(x / 8) * 8)),
      y: Math.max(0, Math.min(520, Math.round(y / 8) * 8)),
    });
  const connect = (from: string, to: string) => {
    setConnecting(null);
    setWirePoint(null);
    const source = config.nodes.find((n) => n.id === from),
      target = config.nodes.find((n) => n.id === to);
    if (
      !source ||
      !target ||
      source.id === target.id ||
      !(
        (source.kind === "LLM" && target.kind === "Output") ||
        (!["LLM", "Output"].includes(source.kind) && target.kind === "LLM")
      )
    ) {
      setError(
        "Connect inputs to LLM, then LLM to Output. Cycles are not supported.",
      );
      return;
    }
    if (config.edges.some((e) => e.from === from && e.to === to)) {
      setNotice("These nodes are already connected.");
      return;
    }
    update({ edges: [...config.edges, { from, to }] });
    setError("");
    setNotice("Connection added to the draft.");
  };
  const add = (kind: AgentNodeKind, point?: { x: number; y: number }) => {
    if (blocked) return;
    if (config.nodes.some((n) => n.kind === kind)) {
      setError(`The graph already has a ${kind} node.`);
      return;
    }
    const initial =
      kind === "Context"
        ? { mode: "bound-only" as const }
        : kind === "Workflow"
          ? { mode: "single-pass" as const }
          : kind === "Knowledge"
            ? { mode: "preview-only" as const }
            : kind === "Output"
              ? { mode: "text" as const }
              : {};
    const id = kind.toLowerCase();
    const freePosition = [368, 0, 520, 160]
      .flatMap((y) => [64, 352, 640, 880].map((x) => ({ x, y })))
      .find((candidate) =>
        config.nodes.every(
          (node) =>
            Math.abs(node.x - candidate.x) >= 152 ||
            Math.abs(node.y - candidate.y) >= 152,
        ),
      );
    const position = point ?? freePosition ?? { x: 64, y: 0 };
    update({
      nodes: [
        ...config.nodes,
        {
          id,
          kind,
          x: Math.max(0, Math.min(880, Math.round(position.x / 8) * 8)),
          y: Math.max(0, Math.min(520, Math.round(position.y / 8) * 8)),
          config: initial,
        },
      ],
    });
    setSelected(id);
    setError("");
    setNotice(`${kind} added. Connect it before applying.`);
  };
  const save = async (action: "draft" | "apply") => {
    if (saving.current || blocked) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await chat.saveConstruction(
        action,
        config,
        construction.revision,
        avatar,
        {
          appearance,
          ...(banner !== undefined ? { bannerDataUrl: banner } : {}),
          ...(wallpaper !== undefined ? { wallpaperDataUrl: wallpaper } : {}),
        },
      );
      setConfig(saved.construction.draft);
      setAvatar(undefined);
      setBanner(undefined);
      setWallpaper(undefined);
      setNotice(
        action === "draft"
          ? "Draft saved. The live agent is unchanged."
          : "Configuration applied. It will be used on the next request.",
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save construction.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const startDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    item: AgentConstructionConfig["nodes"][number],
  ) => {
    if (
      blocked ||
      event.button !== 0 ||
      (event.target as HTMLElement).closest("button")
    )
      return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelected(item.id);
    setDragging(item.id);
    drag.current = {
      id: item.id,
      startX: event.clientX,
      startY: event.clientY,
      x: item.x,
      y: item.y,
    };
  };
  const previewModel = config.nodes.find((n) => n.kind === "LLM")?.config;
  const bannerUrl = banner === undefined ? storedAppearance?.bannerUrl : banner;
  const wallpaperUrl =
    wallpaper === undefined ? storedAppearance?.wallpaperUrl : wallpaper;
  const chooseBackdrop = async (kind: "banner" | "wallpaper") => {
    setBusy(true);
    setError("");
    try {
      const image = await chat.chooseAgentBackdrop(kind);
      if (image) {
        if (kind === "banner") setBanner(image);
        else {
          setWallpaper(image);
          setAppearance((current) => ({ ...current, wallpaperMode: "image" }));
        }
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not open image.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="agent-studio" aria-label="Agent Construction Studio">
      <header className="studio-heading">
        <div>
          <small>QTERMINAL / AGENT STUDIO</small>
          <h2>Agent Construction</h2>
        </div>
        <span className="studio-badge">RETRO MODE</span>
      </header>
      {bannerUrl && (
        <div className="studio-profile-banner">
          <img src={bannerUrl} alt="Profile banner preview" />
        </div>
      )}
      <section
        className={`studio-identity${bannerUrl ? " has-banner" : ""}`}
        aria-label="Construction identity"
      >
        <AgentAvatar
          agent={{ ...profile, displayName: config.displayName }}
          preview={avatar === undefined ? construction.draftAvatarUrl : avatar}
        />
        <label>
          Name
          <input
            aria-label="Agent name"
            maxLength={120}
            disabled={blocked}
            value={config.displayName}
            onChange={(e) => update({ displayName: e.target.value })}
          />
        </label>
        <label className="studio-description">
          Description
          <input
            aria-label="Agent description"
            maxLength={240}
            disabled={blocked}
            value={config.description}
            onChange={(e) => update({ description: e.target.value })}
          />
        </label>
        <div className="studio-pfp">
          <button
            disabled={blocked}
            onClick={async () => {
              setBusy(true);
              try {
                const image = await chat.chooseAgentAvatar();
                if (image) setAvatar(image);
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : "Cannot load image.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Upload / Change PFP
          </button>
          <button disabled={blocked} onClick={() => setAvatar(null)}>
            Remove PFP
          </button>
          <small>PNG, JPG, WebP · 5 MB max</small>
        </div>
      </section>
      <details className="studio-appearance">
        <summary>Profile banner & chat appearance</summary>
        <div className="studio-appearance-controls">
          <section>
            <h3>Profile banner</h3>
            <p>
              Shown on the profile and chat header. Images stay on this device.
            </p>
            <button
              disabled={blocked}
              onClick={() => void chooseBackdrop("banner")}
            >
              Upload / Change banner
            </button>
            <button
              disabled={blocked || !bannerUrl}
              onClick={() => setBanner(null)}
            >
              Remove banner
            </button>
            <small>PNG, JPG, WebP · up to 5 MB · cropped to 1600 × 480</small>
          </section>
          <section>
            <h3>Chat wallpaper</h3>
            <label>
              Background
              <select
                aria-label="Chat background"
                disabled={blocked}
                value={appearance.wallpaperMode}
                onChange={(event) =>
                  setAppearance((current) => ({
                    ...current,
                    wallpaperMode: event.target
                      .value as AgentAppearanceOptions["wallpaperMode"],
                  }))
                }
              >
                <option value="none">Plain dark</option>
                <option value="dots">Soft dots</option>
                <option value="image" disabled={!wallpaperUrl}>
                  Custom image
                </option>
              </select>
            </label>
            <button
              disabled={blocked}
              onClick={() => void chooseBackdrop("wallpaper")}
            >
              Upload / Change wallpaper
            </button>
            <button
              disabled={blocked || !wallpaperUrl}
              onClick={() => {
                setWallpaper(null);
                setAppearance((current) => ({
                  ...current,
                  wallpaperMode: "none",
                }));
              }}
            >
              Remove wallpaper
            </button>
            <label>
              Wallpaper dimming: {appearance.dim}%
              <input
                aria-label="Wallpaper dimming"
                type="range"
                min={0}
                max={90}
                disabled={blocked}
                value={appearance.dim}
                onChange={(event) =>
                  setAppearance((current) => ({
                    ...current,
                    dim: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label>
              Message text size
              <select
                aria-label="Message text size"
                disabled={blocked}
                value={appearance.fontSize}
                onChange={(event) =>
                  setAppearance((current) => ({
                    ...current,
                    fontSize: Number(
                      event.target.value,
                    ) as AgentAppearanceOptions["fontSize"],
                  }))
                }
              >
                {[14, 15, 16, 18].map((size) => (
                  <option key={size} value={size}>
                    {size} px
                  </option>
                ))}
              </select>
            </label>
          </section>
        </div>
        <div
          className="studio-chat-preview"
          aria-label="Chat appearance preview"
          style={wallpaperStyle({
            ...storedAppearance!,
            ...appearance,
            wallpaperUrl: wallpaperUrl ?? null,
          })}
        >
          <div>
            <strong>Research summary</strong>
            <p>
              Readable messages with bold highlights, lists and clear spacing.
            </p>
          </div>
          <div className="preview-user">Looks comfortable.</div>
        </div>
        <p>
          Save draft keeps these changes private to the editor. Save & apply
          updates this agent&apos;s profile and chats.
        </p>
      </details>
      <div className="studio-layout">
        <aside className="studio-library" aria-label="Bubble Node Library">
          <h3>Node library</h3>
          <p>Drag onto the canvas or use Add.</p>
          {kinds.map((kind) => (
            <button
              key={kind}
              draggable={!blocked && !config.nodes.some((n) => n.kind === kind)}
              onDragStart={(e) =>
                e.dataTransfer.setData("application/qterminal-agent-node", kind)
              }
              disabled={blocked || config.nodes.some((n) => n.kind === kind)}
              onClick={() => add(kind)}
            >
              <span aria-hidden="true">{marks[kind]}</span> Add {kind}
            </button>
          ))}
          <small>
            One node per category. Arrows move selected nodes; Delete removes
            them. Use output/input handles to connect.
          </small>
        </aside>
        <div
          className="studio-canvas-viewport"
          aria-label="Construction canvas viewport"
        >
          <div
            ref={canvas}
            className="studio-canvas"
            aria-label="Agent construction canvas"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setConnecting(null);
                setWirePoint(null);
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const kind = e.dataTransfer.getData(
                "application/qterminal-agent-node",
              ) as AgentNodeKind;
              if (kinds.includes(kind))
                add(kind, localPoint(e.clientX - 60, e.clientY - 60));
            }}
          >
            <svg
              className="studio-connections"
              width={1000}
              height={640}
              aria-label="Node connections"
            >
              {config.edges.map((edge) => {
                const from = config.nodes.find((n) => n.id === edge.from),
                  to = config.nodes.find((n) => n.id === edge.to);
                if (!from || !to) return null;
                return (
                  <path
                    key={edge.from + edge.to}
                    d={`M ${from.x + 120} ${from.y + 60} C ${from.x + 180} ${from.y + 60}, ${to.x - 60} ${to.y + 60}, ${to.x} ${to.y + 60}`}
                  />
                );
              })}
              {connecting &&
                wirePoint &&
                (() => {
                  const from = config.nodes.find((n) => n.id === connecting);
                  return from ? (
                    <path
                      className="studio-pending-wire"
                      d={`M ${from.x + 120} ${from.y + 60} L ${wirePoint.x} ${wirePoint.y}`}
                    />
                  ) : null;
                })()}
            </svg>
            {config.nodes.map((item) => (
              <div
                key={item.id}
                className={`studio-node studio-${item.kind.toLowerCase()}${selected === item.id ? " selected" : ""}${dragging === item.id ? " dragging" : ""}`}
                data-node-id={item.id}
                role="group"
                aria-label={`${item.kind} node`}
                tabIndex={0}
                style={{ left: item.x, top: item.y }}
                onFocus={() => setSelected(item.id)}
                onPointerDown={(e) => startDrag(e, item)}
                onPointerMove={(e) => {
                  if (drag.current?.id === item.id)
                    move(
                      item.id,
                      drag.current.x + e.clientX - drag.current.startX,
                      drag.current.y + e.clientY - drag.current.startY,
                    );
                }}
                onPointerUp={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId))
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  drag.current = null;
                  setDragging(null);
                }}
                onPointerCancel={() => {
                  drag.current = null;
                  setDragging(null);
                }}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget || blocked) return;
                  if (e.key.startsWith("Arrow")) {
                    e.preventDefault();
                    move(
                      item.id,
                      item.x +
                        (e.key === "ArrowRight"
                          ? 16
                          : e.key === "ArrowLeft"
                            ? -16
                            : 0),
                      item.y +
                        (e.key === "ArrowDown"
                          ? 16
                          : e.key === "ArrowUp"
                            ? -16
                            : 0),
                    );
                  }
                  if (e.key === "Delete") {
                    e.preventDefault();
                    update({
                      nodes: config.nodes.filter((n) => n.id !== item.id),
                      edges: config.edges.filter(
                        (edge) => edge.from !== item.id && edge.to !== item.id,
                      ),
                    });
                    setSelected(null);
                  }
                }}
              >
                <div className="studio-bubble">
                  <span aria-hidden="true">{marks[item.kind]}</span>
                  <strong>{item.kind}</strong>
                  <small>
                    {item.config.contextFile
                      ? item.config.contextFile.relativePath
                      : item.config.contextBox
                        ? (chat.contextBoxes.find(
                            (box) => box.id === item.config.contextBox?.boxId,
                          )?.name ?? item.config.contextBox.boxName)
                        : item.kind === "LLM"
                          ? item.config.modelId || "Shared model"
                          : item.kind === "Skill"
                            ? item.config.skillId
                              ? "Configured"
                              : "Not configured"
                            : (item.config.mode ?? "Preferences")}
                  </small>
                </div>
                {item.kind !== "Context" && (
                  <button
                    className="studio-port studio-input"
                    aria-label={`Connect to ${item.kind}`}
                    disabled={blocked || !connecting}
                    onClick={() => {
                      if (connecting) connect(connecting, item.id);
                    }}
                    data-input-node={item.id}
                  />
                )}
                {item.kind !== "Output" && (
                  <button
                    className="studio-port studio-output"
                    aria-label={`Connect from ${item.kind}`}
                    disabled={blocked}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setConnecting(item.id);
                      setWirePoint(localPoint(e.clientX, e.clientY));
                    }}
                    onPointerMove={(e) => {
                      if (e.currentTarget.hasPointerCapture(e.pointerId))
                        setWirePoint(localPoint(e.clientX, e.clientY));
                    }}
                    onPointerUp={(e) => {
                      if (e.currentTarget.hasPointerCapture(e.pointerId))
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      const target = document
                        .elementFromPoint(e.clientX, e.clientY)
                        ?.closest<HTMLElement>("[data-input-node]");
                      if (target?.dataset.inputNode)
                        connect(item.id, target.dataset.inputNode);
                      else setWirePoint(null);
                    }}
                    onClick={(event) => {
                      if (event.detail !== 0) return;
                      setConnecting(item.id);
                      setNotice(
                        "Choose an input handle, or drag this handle onto an input.",
                      );
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
        <aside className="studio-inspector" aria-label="Selected Node Settings">
          <h3>{node ? `${node.kind} settings` : "Personality & behavior"}</h3>
          {node ? (
            <>
              <p>{explanations[node.kind]}</p>
              {node.kind !== "LLM" && (
                <ConstructionSourcePicker
                  key={node.id}
                  node={node}
                  chat={chat}
                  blocked={blocked}
                  onConfig={(config) => updateNode(node.id, { config })}
                  onBusy={setBusy}
                  onError={setError}
                  onNotice={setNotice}
                />
              )}
              {node.kind === "Context" && (
                <p>
                  Current chat:{" "}
                  {chat.conversation?.contextFile?.relativePath ??
                    chat.contextBoxes.find(
                      (box) => box.id === chat.conversation?.contextBoxId,
                    )?.name ??
                    "No bound chat"}{" "}
                  · {chat.context?.sources.length ?? 0} sources
                </p>
              )}
              {node.kind === "Knowledge" &&
                profile.availableSkills.includes("knowledge-consolidation") && (
                  <label>
                    Consolidation preview token budget
                    <input
                      aria-label="Knowledge preview token budget"
                      type="number"
                      min={64}
                      max={8000}
                      disabled={blocked}
                      value={node.config.maxTokens ?? 1500}
                      onChange={(event) =>
                        updateNode(node.id, {
                          config: {
                            ...node.config,
                            maxTokens: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </label>
                )}
              {["Personality", "Workflow", "Output"].includes(node.kind) && (
                <label>
                  Node preferences
                  <textarea
                    aria-label={`${node.kind} preferences`}
                    value={node.config.instructions ?? ""}
                    maxLength={1200}
                    disabled={blocked}
                    onChange={(e) =>
                      updateNode(node.id, {
                        config: {
                          ...node.config,
                          instructions: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              )}
              {node.kind === "LLM" && (
                <label>
                  Provider / model
                  <select
                    aria-label="Agent model"
                    disabled={blocked}
                    value={
                      node.config.providerId && node.config.modelId
                        ? node.config.providerId + "/" + node.config.modelId
                        : ""
                    }
                    onChange={(e) => {
                      const model = chat.registry?.models.find(
                        (m) =>
                          m.providerId + "/" + m.modelId === e.target.value,
                      );
                      updateNode(node.id, {
                        config: model
                          ? {
                              providerId: model.providerId,
                              modelId: model.modelId,
                            }
                          : {},
                      });
                    }}
                  >
                    <option value="">Inherit shared Settings</option>
                    {chat.registry?.models.map((model) => (
                      <option
                        key={model.providerId + model.modelId}
                        value={model.providerId + "/" + model.modelId}
                      >
                        {model.providerId} / {model.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {node.kind === "Skill" && (
                <label>
                  Registered capability
                  <select
                    aria-label="Agent skill"
                    disabled={blocked}
                    value={node.config.skillId ?? ""}
                    onChange={(e) =>
                      updateNode(node.id, {
                        config: e.target.value
                          ? { skillId: "knowledge-consolidation" }
                          : {},
                      })
                    }
                  >
                    <option value="">Not configured</option>
                    {profile.availableSkills.map((skill) => (
                      <option key={skill} value={skill}>
                        {skill} (reviewed proposals)
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <h4>Connections</h4>
              {config.edges
                .filter((edge) => edge.from === node.id || edge.to === node.id)
                .map((edge) => (
                  <button
                    key={edge.from + edge.to}
                    disabled={blocked}
                    onClick={() =>
                      update({
                        edges: config.edges.filter((item) => item !== edge),
                      })
                    }
                  >
                    Remove {edge.from} → {edge.to}
                  </button>
                ))}
              <button
                disabled={blocked}
                onClick={() => {
                  update({
                    nodes: config.nodes.filter((n) => n.id !== node.id),
                    edges: config.edges.filter(
                      (e) => e.from !== node.id && e.to !== node.id,
                    ),
                  });
                  setSelected(null);
                }}
              >
                Delete {node.kind}
              </button>
              <button onClick={() => setSelected(null)}>
                Edit personality & behavior
              </button>
            </>
          ) : (
            <>
              <label>
                Personality
                <textarea
                  aria-label="Agent personality"
                  maxLength={2000}
                  disabled={blocked}
                  value={config.personality}
                  onChange={(e) => update({ personality: e.target.value })}
                />
              </label>
              <label>
                Behavior & instructions
                <textarea
                  aria-label="Agent behavior instructions"
                  maxLength={8000}
                  disabled={blocked}
                  value={config.instructions}
                  onChange={(e) => update({ instructions: e.target.value })}
                />
              </label>
              <details>
                <summary>Protected grounding policy</summary>
                <pre>{profile.protectedInstructions}</pre>
              </details>
              <p>
                Personality and preferences cannot grant tools, expand sources
                or replace protected policy.
              </p>
            </>
          )}
        </aside>
      </div>
      <section
        className="studio-preview"
        aria-label="Execution Preview and Logs"
      >
        <div>
          <h3>Execution preview</h3>
          <p>
            {config.nodes.find((node) => node.kind === "Context")?.config
              .contextFile?.relativePath ??
              config.nodes.find((node) => node.kind === "Context")?.config
                .contextBox?.boxName ??
              "Reviewed research source"}{" "}
            →{" "}
            {previewModel?.modelId
              ? `${previewModel.providerId} / ${previewModel.modelId}`
              : "shared provider/model"}{" "}
            → streamed text
          </p>
          <small>
            Reviewed files and boxes guide their configured roles. Knowledge
            sources require confirmation for new chats. No automatic tool
            execution.
          </small>
        </div>
        <details>
          <summary>Saved activity ({construction.log.length})</summary>
          <ol>
            {construction.log
              .slice()
              .reverse()
              .map((event) => (
                <li key={event.revision}>
                  r{event.revision} · {event.action} ·{" "}
                  {new Date(event.at).toLocaleString()}
                </li>
              ))}
          </ol>
          <pre>
            {JSON.stringify(
              chat.runtime.diagnostics ?? {
                status: "No run diagnostics in this session",
              },
              null,
              2,
            )}
          </pre>
        </details>
      </section>
      <footer className="studio-footer">
        {(error || notice) && (
          <div className="studio-feedback">
            {error ? (
              <p className="studio-error" role="alert">
                {error}
              </p>
            ) : (
              <p role="status">{notice}</p>
            )}
          </div>
        )}
        <span>
          {dirty
            ? "Unsaved edits"
            : `Saved draft r${construction.draftRevision}`}{" "}
          ·{" "}
          {construction.activeRevision
            ? `Active r${construction.activeRevision}`
            : "Runtime uses existing profile"}
          {construction.draftRevision !== construction.activeRevision
            ? " · Draft is not active"
            : ""}
        </span>
        <button disabled={blocked || !dirty} onClick={() => void save("draft")}>
          Save draft
        </button>
        <button disabled={blocked} onClick={() => void save("apply")}>
          {busy ? "Working..." : "Save & apply"}
        </button>
      </footer>
    </section>
  );
}
