import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const APP_VERSION = "5.7.4";
const APP_VERSION_LABEL = `Quietliner v${APP_VERSION}`;
const STORAGE_KEY = "quietliner.state.v4";
const DEVICE_KEY = "quietliner.device.v1";
const MAX_LOGS = 80;

const appStateRef = { typewriterMode: false, typewriterAnchor: 0.72 };

// --- Typewriter mode caret measurement -------------------------------------
// Mirror the textarea into a hidden div to find the viewport-Y of the caret's
// visual line, so scrolling can lock the *line being typed* (not the block top)
// at a fixed anchor — even inside multi-line wrapped blocks.
const CARET_MIRROR_PROPS = [
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant", "fontStretch",
  "lineHeight", "letterSpacing", "textAlign", "textIndent", "textTransform",
  "wordSpacing", "wordBreak", "tabSize",
];

let _caretMirror = null;

function getCaretLineViewportTop(el) {
  if (!el || typeof window === "undefined" || typeof document === "undefined") return null;
  if (typeof el.selectionStart !== "number") return null;
  const computed = window.getComputedStyle(el);

  if (!_caretMirror) {
    _caretMirror = document.createElement("div");
    _caretMirror.setAttribute("aria-hidden", "true");
    document.body.appendChild(_caretMirror);
  }
  const div = _caretMirror;
  const style = div.style;
  style.position = "absolute";
  style.top = "0";
  style.left = "-9999px";
  style.visibility = "hidden";
  style.pointerEvents = "none";
  style.whiteSpace = "pre-wrap";
  style.overflowWrap = "anywhere";
  style.boxSizing = "content-box";
  style.height = "auto";
  for (const prop of CARET_MIRROR_PROPS) {
    try { style[prop] = computed[prop]; } catch { /* noop */ }
  }
  // content-box width = textarea inner content width (clientWidth minus h-padding)
  const padL = parseFloat(computed.paddingLeft) || 0;
  const padR = parseFloat(computed.paddingRight) || 0;
  style.width = `${Math.max(0, el.clientWidth - padL - padR)}px`;

  const caretIndex = el.selectionStart;
  div.textContent = el.value.slice(0, caretIndex);
  const marker = document.createElement("span");
  marker.textContent = el.value.slice(caretIndex) || ".";
  div.appendChild(marker);

  const caretTopRelative = marker.offsetTop + (parseFloat(computed.borderTopWidth) || 0);
  div.removeChild(marker);
  div.textContent = "";

  const rect = el.getBoundingClientRect();
  return rect.top - el.scrollTop + caretTopRelative;
}

function repositionCaretTypewriter(el) {
  if (!el || typeof window === "undefined") return;
  // Don't fight an active text selection (e.g. drag-select).
  if (el.selectionStart !== el.selectionEnd) return;
  const caretTop = getCaretLineViewportTop(el);
  if (caretTop == null) return;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  if (!vh) return;
  const anchor = vh * (appStateRef.typewriterAnchor || 0.72);
  const delta = caretTop - anchor;
  if (Math.abs(delta) > 1.5) {
    window.scrollBy({ top: delta, behavior: "auto" });
  }
}

// --- Caret line navigation -------------------------------------------------
// A second hidden mirror (padding/border stripped, content coordinates only)
// used to detect whether the caret sits on the first/last visual line of a
// wrapped block, and to find the index closest to a target x on a given line —
// so ↑/↓ can move *within* a multi-line block and only cross to a neighbouring
// block at the top/bottom edge, preserving the horizontal column.
const NAV_MIRROR_PROPS = [
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant", "fontStretch",
  "lineHeight", "letterSpacing", "textAlign", "textIndent", "textTransform",
  "wordSpacing", "wordBreak", "tabSize",
];
let _navMirror = null;

function setupNavMirror(el) {
  const cs = window.getComputedStyle(el);
  if (!_navMirror) {
    _navMirror = document.createElement("div");
    _navMirror.setAttribute("aria-hidden", "true");
    document.body.appendChild(_navMirror);
  }
  const div = _navMirror;
  const s = div.style;
  s.position = "absolute";
  s.top = "0";
  s.left = "-9999px";
  s.visibility = "hidden";
  s.pointerEvents = "none";
  s.whiteSpace = "pre-wrap";
  s.overflowWrap = "anywhere";
  s.boxSizing = "content-box";
  s.padding = "0";
  s.border = "0";
  s.height = "auto";
  for (const prop of NAV_MIRROR_PROPS) {
    try { s[prop] = cs[prop]; } catch { /* noop */ }
  }
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  s.width = `${Math.max(0, el.clientWidth - padL - padR)}px`;
  const lineHeight = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 16) * 1.4;
  return { div, lineHeight };
}

function measureNavIndex(div, value, index) {
  div.textContent = value.slice(0, index);
  const marker = document.createElement("span");
  marker.textContent = "​";
  div.appendChild(marker);
  const top = marker.offsetTop;
  const left = marker.offsetLeft;
  div.removeChild(marker);
  return { top, left };
}

function getCaretNav(el) {
  if (!el || typeof window === "undefined" || typeof el.selectionStart !== "number") return null;
  const { div, lineHeight } = setupNavMirror(el);
  const value = el.value;
  const { top, left } = measureNavIndex(div, value, el.selectionStart);
  div.textContent = value;
  const totalHeight = div.scrollHeight;
  div.textContent = "";
  return {
    top,
    left,
    lineHeight,
    totalHeight,
    isFirstLine: top < lineHeight * 0.75,
    isLastLine: top + lineHeight >= totalHeight - 2,
  };
}

function caretIndexForX(el, line, x) {
  if (!el || typeof window === "undefined") return 0;
  const value = el.value;
  const len = value.length;
  if (len === 0) return 0;
  if (len > 600) return line === "first" ? 0 : len; // avoid O(n) reflow storms
  const { div, lineHeight } = setupNavMirror(el);
  div.textContent = value;
  const totalHeight = div.scrollHeight;
  div.textContent = "";
  const targetTop = line === "first" ? 0 : Math.max(0, totalHeight - lineHeight);
  let best = line === "first" ? 0 : len;
  let bestDx = Infinity;
  for (let i = 0; i <= len; i += 1) {
    const { top, left } = measureNavIndex(div, value, i);
    if (Math.abs(top - targetTop) <= lineHeight * 0.6) {
      const dx = Math.abs(left - x);
      if (dx < bestDx) { bestDx = dx; best = i; }
    }
  }
  div.textContent = "";
  return best;
}

const FONT_OPTIONS = {
  mincho: '"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", serif',
  serif: 'Georgia, "Times New Roman", "Yu Mincho", serif',
  sans: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  gothic: '"Yu Gothic", "Hiragino Kaku Gothic ProN", "Noto Sans JP", Meiryo, sans-serif',
};

const TEXT_ALIGNMENT_OPTIONS = {
  left: { label: "Left", align: "left", last: "auto" },
  center: { label: "Center", align: "center", last: "auto" },
  right: { label: "Right", align: "right", last: "auto" },
  justify: { label: "Justify", align: "justify", last: "left" },
  justifyAll: { label: "Justify All", align: "justify", last: "justify" },
};

const BACKGROUND_STYLE_OPTIONS = {
  solid: { label: "Solid" },
  mist: { label: "Long Mist" },
  stone: { label: "Long Stone" },
  cloud: { label: "Long Cloud" },
  fog: { label: "Long Fog" },
};

const BACKGROUND_NOISE_OPTIONS = {
  none: { label: "None" },
  gaussian: { label: "Soft Gaussian" },
  particle: { label: "Fine Particle" },
  mixed: { label: "Mixed Grain" },
};

const DEFAULT_SETTINGS = {
  theme: "light",
  font: "gothic",
  fontSize: 18,
  lineHeight: 1.55,
  letterSpacing: 0.01,
  textAlignment: "left",
  editorWidth: 920,
  sidebarWidth: 252,
  backgroundStyle: "solid",
  backgroundNoise: "mixed",
  bgLight: "#fbfaf7",
  textLight: "#171717",
  bgDark: "#111111",
  textDark: "#eeeeee",
  rootTitle: "All Notes",
  typewriterMode: false,
  typewriterAnchor: 0.72,
};

const DEFAULT_SYNC = {
  supabaseUrl: "",
  supabaseKey: "",
  docId: "main",
  autoSync: false,
};

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `ql_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uid();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return uid();
  }
}

function isLocalTooSmallComparedToRemote(local, remote) {
  const remoteChars = Number(remote?.charCount || 0);
  const localChars = Number(local?.charCount || 0);
  const remoteNodes = Number(remote?.nodeCount || 0);
  const localNodes = Number(local?.nodeCount || 0);
  if (remoteChars > 1000 && localChars < remoteChars * 0.3) return true;
  if (remoteNodes > 20 && localNodes < remoteNodes * 0.3) return true;
  return false;
}

function nowIso() {
  return new Date().toISOString();
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatLocalDate(date = new Date()) {
  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`;
}

