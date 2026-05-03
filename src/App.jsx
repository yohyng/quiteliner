import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const APP_VERSION = "4.8.1";
const APP_VERSION_LABEL = `Quietliner v${APP_VERSION}`;
const STORAGE_KEY = "quietliner.state.v4";
const MAX_LOGS = 80;

const FONT_OPTIONS = {
  mincho: '"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", serif',
  serif: 'Georgia, "Times New Roman", "Yu Mincho", serif',
  sans: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  gothic: '"Yu Gothic", "Hiragino Kaku Gothic ProN", "Noto Sans JP", Meiryo, sans-serif',
};

const DEFAULT_SETTINGS = {
  theme: "light",
  font: "gothic",
  fontSize: 18,
  bgLight: "#fbfaf7",
  textLight: "#171717",
  bgDark: "#111111",
  textDark: "#eeeeee",
  rootTitle: "All Notes",
};

const DEFAULT_SYNC = {
  gasUrl: "",
  secret: "",
  autoSync: false,
};

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `ql_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function makeNode(text = "") {
  const time = nowIso();
  return {
    id: uid(),
    text,
    favorite: false,
    collapsed: false,
    children: [],
    createdAt: time,
    updatedAt: time,
  };
}

function defaultItems() {
  return [
    makeNode("Quietlinerへようこそ"),
    {
      ...makeNode("Enterで次の項目、Shift+Enterで子要素を作成できます"),
      children: [makeNode("Tab / Shift+Tabで階層を調整"), makeNode("☆でサイドバーに固定")],
    },
  ];
}

function cloneNode(node) {
  return {
    ...node,
    children: Array.isArray(node.children) ? node.children.map(cloneNode) : [],
  };
}

function cloneItems(items) {
  return Array.isArray(items) ? items.map(cloneNode) : [];
}

function findPath(items, id, path = []) {
  for (let i = 0; i < items.length; i += 1) {
    const node = items[i];
    const nextPath = [...path, i];
    if (node.id === id) return nextPath;
    const childPath = findPath(node.children || [], id, nextPath);
    if (childPath) return childPath;
  }
  return null;
}

function getListByParentPath(items, parentPath) {
  let list = items;
  for (const index of parentPath) {
    list = list[index].children;
  }
  return list;
}

function getNodeByPath(items, path) {
  let node = null;
  let list = items;
  for (const index of path) {
    node = list[index];
    list = node.children || [];
  }
  return node;
}

function getNodeById(items, id) {
  if (!id) return null;
  const path = findPath(items, id);
  return path ? getNodeByPath(items, path) : null;
}

function findTrail(items, id) {
  const path = findPath(items, id);
  if (!path) return [];
  const trail = [];
  let list = items;
  for (const index of path) {
    const node = list[index];
    if (!node) break;
    trail.push(node);
    list = node.children || [];
  }
  return trail;
}

function getReadableTitle(node) {
  const text = String(node?.text || "").trim();
  return text || "Untitled";
}

function touchNode(node) {
  node.updatedAt = nowIso();
  return node;
}

function updateNodeText(items, id, text) {
  const root = cloneItems(items);
  const path = findPath(root, id);
  if (!path) return root;
  const node = getNodeByPath(root, path);
  node.text = text;
  touchNode(node);
  return root;
}

function updateNodePatch(items, id, patch) {
  const root = cloneItems(items);
  const path = findPath(root, id);
  if (!path) return root;
  const node = getNodeByPath(root, path);
  Object.assign(node, patch);
  touchNode(node);
  return root;
}

function insertSiblingAfter(items, id, node) {
  const root = cloneItems(items);
  const path = findPath(root, id);
  if (!path) return [...root, node];
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  const list = getListByParentPath(root, parentPath);
  list.splice(index + 1, 0, node);
  return root;
}

function insertChild(items, id, node) {
  const root = cloneItems(items);
  const path = findPath(root, id);
  if (!path) return root;
  const parent = getNodeByPath(root, path);
  parent.collapsed = false;
  parent.children = parent.children || [];
  parent.children.unshift(node);
  touchNode(parent);
  return root;
}

function indentNode(items, id) {
  const root = cloneItems(items);
  const path = findPath(root, id);
  if (!path) return root;
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  if (index <= 0) return root;
  const list = getListByParentPath(root, parentPath);
  const [node] = list.splice(index, 1);
  const previous = list[index - 1];
  previous.children = previous.children || [];
  previous.children.push(node);
  previous.collapsed = false;
  touchNode(previous);
  return root;
}

function outdentNode(items, id) {
  const root = cloneItems(items);
  const path = findPath(root, id);
  if (!path || path.length <= 1) return root;
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  const parentList = getListByParentPath(root, parentPath);
  const [node] = parentList.splice(index, 1);
  const grandParentPath = path.slice(0, -2);
  const parentIndex = path[path.length - 2];
  const grandList = getListByParentPath(root, grandParentPath);
  grandList.splice(parentIndex + 1, 0, node);
  return root;
}

function flattenVisible(items, depth = 0, out = []) {
  items.forEach((node) => {
    out.push({ node, depth });
    if (!node.collapsed && node.children?.length) {
      flattenVisible(node.children, depth + 1, out);
    }
  });
  return out;
}

function collectFavorites(items, out = []) {
  items.forEach((node) => {
    if (node.favorite) out.push(node);
    if (node.children?.length) collectFavorites(node.children, out);
  });
  return out;
}

function countChars(node, drafts = {}) {
  const own = drafts[node.id] ?? node.text ?? "";
  const childCount = (node.children || []).reduce((sum, child) => sum + countChars(child, drafts), 0);
  return own.length + childCount;
}

function applyDraftsToItems(items, drafts) {
  const keys = Object.keys(drafts || {});
  if (!keys.length) return cloneItems(items);
  const root = cloneItems(items);
  keys.forEach((id) => {
    const path = findPath(root, id);
    if (path) {
      const node = getNodeByPath(root, path);
      node.text = drafts[id];
      touchNode(node);
    }
  });
  return root;
}

function deleteNodeSafe(items, id) {
  const root = cloneItems(items);
  const visibleBefore = flattenVisible(root).map(({ node }) => node.id);
  const currentIndex = visibleBefore.indexOf(id);
  const path = findPath(root, id);
  if (!path) return { items: root, focusId: visibleBefore[0] || null };
  const list = getListByParentPath(root, path.slice(0, -1));
  list.splice(path[path.length - 1], 1);
  let focusId = visibleBefore[currentIndex - 1] || visibleBefore[currentIndex + 1] || null;
  if (!root.length) {
    const node = makeNode("");
    root.push(node);
    focusId = node.id;
  }
  if (focusId === id) focusId = flattenVisible(root)[0]?.node.id || null;
  return { items: root, focusId };
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedText({ text, query }) {
  if (!query) return <>{text || "\u00a0"}</>;
  const trimmed = query.trim();
  const safe = escapeRegExp(trimmed);
  if (!safe) return <>{text || "\u00a0"}</>;
  const regex = new RegExp(`(${safe})`, "ig");
  const parts = String(text || "").split(regex);
  const lowerQuery = trimmed.toLowerCase();
  if (!parts.length) return <>{"\u00a0"}</>;
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === lowerQuery ? (
          <mark className="search-mark" key={`${part}-${index}`}>
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part || ""}</span>
        )
      )}
    </>
  );
}

function isImeEvent(event) {
  return Boolean(event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed.items) && parsed.items.length ? parsed.items : defaultItems(),
      version: Number(parsed.version || 1),
      updatedAt: parsed.updatedAt || nowIso(),
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      sync: { ...DEFAULT_SYNC, ...(parsed.sync || {}) },
    };
  } catch {
    return {
      items: defaultItems(),
      version: 1,
      updatedAt: nowIso(),
      settings: DEFAULT_SETTINGS,
      sync: DEFAULT_SYNC,
    };
  }
}

function downloadText(filename, content, type = "application/json") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ensureNodeShape(input, fallbackText = "") {
  const time = nowIso();
  const childrenSource = Array.isArray(input?.children)
    ? input.children
    : Array.isArray(input?.items)
      ? input.items
      : Array.isArray(input?.nodes)
        ? input.nodes
        : [];
  const rawText = input?.text ?? input?.title ?? input?.name ?? input?.content ?? input?.body ?? fallbackText;
  const textValue = typeof rawText === "string" ? rawText : String(rawText ?? "");
  return {
    id: String(input?.id || uid()),
    text: textValue,
    favorite: Boolean(input?.favorite || input?.starred),
    collapsed: Boolean(input?.collapsed),
    children: childrenSource.map((child) => ensureNodeShape(child)),
    createdAt: input?.createdAt || time,
    updatedAt: input?.updatedAt || time,
  };
}

function countNodes(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, node) => sum + 1 + countNodes(node.children || []), 0);
}

function extractImportItems(parsed) {
  if (!parsed || typeof parsed !== "object") throw new Error("JSON object not found");
  const candidates = [
    parsed.items,
    parsed.nodes,
    parsed.outline,
    parsed.data?.items,
    parsed.data?.nodes,
    parsed.payload?.items,
    parsed.payload?.nodes,
    parsed.root?.children,
  ];
  const source = candidates.find((value) => Array.isArray(value));
  if (!source) {
    throw new Error("Importable outline array not found. Supported keys: items, nodes, outline, data.nodes, root.children");
  }
  const normalized = source.map((node) => ensureNodeShape(node)).filter(Boolean);
  if (!normalized.length) throw new Error("No outline blocks found in JSON");
  return normalized;
}

function normalizeImportPayload(parsed) {
  const items = extractImportItems(parsed);
  const importedSettings = parsed.settings || parsed.data?.settings || parsed.payload?.settings || {};
  const rootTitle = parsed.rootTitle || importedSettings.rootTitle || parsed.title || parsed.name || null;
  return {
    items,
    settings: importedSettings,
    rootTitle,
    version: Number(parsed.version || parsed.data?.version || parsed.payload?.version || 0),
    updatedAt: parsed.updatedAt || parsed.exportedAt || parsed.data?.updatedAt || parsed.payload?.updatedAt || nowIso(),
  };
}


function makeImportedNode(text, children = [], options = {}) {
  const time = nowIso();
  return {
    id: options.id || uid(),
    text: String(text || ""),
    favorite: Boolean(options.favorite),
    collapsed: Boolean(options.collapsed),
    children,
    createdAt: options.createdAt || time,
    updatedAt: options.updatedAt || time,
  };
}

function safeImportId(prefix, value) {
  return `${prefix}-${String(value || "")}`
    .replace(/[\s/年月日:：.]+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || uid();
}

function parseDiaryTextPayload(rawText) {
  const source = String(rawText || "").replace(/\r\n/g, "\n");
  const datePattern = /^(20\d{2}[\/\-.]\d{1,2}[\/\-.]\d{1,2})\s*$/gm;
  const matches = Array.from(source.matchAll(datePattern));
  if (!matches.length) {
    throw new Error("Diary date lines not found. Use lines like 2026/01/02.");
  }

  const entries = matches.map((match, index) => {
    const date = match[1].replace(/-/g, "/").replace(/\./g, "/");
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : source.length;
    const body = source.slice(start, end).trim();
    return { date, body };
  }).filter((entry) => entry.date && entry.body);

  if (!entries.length) {
    throw new Error("Diary entries were found, but their bodies were empty.");
  }

  const dateNodes = entries.map((entry, index) => {
    const dateId = safeImportId("diary-date", `${entry.date}-${index}`);
    const bodyId = safeImportId("diary-body", `${entry.date}-${index}`);
    return makeImportedNode(entry.date, [makeImportedNode(entry.body, [], { id: bodyId })], { id: dateId });
  });

  return {
    app: "Quietliner",
    schema: "quietliner.diaryText.v1",
    version: Date.now(),
    updatedAt: nowIso(),
    nodes: [makeImportedNode("Diary", dateNodes, { id: "diary-root-import", favorite: true })],
  };
}

function OutlineRow({
  node,
  depth,
  query,
  activeId,
  selected,
  drafts,
  registerInput,
  onFocus,
  onBlur,
  onChange,
  onKeyDown,
  onToggleFavorite,
  onToggleCollapse,
  onZoom,
  onBeginSelect,
  onEnterSelect,
}) {
  const textareaRef = useRef(null);
  const value = drafts[node.id] ?? node.text ?? "";
  const hasQuery = query.trim().length > 0;
  const isActive = activeId === node.id;
  const chars = countChars(node, drafts);
  const hasChildren = Boolean(node.children?.length);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(28, el.scrollHeight)}px`;
  }, [value, activeId]);

  return (
    <div
      className="outline-row"
      data-active={isActive ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      style={{ "--depth": depth }}
      onPointerEnter={() => onEnterSelect(node.id)}
    >
      <div className="row-gutter">
        <button
          className="select-grip"
          type="button"
          aria-label="Select this row"
          title="Drag to select rows"
          onPointerDown={(event) => onBeginSelect(event, node.id)}
        >
          <span />
        </button>
        <button
          className="zoom-dot-button"
          type="button"
          aria-label="Zoom into this item"
          title="Zoom"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onZoom(node.id)}
        >
          <span />
        </button>
        <button
          className="collapse-button"
          type="button"
          aria-label={node.collapsed ? "Expand" : "Collapse"}
          title={hasChildren ? (node.collapsed ? "Expand" : "Collapse") : "No children"}
          disabled={!hasChildren}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onToggleCollapse(node.id)}
        >
          {hasChildren ? (node.collapsed ? "›" : "⌄") : ""}
        </button>
      </div>

      <div className={`text-shell ${hasQuery ? "has-query" : ""}`}>
        {hasQuery && (
          <div className="highlight-mirror" aria-hidden="true">
            <HighlightedText text={value} query={query} />
          </div>
        )}
        <textarea
          ref={(el) => {
            textareaRef.current = el;
            registerInput(node.id, el);
          }}
          className="outline-input"
          rows={1}
          value={value}
          placeholder="Write something..."
          spellCheck={false}
          onFocus={() => onFocus(node.id, node.text ?? "")}
          onBlur={() => onBlur(node.id)}
          onChange={(event) => onChange(node.id, event.target.value)}
          onKeyDown={(event) => onKeyDown(event, node)}
        />
      </div>

      <div className="row-actions">
        <span className="char-count" title="このブロック配下の文字数">
          {chars}
        </span>
        <button
          className="favorite-button"
          type="button"
          aria-label={node.favorite ? "Unfavorite" : "Favorite"}
          title={node.favorite ? "Unfavorite" : "Favorite"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onToggleFavorite(node.id)}
        >
          {node.favorite ? "★" : "☆"}
        </button>
      </div>
    </div>
  );
}

