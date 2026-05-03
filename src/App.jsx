import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "quietliner_tree_v2";
const SETTINGS_KEY = "quietliner_settings_v2";
const SYNC_KEY = "quietliner_sync_v1";
const SYNC_META_KEY = "quietliner_sync_meta_v1";
const AUTO_SYNC_DELAY_MS = 30000;

const initialTree = [
  {
    id: "n1",
    text: "今日考えたいこと",
    collapsed: false,
    favorite: true,
    children: [
      {
        id: "n2",
        text: "ノートアプリをWorkflowy型のアウトライナーとして作る",
        collapsed: false,
        favorite: false,
        children: [],
      },
      {
        id: "n3",
        text: "ふつうのノートではなく、思考の棚・発酵装置として使いたい",
        collapsed: false,
        favorite: false,
        children: [
          {
            id: "n4",
            text: "日記、読書メモ、企画、タスクが自然に混ざる",
            collapsed: false,
            favorite: false,
            children: [],
          },
          {
            id: "n5",
            text: "あとから階層を変えたり、接続し直せる",
            collapsed: false,
            favorite: false,
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: "n6",
    text: "読書メモ",
    collapsed: false,
    favorite: true,
    children: [
      {
        id: "n7",
        text: "引用を小さなブロックとして保存する",
        collapsed: false,
        favorite: false,
        children: [],
      },
      {
        id: "n8",
        text: "あとで文章化するときに、別の枝へ移動できる",
        collapsed: false,
        favorite: false,
        children: [],
      },
    ],
  },
  {
    id: "n9",
    text: "プロジェクト",
    collapsed: false,
    favorite: false,
    children: [
      {
        id: "n10",
        text: "雨・風・雪のような自然現象を空間に取り込む研究",
        collapsed: false,
        favorite: false,
        children: [],
      },
      {
        id: "n11",
        text: "Apple Vision Proを使った仮組DXのアイデア",
        collapsed: false,
        favorite: false,
        children: [],
      },
    ],
  },
];

const fontOptions = [
  {
    value: "sans",
    label: "Sans Serif",
    note: "ニュートラル",
    family:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  {
    value: "gothic",
    label: "Gothic / ゴシック",
    note: "読みやすい",
    family:
      "'Hiragino Sans', 'Yu Gothic', 'YuGothic', 'Noto Sans JP', Meiryo, sans-serif",
  },
  {
    value: "serif",
    label: "Serif",
    note: "少し文芸的",
    family: "Georgia, 'Times New Roman', Times, serif",
  },
  {
    value: "mincho",
    label: "Mincho / 明朝",
    note: "書籍っぽい",
    family:
      "'Hiragino Mincho ProN', 'Yu Mincho', 'YuMincho', 'Noto Serif JP', serif",
  },
];

const paletteOptions = [
  {
    value: "dark_silver",
    mode: "dark",
    label: "Dark / Silver",
    background: "#111111",
    text: "#f4f4f5",
    soft: "#d4d4d8",
    muted: "#71717a",
    faint: "#3f3f46",
    panel: "#151515",
    overlay: "rgba(0,0,0,0.56)",
    accent: "#d4d4d8",
    danger: "#fca5a5",
  },
  {
    value: "dark_gold",
    mode: "dark",
    label: "Dark / Gold",
    background: "#11100d",
    text: "#fff7ed",
    soft: "#fde68a",
    muted: "#8b7d5a",
    faint: "#4b4030",
    panel: "#17140f",
    overlay: "rgba(0,0,0,0.58)",
    accent: "#f5d06f",
    danger: "#fca5a5",
  },
  {
    value: "light_paper",
    mode: "light",
    label: "Light / Paper",
    background: "#f7f4ee",
    text: "#1f1f1f",
    soft: "#3f3f3f",
    muted: "#8b857c",
    faint: "#d8d2c8",
    panel: "#fbf8f2",
    overlay: "rgba(30,24,18,0.18)",
    accent: "#4b5563",
    danger: "#b91c1c",
  },
  {
    value: "light_white",
    mode: "light",
    label: "Light / White",
    background: "#fbfbfb",
    text: "#18181b",
    soft: "#3f3f46",
    muted: "#a1a1aa",
    faint: "#e4e4e7",
    panel: "#ffffff",
    overlay: "rgba(24,24,27,0.16)",
    accent: "#52525b",
    danger: "#dc2626",
  },
  {
    value: "light_bluegray",
    mode: "light",
    label: "Light / Blue Gray",
    background: "#eef2f3",
    text: "#1f2933",
    soft: "#334155",
    muted: "#94a3b8",
    faint: "#cbd5e1",
    panel: "#f8fafc",
    overlay: "rgba(15,23,42,0.18)",
    accent: "#475569",
    danger: "#b91c1c",
  },
];

const shortcuts = [
  "Enter: 次の項目",
  "Shift + Enter: 子要素",
  "Tab: インデント",
  "Shift + Tab: アウトデント",
  "☆: お気に入り",
  "Esc / 上端: UI表示",
];

function deepClone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function createId() {
  return `n_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function createNode(text = "") {
  return {
    id: createId(),
    text,
    collapsed: false,
    favorite: false,
    children: [],
  };
}

function normalizeTree(nodes) {
  return (nodes || []).map((node) => ({
    id: node.id || createId(),
    text: typeof node.text === "string" ? node.text : "",
    collapsed: Boolean(node.collapsed),
    favorite: Boolean(node.favorite),
    children: normalizeTree(node.children || []),
  }));
}

function findPath(nodes, id, path = []) {
  for (let i = 0; i < nodes.length; i += 1) {
    const nextPath = [...path, i];
    if (nodes[i].id === id) return nextPath;
    const found = findPath(
      nodes[i].children || [],
      id,
      nextPath.concat("children")
    );
    if (found) return found;
  }
  return null;
}

function getAtPath(root, path) {
  let current = root;
  for (const part of path) current = current[part];
  return current;
}

function getListPathForNode(path) {
  return path.slice(0, -1);
}

function getParentNodePath(path) {
  if (path.length <= 1) return null;
  return path.slice(0, -2);
}

function updateNodeById(nodes, id, updater) {
  let changed = false;

  const nextNodes = nodes.map((node) => {
    if (node.id === id) {
      changed = true;
      return updater(node);
    }

    const children = node.children || [];
    const nextChildren = updateNodeById(children, id, updater);

    if (nextChildren !== children) {
      changed = true;
      return { ...node, children: nextChildren };
    }

    return node;
  });

  return changed ? nextNodes : nodes;
}

function collectBreadcrumbs(nodes, id) {
  const path = findPath(nodes, id);
  if (!path) return [];

  const crumbs = [];
  let cursor = nodes;

  for (let i = 0; i < path.length; i += 2) {
    const node = cursor[path[i]];
    crumbs.push(node);
    cursor = node.children || [];
  }

  return crumbs;
}

function collectFavorites(nodes, trail = []) {
  const favorites = [];

  for (const node of nodes || []) {
    const nextTrail = [...trail, node.text || "Untitled"];
    if (node.favorite) {
      favorites.push({
        id: node.id,
        text: node.text || "Untitled",
        trail: nextTrail,
      });
    }

    favorites.push(...collectFavorites(node.children || [], nextTrail));
  }

  return favorites;
}

function hasMatch(node, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  return (
    (node.text || "").toLowerCase().includes(q) ||
    (node.children || []).some((child) => hasMatch(child, query))
  );
}

function flattenCount(nodes) {
  return nodes.reduce(
    (sum, node) => sum + 1 + flattenCount(node.children || []),
    0
  );
}

function countCharacters(node) {
  if (!node) return 0;

  return (
    Array.from(node.text || "").length +
    (node.children || []).reduce((sum, child) => sum + countCharacters(child), 0)
  );
}

function countCharactersInNodes(nodes) {
  return (nodes || []).reduce((sum, node) => sum + countCharacters(node), 0);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitHighlightedParts(text, query) {
  const q = query.trim();
  if (!q) return [{ text, match: false }];

  const regex = new RegExp(`(${escapeRegExp(q)})`, "gi");

  return String(text)
    .split(regex)
    .filter(Boolean)
    .map((part) => ({
      text: part,
      match: part.toLowerCase() === q.toLowerCase(),
    }));
}

function hexToRgb(hex) {
  const normalized = String(hex || "").replace("#", "");
  if (normalized.length !== 6) return null;

  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) return null;

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function mixHex(hexA, hexB, amount = 0.5) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);

  if (!a || !b) return hexA;

  const mix = (x, y) => Math.round(x * (1 - amount) + y * amount);

  return `#${[mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

function getPalette(paletteChoice, mode) {
  const fallback = mode === "light" ? "light_paper" : "dark_silver";

  return (
    paletteOptions.find((option) => option.value === paletteChoice) ||
    paletteOptions.find((option) => option.value === fallback)
  );
}

function buildColors({ mode, paletteChoice, customBackground, customText }) {
  const palette = getPalette(paletteChoice, mode);
  const background = customBackground || palette.background;
  const text = customText || palette.text;

  return {
    ...palette,
    background,
    text,
    soft: customText ? mixHex(text, background, 0.22) : palette.soft,
    muted: customText ? mixHex(text, background, 0.55) : palette.muted,
    faint: customText ? mixHex(text, background, 0.76) : palette.faint,
    panel: customBackground
      ? mixHex(background, mode === "light" ? "#ffffff" : "#000000", 0.08)
      : palette.panel,
    overlay: mode === "light" ? "rgba(24,24,27,0.16)" : "rgba(0,0,0,0.56)",
    accent: customText ? mixHex(text, background, 0.34) : palette.accent,
  };
}

function getFontFamily(fontChoice) {
  return (
    fontOptions.find((option) => option.value === fontChoice)?.family ||
    fontOptions[0].family
  );
}

function isValidMode(mode) {
  return mode === "dark" || mode === "light";
}

function isValidFontChoice(fontChoice) {
  return fontOptions.some((option) => option.value === fontChoice);
}

function isValidPaletteChoice(paletteChoice) {
  return paletteOptions.some((option) => option.value === paletteChoice);
}

function getMarkerColors(mode) {
  return mode === "light"
    ? { background: "#111111", text: "#ffffff" }
    : { background: "#ffffff", text: "#111111" };
}

function isImeComposing(event) {
  return Boolean(
    event?.isComposing ||
      event?.nativeEvent?.isComposing ||
      event?.keyCode === 229 ||
      event?.nativeEvent?.keyCode === 229
  );
}

function shouldHandleShortcut(event) {
  return !isImeComposing(event);
}

function shouldCommitBeforeKey(key, currentText = "") {
  if (key === "Enter" || key === "Tab") return true;
  if (key === "Backspace") return currentText.length === 0;
  return false;
}

function shouldCommitOnInputChange() {
  return false;
}

function treeToMarkdown(nodes, depth = 0) {
  const lines = [];
  for (const node of nodes || []) {
    const indent = "  ".repeat(depth);
    const text = String(node.text || "Untitled").replace(/\n/g, " ");
    lines.push(`${indent}- ${text}`);
    if (node.children?.length) lines.push(treeToMarkdown(node.children, depth + 1));
  }
  return lines.filter(Boolean).join("\n");
}

function getDeviceLabel() {
  const ua = navigator.userAgent || "";
  if (/iPhone|Android.*Mobile/i.test(ua)) return "mobile";
  if (/iPad|Android/i.test(ua)) return "tablet";
  return "desktop";
}

function nowIso() {
  return new Date().toISOString();
}

function readJsonStorage(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // noop
  }
}

function runSelfTests() {
  const sample = [
    {
      id: "a",
      text: "A",
      collapsed: false,
      favorite: true,
      children: [
        {
          id: "b",
          text: "B",
          collapsed: false,
          favorite: true,
          children: [],
        },
      ],
    },
    { id: "c", text: "C", collapsed: false, favorite: false, children: [] },
  ];

  console.assert(
    JSON.stringify(findPath(sample, "b")) === JSON.stringify([0, "children", 0]),
    "findPath should find nested nodes"
  );
  console.assert(flattenCount(sample) === 3, "flattenCount should count nodes");
  console.assert(countCharacters(sample[0]) === 2, "countCharacters should count descendants");
  console.assert(
    countCharactersInNodes(sample) === 3,
    "countCharactersInNodes should count a list of nodes"
  );
  console.assert(
    updateNodeById(sample, "b", (node) => ({ ...node, text: "BB" }))[0].children[0].text === "BB",
    "updateNodeById should update a nested node"
  );
  console.assert(
    updateNodeById(sample, "missing", (node) => ({ ...node, text: "X" })) === sample,
    "updateNodeById should preserve root array when no node changes"
  );
  console.assert(
    collectBreadcrumbs(sample, "b").map((node) => node.id).join("/") === "a/b",
    "collectBreadcrumbs should return ancestor chain"
  );
  console.assert(
    collectFavorites(sample).map((node) => node.id).join("/") === "a/b",
    "collectFavorites should collect favorites in tree order"
  );
  console.assert(hasMatch(sample[0], "B") === true, "hasMatch should match descendants");
  console.assert(hasMatch(sample[1], "B") === false, "hasMatch should reject unrelated nodes");
  console.assert(
    splitHighlightedParts("hello hello", "hell").filter((part) => part.match).length === 2,
    "splitHighlightedParts should find repeated matches"
  );
  console.assert(
    splitHighlightedParts("a+b", "+").some((part) => part.match),
    "splitHighlightedParts should support regex characters"
  );
  console.assert(
    getMarkerColors("dark").background === "#ffffff",
    "dark mode should use a white marker"
  );
  console.assert(
    getMarkerColors("light").background === "#111111",
    "light mode should use a black marker"
  );
  console.assert(
    shouldHandleShortcut({ key: "Enter", isComposing: true }) === false,
    "IME composing Enter should not create a new node"
  );
  console.assert(
    shouldHandleShortcut({ key: "Enter", nativeEvent: { isComposing: true } }) === false,
    "native IME composing Enter should not create a new node"
  );
  console.assert(
    shouldHandleShortcut({ key: "Enter", keyCode: 229 }) === false,
    "IME keyCode 229 should not create a new node"
  );
  console.assert(
    shouldHandleShortcut({ key: "Enter", isComposing: false }) === true,
    "normal Enter should still create a new node"
  );
  console.assert(
    shouldCommitBeforeKey("Backspace", "abc") === false,
    "Backspace with text should stay lightweight"
  );
  console.assert(
    shouldCommitBeforeKey("Backspace", "") === true,
    "Backspace on empty text should prepare for node deletion"
  );
  console.assert(
    shouldCommitOnInputChange() === false,
    "normal text input should not auto-commit while typing"
  );
  console.assert(treeToMarkdown(sample).includes("  - B"), "treeToMarkdown should output nested markdown");
}

runSelfTests();

function Icon({ name, size = 16 }) {
  const glyphs = {
    down: "⌄",
    right: "›",
    circle: "•",
    home: "⌂",
    plus: "+",
    search: "⌕",
    settings: "⚙",
    trash: "×",
    close: "×",
    star: "☆",
    starFilled: "★",
    sync: "↻",
    upload: "↑",
    download: "↓",
  };

  return (
    <span
      aria-hidden="true"
      className="icon"
      style={{ width: size, height: size, fontSize: size }}
    >
      {glyphs[name] || "•"}
    </span>
  );
}

function HighlightedText({ text, query, mode }) {
  const marker = getMarkerColors(mode);
  const parts = splitHighlightedParts(text || "", query);

  return (
    <span>
      {parts.map((part, index) =>
        part.match ? (
          <mark
            key={`${part.text}_${index}`}
            className="search-mark"
            style={{ background: marker.background, color: marker.text }}
          >
            {part.text}
          </mark>
        ) : (
          <span key={`${part.text}_${index}`}>{part.text}</span>
        )
      )}
    </span>
  );
}

function FastTextInput({
  nodeId,
  value,
  onCommit,
  onKeyDown,
  onFocus,
  placeholder,
  className,
  style,
  ariaLabel,
  inputRef,
}) {
  const [draft, setDraft] = useState(value || "");
  const lastCommittedRef = useRef(value || "");

  function commit(nextValue = draft) {
    if (nextValue !== lastCommittedRef.current) {
      lastCommittedRef.current = nextValue;
      onCommit(nodeId, nextValue);
    }
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(event) => {
        const nextValue = event.target.value;
        setDraft(nextValue);
        if (shouldCommitOnInputChange()) commit(nextValue);
      }}
      onKeyDown={(event) => {
        if (shouldCommitBeforeKey(event.key, draft)) commit(draft);
        onKeyDown(event, draft);
      }}
      onBlur={() => commit(draft)}
      onFocus={onFocus}
      placeholder={placeholder}
      className={className}
      style={style}
      aria-label={ariaLabel}
    />
  );
}

export default function App() {
  const [tree, setTree] = useState(initialTree);
  const [zoomId, setZoomId] = useState(null);
  const [focusedId, setFocusedId] = useState(null);
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [mode, setMode] = useState("dark");
  const [paletteChoice, setPaletteChoice] = useState("dark_silver");
  const [customBackground, setCustomBackground] = useState("");
  const [customText, setCustomText] = useState("");
  const [fontChoice, setFontChoice] = useState("sans");
  const [immersive, setImmersive] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const [gasUrl, setGasUrl] = useState("");
  const [syncSecret, setSyncSecret] = useState("");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Not synced");
  const [syncMeta, setSyncMeta] = useState({ version: 0, localUpdatedAt: null, remoteUpdatedAt: null });
  const [dirty, setDirty] = useState(false);
  const inputRefs = useRef({});

  const colors = buildColors({ mode, paletteChoice, customBackground, customText });
  const editorFontFamily = getFontFamily(fontChoice);

  useEffect(() => {
    try {
      const savedTree = window.localStorage.getItem(STORAGE_KEY);
      if (savedTree) {
        const parsed = JSON.parse(savedTree);
        if (Array.isArray(parsed)) {
          setTree(normalizeTree(parsed));
          setEditorRevision((value) => value + 1);
        }
      }

      const savedSettings = window.localStorage.getItem(SETTINGS_KEY);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (isValidMode(parsed.mode)) setMode(parsed.mode);
        if (isValidPaletteChoice(parsed.paletteChoice)) {
          setPaletteChoice(parsed.paletteChoice);
        }
        if (typeof parsed.customBackground === "string") {
          setCustomBackground(parsed.customBackground);
        }
        if (typeof parsed.customText === "string") setCustomText(parsed.customText);
        if (isValidFontChoice(parsed.fontChoice)) setFontChoice(parsed.fontChoice);
      }

      const savedSync = readJsonStorage(SYNC_KEY, null);
      if (savedSync) {
        if (typeof savedSync.gasUrl === "string") setGasUrl(savedSync.gasUrl);
        if (typeof savedSync.syncSecret === "string") setSyncSecret(savedSync.syncSecret);
        if (typeof savedSync.autoSyncEnabled === "boolean") setAutoSyncEnabled(savedSync.autoSyncEnabled);
      }

      const savedMeta = readJsonStorage(SYNC_META_KEY, null);
      if (savedMeta) setSyncMeta(savedMeta);
    } catch {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
        window.localStorage.removeItem(SETTINGS_KEY);
      } catch {
        // noop
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tree));
      } catch {
        // localStorage may be unavailable in some preview environments.
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [tree]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          mode,
          paletteChoice,
          customBackground,
          customText,
          fontChoice,
        })
      );
    } catch {
      // noop
    }
  }, [mode, paletteChoice, customBackground, customText, fontChoice]);

  useEffect(() => {
    writeJsonStorage(SYNC_KEY, { gasUrl, syncSecret, autoSyncEnabled });
  }, [gasUrl, syncSecret, autoSyncEnabled]);

  useEffect(() => {
    writeJsonStorage(SYNC_META_KEY, syncMeta);
  }, [syncMeta]);

  useEffect(() => {
    if (!focusedId) return undefined;

    const timer = window.setTimeout(() => {
      inputRefs.current[focusedId]?.focus();
    }, 30);

    return () => window.clearTimeout(timer);
  }, [focusedId, zoomId, editorRevision]);

  useEffect(() => {
    function handleGlobalKeyDown(event) {
      if (event.key === "Escape") setImmersive(false);
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (!autoSyncEnabled || !dirty || !gasUrl) return undefined;
    const timer = window.setTimeout(() => {
      pushToNotion({ silent: true });
    }, AUTO_SYNC_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [autoSyncEnabled, dirty, gasUrl, tree]);

  const zoomNode = useMemo(() => {
    if (!zoomId) return null;

    const path = findPath(tree, zoomId);
    return path ? getAtPath(tree, path) : null;
  }, [tree, zoomId]);

  useEffect(() => {
    if (zoomId && !zoomNode) setZoomId(null);
  }, [zoomId, zoomNode]);

  const visibleNodes = zoomNode ? zoomNode.children : tree;
  const breadcrumbs = zoomId ? collectBreadcrumbs(tree, zoomId) : [];
  const favorites = useMemo(() => collectFavorites(tree), [tree]);
  const totalCount = flattenCount(tree);
  const visibleCharacterCount = zoomNode
    ? countCharacters(zoomNode)
    : countCharactersInNodes(tree);
  const chromeHidden = immersive && !settingsOpen && !query.trim();
  const paletteOptionsForMode = paletteOptions.filter((option) => option.mode === mode);

  useEffect(() => {
    document.documentElement.style.setProperty("--bg", colors.background);
    document.documentElement.style.setProperty("--text", colors.text);
    document.documentElement.style.setProperty("--soft", colors.soft);
    document.documentElement.style.setProperty("--muted", colors.muted);
    document.documentElement.style.setProperty("--faint", colors.faint);
    document.documentElement.style.setProperty("--panel", colors.panel);
    document.documentElement.style.setProperty("--accent", colors.accent);
    document.documentElement.style.setProperty("--danger", colors.danger);
    document.documentElement.style.setProperty("--overlay", colors.overlay);
    document.documentElement.style.setProperty("--font-editor", editorFontFamily);
  }, [colors, editorFontFamily]);

  function chooseMode(nextMode) {
    setMode(nextMode);

    const currentPalette = paletteOptions.find((option) => option.value === paletteChoice);
    if (!currentPalette || currentPalette.mode !== nextMode) {
      const nextPalette = paletteOptions.find((option) => option.mode === nextMode);
      if (nextPalette) setPaletteChoice(nextPalette.value);
    }
  }

  function revealChrome() {
    setImmersive(false);
  }

  function maybeRevealChrome(event) {
    if (chromeHidden && event.clientY < 84) revealChrome();
  }

  function markDirty() {
    setDirty(true);
    setSyncMeta((current) => ({ ...current, localUpdatedAt: nowIso() }));
  }

  function commitText(id, text) {
    setTree((current) => updateNodeById(current, id, (node) => ({ ...node, text })));
    markDirty();
  }

  function toggleFavorite(id) {
    setTree((current) =>
      updateNodeById(current, id, (node) => ({ ...node, favorite: !node.favorite }))
    );
    markDirty();
  }

  function toggleCollapse(id) {
    setTree((current) =>
      updateNodeById(current, id, (node) => ({ ...node, collapsed: !node.collapsed }))
    );
    markDirty();
  }

  function addSibling(id) {
    const path = findPath(tree, id);
    if (!path) return;

    const newNode = createNode();

    setTree((current) => {
      const next = deepClone(current);
      const list = getAtPath(next, getListPathForNode(path));
      const index = path[path.length - 1];
      list.splice(index + 1, 0, newNode);
      return next;
    });

    setFocusedId(newNode.id);
    markDirty();
  }

  function addRootNode() {
    const newNode = createNode("新しいメモ");

    if (zoomNode) {
      setTree((current) =>
        updateNodeById(current, zoomNode.id, (node) => ({
          ...node,
          collapsed: false,
          children: [...node.children, newNode],
        }))
      );
    } else {
      setTree((current) => [...current, newNode]);
    }

    setFocusedId(newNode.id);
    markDirty();
  }

  function addChild(id) {
    const newNode = createNode();

    setTree((current) =>
      updateNodeById(current, id, (node) => ({
        ...node,
        collapsed: false,
        children: [...node.children, newNode],
      }))
    );

    setFocusedId(newNode.id);
    markDirty();
  }

  function removeNode(id) {
    const path = findPath(tree, id);
    if (!path) return;

    setTree((current) => {
      const next = deepClone(current);
      const list = getAtPath(next, getListPathForNode(path));
      const index = path[path.length - 1];
      list.splice(index, 1);
      return next;
    });
    markDirty();
  }

  function indentNode(id) {
    const path = findPath(tree, id);
    if (!path) return;

    const index = path[path.length - 1];
    if (index === 0) return;

    setTree((current) => {
      const next = deepClone(current);
      const list = getAtPath(next, getListPathForNode(path));
      const [moving] = list.splice(index, 1);
      const previousSibling = list[index - 1];
      previousSibling.children.push(moving);
      previousSibling.collapsed = false;
      return next;
    });

    setFocusedId(id);
    markDirty();
  }

  function outdentNode(id) {
    const path = findPath(tree, id);
    if (!path || path.length <= 1) return;

    const parentPath = getParentNodePath(path);
    if (!parentPath) return;

    setTree((current) => {
      const next = deepClone(current);
      const list = getAtPath(next, getListPathForNode(path));
      const index = path[path.length - 1];
      const [moving] = list.splice(index, 1);
      const parentList = getAtPath(next, getListPathForNode(parentPath));
      const parentIndex = parentPath[parentPath.length - 1];
      parentList.splice(parentIndex + 1, 0, moving);
      return next;
    });

    setFocusedId(id);
    markDirty();
  }

  function handleKeyDown(event, node, currentText = node.text) {
    if (!shouldHandleShortcut(event)) return;

    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) addChild(node.id);
      else addSibling(node.id);
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      if (event.shiftKey) outdentNode(node.id);
      else indentNode(node.id);
      return;
    }

    if (event.key === "Backspace" && !currentText && !node.children.length) {
      event.preventDefault();
      removeNode(node.id);
    }
  }

  function resetDemo() {
    setTree(deepClone(initialTree));
    setZoomId(null);
    setQuery("");
    setMode("dark");
    setPaletteChoice("dark_silver");
    setCustomBackground("");
    setCustomText("");
    setFontChoice("sans");
    setEditorRevision((value) => value + 1);
    setDirty(true);

    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(SETTINGS_KEY);
    } catch {
      // noop
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(tree, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `quietliner-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();

    URL.revokeObjectURL(url);
  }

  function validateSyncSettings() {
    if (!gasUrl.trim()) {
      setSyncStatus("GAS Web App URLを入力してください");
      return false;
    }
    if (!syncSecret.trim()) {
      setSyncStatus("Shared Secretを入力してください");
      return false;
    }
    return true;
  }

  async function callGas(payload) {
    const response = await fetch(gasUrl.trim(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, secret: syncSecret }),
    });
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      if (!data.ok) throw new Error(data.error || "GAS returned ok:false");
      return data;
    } catch (error) {
      throw new Error(`${error.message}\n\nResponse:\n${text.slice(0, 500)}`);
    }
  }

  async function pingGas() {
    if (!validateSyncSettings()) return;
    setSyncStatus("Pinging...");
    try {
      const data = await callGas({ action: "ping" });
      setSyncStatus(`OK: ${data.message || "connected"}`);
    } catch (error) {
      setSyncStatus(`Error: ${error.message}`);
    }
  }

  async function pushToNotion({ silent = false } = {}) {
    if (!validateSyncSettings()) return;
    if (!silent) setSyncStatus("Pushing to Notion...");
    const updatedAt = nowIso();
    const version = Date.now();
    try {
      const data = await callGas({
        action: "push",
        tree,
        markdown: treeToMarkdown(tree),
        updatedAt,
        version,
        device: getDeviceLabel(),
      });
      setDirty(false);
      setSyncMeta((current) => ({
        ...current,
        version: data.version || version,
        localUpdatedAt: updatedAt,
        remoteUpdatedAt: data.updatedAt || updatedAt,
      }));
      setSyncStatus(`Pushed: ${new Date(updatedAt).toLocaleString()}`);
    } catch (error) {
      setSyncStatus(`Push Error: ${error.message}`);
    }
  }

  async function pullFromNotion({ confirmOverwrite = true } = {}) {
    if (!validateSyncSettings()) return;
    if (confirmOverwrite) {
      const ok = window.confirm("Notion上の内容で、この端末のアウトラインを上書きします。続けますか？");
      if (!ok) return;
    }
    setSyncStatus("Pulling from Notion...");
    try {
      const data = await callGas({ action: "pull" });
      const nextTree = normalizeTree(data.tree || []);
      setTree(nextTree);
      setZoomId(null);
      setEditorRevision((value) => value + 1);
      setDirty(false);
      setSyncMeta((current) => ({
        ...current,
        version: data.version || current.version || 0,
        localUpdatedAt: data.updatedAt || nowIso(),
        remoteUpdatedAt: data.updatedAt || nowIso(),
      }));
      setSyncStatus(`Pulled: ${new Date(data.updatedAt || Date.now()).toLocaleString()}`);
    } catch (error) {
      setSyncStatus(`Pull Error: ${error.message}`);
    }
  }

  async function smartSync() {
    if (!validateSyncSettings()) return;
    setSyncStatus("Checking remote status...");
    try {
      const status = await callGas({ action: "status" });
      const remoteUpdatedAt = status.updatedAt ? Date.parse(status.updatedAt) : 0;
      const localUpdatedAt = syncMeta.localUpdatedAt ? Date.parse(syncMeta.localUpdatedAt) : 0;
      if (status.exists && remoteUpdatedAt > localUpdatedAt && !dirty) {
        await pullFromNotion({ confirmOverwrite: false });
        return;
      }
      if (status.exists && remoteUpdatedAt > localUpdatedAt && dirty) {
        const ok = window.confirm("Notion側もこの端末側も更新されています。NotionからPullしますか？キャンセルするとPushします。");
        if (ok) await pullFromNotion({ confirmOverwrite: false });
        else await pushToNotion();
        return;
      }
      await pushToNotion();
    } catch (error) {
      setSyncStatus(`Sync Error: ${error.message}`);
    }
  }

  function NodeRow({ node, depth = 0 }) {
    if (!hasMatch(node, query)) return null;

    const hasChildren = node.children.length > 0;
    const matched = query.trim() && node.text.toLowerCase().includes(query.toLowerCase());
    const isFocused = focusedId === node.id;
    const showHighlightedText = Boolean(query.trim());

    return (
      <div className="node">
        <div className="node-row" style={{ marginLeft: depth * 24 }}>
          <button
            type="button"
            onClick={() => (hasChildren ? toggleCollapse(node.id) : addChild(node.id))}
            className={`node-disclosure ${isFocused ? "is-active" : ""}`}
            title={hasChildren ? "折りたたむ" : "子要素を追加"}
          >
            {hasChildren ? (
              node.collapsed ? (
                <Icon name="right" size={14} />
              ) : (
                <Icon name="down" size={14} />
              )
            ) : (
              <Icon name="circle" size={9} />
            )}
          </button>

          <div className="node-input-wrap">
            {showHighlightedText && (
              <div
                className={`node-highlight-layer ${matched ? "is-matched" : ""}`}
                aria-hidden="true"
              >
                <HighlightedText text={node.text || "なにか書く"} query={query} mode={mode} />
              </div>
            )}

            <FastTextInput
              key={`${editorRevision}_${node.id}`}
              nodeId={node.id}
              value={node.text}
              onCommit={commitText}
              onKeyDown={(event, currentText) => handleKeyDown(event, node, currentText)}
              onFocus={() => setFocusedId(node.id)}
              inputRef={(element) => {
                if (element) inputRefs.current[node.id] = element;
              }}
              placeholder="なにか書く"
              className={`node-input ${showHighlightedText ? "is-transparent" : ""}`}
              style={{
                fontFamily: editorFontFamily,
                color: showHighlightedText
                  ? "transparent"
                  : matched || isFocused
                    ? colors.text
                    : colors.soft,
                caretColor: colors.accent,
              }}
              ariaLabel={node.text || "Empty block"}
            />
          </div>

          <span className="node-count" title="このブロック配下の文字数">
            {countCharacters(node)}
          </span>

          <div className="node-actions">
            <button
              type="button"
              onClick={() => toggleFavorite(node.id)}
              className={`icon-button ${node.favorite ? "is-favorite" : ""}`}
              title={node.favorite ? "お気に入りから外す" : "お気に入りに追加"}
            >
              <Icon name={node.favorite ? "starFilled" : "star"} size={14} />
            </button>

            <button
              type="button"
              onClick={() => setZoomId(node.id)}
              className="text-button"
              title="この項目に潜る"
            >
              zoom
            </button>

            <button
              type="button"
              onClick={() => addChild(node.id)}
              className="icon-button"
              title="子要素を追加"
            >
              <Icon name="plus" size={14} />
            </button>

            <button
              type="button"
              onClick={() => removeNode(node.id)}
              className="icon-button danger"
              title="削除"
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        </div>

        {hasChildren && !node.collapsed && (
          <div>
            {node.children.map((child) => (
              <NodeRow key={child.id} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="app"
      data-mode={mode}
      data-chrome-hidden={chromeHidden ? "true" : "false"}
      onMouseMove={maybeRevealChrome}
    >
      <div className="layout">
        <aside className="sidebar">
          <button type="button" onClick={() => setZoomId(null)} className="brand">
            <span>Quietliner</span>
            <span className="brand-count">{totalCount}</span>
          </button>

          <div className="sidebar-heading">
            <span>Favorites</span>
            <span>{favorites.length}</span>
          </div>

          <nav className="favorite-list">
            {favorites.length ? (
              favorites.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setZoomId(item.id)}
                  className={`favorite-item ${zoomId === item.id ? "is-current" : ""}`}
                  title={item.trail.join(" / ")}
                >
                  <span className="favorite-title">{item.text}</span>
                  {item.trail.length > 1 && (
                    <span className="favorite-trail">
                      {item.trail.slice(0, -1).join(" / ")}
                    </span>
                  )}
                </button>
              ))
            ) : (
              <p className="sidebar-empty">
                アウトライン上の☆を押すと、ここに項目が並びます。
              </p>
            )}
          </nav>
        </aside>

        <main className="main">
          <header className="topbar">
            <div className="topbar-left">
              <div className="breadcrumbs">
                <button type="button" onClick={() => setZoomId(null)}>
                  <Icon name="home" size={13} />
                  Home
                </button>

                {breadcrumbs.map((crumb) => (
                  <React.Fragment key={crumb.id}>
                    <span>/</span>
                    <button type="button" onClick={() => setZoomId(crumb.id)}>
                      {crumb.text || "Untitled"}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              <div className="title-row">
                <h1 style={{ fontFamily: editorFontFamily }}>
                  {zoomNode ? zoomNode.text || "Untitled" : "All Notes"}
                </h1>
                <span className="title-count" title="現在表示しているブロック配下の文字数">
                  {visibleCharacterCount}
                </span>

                {zoomNode && (
                  <button
                    type="button"
                    onClick={() => toggleFavorite(zoomNode.id)}
                    className={`icon-button ${zoomNode.favorite ? "is-favorite" : ""}`}
                    title={zoomNode.favorite ? "お気に入りから外す" : "お気に入りに追加"}
                  >
                    <Icon name={zoomNode.favorite ? "starFilled" : "star"} size={16} />
                  </button>
                )}

                {dirty && <span className="dirty-dot" title="未同期の変更があります" />}
              </div>
            </div>

            <div className="topbar-actions">
              <label className="search">
                <Icon name="search" size={15} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search"
                />
              </label>

              <button type="button" onClick={smartSync} className="sync-button" title={syncStatus}>
                <Icon name="sync" size={15} />
                Sync
              </button>

              <button type="button" onClick={addRootNode} className="add-button">
                Add
              </button>

              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="icon-button"
                aria-label="Settings"
              >
                <Icon name="settings" size={17} />
              </button>
            </div>
          </header>

          <section className="content">
            <div className="editor">
              {zoomNode && (
                <div className="zoom-title-row">
                  <FastTextInput
                    key={`${editorRevision}_${zoomNode.id}_title`}
                    nodeId={zoomNode.id}
                    value={zoomNode.text}
                    onCommit={commitText}
                    onKeyDown={() => {}}
                    onFocus={() => setFocusedId(zoomNode.id)}
                    inputRef={(element) => {
                      if (element) inputRefs.current[zoomNode.id] = element;
                    }}
                    className="zoom-title-input"
                    style={{
                      fontFamily: editorFontFamily,
                      color: colors.text,
                      caretColor: colors.accent,
                    }}
                    placeholder="Untitled"
                    ariaLabel={zoomNode.text || "Untitled"}
                  />

                  <span className="title-count" title="このブロック配下の文字数">
                    {countCharacters(zoomNode)}
                  </span>
                </div>
              )}

              {visibleNodes.length ? (
                visibleNodes.map((node) => <NodeRow key={node.id} node={node} />)
              ) : (
                <button type="button" onClick={addRootNode} className="empty-editor">
                  最初のブロックを追加する
                </button>
              )}
            </div>
          </section>
        </main>
      </div>

      {chromeHidden && (
        <button type="button" onClick={revealChrome} className="reveal-button">
          UI
        </button>
      )}

      {settingsOpen && (
        <div className="modal-backdrop">
          <div className="settings-panel">
            <div className="settings-head">
              <div>
                <div className="settings-title">Settings</div>
                <div className="settings-subtitle">静かなアウトライナーのための最低限の設定</div>
              </div>

              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="icon-button"
                aria-label="Close settings"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="settings-body">
              <section>
                <div className="setting-label">Sync</div>
                <button
                  type="button"
                  onClick={() => setSyncOpen((value) => !value)}
                  className="shortcut-toggle"
                >
                  <span>GAS / Notion Sync</span>
                  <span>{syncOpen ? "−" : "+"}</span>
                </button>

                {syncOpen && (
                  <div className="sync-panel">
                    <label>
                      <span>GAS Web App URL</span>
                      <input
                        value={gasUrl}
                        onChange={(event) => setGasUrl(event.target.value)}
                        placeholder="https://script.google.com/macros/s/..."
                      />
                    </label>

                    <label>
                      <span>Shared Secret</span>
                      <input
                        value={syncSecret}
                        onChange={(event) => setSyncSecret(event.target.value)}
                        placeholder="QUIETLINER_SECRET"
                        type="password"
                      />
                    </label>

                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={autoSyncEnabled}
                        onChange={(event) => setAutoSyncEnabled(event.target.checked)}
                      />
                      <span>Auto sync after edits / 編集後に自動Push</span>
                    </label>

                    <div className="sync-actions">
                      <button type="button" onClick={pingGas} className="subtle-button">Ping</button>
                      <button type="button" onClick={() => pushToNotion()} className="subtle-button"><Icon name="upload" size={13} /> Push</button>
                      <button type="button" onClick={() => pullFromNotion()} className="subtle-button"><Icon name="download" size={13} /> Pull</button>
                      <button type="button" onClick={smartSync} className="subtle-button"><Icon name="sync" size={13} /> Smart Sync</button>
                    </div>

                    <div className="sync-status">{syncStatus}</div>
                  </div>
                )}
              </section>

              <section>
                <div className="setting-label">Mode</div>
                <div className="choice-grid two">
                  {["dark", "light"].map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => chooseMode(item)}
                      className={mode === item ? "is-selected" : ""}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className="setting-label">Background / Text Preset</div>
                <div className="palette-list">
                  {paletteOptionsForMode.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPaletteChoice(option.value)}
                      className={paletteChoice === option.value ? "is-selected" : ""}
                    >
                      <span>{option.label}</span>
                      <span className="palette-swatches">
                        <span style={{ background: option.background }} />
                        <span style={{ background: option.text }} />
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className="setting-label">Custom Colors</div>
                <div className="color-grid">
                  <label>
                    <span>Background</span>
                    <input
                      type="color"
                      value={customBackground || colors.background}
                      onChange={(event) => setCustomBackground(event.target.value)}
                    />
                  </label>

                  <label>
                    <span>Text</span>
                    <input
                      type="color"
                      value={customText || colors.text}
                      onChange={(event) => setCustomText(event.target.value)}
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCustomBackground("");
                    setCustomText("");
                  }}
                  className="subtle-button"
                >
                  カスタムカラーを解除
                </button>
              </section>

              <section>
                <div className="setting-label">Font</div>
                <div className="font-grid">
                  {fontOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFontChoice(option.value)}
                      className={fontChoice === option.value ? "is-selected" : ""}
                      style={{ fontFamily: option.family }}
                    >
                      <span>{option.label}</span>
                      <small>{option.note}</small>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <button
                  type="button"
                  onClick={() => setShortcutsOpen((value) => !value)}
                  className="shortcut-toggle"
                >
                  <span>Shortcuts</span>
                  <span>{shortcutsOpen ? "−" : "+"}</span>
                </button>

                {shortcutsOpen && (
                  <div className="shortcut-list">
                    {shortcuts.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                )}
              </section>

              <div className="settings-footer">
                <button type="button" onClick={exportJson} className="subtle-button">
                  JSONを書き出し
                </button>

                <button type="button" onClick={resetDemo} className="danger-button">
                  デモデータをリセット
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