function formatLocalDateTime(date = new Date()) {
  return `${formatLocalDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function expandInlineCommands(text) {
  const source = String(text ?? "");
  const today = formatLocalDate();
  const now = formatLocalDateTime();
  return source
    .replace(/(^|\s)(\/today|;today)(?=$|\s)/g, `$1${today}`)
    .replace(/(^|\s)(\/now|;now)(?=$|\s)/g, `$1${now}`);
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
      ...makeNode("Enterで次の項目、Shift+Enterでブロック内改行"),
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

function truncateTitle(text, max = 18) {
  const normalized = String(text || "Untitled").replace(/\s+/g, " ").trim() || "Untitled";
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function hasStoredBody(node) {
  const own = String(node?.text || "");
  const childTextLength = (node?.children || []).reduce((sum, child) => sum + countChars(child), 0);
  return Boolean(own.includes("\n") || own.length > 80 || childTextLength > 40);
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

// Delete a block but keep its children: the children are spliced into the
// block's own position (same parent, same level), so information stored below
// an empty block survives the deletion.
function deleteNodeKeepChildren(items, id) {
  const root = cloneItems(items);
  const visibleBefore = flattenVisible(root).map(({ node }) => node.id);
  const currentIndex = visibleBefore.indexOf(id);
  const path = findPath(root, id);
  if (!path) return { items: root, focusId: visibleBefore[0] || null };
  const list = getListByParentPath(root, path.slice(0, -1));
  const pos = path[path.length - 1];
  const node = list[pos];
  const children = (node.children || []).map(cloneNode);
  list.splice(pos, 1, ...children);
  let focusId = visibleBefore[currentIndex - 1] || children[0]?.id || visibleBefore[currentIndex + 1] || null;
  if (!root.length) {
    const fresh = makeNode("");
    root.push(fresh);
    focusId = fresh.id;
  }
  return { items: root, focusId };
}

// Swap a block with its previous/next sibling (dir = -1 up, +1 down), moving
// the whole subtree. Used for Alt+↑ / Alt+↓ keyboard reordering.
function moveSibling(items, id, dir) {
  const root = cloneItems(items);
  const path = findPath(root, id);
  if (!path) return root;
  const list = getListByParentPath(root, path.slice(0, -1));
  const i = path[path.length - 1];
  const j = dir < 0 ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return root;
  const tmp = list[i];
  list[i] = list[j];
  list[j] = tmp;
  return root;
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

function keepActiveEditorComfortable(el) {
  if (!el || typeof window === "undefined") return;
  if (appStateRef.typewriterMode) {
    window.requestAnimationFrame(() => repositionCaretTypewriter(el));
    return;
  }
  window.requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!viewportHeight) return;

    const bottomComfort = Math.min(420, Math.max(260, viewportHeight * 0.38));
    const topComfort = 110;

    if (rect.bottom > viewportHeight - bottomComfort) {
      const delta = rect.bottom - (viewportHeight - bottomComfort);
      window.scrollBy({ top: Math.min(delta + 96, 560), behavior: "auto" });
      return;
    }

    if (rect.top < topComfort) {
      const delta = rect.top - topComfort;
      window.scrollBy({ top: Math.max(delta - 48, -320), behavior: "auto" });
    }
  });
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
    deletedAt: input?.deletedAt || null,
  };
}

function countNodes(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, node) => sum + 1 + countNodes(node.children || []), 0);
}

function summarizeItems(items) {
  const source = Array.isArray(items) ? items : [];
  const charCount = source.reduce((sum, node) => sum + countChars(node), 0);
  return {
    rootCount: source.length,
    nodeCount: countNodes(source),
    charCount,
    isStarter: isStarterOutline(source),
    isEffectivelyEmpty: isEffectivelyEmptyOutline(source),
  };
}

function isStarterOutline(items) {
  const source = Array.isArray(items) ? items : [];
  const flat = flattenVisible(source).map(({ node }) => String(node.text || "").trim());
  return (
    flat.length <= 3 &&
    flat[0] === "Quietlinerへようこそ" &&
    flat.some((text) => text.includes("Enterで次の項目"))
  );
}

function isEffectivelyEmptyOutline(items) {
  const source = Array.isArray(items) ? items : [];
  if (!source.length) return true;
  if (isStarterOutline(source)) return true;
  return source.every((node) => countChars(node) === 0 && !(node.children || []).length);
}

function newestTimestamp(a, b) {
  const left = Date.parse(a || "") || 0;
  const right = Date.parse(b || "") || 0;
  return left >= right ? a : b;
}

function mergeNodeLists(localList = [], remoteList = []) {
  const result = [];
  const used = new Set();
  const localById = new Map((localList || []).map((node) => [node.id, node]));
  const remoteById = new Map((remoteList || []).map((node) => [node.id, node]));
  const orderedIds = [];

  (remoteList || []).forEach((node) => {
    if (node?.id && !orderedIds.includes(node.id)) orderedIds.push(node.id);
  });
  (localList || []).forEach((node) => {
    if (node?.id && !orderedIds.includes(node.id)) orderedIds.push(node.id);
  });

  orderedIds.forEach((id) => {
    const localNode = localById.get(id);
    const remoteNode = remoteById.get(id);
    if (localNode && remoteNode) {
      result.push(mergeNode(localNode, remoteNode));
    } else if (localNode) {
      result.push(cloneNode(localNode));
    } else if (remoteNode) {
      result.push(cloneNode(remoteNode));
    }
    used.add(id);
  });

  (localList || []).forEach((node) => {
    if (!node?.id || used.has(node.id)) return;
    result.push(cloneNode(node));
  });
  (remoteList || []).forEach((node) => {
    if (!node?.id || used.has(node.id)) return;
    result.push(cloneNode(node));
  });

  return result;
}

function mergeNode(localNode, remoteNode) {
  const localTime = Date.parse(localNode?.updatedAt || "") || 0;
  const remoteTime = Date.parse(remoteNode?.updatedAt || "") || 0;
  const primary = localTime >= remoteTime ? localNode : remoteNode;
  const secondary = primary === localNode ? remoteNode : localNode;
  return {
    ...cloneNode(secondary || {}),
    ...cloneNode(primary || {}),
    id: primary?.id || secondary?.id || uid(),
    text: primary?.text ?? secondary?.text ?? "",
    favorite: Boolean(primary?.favorite || secondary?.favorite),
    collapsed: Boolean(primary?.collapsed),
    createdAt: primary?.createdAt || secondary?.createdAt || nowIso(),
    updatedAt: newestTimestamp(primary?.updatedAt, secondary?.updatedAt) || nowIso(),
    deletedAt: primary?.deletedAt || secondary?.deletedAt || null,
    children: mergeNodeLists(localNode?.children || [], remoteNode?.children || []),
  };
}

function mergePayloads(localPayload, remotePayload) {
  const localItems = Array.isArray(localPayload?.items) ? localPayload.items : [];
  const remoteItems = Array.isArray(remotePayload?.items) ? remotePayload.items : [];
  const mergedItems = mergeNodeLists(localItems, remoteItems);
  const mergedSettings = {
    ...(remotePayload?.settings || {}),
    ...(localPayload?.settings || {}),
  };
  const timestamp = nowIso();
  return {
    ...(remotePayload || {}),
    ...(localPayload || {}),
    schema: "quietliner.v1",
    mergedAt: timestamp,
    version: Math.max(Number(localPayload?.version || 0), Number(remotePayload?.version || 0)) + 1,
    updatedAt: timestamp,
    items: mergedItems.length ? mergedItems : [makeNode("")],
    settings: mergedSettings,
    summary: summarizeItems(mergedItems),
  };
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

function rekeyImportedNode(node) {
  return {
    ...node,
    id: uid(),
    children: Array.isArray(node.children) ? node.children.map(rekeyImportedNode) : [],
  };
}

function appendImportedItems(existingItems, importedItems) {
  const root = cloneItems(existingItems);
  const imports = cloneItems(importedItems).map(rekeyImportedNode);
  imports.forEach((incoming) => {
    const incomingTitle = String(incoming.text || "").trim().toLowerCase();
    const shouldMergeDiary = incomingTitle === "diary" && Array.isArray(incoming.children) && incoming.children.length;
    if (shouldMergeDiary) {
      const existingDiary = root.find((item) => String(item.text || "").trim().toLowerCase() === "diary");
      if (existingDiary) {
        existingDiary.children = existingDiary.children || [];
        existingDiary.children.push(...incoming.children);
        existingDiary.favorite = existingDiary.favorite || incoming.favorite;
        existingDiary.collapsed = false;
        touchNode(existingDiary);
        return;
      }
    }
    root.push(incoming);
  });
  return root.length ? root : [makeNode("")];
}

function removeNodeById(items, id) {
  const root = cloneItems(items);
  const path = findPath(root, id);
  if (!path) return { items: root, node: null };
  const list = getListByParentPath(root, path.slice(0, -1));
  const [node] = list.splice(path[path.length - 1], 1);
  return { items: root, node };
}

function isDescendantPath(sourcePath, targetPath) {
  if (!sourcePath || !targetPath) return false;
  if (targetPath.length <= sourcePath.length) return false;
  return sourcePath.every((value, index) => targetPath[index] === value);
}

function moveNode(items, draggedId, targetId, mode = "after") {
  if (!draggedId || !targetId || draggedId === targetId) return items;
  const original = cloneItems(items);
  const sourcePath = findPath(original, draggedId);
  const targetPath = findPath(original, targetId);
  if (!sourcePath || !targetPath || isDescendantPath(sourcePath, targetPath)) return original;

  const removed = removeNodeById(original, draggedId);
  if (!removed.node) return original;
  const root = removed.items;
  const freshTargetPath = findPath(root, targetId);
  if (!freshTargetPath) return original;

  if (mode === "child") {
    const target = getNodeByPath(root, freshTargetPath);
    target.children = target.children || [];
    target.children.unshift(removed.node);
    target.collapsed = false;
    touchNode(target);
    return root;
  }

  const list = getListByParentPath(root, freshTargetPath.slice(0, -1));
  const targetIndex = freshTargetPath[freshTargetPath.length - 1];
  const insertIndex = mode === "before" ? targetIndex : targetIndex + 1;
  list.splice(insertIndex, 0, removed.node);
  return root;
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
    deletedAt: options.deletedAt || null,
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

function detectIndentUnit(lines) {
  for (const line of lines) {
    const m = line.match(/^(\s+)[-*] /);
    if (m) {
      const spaces = m[1].replace(/\t/g, "    ").length;
      if (spaces > 0) return spaces;
    }
  }
  return 4;
}

function getIndentLevel(indentStr, unit) {
  const spaces = indentStr.replace(/\t/g, "    ").length;
  return Math.round(spaces / unit);
}

function parseNotionToggleText(rawText) {
  const source = String(rawText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = source.split("\n");
  const unit = detectIndentUnit(lines);
  const roots = [];
  const stack = []; // [{ node, level }]

  const pushNode = (node, level) => {
    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
    if (stack.length === 0) {
      roots.push(node);
    } else {
      const parent = stack[stack.length - 1].node;
      parent.children = parent.children || [];
      parent.children.push(node);
    }
    stack.push({ node, level });
  };

  for (const line of lines) {
    // Notion ページリンク [タイトル](URL)
    const linkMatch = line.match(/^(\s*)\[(.+?)\]\(https?:\/\/.+?\)\s*$/);
    if (linkMatch) {
      const level = getIndentLevel(linkMatch[1], unit);
      pushNode(makeImportedNode(linkMatch[2].trim()), level);
      continue;
    }
    // bullet 行
    const bulletMatch = line.match(/^(\s*)[-*] (.*)$/);
    if (bulletMatch) {
      const level = getIndentLevel(bulletMatch[1], unit);
      const content = bulletMatch[2].trim();
      if (!content) continue; // 空bullet はスキップ
      pushNode(makeImportedNode(content), level);
      continue;
    }
    // 非bullet コンテンツ行: スタック最上位ノードにテキストとして追記
    const content = line.trim();
    if (content && stack.length > 0) {
      const top = stack[stack.length - 1].node;
      top.text = top.text ? `${top.text}\n${content}` : content;
    }
  }

  if (!roots.length) throw new Error("Notion toggle format: no bullet lines found");
  return roots;
}

function looksLikeNotionToggle(text) {
  const lines = text.split("\n");
  return lines.filter((l) => /^\s*[-*] \S/.test(l)).length >= 2;
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
  onTextPointerDown,
  onDragStartRow,
  onDragOverRow,
  onDropRow,
  onDragEndRow,
  dragOver,
}) {
  const textareaRef = useRef(null);
  const value = drafts[node.id] ?? node.text ?? "";
  const hasQuery = query.trim().length > 0;
  const isActive = activeId === node.id;
  const chars = countChars(node, drafts);
  const hasChildren = Boolean(node.children?.length);
  const hasBody = hasStoredBody(node);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(28, el.scrollHeight)}px`;
    if (document.activeElement === el) keepActiveEditorComfortable(el);
  }, [value, activeId]);

  return (
    <div
      className="outline-row"
      data-node-id={node.id}
      data-active={isActive ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      data-drag-over={dragOver || ""}
      style={{ "--depth": depth }}
      onPointerEnter={() => onEnterSelect(node.id)}
      onDragOver={(event) => onDragOverRow(event, node.id)}
      onDrop={(event) => onDropRow(event, node.id)}
      onDragEnd={onDragEndRow}
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
          className="drag-grip"
          type="button"
          draggable
          aria-label="Move this row"
          title="Drag to move / Shift-drag onto a row to make it a child"
          onDragStart={(event) => onDragStartRow(event, node.id)}
          onDragEnd={onDragEndRow}
        >
          ⋮
        </button>
        <button
          className={`zoom-dot-button ${hasBody ? "has-body" : ""}`}
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
          onPointerDown={(event) => { if (event.button === 0) onTextPointerDown(node.id, event.clientX, event.clientY); }}
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
    if (document.activeElement === el) keepActiveEditorComfortable(el);
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
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverState, setDragOverState] = useState(null);
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [importMode, setImportMode] = useState("append");
  const [deviceId] = useState(() => getOrCreateDeviceId());
  const [dangerConfirmText, setDangerConfirmText] = useState("");
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [snapshotList, setSnapshotList] = useState([]);
  const [snapshotListStatus, setSnapshotListStatus] = useState("");
  const [lastSyncError, setLastSyncError] = useState("");

  const inputRefs = useRef(new Map());
  const autoSyncTimer = useRef(null);
  const sidebarResizeRef = useRef(null);
  const textDragAnchorRef = useRef(null);
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const isUndoingRef = useRef(false);
  const itemsRef = useRef(items);

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

  useEffect(() => {
    appStateRef.typewriterMode = Boolean(settings.typewriterMode);
    appStateRef.typewriterAnchor = Number(settings.typewriterAnchor) || 0.72;
  }, [settings.typewriterMode, settings.typewriterAnchor]);

  // Typewriter mode: keep the caret's line locked at the anchor on every caret
  // move (typing, arrows, click) via a single selectionchange listener.
  useEffect(() => {
    if (!settings.typewriterMode || typeof document === "undefined") return undefined;
    let rafId = null;
    const run = () => {
      rafId = null;
      const el = document.activeElement;
      if (!el || el.tagName !== "TEXTAREA") return;
      if (!el.classList.contains("outline-input") && !el.classList.contains("zoom-title-input")) return;
      repositionCaretTypewriter(el);
    };
    const schedule = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(run);
    };
    document.addEventListener("selectionchange", schedule);
    window.addEventListener("resize", schedule);
    schedule(); // center immediately when toggled on
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      document.removeEventListener("selectionchange", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [settings.typewriterMode, settings.typewriterAnchor]);

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
      keepActiveEditorComfortable(el);
    };
    requestAnimationFrame(run);
    setTimeout(run, 30);
  }, []);

  const focusNodeAtIndex = useCallback((id, index) => {
    if (!id) return;
    const run = () => {
      const el = inputRefs.current.get(id);
      if (!el) return;
      el.focus({ preventScroll: false });
      const pos = Math.max(0, Math.min(index ?? el.value.length, el.value.length));
      try { el.setSelectionRange(pos, pos); } catch { /* noop */ }
      keepActiveEditorComfortable(el);
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

  const pushHistory = useCallback(() => {
    if (isUndoingRef.current) return;
    const snapshot = JSON.parse(JSON.stringify(itemsRef.current || []));
    const idx = historyIndexRef.current;
    const sliced = historyRef.current.slice(0, idx + 1);
    if (sliced.length && JSON.stringify(sliced[sliced.length - 1]) === JSON.stringify(snapshot)) return;
    sliced.push(snapshot);
    if (sliced.length > 50) sliced.shift();
    historyRef.current = sliced;
    historyIndexRef.current = historyRef.current.length - 1;
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    isUndoingRef.current = true;
    setItems(JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current])));
    markChanged();
    setTimeout(() => { isUndoingRef.current = false; }, 0);
  }, [markChanged]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    isUndoingRef.current = true;
    setItems(JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current])));
    markChanged();
    setTimeout(() => { isUndoingRef.current = false; }, 0);
  }, [markChanged]);

  const mutateItems = useCallback((updater, focusId = null) => {
    pushHistory();
    setItems((prev) => {
      const next = updater(prev);
      return Array.isArray(next) && next.length ? next : [makeNode("")];
    });
    markChanged();
    if (focusId) focusNode(focusId);
  }, [focusNode, markChanged, pushHistory]);

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

  useEffect(() => { itemsRef.current = items; }, [items]);

  // 選択ドラッグ中はブラウザのテキスト選択自動スクロールを抑制
  useEffect(() => {
    document.body.style.userSelect = isSelectingRows ? "none" : "";
    return () => { document.body.style.userSelect = ""; };
  }, [isSelectingRows]);

  useEffect(() => {
    const onKey = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  useEffect(() => {
    const clear = () => { textDragAnchorRef.current = null; };
    window.addEventListener("pointerup", clear);
    return () => window.removeEventListener("pointerup", clear);
  }, []);

  const visibleIdsRef = useRef(visibleIds);
  useEffect(() => { visibleIdsRef.current = visibleIds; }, [visibleIds]);

  const isSelectingRowsRef = useRef(isSelectingRows);
  useEffect(() => { isSelectingRowsRef.current = isSelectingRows; }, [isSelectingRows]);

  const selectionAnchorIdRef = useRef(selectionAnchorId);
  useEffect(() => { selectionAnchorIdRef.current = selectionAnchorId; }, [selectionAnchorId]);

  useEffect(() => {
    const handleMove = (event) => {
      // 選択ドラッグ中: ビューポート端での制御スクロール
      if (isSelectingRowsRef.current) {
        const zone = 72;
        const vy = window.innerHeight;
        if (event.clientY > vy - zone) {
          window.scrollBy({ top: ((event.clientY - (vy - zone)) / zone) * 12, behavior: "instant" });
        } else if (event.clientY < zone) {
          window.scrollBy({ top: -((zone - event.clientY) / zone) * 12, behavior: "instant" });
        }
        // 選択範囲の延伸
        const el = document.elementFromPoint(event.clientX, event.clientY);
        const rowEl = el?.closest("[data-node-id]");
        if (rowEl) {
          const targetId = rowEl.dataset.nodeId;
          const anchorId = selectionAnchorIdRef.current;
          if (targetId && anchorId) {
            const ids = visibleIdsRef.current;
            const start = ids.indexOf(anchorId);
            const end = ids.indexOf(targetId);
            if (start >= 0 && end >= 0) {
              setSelectedIds(ids.slice(Math.min(start, end), Math.max(start, end) + 1));
            }
          }
        }
        return;
      }
      // テキストエリアからのクロスブロックドラッグ検知
      const anchor = textDragAnchorRef.current;
      if (!anchor) return;
      if (!(event.buttons & 1)) { textDragAnchorRef.current = null; return; }
      const dy = Math.abs(event.clientY - anchor.startY);
      const dx = Math.abs(event.clientX - anchor.startX);
      if (dy < 16) return;
      if (dx > dy * 1.5) return;
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const rowEl = el?.closest("[data-node-id]");
      if (!rowEl) return;
      const targetId = rowEl.dataset.nodeId;
      if (!targetId || targetId === anchor.id) return;
      textDragAnchorRef.current = null;
      const ids = visibleIdsRef.current;
      const start = ids.indexOf(anchor.id);
      const end = ids.indexOf(targetId);
      if (start < 0 || end < 0) return;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      setSelectionAnchorId(anchor.id);
      setIsSelectingRows(true);
      setActiveId(null);
      setSelectedIds(ids.slice(Math.min(start, end), Math.max(start, end) + 1));
    };
    window.addEventListener("pointermove", handleMove);
    return () => window.removeEventListener("pointermove", handleMove);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (syncStatus !== "error") setLastSyncError("");
  }, [syncStatus]);

  useEffect(() => {
    if (!sync.autoSync || !dirty || !sync.supabaseUrl || !sync.supabaseKey) return;
    if (autoSyncTimer.current) clearTimeout(autoSyncTimer.current);
    autoSyncTimer.current = setTimeout(() => {
      pushRemote("auto").catch((error) => appendLog("error", "Auto Sync failed", error.message));
    }, 45000);
    return () => clearTimeout(autoSyncTimer.current);
  }, [dirty, sync.autoSync, sync.supabaseUrl, sync.supabaseKey]);

  useEffect(() => {
    document.title = APP_VERSION_LABEL;
  }, []);

  // 起動時サイレント Pull: GAS URL / Secret が設定済みなら一度だけ実行
  const startupPullRef = useRef(false);
  useEffect(() => {
    if (startupPullRef.current) return;
    if (!sync.supabaseUrl.trim() || !sync.supabaseKey.trim()) return;
    startupPullRef.current = true;

    (async () => {
      try {
        await smartSync();
      } catch {
        setSyncStatus("local only");
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyTextThen = useCallback((id, text, operation, focusId) => {
    pushHistory();
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
  }, [focusNode, markChanged, pushHistory]);

  const handleFocus = useCallback((id, text) => {
    setActiveId(id);
    setSelectedIds([]);
    setDrafts((prev) => (id in prev ? prev : { ...prev, [id]: text }));
  }, []);

  const handleBlur = useCallback((id) => {
    commitDraft(id);
  }, [commitDraft]);

  const handleChange = useCallback((id, value) => {
    const nextValue = expandInlineCommands(value);
    setDrafts((prev) => ({ ...prev, [id]: nextValue }));
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

  const getDropMode = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - rect.top;
    if (event.shiftKey || event.clientX - rect.left > rect.width * 0.34) return "child";
    if (y < rect.height * 0.35) return "before";
    if (y > rect.height * 0.65) return "after";
    return "after";
  }, []);

  const handleDragStartRow = useCallback((event, id) => {
    event.stopPropagation();
    setDraggingId(id);
    setDragOverState(null);
    setSelectedIds([id]);
    try {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id);
    } catch {
      // noop
    }
  }, []);

  const handleDragOverRow = useCallback((event, id) => {
    if (!draggingId || draggingId === id) return;
    event.preventDefault();
    const mode = getDropMode(event);
    setDragOverState({ id, mode });
    try {
      event.dataTransfer.dropEffect = "move";
    } catch {
      // noop
    }
  }, [draggingId, getDropMode]);

  const handleDropRow = useCallback((event, id) => {
    if (!draggingId || draggingId === id) return;
    event.preventDefault();
    event.stopPropagation();
    const mode = dragOverState?.id === id ? dragOverState.mode : getDropMode(event);
    mutateItems((prev) => moveNode(prev, draggingId, id, mode), draggingId);
    setDraggingId(null);
    setDragOverState(null);
  }, [dragOverState, draggingId, getDropMode, mutateItems]);

  const handleDragEndRow = useCallback(() => {
    setDraggingId(null);
    setDragOverState(null);
  }, []);


  const handleKeyDown = useCallback((event, node) => {
    if (isImeEvent(event)) return;
    const el = event.target;
    const currentText = drafts[node.id] ?? node.text ?? "";
    const meta = event.ctrlKey || event.metaKey;
    const flat = visibleRows.map(({ node: rowNode }) => rowNode.id);
    const index = flat.indexOf(node.id);

    if (event.key === "Enter") {
      if (event.shiftKey) {
        // Shift+Enter is an in-block line break. Let the textarea handle it naturally.
        return;
      }
      event.preventDefault();
      // Split the block at the caret: text before the caret stays, text after
      // moves into the new sibling block (standard outliner behaviour).
      const caret = typeof el?.selectionStart === "number" ? el.selectionStart : currentText.length;
      const before = currentText.slice(0, caret);
      const after = currentText.slice(caret);
      const next = makeNode(after);
      applyTextThen(node.id, before, (base) => insertSiblingAfter(base, node.id, next));
      setDrafts((prev) => ({ ...prev, [next.id]: after }));
      focusNodeAtIndex(next.id, 0);
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      applyTextThen(node.id, currentText, (base) => (event.shiftKey ? outdentNode(base, node.id) : indentNode(base, node.id)), node.id);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setUiHidden(false);
      setTimeout(() => document.querySelector(".search-input")?.focus(), 0);
      return;
    }

    // Cmd/Ctrl + . : fold / unfold the current block (if it has children).
    if (meta && event.key === ".") {
      if (node.children?.length) {
        event.preventDefault();
        mutateItems((prev) => updateNodePatch(prev, node.id, { collapsed: !node.collapsed }), null);
      }
      return;
    }

    // Alt + ↑ / ↓ : move the whole block up/down among its siblings.
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const dir = event.key === "ArrowUp" ? -1 : 1;
      const caret = typeof el?.selectionStart === "number" ? el.selectionStart : currentText.length;
      applyTextThen(node.id, currentText, (base) => moveSibling(base, node.id, dir));
      focusNodeAtIndex(node.id, caret);
      return;
    }

    if (event.key === "Backspace" && el && el.selectionStart === 0 && el.selectionEnd === 0) {
      // Empty block: delete it. Children (if any) are preserved by promoting
      // them into the block's position rather than being thrown away.
      if (currentText.length === 0) {
        event.preventDefault();
        pushHistory();
        setItems((prev) => {
          const withText = updateNodeText(prev, node.id, "");
          const result = node.children?.length
            ? deleteNodeKeepChildren(withText, node.id)
            : deleteNodeSafe(withText, node.id);
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
      // Non-empty block, caret at start, no children: merge into the previous
      // visible block (append this block's text to it, place caret at the join).
      if (!node.children?.length && index > 0) {
        const prevId = flat[index - 1];
        const prevEl = inputRefs.current.get(prevId);
        if (prevId && prevEl) {
          event.preventDefault();
          const prevText = prevEl.value;
          const joinPos = prevText.length;
          pushHistory();
          setItems((prev) => {
            let root = updateNodeText(prev, prevId, prevText + currentText);
            const removed = removeNodeById(root, node.id);
            root = removed.items;
            return root.length ? root : [makeNode("")];
          });
          setDrafts((prev) => {
            const nextDrafts = { ...prev };
            delete nextDrafts[node.id];
            delete nextDrafts[prevId];
            return nextDrafts;
          });
          markChanged();
          setTimeout(() => focusNodeAtIndex(prevId, joinPos), 0);
          return;
        }
      }
      return;
    }

    // Caret-aware vertical / horizontal navigation across blocks.
    if (!event.shiftKey && !event.altKey && !meta) {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const nav = getCaretNav(el);
        const goPrev = event.key === "ArrowUp";
        const atEdge = goPrev ? (!nav || nav.isFirstLine) : (!nav || nav.isLastLine);
        if (!atEdge) return; // move within this multi-line block
        const targetId = goPrev ? flat[index - 1] : flat[index + 1];
        if (!targetId) return;
        event.preventDefault();
        commitDraft(node.id);
        const targetEl = inputRefs.current.get(targetId);
        const x = nav ? nav.left : 0;
        const idx = targetEl ? caretIndexForX(targetEl, goPrev ? "last" : "first", x) : undefined;
        focusNodeAtIndex(targetId, idx);
        return;
      }
      if (event.key === "ArrowLeft" && el && el.selectionStart === 0 && el.selectionEnd === 0) {
        const prevId = flat[index - 1];
        if (!prevId) return;
        event.preventDefault();
        commitDraft(node.id);
        focusNode(prevId, "end");
        return;
      }
      if (event.key === "ArrowRight" && el && el.selectionStart === el.value.length && el.selectionEnd === el.value.length) {
        const nextId = flat[index + 1];
        if (!nextId) return;
        event.preventDefault();
        commitDraft(node.id);
        focusNode(nextId, "start");
      }
    }
  }, [applyTextThen, commitDraft, drafts, focusNode, focusNodeAtIndex, markChanged, mutateItems, pushHistory, visibleRows]);

  const handleZoomTitleKeyDown = useCallback((event, node) => {
    if (isImeEvent(event)) return;
    const currentText = drafts[node.id] ?? node.text ?? "";

    if (event.key === "Enter") {
      if (event.shiftKey) {
        // Shift+Enter is an in-block line break, even in Zoom title mode.
        return;
      }
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

  const deleteSelected = useCallback(() => {
    if (!selectedIds.length) return;
    pushHistory();
    setItems((prev) => {
      let result = prev;
      for (const id of selectedIds) {
        result = deleteNodeSafe(result, id).items;
      }
      return result.length ? result : [makeNode("")];
    });
    setSelectedIds([]);
    markChanged();
  }, [selectedIds, pushHistory, markChanged]);

  const indentSelected = useCallback(() => {
    if (!selectedIds.length) return;
    pushHistory();
    setItems((prev) => {
      let result = prev;
      for (const id of selectedIds) {
        result = indentNode(result, id);
      }
      return result;
    });
    markChanged();
  }, [selectedIds, pushHistory, markChanged]);

  const dedentSelected = useCallback(() => {
    if (!selectedIds.length) return;
    pushHistory();
    setItems((prev) => {
      let result = prev;
      for (const id of [...selectedIds].reverse()) {
        result = outdentNode(result, id);
      }
      return result;
    });
    markChanged();
  }, [selectedIds, pushHistory, markChanged]);

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

  const buildExportPayload = useCallback(() => {
    const currentItems = getCurrentItems();
    return {
      schema: "quietliner.v1",
      appVersion: APP_VERSION,
      exportedAt: nowIso(),
      version,
      updatedAt,
      items: currentItems,
      summary: summarizeItems(currentItems),
      settings: {
        theme: settings.theme,
        font: settings.font,
        fontSize: settings.fontSize,
        lineHeight: settings.lineHeight,
        letterSpacing: settings.letterSpacing,
        textAlignment: settings.textAlignment,
        bgLight: settings.bgLight,
        textLight: settings.textLight,
        bgDark: settings.bgDark,
        textDark: settings.textDark,
        rootTitle: settings.rootTitle,
      },
    };
  }, [getCurrentItems, settings, updatedAt, version]);

  function supabaseHeaders(extra = {}) {
    return {
      apikey: sync.supabaseKey.trim(),
      Authorization: `Bearer ${sync.supabaseKey.trim()}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  async function supabaseRequest(method, path, body) {
    const base = sync.supabaseUrl.trim().replace(/\/$/, "");
    if (!base) throw new Error("Supabase URL が未設定です。Settings → Sync で入力してください。");
    if (!sync.supabaseKey.trim()) throw new Error("Supabase Anon Key が未設定です。Settings → Sync で入力してください。");
    const url = `${base}/rest/v1${path}`;
    const opts = {
      method,
      headers: supabaseHeaders(method === "POST" || method === "PATCH" ? { Prefer: "resolution=merge-duplicates,return=representation" } : {}),
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    let response, text;
    try {
      response = await fetch(url, opts);
      text = await response.text();
    } catch (err) {
      throw new Error(`ネットワークエラー: ${err?.message || err}`);
    }
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    if (!response.ok) {
      const detail = typeof json === "object" ? (json?.message || JSON.stringify(json)) : String(json || "");
      throw new Error(`Supabase HTTP ${response.status}: ${detail}`);
    }
    return json;
  }

  async function runPing() {
    setSyncStatus("syncing...");
    try {
      await supabaseRequest("GET", `/outlines?id=eq.${encodeURIComponent(sync.docId || "main")}&select=id`);
      setSyncStatus("synced");
      appendLog("info", "Ping succeeded", { supabaseUrl: sync.supabaseUrl });
    } catch (error) {
      setSyncStatus("error");
      setLastSyncError(error.message);
      appendLog("error", "Ping failed", error.message);
    }
  }

  async function pushPayloadToRemote(payload, source = "manual", options = {}) {
    const payloadSummary = summarizeItems(payload.items || []);
    if (payloadSummary.isEffectivelyEmpty && !options.force) {
      throw new Error("ローカルのアウトラインが空またはスターターのみです。誤ってリモートを上書きするのを防ぐため Push をブロックしました。Force Replace Remote を使って上書きしてください。");
    }
    const docId = sync.docId?.trim() || "main";
    const row = {
      id: docId,
      payload: { ...payload, summary: payloadSummary },
      version: payload.version || version,
      updated_at: payload.updatedAt || nowIso(),
    };
    if (options.snapshotBefore !== false) {
      const snapId = `snap_${docId}_${new Date().toISOString().replace(/[:.]/g, "-")}`;
      supabaseRequest("POST", "/outlines", { id: snapId, payload: row.payload, version: row.version, updated_at: row.updated_at })
        .catch((err) => appendLog("warn", "Snapshot 作成失敗（無視）", err.message));
    }
    const result = await supabaseRequest("POST", "/outlines", row);
    appendLog("info", `${source}: push 完了`, { docId, version: row.version });
    return result;
  }

  async function pushRemote(source = "manual", options = {}) {
    setSyncStatus("syncing...");
    const payload = buildExportPayload();
    try {
      const result = await pushPayloadToRemote(payload, source, options);
      setSyncStatus("synced");
      setDirty(false);
      appendLog("info", options.force ? "Force Replace Remote 完了" : "Push 完了", {});
      return result;
    } catch (error) {
      setSyncStatus("error");
      setLastSyncError(error.message);
      appendLog("error", "Push 失敗", error.message);
      throw error;
    }
  }

  function applyRemotePayload(payload, result = {}) {
    if (!payload || !Array.isArray(payload.items)) throw new Error("リモートの payload に items がありません");
    setItems(payload.items);
    setVersion(Number(payload.version || result.remoteVersion || version + 1));
    setUpdatedAt(payload.updatedAt || result.remoteUpdatedAt || nowIso());
    if (payload.settings) setSettings((prev) => ({ ...prev, ...payload.settings }));
    // 編集中ブロックの未確定 draft は保持する（Sync の往復中に打った文字や
    // カーソル位置が失われて「タイピングできない」状態になるのを防ぐ）。
    setDrafts((prev) => (activeId && activeId in prev ? { [activeId]: prev[activeId] } : {}));
    // ズーム中のノードが新しいツリーにまだ存在するなら、ズームは維持する。
    setZoomRootId((prev) => (prev && findPath(payload.items, prev) ? prev : null));
    setSelectedIds([]);
    setDirty(false);
  }

  async function pullRemote(options = { apply: true }) {
    setSyncStatus("syncing...");
    try {
      const docId = sync.docId?.trim() || "main";
      const rows = await supabaseRequest("GET", `/outlines?id=eq.${encodeURIComponent(docId)}&select=*`);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) throw new Error(`ドキュメント "${docId}" がリモートに存在しません。先に Push してください。`);
      const payload = row.payload;
      if (options.apply !== false) {
        applyRemotePayload(payload, { remoteVersion: row.version, remoteUpdatedAt: row.updated_at });
        setSyncStatus("synced");
        appendLog("info", "Pull 完了", { docId, version: row.version });
      }
      return { payload, version: row.version, updatedAt: row.updated_at };
    } catch (error) {
      setSyncStatus("error");
      setLastSyncError(error.message);
      appendLog("error", "Pull 失敗", error.message);
      throw error;
    }
  }

  async function smartSync() {
    setSyncStatus("syncing...");
    try {
      const docId = sync.docId?.trim() || "main";
      const localPayload = buildExportPayload();
      const localSummary = summarizeItems(localPayload.items);

      const rows = await supabaseRequest("GET", `/outlines?id=eq.${encodeURIComponent(docId)}&select=*`);
      const row = Array.isArray(rows) ? rows[0] : null;
      const remoteLooksEmpty = !row || !row.payload || !Array.isArray(row.payload.items) || row.payload.items.length === 0;
      const remoteSummary = row ? summarizeItems(row.payload?.items || []) : { nodeCount: 0, charCount: 0, isEffectivelyEmpty: true };

      if (localSummary.isEffectivelyEmpty && !remoteLooksEmpty) {
        appendLog("info", "Smart Sync: ローカルが空 → Pull", { localSummary, remoteSummary });
        applyRemotePayload(row.payload, { remoteVersion: row.version, remoteUpdatedAt: row.updated_at });
        setSyncStatus("synced");
        return;
      }

      if (!localSummary.isEffectivelyEmpty && remoteLooksEmpty) {
        appendLog("info", "Smart Sync: リモートが空 → Push", { localSummary, remoteSummary });
        await pushPayloadToRemote(localPayload, "smart-empty-remote", { snapshotBefore: false });
        setSyncStatus("synced");
        setDirty(false);
        return;
      }

      if (localSummary.isEffectivelyEmpty && remoteLooksEmpty) {
        setSyncStatus("synced");
        appendLog("info", "Smart Sync: 両方空。何もしません。", {});
        return;
      }

      if (isLocalTooSmallComparedToRemote(localSummary, remoteSummary)) {
        appendLog("warn", "Smart Sync: ローカルがリモートより極端に少ない → Pull で保護", { localSummary, remoteSummary });
        const localNonStarter = (localPayload.items || []).filter((item) => !isStarterOutline([item]) && (countChars(item) > 0 || (item.children || []).length > 0));
        if (localNonStarter.length > 0) {
          const mergedItems = appendImportedItems(row.payload.items || [], localNonStarter);
          const mergedPayload = { ...row.payload, items: mergedItems, summary: summarizeItems(mergedItems), mergedAt: nowIso() };
          applyRemotePayload(mergedPayload, { remoteVersion: mergedPayload.version, remoteUpdatedAt: mergedPayload.updatedAt });
          appendLog("info", "Smart Sync: ローカルの非スターターをマージ", { appendedCount: localNonStarter.length });
        } else {
          applyRemotePayload(row.payload, { remoteVersion: row.version, remoteUpdatedAt: row.updated_at });
        }
        setSyncStatus("synced");
        return;
      }

      const remotePayload = row.payload;
      const mergedPayload = mergePayloads(localPayload, remotePayload);
      applyRemotePayload(mergedPayload, { remoteVersion: mergedPayload.version, remoteUpdatedAt: mergedPayload.updatedAt });
      await pushPayloadToRemote(mergedPayload, "smart-merge", { snapshotBefore: true });
      setSyncStatus("synced");
      setDirty(false);
      appendLog("info", "Smart Sync: マージして Push 完了", { localSummary, remoteSummary });
    } catch (error) {
      setSyncStatus("error");
      setLastSyncError(error.message);
      appendLog("error", "Smart Sync 失敗", error.message);
      throw error;
    }
  }

  async function forceReplaceRemote() {
    return pushRemote("force-replace", { force: true, snapshotBefore: true });
  }

  async function listSnapshots() {
    setSnapshotListStatus("loading...");
    try {
      const docId = sync.docId?.trim() || "main";
      const rows = await supabaseRequest("GET", `/outlines?id=like.snap_${encodeURIComponent(docId)}_%25&select=id,updated_at&order=updated_at.desc&limit=20`);
      const snaps = Array.isArray(rows) ? rows.map((r) => ({ id: r.id, title: r.id.replace(`snap_${docId}_`, "") })) : [];
      setSnapshotList(snaps);
      setSnapshotListStatus(snaps.length > 0 ? `${snaps.length} 件のスナップショット` : "スナップショットなし");
      appendLog("info", "List Snapshots 完了", { count: snaps.length });
    } catch (error) {
      setSnapshotListStatus(`失敗: ${error.message}`);
      appendLog("error", "List Snapshots 失敗", error.message);
    }
  }

  async function downloadSnapshotById(snapshotId, label) {
    try {
      const rows = await supabaseRequest("GET", `/outlines?id=eq.${encodeURIComponent(snapshotId)}&select=*`);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row?.payload) {
        const filename = `quietliner-snapshot-${(label || snapshotId || "unknown").replace(/[^\w-]/g, "_")}-${Date.now()}.json`;
        downloadText(filename, JSON.stringify(row.payload, null, 2));
        appendLog("info", `Snapshot ダウンロード: ${label || snapshotId}`, {});
      } else {
        appendLog("error", "Snapshot: payload が見つかりません", { snapshotId });
      }
    } catch (error) {
      appendLog("error", "Snapshot ダウンロード失敗", error.message);
    }
  }

  const applyImportedJson = useCallback((parsed, sourceName = "JSON") => {
    const normalized = normalizeImportPayload(parsed);
    const importedBlocks = countNodes(normalized.items);
    const shouldReplace = importMode === "replace";

    if (shouldReplace) {
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
      setZoomRootId(null);
      const message = `${sourceName} replace import succeeded: ${normalized.items.length} root item(s), ${importedBlocks} block(s)`;
      setImportStatus(message);
      appendLog("info", message, {
        sourceName,
        mode: "replace",
        rootItems: normalized.items.length,
        importedBlocks,
        rootTitle: nextSettings.rootTitle,
      });
    } else {
      setItems((prev) => appendImportedItems(prev, normalized.items));
      setVersion((prev) => prev + 1);
      setUpdatedAt(nowIso());
      setZoomRootId(null);
      const message = `${sourceName} append import succeeded: added ${normalized.items.length} root item(s), ${importedBlocks} block(s)`;
      setImportStatus(message);
      appendLog("info", message, {
        sourceName,
        mode: "append",
        rootItems: normalized.items.length,
        importedBlocks,
      });
    }

    setDrafts({});
    setActiveId(null);
    setSelectedIds([]);
    setSelectionAnchorId(null);
    setDirty(true);
    setSyncStatus("local only");
  }, [appendLog, importMode, settings, version]);

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
        if (looksLikeNotionToggle(raw)) {
          try {
            const nodes = parseNotionToggleText(raw);
            const notionPayload = { schema: "quietliner.notionToggle.v1", version: Date.now(), updatedAt: nowIso(), nodes };
            applyImportedJson(notionPayload, `${sourceName} Notion toggle`);
            return true;
          } catch (notionError) {
            const message = `Import failed: Notion toggle parse error: ${notionError.message}`;
            setImportStatus(message);
            appendLog("error", "Import failed", message);
            return false;
          }
        }
        const looksLikeJson = raw.startsWith("{") || raw.startsWith("[");
        const help = looksLikeJson
          ? "JSONが途中で切れている可能性があります。全文を最初の { から最後の } までコピーするか、元の日記テキストをそのまま貼ってください。"
          : "日付行が見つかりませんでした。2026/01/02 のような日付行で区切った日記テキスト、Notionのトグルテキスト、またはQuietliner JSONを貼ってください。";
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

  const beginSidebarResize = useCallback((event) => {
    if (window.innerWidth <= 760) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = Number(settings.sidebarWidth || 252);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      const next = Math.max(196, Math.min(420, Math.round(startWidth + delta)));
      setSettings((prev) => ({ ...prev, sidebarWidth: next }));
    };

    const stop = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stop);
    };

    sidebarResizeRef.current = { handleMove, stop };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stop, { once: true });
  }, [settings.sidebarWidth]);

  const textAlignment = TEXT_ALIGNMENT_OPTIONS[settings.textAlignment] || TEXT_ALIGNMENT_OPTIONS.left;

  const appStyle = {
    "--app-bg": appBackground,
    "--app-text": appTextColor,
    "--app-font": fontFamily,
    "--editor-font-size": `${settings.fontSize}px`,
    "--editor-line-height": Number(settings.lineHeight || 1.55),
    "--editor-letter-spacing": `${Number(settings.letterSpacing ?? 0.01)}em`,
    "--editor-text-align": textAlignment.align,
    "--editor-text-align-last": textAlignment.last,
    "--sidebar-width": settings.sidebarCollapsed
      ? "0px"
      : `${Math.max(196, Math.min(420, Number(settings.sidebarWidth || 252)))}px`,
    "--editor-max-width": `${Math.max(560, Math.min(1440, Number(settings.editorWidth || 920)))}px`,
  };

  return (
    <div className={`app theme-${activeTheme} ${uiHidden ? "ui-hidden" : ""} ${settings.sidebarCollapsed ? "sidebar-collapsed" : ""} ${isSelectingRows ? "is-selecting" : ""} ${settings.typewriterMode ? "typewriter-mode" : ""}`} style={appStyle} data-bg-style={settings.backgroundStyle || "solid"} data-noise-style={settings.backgroundNoise || "mixed"}>
      <div className="top-hot-zone" onMouseEnter={() => setUiHidden(false)} />

      {settings.sidebarCollapsed && (
        <button
          className="sidebar-edge-button"
          type="button"
          title="サイドバーを開く"
          onClick={() => setSettings((prev) => ({ ...prev, sidebarCollapsed: false }))}
        >›</button>
      )}

      <aside className="sidebar">
        <div className="brand-block">
          <button className="brand-button" type="button" onClick={() => setUiHidden(false)}>
            Quietliner
          </button>
          <div className="app-version-pill" title="Current app version">v{APP_VERSION}</div>
          <div className="sync-pill" data-status={syncStatus}>{syncStatus}</div>
          <button
            className="sidebar-collapse-button"
            type="button"
            title="サイドバーを閉じる"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setSettings((prev) => ({ ...prev, sidebarCollapsed: true }))}
          >‹</button>
        </div>

        <button className="all-notes" type="button" onClick={() => zoomOutAll(visibleRows[0]?.node.id)}>
          {rootTitle} <span>{flattenVisible(items).length}</span>
        </button>

        <div className="favorite-list">
          <div className="sidebar-label">Favorites</div>
          {favorites.length === 0 && <p className="empty-sidebar">お気に入りにした項目がここに並びます</p>}
          {favorites.map((favorite) => (
            <button className="favorite-link" type="button" key={favorite.id} onClick={() => zoomInto(favorite.id)}>
              <span className="favorite-title">{favorite.text?.trim() || "Untitled"}</span>
              <span className="favorite-meta">{countChars(favorite, drafts)}</span>
            </button>
          ))}
        </div>
      </aside>
      <div className="sidebar-resizer" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" onPointerDown={beginSidebarResize} />

      <main className="main-panel">
        <header className="topbar">
          {settings.sidebarCollapsed && (
            <button
              className="ghost-button sidebar-expand-button"
              type="button"
              title="サイドバーを開く"
              onClick={() => setSettings((prev) => ({ ...prev, sidebarCollapsed: false }))}
            >›</button>
          )}
          <input
            className="search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
          />
          <div className="topbar-spacer" />
          <div className="top-version" title="Current app version">{APP_VERSION_LABEL}</div>
          <button
            className="ghost-button"
            type="button"
            title={settings.typewriterMode ? "タイプライターモード ON" : "タイプライターモード OFF"}
            style={{ opacity: settings.typewriterMode ? 1 : 0.48 }}
            onClick={() => setSettings((prev) => ({ ...prev, typewriterMode: !prev.typewriterMode }))}
          >
            ⌨
          </button>
          <button
            className="ghost-button sync-top-button"
            type="button"
            data-status={syncStatus}
            title={lastSyncError || undefined}
            onClick={() => smartSync().catch(() => {})}
          >
            {syncStatus === "syncing..." ? "Syncing…" : syncStatus === "error" ? "Sync ⚠" : "Sync"}
          </button>
          <button className="ghost-button" type="button" onClick={addRootNode}>＋ New</button>
          <button className="ghost-button" type="button" onClick={() => { setSettingsOpen(true); setSettingsTab("appearance"); }}>Settings</button>
        </header>

        {syncStatus === "error" && lastSyncError && (
          <div className="sync-error-banner">
            <span title={lastSyncError}>⚠ {lastSyncError}</span>
            <button type="button" onClick={() => { setSettingsOpen(true); setSettingsTab("sync"); }}>詳細</button>
            <button type="button" className="sync-error-dismiss" onClick={() => setSyncStatus("local only")}>×</button>
          </div>
        )}

        <section className="editor-wrap" onMouseDown={() => setUiHidden(false)}>
          <div className="editor-header" data-zoomed={zoomRootNode ? "true" : "false"}>
            <div className="zoom-crumbs" aria-label="Current hierarchy">
              <button type="button" title={rootTitle} onClick={() => zoomOutAll(zoomRootId)}>{truncateTitle(rootTitle, 16)}</button>
              {zoomTrail.map((trailNode, index) => {
                const isLast = index === zoomTrail.length - 1;
                const fullTitle = getReadableTitle(trailNode);
                const shortTitle = truncateTitle(fullTitle, 18);
                return (
                  <React.Fragment key={trailNode.id}>
                    <span>/</span>
                    {isLast ? (
                      <strong title={fullTitle}>{shortTitle}</strong>
                    ) : (
                      <button type="button" title={fullTitle} onClick={() => zoomInto(trailNode.id)}>{shortTitle}</button>
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
                onTextPointerDown={(id, startX, startY) => { textDragAnchorRef.current = { id, startX, startY }; }}
                onDragStartRow={handleDragStartRow}
                onDragOverRow={handleDragOverRow}
                onDropRow={handleDropRow}
                onDragEndRow={handleDragEndRow}
                dragOver={dragOverState?.id === node.id ? dragOverState.mode : ""}
              />
            ))}
          </div>
        </section>
      </main>

      {selectedIds.length > 0 && (
        <div className="action-menu">
          <span className="action-menu-count">{selectedIds.length}件選択</span>
          <button className="action-menu-btn" type="button" onClick={dedentSelected} title="アウトデント (Shift+Tab)">←</button>
          <button className="action-menu-btn" type="button" onClick={indentSelected} title="インデント (Tab)">→</button>
          <button className="action-menu-btn danger" type="button" onClick={deleteSelected} title="削除">削除</button>
          <button className="action-menu-btn" type="button" onClick={() => setSelectedIds([])} title="選択解除">✕</button>
        </div>
      )}

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
                <label className="range-field">
                  Line Height <span>{Number(settings.lineHeight || 1.55).toFixed(2)}</span>
                  <input type="range" min="1.2" max="2.2" step="0.05" value={settings.lineHeight || 1.55} onChange={(event) => setSettings((prev) => ({ ...prev, lineHeight: Number(event.target.value) }))} />
                </label>
                <label className="range-field">
                  Letter Spacing <span>{Number(settings.letterSpacing ?? 0.01).toFixed(2)}em</span>
                  <input type="range" min="-0.04" max="0.16" step="0.01" value={settings.letterSpacing ?? 0.01} onChange={(event) => setSettings((prev) => ({ ...prev, letterSpacing: Number(event.target.value) }))} />
                </label>
                <label>
                  Text Alignment
                  <select value={settings.textAlignment || "left"} onChange={(event) => setSettings((prev) => ({ ...prev, textAlignment: event.target.value }))}>
                    {Object.entries(TEXT_ALIGNMENT_OPTIONS).map(([key, option]) => (
                      <option key={key} value={key}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="range-field">
                  Editor Width <span>{Math.round(Number(settings.editorWidth || 920))}px</span>
                  <input type="range" min="560" max="1440" step="20" value={settings.editorWidth || 920} onChange={(event) => setSettings((prev) => ({ ...prev, editorWidth: Number(event.target.value) }))} />
                </label>
                <label className="range-field">
                  Sidebar Width <span>{Math.round(Number(settings.sidebarWidth || 252))}px</span>
                  <input type="range" min="196" max="420" step="4" value={settings.sidebarWidth || 252} onChange={(event) => setSettings((prev) => ({ ...prev, sidebarWidth: Number(event.target.value) }))} />
                </label>
                <label className="check-row wide">
                  <input type="checkbox" checked={Boolean(settings.typewriterMode)} onChange={(event) => setSettings((prev) => ({ ...prev, typewriterMode: event.target.checked }))} />
                  Typewriter Mode（入力行を画面の固定位置にロック）
                </label>
                {settings.typewriterMode && (
                  <label className="range-field">
                    Typewriter Lock Position <span>{Math.round((Number(settings.typewriterAnchor) || 0.72) * 100)}%</span>
                    <input type="range" min="0.45" max="0.85" step="0.02" value={Number(settings.typewriterAnchor) || 0.72} onChange={(event) => setSettings((prev) => ({ ...prev, typewriterAnchor: Number(event.target.value) }))} />
                  </label>
                )}
                <label>
                  Background Style
                  <select value={settings.backgroundStyle || "solid"} onChange={(event) => setSettings((prev) => ({ ...prev, backgroundStyle: event.target.value }))}>
                    {Object.entries(BACKGROUND_STYLE_OPTIONS).map(([key, option]) => (
                      <option key={key} value={key}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Background Noise
                  <select value={settings.backgroundNoise || "mixed"} onChange={(event) => setSettings((prev) => ({ ...prev, backgroundNoise: event.target.value }))}>
                    {Object.entries(BACKGROUND_NOISE_OPTIONS).map(([key, option]) => (
                      <option key={key} value={key}>{option.label}</option>
                    ))}
                  </select>
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
                  <div className="import-mode-row" role="group" aria-label="Import mode">
                    <label>
                      <input type="radio" name="import-mode" value="append" checked={importMode === "append"} onChange={() => setImportMode("append")} />
                      Append to current outline
                    </label>
                    <label>
                      <input type="radio" name="import-mode" value="replace" checked={importMode === "replace"} onChange={() => setImportMode("replace")} />
                      Replace current outline
                    </label>
                  </div>
                  <label>
                    Paste Import JSON / Diary Text
                    <textarea
                      value={importText}
                      onChange={(event) => setImportText(event.target.value)}
                      placeholder='Quietliner JSON、2026/01/02 のような日付行で区切った日記テキスト、またはNotionのトグルをプレーンテキストでコピーしたものをそのまま貼れます。'
                    />
                  </label>
                  <div className="settings-actions">
                    <button type="button" onClick={importPastedJson} disabled={!importText.trim()}>{importMode === "append" ? "Append Pasted Data" : "Replace with Pasted Data"}</button>
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
                <div className="device-id-card">
                  <span>Device ID</span>
                  <code>{deviceId}</code>
                </div>
                <p className="sync-hint">Supabase プロジェクトの URL と anon/public key を入力してください。テーブル <code>outlines</code>（<code>id text PK, payload jsonb, version int, updated_at text</code>）を作成し、RLS で anon アクセスを許可してください。</p>
                <label>
                  Supabase URL
                  <input value={sync.supabaseUrl} onChange={(event) => setSync((prev) => ({ ...prev, supabaseUrl: event.target.value }))} placeholder="https://xxxxxxxxxxxx.supabase.co" />
                </label>
                <label>
                  Supabase Anon Key
                  <input type="password" value={sync.supabaseKey} onChange={(event) => setSync((prev) => ({ ...prev, supabaseKey: event.target.value }))} placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." />
                </label>
                <label>
                  Document ID
                  <input value={sync.docId || "main"} onChange={(event) => setSync((prev) => ({ ...prev, docId: event.target.value }))} placeholder="main" />
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={sync.autoSync} onChange={(event) => setSync((prev) => ({ ...prev, autoSync: event.target.checked }))} />
                  Auto Sync ON/OFF
                </label>
                <p className="sync-hint">Smart Sync はローカルデータが少ない場合の Push を自動ブロックし、必要に応じて Pull またはマージします。</p>

                <div className="sync-state-card">
                  <span>Status</span>
                  <strong>{syncStatus}</strong>
                  <small>Local v{version} / {new Date(updatedAt).toLocaleString()}</small>
                </div>

                <div className="sync-buttons">
                  <button type="button" onClick={runPing}>Ping</button>
                  <button type="button" onClick={() => pushRemote().catch(() => {})}>Push</button>
                  <button type="button" onClick={() => pullRemote().catch(() => {})}>Pull</button>
                  <button type="button" onClick={() => smartSync().catch(() => {})}>Smart Sync</button>
                  <button type="button" onClick={() => setSyncLog([])}>Clear Log</button>
                </div>

                <div className="sync-section">
                  <div className="sync-section-title">Snapshots</div>
                  <p className="sync-hint">Push 時に自動スナップショットを作成します。過去 20 件まで一覧表示できます。</p>
                  <div className="sync-buttons">
                    <button type="button" onClick={listSnapshots}>List Snapshots</button>
                  </div>
                  {snapshotListStatus && <p className="sync-hint">{snapshotListStatus}</p>}
                  {snapshotList.length > 0 && (
                    <div className="snapshot-list">
                      {snapshotList.map((snap) => (
                        <div key={snap.id || snap.title} className="snapshot-item">
                          <span className="snapshot-label">{snap.title || snap.id || "Snapshot"}</span>
                          <button type="button" onClick={() => downloadSnapshotById(snap.id, snap.title)}>Download</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="sync-section danger-zone">
                  <button
                    type="button"
                    className="danger-zone-toggle"
                    onClick={() => { setShowDangerZone((prev) => !prev); setDangerConfirmText(""); }}
                  >
                    {showDangerZone ? "▾" : "▸"} Danger Zone
                  </button>
                  {showDangerZone && (
                    <div className="danger-zone-content">
                      <p className="danger-warning">Force Replace Remote は現在の端末のデータで Supabase 側を完全に上書きします。実行前にスナップショットを作成しますが、リモートの既存データは失われます。</p>
                      <label>
                        確認のため <strong>REPLACE REMOTE</strong> と入力してください
                        <input
                          value={dangerConfirmText}
                          onChange={(event) => setDangerConfirmText(event.target.value)}
                          placeholder="REPLACE REMOTE"
                          autoComplete="off"
                        />
                      </label>
                      <div className="sync-buttons">
                        <button
                          className="danger-button"
                          type="button"
                          disabled={dangerConfirmText !== "REPLACE REMOTE"}
                          onClick={() => { forceReplaceRemote().catch(() => {}); setDangerConfirmText(""); setShowDangerZone(false); }}
                        >
                          Force Replace Remote
                        </button>
                      </div>
                    </div>
                  )}
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
                <div><kbd>Enter</kbd><span>カーソル位置で分割して次の項目</span></div>
                <div><kbd>Shift</kbd> + <kbd>Enter</kbd><span>ブロック内改行</span></div>
                <div><kbd>Tab</kbd><span>インデント</span></div>
                <div><kbd>Shift</kbd> + <kbd>Tab</kbd><span>アウトデント</span></div>
                <div><kbd>Backspace</kbd><span>空ブロック削除（子は残す）/ 行頭で前と結合</span></div>
                <div><kbd>↑</kbd> / <kbd>↓</kbd><span>ブロック間移動（複数行は行内優先・列を保持）</span></div>
                <div><kbd>←</kbd> / <kbd>→</kbd><span>行頭/行末で隣のブロックへ</span></div>
                <div><kbd>Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd><span>ブロックを上下に並べ替え</span></div>
                <div><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>.</kbd><span>折りたたみ / 展開</span></div>
                <div><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>Z</kbd><span>取り消し / やり直し（+Shift）</span></div>
                <div><kbd>○</kbd><span>Zoom</span></div>
                <div><kbd>☆</kbd><span>お気に入り</span></div>
                <div><kbd>Esc</kbd><span>UI表示</span></div>
                <div><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>K</kbd><span>検索</span></div>
                <div><kbd>/today</kbd> / <kbd>;today</kbd><span>今日の日付を挿入</span></div>
                <div><kbd>/now</kbd> / <kbd>;now</kbd><span>現在時刻つきの日付を挿入</span></div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