function ZoomTitleEditor({
  node,
  query,
  activeId,
  drafts,
  registerInput,
  onFocus,
  onBlur,
  onChange,
  onKeyDown,
  onToggleFavorite,
}) {
  const textareaRef = useRef(null);
  const value = drafts[node.id] ?? node.text ?? "";
  const hasQuery = query.trim().length > 0;
  const isActive = activeId === node.id;
  const chars = countChars(node, drafts);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(40, el.scrollHeight)}px`;
  }, [value, activeId]);

  return (
    <div className="zoom-title-editor" data-active={isActive ? "true" : "false"}>
      <div className={`zoom-title-shell ${hasQuery ? "has-query" : ""}`}>
        {hasQuery && (
          <div className="zoom-title-mirror" aria-hidden="true">
            <HighlightedText text={value} query={query} />
          </div>
        )}
        <textarea
          ref={(el) => {
            textareaRef.current = el;
            registerInput(node.id, el);
          }}
          className="zoom-title-input"
          rows={1}
          value={value}
          placeholder="Untitled"
          spellCheck={false}
          onFocus={() => onFocus(node.id, node.text ?? "")}
          onBlur={() => onBlur(node.id)}
          onChange={(event) => onChange(node.id, event.target.value)}
          onKeyDown={(event) => onKeyDown(event, node)}
        />
      </div>
      <div className="zoom-title-actions">
        <span className="char-count" title="このZoom配下の文字数">{chars}</span>
        <button
          className="favorite-button zoom-title-favorite"
          type="button"
          aria-label={node.favorite ? "Unfavorite" : "Favorite"}
          title={node.favorite ? "Unfavorite" : "Favorite"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onToggleFavorite(node.id)}
        >
          {node.favorite ? "★" : "☆"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const initial = useMemo(loadState, []);
  const [items, setItems] = useState(initial.items);
  const [version, setVersion] = useState(initial.version);
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);
  const [settings, setSettings] = useState(initial.settings);
  const [sync, setSync] = useState(initial.sync);
  const [drafts, setDrafts] = useState({});
  const [activeId, setActiveId] = useState(null);
  const [query, setQuery] = useState("");
  const [uiHidden, setUiHidden] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("appearance");
  const [syncStatus, setSyncStatus] = useState("local only");
  const [syncLog, setSyncLog] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [zoomRootId, setZoomRootId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState(null);
  const [isSelectingRows, setIsSelectingRows] = useState(false);
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState("");

  const inputRefs = useRef(new Map());
  const autoSyncTimer = useRef(null);

  const zoomRootNode = useMemo(() => getNodeById(items, zoomRootId), [items, zoomRootId]);
  const zoomTrail = useMemo(() => (zoomRootId ? findTrail(items, zoomRootId) : []), [items, zoomRootId]);
  const rootTitle = String(settings.rootTitle || "All Notes").trim() || "All Notes";
  const visibleRows = useMemo(() => {
    if (zoomRootNode) return flattenVisible(zoomRootNode.children || []);
    return flattenVisible(items);
  }, [items, zoomRootNode]);
  const visibleIds = useMemo(() => visibleRows.map(({ node }) => node.id), [visibleRows]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const favorites = useMemo(() => collectFavorites(items), [items]);
  const zoomTitle = zoomRootNode ? getReadableTitle(zoomRootNode) : rootTitle;
  const activeTheme = settings.theme === "dark" ? "dark" : "light";
  const appBackground = activeTheme === "dark" ? settings.bgDark : settings.bgLight;
  const appTextColor = activeTheme === "dark" ? settings.textDark : settings.textLight;
  const fontFamily = FONT_OPTIONS[settings.font] || FONT_OPTIONS.gothic;

  const registerInput = useCallback((id, el) => {
    if (el) inputRefs.current.set(id, el);
    else inputRefs.current.delete(id);
  }, []);

  const focusNode = useCallback((id, select = "end") => {
    if (!id) return;
    const run = () => {
      const el = inputRefs.current.get(id);
      if (!el) return;
      el.focus({ preventScroll: false });
      const end = el.value.length;
      const pos = select === "start" ? 0 : end;
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        // noop
      }
    };
    requestAnimationFrame(run);
    setTimeout(run, 30);
  }, []);

  const appendLog = useCallback((level, message, detail = "") => {
    setSyncLog((prev) => [
      {
        id: uid(),
        time: new Date().toLocaleString(),
        level,
        message,
        detail: typeof detail === "string" ? detail : JSON.stringify(detail, null, 2),
      },
      ...prev,
    ].slice(0, MAX_LOGS));
  }, []);

  const markChanged = useCallback(() => {
    setVersion((prev) => prev + 1);
    setUpdatedAt(nowIso());
    setSyncStatus("local only");
    setDirty(true);
  }, []);

  const mutateItems = useCallback((updater, focusId = null) => {
    setItems((prev) => {
      const next = updater(prev);
      return Array.isArray(next) && next.length ? next : [makeNode("")];
    });
    markChanged();
    if (focusId) focusNode(focusId);
  }, [focusNode, markChanged]);

  const commitDraft = useCallback((id) => {
    setDrafts((prevDrafts) => {
      if (!(id in prevDrafts)) return prevDrafts;
      const nextText = prevDrafts[id];
      setItems((prevItems) => {
        const path = findPath(prevItems, id);
        if (!path) return prevItems;
        const node = getNodeByPath(prevItems, path);
        if ((node.text ?? "") === nextText) return prevItems;
        markChanged();
        return updateNodeText(prevItems, id, nextText);
      });
      const next = { ...prevDrafts };
      delete next[id];
      return next;
    });
  }, [markChanged]);

  const getCurrentItems = useCallback(() => applyDraftsToItems(items, drafts), [items, drafts]);

  useEffect(() => {
    const payload = {
      items: getCurrentItems(),
      version,
      updatedAt,
      settings,
      sync,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [getCurrentItems, version, updatedAt, settings, sync]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") setUiHidden(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (zoomRootId && !findPath(items, zoomRootId)) {
      setZoomRootId(null);
    }
  }, [items, zoomRootId]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => visibleIds.includes(id)));
  }, [visibleIds]);

  useEffect(() => {
    if (!isSelectingRows) return undefined;
    const stop = () => setIsSelectingRows(false);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("blur", stop, { once: true });
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("blur", stop);
    };
  }, [isSelectingRows]);

  useEffect(() => {
    if (!sync.autoSync || !dirty || !sync.gasUrl || !sync.secret) return;
    if (autoSyncTimer.current) clearTimeout(autoSyncTimer.current);
    autoSyncTimer.current = setTimeout(() => {
      pushRemote("auto").catch((error) => appendLog("error", "Auto Sync failed", error.message));
    }, 45000);
    return () => clearTimeout(autoSyncTimer.current);
  }, [dirty, sync.autoSync, sync.gasUrl, sync.secret]);

  const applyTextThen = useCallback((id, text, operation, focusId) => {
    setItems((prev) => {
      const withText = updateNodeText(prev, id, text);
      return operation(withText);
    });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    markChanged();
    if (focusId) focusNode(focusId);
  }, [focusNode, markChanged]);

  const handleFocus = useCallback((id, text) => {
    setActiveId(id);
    setSelectedIds([]);
    setDrafts((prev) => (id in prev ? prev : { ...prev, [id]: text }));
  }, []);

  const handleBlur = useCallback((id) => {
    commitDraft(id);
  }, [commitDraft]);

  const handleChange = useCallback((id, value) => {
    setDrafts((prev) => ({ ...prev, [id]: value }));
    if (!uiHidden && !settingsOpen) setUiHidden(true);
  }, [settingsOpen, uiHidden]);

  const beginRowSelection = useCallback((event, id) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setUiHidden(false);
    setActiveId(null);
    setSelectionAnchorId(id);
    setSelectedIds([id]);
    setIsSelectingRows(true);
  }, []);

  const enterRowSelection = useCallback((id) => {
    if (!isSelectingRows || !selectionAnchorId) return;
    const start = visibleIds.indexOf(selectionAnchorId);
    const end = visibleIds.indexOf(id);
    if (start < 0 || end < 0) return;
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    setSelectedIds(visibleIds.slice(from, to + 1));
  }, [isSelectingRows, selectionAnchorId, visibleIds]);


  const handleKeyDown = useCallback((event, node) => {
    if (isImeEvent(event)) return;
    const currentText = drafts[node.id] ?? node.text ?? "";

    if (event.key === "Enter") {
      event.preventDefault();
      const next = makeNode("");
      if (event.shiftKey) {
        applyTextThen(node.id, currentText, (base) => insertChild(base, node.id, next), next.id);
      } else {
        applyTextThen(node.id, currentText, (base) => insertSiblingAfter(base, node.id, next), next.id);
      }
      setDrafts((prev) => ({ ...prev, [next.id]: "" }));
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      applyTextThen(node.id, currentText, (base) => (event.shiftKey ? outdentNode(base, node.id) : indentNode(base, node.id)), node.id);
      return;
    }

    if (event.key === "Backspace" && currentText.length === 0 && !node.children?.length) {
      event.preventDefault();
      setItems((prev) => {
        const withText = updateNodeText(prev, node.id, currentText);
        const result = deleteNodeSafe(withText, node.id);
        setTimeout(() => focusNode(result.focusId), 0);
        return result.items;
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[node.id];
        return next;
      });
      markChanged();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setUiHidden(false);
      setTimeout(() => document.querySelector(".search-input")?.focus(), 0);
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const flat = visibleRows.map(({ node: rowNode }) => rowNode.id);
      const index = flat.indexOf(node.id);
      const nextId = event.key === "ArrowUp" ? flat[index - 1] : flat[index + 1];
      if (nextId) {
        event.preventDefault();
        commitDraft(node.id);
        focusNode(nextId);
      }
    }
  }, [applyTextThen, commitDraft, drafts, focusNode, markChanged, visibleRows]);

  const handleZoomTitleKeyDown = useCallback((event, node) => {
    if (isImeEvent(event)) return;
    const currentText = drafts[node.id] ?? node.text ?? "";

    if (event.key === "Enter") {
      event.preventDefault();
      const next = makeNode("");
      applyTextThen(node.id, currentText, (base) => insertChild(base, node.id, next), next.id);
      setDrafts((prev) => ({ ...prev, [next.id]: "" }));
      return;
    }

    if (event.key === "ArrowDown") {
      const firstChildId = node.children?.[0]?.id;
      if (firstChildId) {
        event.preventDefault();
        commitDraft(node.id);
        focusNode(firstChildId);
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setUiHidden(false);
      setTimeout(() => document.querySelector(".search-input")?.focus(), 0);
    }
  }, [applyTextThen, commitDraft, drafts, focusNode]);

  const toggleFavorite = useCallback((id) => {
    mutateItems((prev) => {
      const path = findPath(prev, id);
      if (!path) return prev;
      const node = getNodeByPath(prev, path);
      return updateNodePatch(prev, id, { favorite: !node.favorite });
    }, id);
  }, [mutateItems]);

  const toggleCollapse = useCallback((id) => {
    mutateItems((prev) => {
      const path = findPath(prev, id);
      if (!path) return prev;
      const node = getNodeByPath(prev, path);
      return updateNodePatch(prev, id, { collapsed: !node.collapsed });
    }, id);
  }, [mutateItems]);

  const zoomInto = useCallback((id) => {
    if (!id || !findPath(getCurrentItems(), id)) return;
    commitDraft(activeId);
    setZoomRootId(id);
    setUiHidden(false);
    focusNode(id);
  }, [activeId, commitDraft, focusNode, getCurrentItems]);

  const zoomOutAll = useCallback((focusId = null) => {
    setZoomRootId(null);
    setUiHidden(false);
    if (focusId) focusNode(focusId);
  }, [focusNode]);

  const addRootNode = useCallback(() => {
    const node = makeNode("");
    const currentActiveId = activeId;
    const currentDraft = currentActiveId ? drafts[currentActiveId] : undefined;
    mutateItems((prev) => {
      let base = prev;
      if (currentActiveId && currentDraft !== undefined) {
        base = updateNodeText(prev, currentActiveId, currentDraft);
      }
      if (zoomRootId && findPath(base, zoomRootId)) {
        const root = cloneItems(base);
        const path = findPath(root, zoomRootId);
        const parent = getNodeByPath(root, path);
        parent.collapsed = false;
        parent.children = parent.children || [];
        parent.children.push(node);
        touchNode(parent);
        return root;
      }
      return [...base, node];
    }, node.id);
    setDrafts((prev) => ({ ...prev, [node.id]: "" }));
  }, [activeId, drafts, mutateItems, zoomRootId]);

  const buildExportPayload = useCallback(() => ({
    schema: "quietliner.v1",
    exportedAt: nowIso(),
    version,
    updatedAt,
    items: getCurrentItems(),
    settings: {
      theme: settings.theme,
      font: settings.font,
      fontSize: settings.fontSize,
      bgLight: settings.bgLight,
      textLight: settings.textLight,
      bgDark: settings.bgDark,
      textDark: settings.textDark,
      rootTitle: settings.rootTitle,
    },
  }), [getCurrentItems, settings, updatedAt, version]);

  function explainGasFailure(action, response, text, json) {
    if (json?.error) {
      const errorText = String(json.error);
      if (/unknown action/i.test(errorText)) {
        return `GAS Code.gs is older than this app. Paste gas/Code.gs from v4.2 into Apps Script and deploy a new Web App version. Original error: ${errorText}`;
      }
      if (/shared secret/i.test(errorText)) {
        return `${errorText}. Check that Settings → Shared Secret matches GAS Script Properties → QUIETLINER_SECRET.`;
      }
      if (/notion_token|notion_database_id|notion api/i.test(errorText)) {
        return `${errorText}. Check GAS Script Properties and whether the Notion database is shared with the integration.`;
      }
      return errorText;
    }
    if (!response.ok) return `HTTP ${response.status}`;
    const trimmed = String(text || "").trim();
    if (trimmed.startsWith("<")) {
      return "GAS returned HTML. Check that the Web App URL ends with /exec and the deployment is accessible.";
    }
    if (!trimmed) return "Empty response from GAS";
    return `${action} returned an unreadable response`;
  }

  async function postToGas(action, extra = {}) {
    const gasUrl = sync.gasUrl.trim();
    if (!gasUrl) throw new Error("GAS Web App URL is empty");
    if (action !== "ping" && !sync.secret.trim()) {
      throw new Error("Shared Secret is empty. Put the same value as QUIETLINER_SECRET in GAS Script Properties.");
    }

    const body = {
      action,
      secret: sync.secret,
      client: "quietliner-web",
      clientVersion: version,
      clientUpdatedAt: updatedAt,
      device: navigator.userAgent,
      ...extra,
    };

    appendLog("info", `${action} request`, {
      endpoint: gasUrl.replace(/\?.*$/, ""),
      hasSecret: Boolean(sync.secret.trim()),
      localVersion: version,
      localUpdatedAt: updatedAt,
    });

    let response;
    let text = "";
    try {
      response = await fetch(gasUrl, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body),
      });
      text = await response.text();
    } catch (error) {
      const message = "Network/CORS request failed. Check GAS deployment access: Execute as Me, access Anyone, and use the /exec URL.";
      appendLog("error", `${action} failed`, `${message}\n\n${error?.message || error}`);
      throw new Error(message);
    }

    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { ok: false, raw: text };
    }

    if (!response.ok || json.ok === false) {
      const message = explainGasFailure(action, response, text, json);
      appendLog("error", `${action} failed`, {
        message,
        httpStatus: response.status,
        responsePreview: text.slice(0, 1200),
      });
      throw new Error(message);
    }

    appendLog("info", `${action} succeeded / HTTP ${response.status}`, json);
    return json;
  }

  async function runPing() {
    setSyncStatus("syncing...");
    try {
      const result = await postToGas("ping");
      setSyncStatus("synced");
      appendLog("info", "Ping succeeded", result);
    } catch (error) {
      setSyncStatus("error");
      appendLog("error", "Ping failed", error.message);
    }
  }

  async function runDiagnostics() {
    setSyncStatus("syncing...");
    try {
      await postToGas("diagnostics");
      setSyncStatus("synced");
    } catch (error) {
      setSyncStatus("error");
      appendLog("error", "Diagnostics failed", error.message);
    }
  }

  async function runStatus() {
    setSyncStatus("syncing...");
    try {
      await postToGas("status");
      setSyncStatus("synced");
    } catch (error) {
      setSyncStatus("error");
      appendLog("error", "Status failed", error.message);
    }
  }

  async function pushRemote(source = "manual") {
    setSyncStatus("syncing...");
    const payload = buildExportPayload();
    try {
      const result = await postToGas("push", { payload, source });
      setSyncStatus("synced");
      setDirty(false);
      appendLog("info", "Push succeeded", result);
      return result;
    } catch (error) {
      setSyncStatus("error");
      appendLog("error", "Push failed", error.message);
      throw error;
    }
  }

  async function pullRemote() {
    setSyncStatus("syncing...");
    try {
      const result = await postToGas("pull");
      const payload = result.payload;
      if (!payload || !Array.isArray(payload.items)) throw new Error("Remote payload has no items array");
      setItems(payload.items);
      setVersion(Number(payload.version || result.remoteVersion || version + 1));
      setUpdatedAt(payload.updatedAt || result.remoteUpdatedAt || nowIso());
      if (payload.settings) setSettings((prev) => ({ ...prev, ...payload.settings }));
      setDrafts({});
      setDirty(false);
      setSyncStatus("synced");
      appendLog("info", "Pull succeeded", result);
      return result;
    } catch (error) {
      setSyncStatus("error");
      appendLog("error", "Pull failed", error.message);
      throw error;
    }
  }

  async function smartSync() {
    setSyncStatus("syncing...");
    try {
      const status = await postToGas("status");
      const remoteVersion = Number(status.remoteVersion || 0);
      const remoteUpdatedAt = status.remoteUpdatedAt ? Date.parse(status.remoteUpdatedAt) : 0;
      const localUpdatedAt = updatedAt ? Date.parse(updatedAt) : 0;
      if (!remoteVersion) {
        appendLog("info", "Smart Sync: remote is empty, pushing local data");
        return await pushRemote("smart-empty-remote");
      }
      if (remoteVersion > version || remoteUpdatedAt > localUpdatedAt) {
        appendLog("info", "Smart Sync: remote is newer, pulling remote data", status);
        return await pullRemote();
      }
      appendLog("info", "Smart Sync: local is newer or same, pushing local data", status);
      return await pushRemote("smart-local-newer");
    } catch (error) {
      setSyncStatus("error");
      appendLog("error", "Smart Sync failed", error.message);
      throw error;
    }
  }

  const applyImportedJson = useCallback((parsed, sourceName = "JSON") => {
    const normalized = normalizeImportPayload(parsed);
    const nextSettings = {
      ...DEFAULT_SETTINGS,
      ...settings,
      ...(normalized.settings || {}),
    };
    if (normalized.rootTitle) nextSettings.rootTitle = String(normalized.rootTitle);

    setItems(normalized.items);
    setSettings(nextSettings);
    setVersion(Number(normalized.version || version + 1));
    setUpdatedAt(normalized.updatedAt || nowIso());
    setDrafts({});
    setActiveId(null);
    setZoomRootId(null);
    setSelectedIds([]);
    setSelectionAnchorId(null);
    setDirty(true);
    setSyncStatus("local only");
    const totalBlocks = countNodes(normalized.items);
    const message = `${sourceName} import succeeded: ${normalized.items.length} root item(s), ${totalBlocks} block(s)`;
    setImportStatus(message);
    appendLog("info", message, {
      sourceName,
      rootItems: normalized.items.length,
      totalBlocks,
      rootTitle: nextSettings.rootTitle,
    });
  }, [appendLog, settings, version]);

  const importJsonText = useCallback((rawText, sourceName = "pasted data") => {
    const raw = String(rawText || "").trim();
    if (!raw) {
      const message = "Import failed: pasted data is empty";
      setImportStatus(message);
      appendLog("error", "Import failed", message);
      return false;
    }

    try {
      const parsed = JSON.parse(raw);
      applyImportedJson(parsed, sourceName.includes("JSON") ? sourceName : `${sourceName} JSON`);
      return true;
    } catch (jsonError) {
      try {
        const diaryPayload = parseDiaryTextPayload(raw);
        applyImportedJson(diaryPayload, `${sourceName} diary text`);
        return true;
      } catch (diaryError) {
        const looksLikeJson = raw.startsWith("{") || raw.startsWith("[");
        const help = looksLikeJson
          ? "JSONが途中で切れている可能性があります。全文を最初の { から最後の } までコピーするか、元の日記テキストをそのまま貼ってください。"
          : "日付行が見つかりませんでした。2026/01/02 のような日付行で区切った日記テキスト、またはQuietliner JSONを貼ってください。";
        const message = `Import failed: ${jsonError.message}. ${help}`;
        setImportStatus(message);
        appendLog("error", "Import failed", {
          jsonError: jsonError.message,
          diaryTextError: diaryError.message,
          hint: help,
        });
        return false;
      }
    }
  }, [appendLog, applyImportedJson]);

  const importJson = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      importJsonText(String(reader.result || ""), file.name || "selected file");
    };
    reader.onerror = () => {
      const message = `JSON import failed: ${reader.error?.message || "file read error"}`;
      setImportStatus(message);
      appendLog("error", "JSON import failed", message);
    };
    reader.readAsText(file);
  }, [appendLog, importJsonText]);

  const importPastedJson = useCallback(() => {
    const ok = importJsonText(importText, "pasted JSON");
    if (ok) setImportText("");
  }, [importJsonText, importText]);

  const appStyle = {
    "--app-bg": appBackground,
    "--app-text": appTextColor,
    "--app-font": fontFamily,
    "--editor-font-size": `${settings.fontSize}px`,
  };

  return (
    <div className={`app theme-${activeTheme} ${uiHidden ? "ui-hidden" : ""}`} style={appStyle}>
      <div className="top-hot-zone" onMouseEnter={() => setUiHidden(false)} />

      <aside className="sidebar">
        <div className="brand-block">
          <button className="brand-button" type="button" onClick={() => setUiHidden(false)}>
            Quietliner
          </button>
          <div className="app-version-pill" title="Current app version">v{APP_VERSION}</div>
          <div className="sync-pill" data-status={syncStatus}>{syncStatus}</div>
        </div>

        <button className="all-notes" type="button" onClick={() => zoomOutAll(visibleRows[0]?.node.id)}>
          {rootTitle} <span>{flattenVisible(items).length}</span>
        </button>

        <div className="favorite-list">
          <div className="sidebar-label">Favorites</div>
          {favorites.length === 0 && <p className="empty-sidebar">☆を押した項目がここに並びます</p>}
          {favorites.map((favorite) => (
            <button className="favorite-link" type="button" key={favorite.id} onClick={() => zoomInto(favorite.id)}>
              <span className="favorite-title">{favorite.text?.trim() || "Untitled"}</span>
              <span className="favorite-meta">{countChars(favorite, drafts)}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <input
            className="search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
          />
          <div className="topbar-spacer" />
          <div className="top-version" title="Current app version">{APP_VERSION_LABEL}</div>
          <button className="ghost-button sync-top-button" type="button" data-status={syncStatus} onClick={() => smartSync().catch(() => {})}>
            {syncStatus === "syncing..." ? "Syncing…" : "Sync"}
          </button>
          <button className="ghost-button" type="button" onClick={addRootNode}>＋ New</button>
          <button className="ghost-button" type="button" onClick={() => { setSettingsOpen(true); setSettingsTab("appearance"); }}>Settings</button>
        </header>

        <section className="editor-wrap" onMouseDown={() => setUiHidden(false)}>
          <div className="editor-header" data-zoomed={zoomRootNode ? "true" : "false"}>
            <div className="zoom-crumbs" aria-label="Current hierarchy">
              <button type="button" onClick={() => zoomOutAll(zoomRootId)}>{rootTitle}</button>
              {zoomTrail.map((trailNode, index) => {
                const isLast = index === zoomTrail.length - 1;
                return (
                  <React.Fragment key={trailNode.id}>
                    <span>/</span>
                    {isLast ? (
                      <strong>{getReadableTitle(trailNode)}</strong>
                    ) : (
                      <button type="button" onClick={() => zoomInto(trailNode.id)}>{getReadableTitle(trailNode)}</button>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {zoomRootNode ? (
              <ZoomTitleEditor
                node={zoomRootNode}
                query={query}
                activeId={activeId}
                drafts={drafts}
                registerInput={registerInput}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onChange={handleChange}
                onKeyDown={handleZoomTitleKeyDown}
                onToggleFavorite={toggleFavorite}
              />
            ) : (
              <input
                className="root-title-input"
                value={rootTitle}
                aria-label="Root title"
                spellCheck={false}
                onChange={(event) => setSettings((prev) => ({ ...prev, rootTitle: event.target.value }))}
              />
            )}
          </div>

          <div className="outline-list">
            {zoomRootNode && visibleRows.length === 0 && (
              <button className="empty-zoom-row" type="button" onClick={addRootNode}>
                ＋ このタイトルの下に最初のブロックを追加
              </button>
            )}
            {visibleRows.map(({ node, depth }) => (
              <OutlineRow
                key={node.id}
                node={node}
                depth={depth}
                query={query}
                activeId={activeId}
                selected={selectedIdSet.has(node.id)}
                drafts={drafts}
                registerInput={registerInput}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onToggleFavorite={toggleFavorite}
                onToggleCollapse={toggleCollapse}
                onZoom={zoomInto}
                onBeginSelect={beginRowSelection}
                onEnterSelect={enterRowSelection}
              />
            ))}
          </div>
        </section>
      </main>

      {settingsOpen && (
        <div className="settings-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <section className="settings-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <div className="settings-head">
              <div>
                <h2>Settings</h2>
                <p>表示・同期・ショートカット</p>
              </div>
              <button className="close-button" type="button" onClick={() => setSettingsOpen(false)}>×</button>
            </div>

            <div className="tabbar">
              <button type="button" data-active={settingsTab === "appearance"} onClick={() => setSettingsTab("appearance")}>Appearance</button>
              <button type="button" data-active={settingsTab === "sync"} onClick={() => setSettingsTab("sync")}>GAS / Notion Sync</button>
              <button type="button" data-active={settingsTab === "shortcuts"} onClick={() => setSettingsTab("shortcuts")}>Shortcuts</button>
            </div>

            {settingsTab === "appearance" && (
              <div className="settings-grid">
                <label className="wide">
                  Root Title
                  <input value={settings.rootTitle || "All Notes"} onChange={(event) => setSettings((prev) => ({ ...prev, rootTitle: event.target.value }))} />
                </label>
                <label>
                  Theme
                  <select value={settings.theme} onChange={(event) => setSettings((prev) => ({ ...prev, theme: event.target.value }))}>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
                <label>
                  Font
                  <select value={settings.font} onChange={(event) => setSettings((prev) => ({ ...prev, font: event.target.value }))}>
                    <option value="mincho">明朝</option>
                    <option value="serif">セリフ</option>
                    <option value="sans">サンセリフ</option>
                    <option value="gothic">ゴシック</option>
                  </select>
                </label>
                <label className="range-field">
                  Editor Font Size <span>{settings.fontSize}px</span>
                  <input type="range" min="13" max="30" value={settings.fontSize} onChange={(event) => setSettings((prev) => ({ ...prev, fontSize: Number(event.target.value) }))} />
                </label>
                <label>
                  Light Background
                  <input type="color" value={settings.bgLight} onChange={(event) => setSettings((prev) => ({ ...prev, bgLight: event.target.value }))} />
                </label>
                <label>
                  Light Text
                  <input type="color" value={settings.textLight} onChange={(event) => setSettings((prev) => ({ ...prev, textLight: event.target.value }))} />
                </label>
                <label>
                  Dark Background
                  <input type="color" value={settings.bgDark} onChange={(event) => setSettings((prev) => ({ ...prev, bgDark: event.target.value }))} />
                </label>
                <label>
                  Dark Text
                  <input type="color" value={settings.textDark} onChange={(event) => setSettings((prev) => ({ ...prev, textDark: event.target.value }))} />
                </label>
                <div className="settings-actions wide">
                  <button type="button" onClick={() => downloadText(`quietliner-${Date.now()}.json`, JSON.stringify(buildExportPayload(), null, 2))}>Export JSON</button>
                  <label className="file-button">
                    Import JSON File
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={(event) => {
                        importJson(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <div className="import-paste-box wide">
                  <label>
                    Paste Import JSON / Diary Text
                    <textarea
                      value={importText}
                      onChange={(event) => setImportText(event.target.value)}
                      placeholder='Quietliner JSON、または 2026/01/02 のような日付行で区切った日記テキストをそのまま貼れます。'
                    />
                  </label>
                  <div className="settings-actions">
                    <button type="button" onClick={importPastedJson} disabled={!importText.trim()}>Import Pasted Data</button>
                    <button type="button" onClick={() => setImportText("")} disabled={!importText}>Clear Paste</button>
                  </div>
                  {importStatus ? <p className="import-status">{importStatus}</p> : null}
                </div>
              </div>
            )}

            {settingsTab === "sync" && (
              <div className="sync-panel">
                <div className="settings-version-card">
                  <strong>Current App Version</strong>
                  <span>{APP_VERSION_LABEL}</span>
                </div>
                <label>
                  GAS Web App URL
                  <input value={sync.gasUrl} onChange={(event) => setSync((prev) => ({ ...prev, gasUrl: event.target.value }))} placeholder="https://script.google.com/macros/s/.../exec" />
                </label>
                <label>
                  Shared Secret
                  <input type="password" value={sync.secret} onChange={(event) => setSync((prev) => ({ ...prev, secret: event.target.value }))} placeholder="QUIETLINER_SECRETと同じ値" />
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={sync.autoSync} onChange={(event) => setSync((prev) => ({ ...prev, autoSync: event.target.checked }))} />
                  Auto Sync ON/OFF
                </label>
                <p className="sync-hint">まず Ping → Diagnostics → Status の順に確認してください。Status が失敗する場合は、Notion Token / Database ID / Shared Secret / Web App URL のどこかで止まっています。</p>

                <div className="sync-state-card">
                  <span>Status</span>
                  <strong>{syncStatus}</strong>
                  <small>Local v{version} / {new Date(updatedAt).toLocaleString()}</small>
                </div>

                <div className="sync-buttons">
                  <button type="button" onClick={runPing}>Ping</button>
                  <button type="button" onClick={runDiagnostics}>Diagnostics</button>
                  <button type="button" onClick={runStatus}>Status</button>
                  <button type="button" onClick={() => pushRemote().catch(() => {})}>Push</button>
                  <button type="button" onClick={() => pullRemote().catch(() => {})}>Pull</button>
                  <button type="button" onClick={() => smartSync().catch(() => {})}>Smart Sync</button>
                  <button type="button" onClick={() => setSyncLog([])}>Clear Log</button>
                </div>

                <div className="debug-log">
                  <div className="debug-head">Debug Log</div>
                  {syncLog.length === 0 && <p className="empty-log">まだログはありません</p>}
                  {syncLog.map((log) => (
                    <details key={log.id} className={`log-line ${log.level}`}>
                      <summary>{log.time} · {log.message}</summary>
                      {log.detail && <pre>{log.detail}</pre>}
                    </details>
                  ))}
                </div>
              </div>
            )}

            {settingsTab === "shortcuts" && (
              <div className="shortcut-list">
                <div><kbd>Enter</kbd><span>次の項目</span></div>
                <div><kbd>Shift</kbd> + <kbd>Enter</kbd><span>子要素</span></div>
                <div><kbd>Tab</kbd><span>インデント</span></div>
                <div><kbd>Shift</kbd> + <kbd>Tab</kbd><span>アウトデント</span></div>
                <div><kbd>○</kbd><span>Zoom</span></div>
                <div><kbd>☆</kbd><span>お気に入り</span></div>
                <div><kbd>Esc</kbd><span>UI表示</span></div>
                <div><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>K</kbd><span>検索</span></div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
