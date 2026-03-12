import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MagnifyingGlass, Folder, File, UploadSimple, FolderPlus,
  Trash, ArrowUp, ArrowClockwise, CaretRight, CaretLeft, Check, X,
  SquaresFour, Rows, DownloadSimple, Eye, Info, Clock, Star,
  HardDrives, DotsThree, Plus, CloudArrowUp, GearSix, PencilSimple,
} from "@phosphor-icons/react";
import {
  createGitHubFolder,
  deleteGitHubPath,
  getGitHubFileBlob,
  getGitHubRepoSize,
  listGitHubPath,
  moveGitHubPath,
  uploadGitHubFile,
} from "./lib/github";
import { GitSettings, clearSettings, getSettings, saveSettings } from "./lib/settings";

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */
type Item = {
  name: string;
  path: string;
  type: "folder" | "file";
  size: number;
  sha: string;
  downloadUrl?: string | null;
};
type Toast = { id: number; message: string; kind: "info" | "success" | "error"; sticky?: boolean };
type UploadItem = {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  message?: string;
};
type DownloadItem = {
  id: string;
  name: string;
  progress: number | null;
  status: "downloading" | "done" | "error";
  message?: string;
};
type ViewerState = {
  open: boolean;
  item?: Item;
  kind?: "image" | "pdf" | "text" | "video" | "unknown";
  url?: string;
  text?: string;
  loading?: boolean;
  error?: string | null;
};
type RecentEntry = {
  name: string;
  path: string;
  type: "folder" | "file";
  size: number;
  ts: number;
};
type StarEntry = {
  name: string;
  path: string;
  type: "folder" | "file";
  size: number;
  ts: number;
};

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_REPO_BYTES = 5 * 1024 * 1024 * 1024;
const MAX_RECENT = 50;
const MAX_STARRED = 200;
const RECENT_KEY = "jrcloud.recent.v1";
const STARRED_KEY = "jrcloud.starred.v1";

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */
const formatBytes = (v: number) => {
  if (!v) return "—";
  const s = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(v) / Math.log(1024)), s.length - 1);
  const n = v / Math.pow(1024, i);
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${s[i]}`;
};
const extOf = (name: string) =>
  name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";

const EXT_META: Record<string, { color: string; label: string }> = {
  pdf: { color: "#FF3B30", label: "PDF" },
  md: { color: "#007AFF", label: "MD" },
  txt: { color: "#34C759", label: "TXT" },
  docx: { color: "#007AFF", label: "DOC" },
  xlsx: { color: "#34C759", label: "XLS" },
  pptx: { color: "#FF9500", label: "PPT" },
  jpg: { color: "#AF52DE", label: "JPG" },
  jpeg: { color: "#AF52DE", label: "JPG" },
  png: { color: "#AF52DE", label: "PNG" },
  gif: { color: "#5856D6", label: "GIF" },
  svg: { color: "#AF52DE", label: "SVG" },
  mp4: { color: "#FF2D55", label: "MP4" },
  mov: { color: "#FF2D55", label: "MOV" },
  zip: { color: "#FF9500", label: "ZIP" },
  ts: { color: "#007AFF", label: "TS" },
  tsx: { color: "#007AFF", label: "TSX" },
  js: { color: "#FFCC00", label: "JS" },
  jsx: { color: "#FFCC00", label: "JSX" },
  json: { color: "#FF9500", label: "JSON" },
  css: { color: "#007AFF", label: "CSS" },
  html: { color: "#FF3B30", label: "HTML" },
};
const extMeta = (name: string) =>
  EXT_META[extOf(name)] ?? { color: "#8E8E93", label: (extOf(name).toUpperCase().slice(0, 4) || "FILE") };

const readStoredList = <T,>(key: string, fallback: T[] = []): T[] => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
};

const writeStoredList = (key: string, value: unknown) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors.
  }
};

type RepoSizeCache = { size: number; ts: number };
const readStoredRepoSize = (key: string): RepoSizeCache | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.size === "number" && typeof parsed.ts === "number") {
      return parsed as RepoSizeCache;
    }
    return null;
  } catch {
    return null;
  }
};

const writeStoredRepoSize = (key: string, size: number) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ size, ts: Date.now() }));
  } catch {
    // Ignore storage errors.
  }
};

const entryToItem = (entry: RecentEntry | StarEntry): Item => ({
  name: entry.name,
  path: entry.path,
  type: entry.type,
  size: entry.size,
  sha: "",
});

/* ─────────────────────────────────────────
   Icons — Phosphor
───────────────────────────────────────── */
const Ic = {
  search: () => <MagnifyingGlass size={14} weight="regular" />,
  folder: () => <Folder size={17} weight="regular" />,
  folderFill: () => <Folder size={22} weight="fill" />,
  file: () => <File size={16} weight="regular" />,
  upload: () => <UploadSimple size={14} weight="regular" />,
  newFolder: () => <FolderPlus size={14} weight="regular" />,
  trash: () => <Trash size={13} weight="regular" />,
  moveUp: () => <ArrowUp size={13} weight="regular" />,
  refresh: () => <ArrowClockwise size={14} weight="regular" />,
  chevRight: () => <CaretRight size={10} weight="bold" />,
  chevLeft: () => <CaretLeft size={16} weight="regular" />,
  check: () => <Check size={10} weight="bold" />,
  x: () => <X size={11} weight="bold" />,
  grid: () => <SquaresFour size={13} weight="regular" />,
  list: () => <Rows size={13} weight="regular" />,
  download: () => <DownloadSimple size={13} weight="regular" />,
  eye: () => <Eye size={13} weight="regular" />,
  info: () => <Info size={14} weight="regular" />,
  clock: () => <Clock size={15} weight="regular" />,
  star: (filled = false) => <Star size={15} weight={filled ? "fill" : "regular"} />,
  drive: () => <HardDrives size={15} weight="regular" />,
  ellipsis: () => <DotsThree size={16} weight="fill" />,
  plus: () => <Plus size={16} weight="regular" />,
  icloudUp: () => <CloudArrowUp size={22} weight="regular" />,
  settings: () => <GearSix size={16} weight="regular" />,
  rename: () => <PencilSimple size={14} weight="regular" />,
};

/* ─────────────────────────────────────────
   CSS
───────────────────────────────────────── */
const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  /* ── macOS Sonoma system colors ── */
  --sys-bg:         #DCDCDC;
  --sys-window-bg:  #ECECEC;
  --sys-sidebar:    rgba(241,241,244,0.62);
  --sys-toolbar:    rgba(251,251,253,0.88);
  --sys-content:    #F4F4F4;
  --sys-white:      #FFFFFF;
  --sys-sep:      rgba(0,0,0,0.08);
  --sys-sep2:     rgba(0,0,0,0.048);

  /* macOS label hierarchy — from HIG */
  --l1: rgba(0,0,0,0.847);
  --l2: rgba(0,0,0,0.498);
  --l3: rgba(0,0,0,0.259);
  --l4: rgba(0,0,0,0.118);

  /* Brand tint — rose */
  --tint:        #D95F7F;
  --tint-mid:    #C65473;
  --tint-l:      rgba(217,95,127,0.09);
  --tint-border: rgba(217,95,127,0.22);

  /* Typography */
  --font: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif;
  --font-mono: ui-monospace, 'SF Mono', 'Menlo', 'Monaco', 'Cascadia Mono', 'Segoe UI Mono', monospace;

  /* System fills — macOS */
  --green:  #34C759;
  --red:    #FF3B30;
  --blue:   #007AFF;
  --fill:   rgba(120,120,128,0.11);
  --fill2:  rgba(120,120,128,0.15);
  --fill3:  rgba(120,120,128,0.20);

  /* Layout */
  --sidebar-w: 220px;
  --toolbar-h: 52px;
  --vh: 100vh;

  /* Shadows — layered for depth */
  --sh-sm: 0 1px 2px rgba(0,0,0,0.09), 0 0.5px 1px rgba(0,0,0,0.06);
  --sh-md: 0 4px 12px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06);
  --sh-lg: 0 10px 36px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
  --sh-xl: 0 22px 64px rgba(0,0,0,0.15), 0 4px 14px rgba(0,0,0,0.08);
}

@supports (height: 100dvh) {
  :root { --vh: 100dvh; }
}

html, body, #root {
  height: 100%;
  font-family: var(--font);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-size: 13px;
  line-height: 1.45;
  color: var(--l1);
  background: var(--sys-bg);
  letter-spacing: -0.003em;
}
body { overflow: hidden; }

/* macOS overlay scrollbars */
::-webkit-scrollbar { width: 7px; height: 7px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: transparent; border-radius: 10px; }
.sidebar-nav::-webkit-scrollbar-thumb,
.content::-webkit-scrollbar-thumb,
.ios-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.16); border-radius: 10px; }

.hidden { display: none !important; }

/* ================================================================
   DESKTOP — macOS Sonoma Finder
================================================================ */
.desktop-view { display: flex; flex: 1; overflow: hidden; height: var(--vh); min-height: var(--vh); }
.mobile-view  { display: none; }
/* Fixed-position overlays also need hiding */
.desktop-view.viewer-overlay,
.desktop-view.settings-overlay { display: flex; }
.mobile-view.ios-viewer-overlay,
.mobile-view.ios-settings-overlay { display: flex; }

/* Window chrome — Sonoma rounded corners + layered shadow */
.mac-window {
  display: flex; flex: 1; overflow: hidden;
  border-radius: 10px;
  box-shadow:
    0 0 0 0.5px rgba(0,0,0,0.24),
    inset 0 0 0 0.5px rgba(255,255,255,0.12),
    0 2px 6px rgba(0,0,0,0.10),
    0 12px 40px rgba(0,0,0,0.18),
    0 28px 80px rgba(0,0,0,0.22);
}

/* Sidebar — Sonoma vibrancy material */
.sidebar {
  width: var(--sidebar-w); flex-shrink: 0;
  display: flex; flex-direction: column;
  background: var(--sys-sidebar);
  backdrop-filter: saturate(180%) blur(28px) brightness(1.02);
  -webkit-backdrop-filter: saturate(180%) blur(28px) brightness(1.02);
  border-right: 0.5px solid rgba(0,0,0,0.11);
  overflow: hidden; z-index: 10;
}

/* Traffic lights — 12px circles, 8px gap, macOS Sonoma spec */
.sidebar-traffic { height: var(--toolbar-h); display: flex; align-items: center; padding: 0 20px; gap: 8px; flex-shrink: 0; }
.td {
  width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0;
  position: relative; cursor: default;
  transition: filter 0.1s;
}
/* Specular highlight — top-left gloss dot */
.td::before {
  content: ''; position: absolute;
  top: 1.5px; left: 2px;
  width: 4px; height: 4px; border-radius: 50%;
  background: rgba(255,255,255,0.50);
  pointer-events: none;
}
/* Inset glyph on hover */
.td::after {
  content: ''; position: absolute;
  inset: 0; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 7px; font-weight: 900; line-height: 12px; text-align: center;
  color: rgba(0,0,0,0.42); opacity: 0;
  transition: opacity 0.1s;
}
.sidebar-traffic:hover .td::after { opacity: 1; }
.td.cl::after { content: '✕'; font-size: 6.5px; }
.td.mn::after { content: '—'; font-size: 8px; line-height: 14px; }
.td.mx::after { content: '⤢'; font-size: 7px; }
.td.cl { background: #FF5F57; box-shadow: 0 0 0 0.5px rgba(200,0,0,0.25); }
.td.mn { background: #FEBC2E; box-shadow: 0 0 0 0.5px rgba(160,100,0,0.22); }
.td.mx { background: #28C840; box-shadow: 0 0 0 0.5px rgba(0,130,0,0.22); }

.sidebar-nav { flex: 1; padding: 4px 0 8px; overflow-y: auto; }
.nav-section { margin-bottom: 2px; }
.nav-sec-hd {
  font-size: 11px; font-weight: 600; color: var(--l3);
  letter-spacing: 0.04em; text-transform: uppercase;
  padding: 10px 20px 2px; user-select: none;
}
.nav-item {
  display: flex; align-items: center; gap: 5px;
  height: 22px; padding: 0 6px 0 18px;
  border-radius: 6px; margin: 0 8px;
  font-size: 13px; font-weight: 400; color: var(--l1);
  background: none; border: none; cursor: default;
  width: calc(100% - 16px); text-align: left;
  transition: background 0.07s; user-select: none; white-space: nowrap;
  letter-spacing: -0.003em;
}
.nav-item:hover:not(:disabled) { background: rgba(0,0,0,0.048); }
.nav-item.active {
  background: var(--tint); color: white;
  box-shadow: 0 1px 3px rgba(217,95,127,0.28), inset 0 0.5px 0 rgba(255,255,255,0.15);
}
.nav-item.active .nav-ic { color: rgba(255,255,255,0.88); }
.nav-ic { color: var(--l3); display: flex; align-items: center; flex-shrink: 0; }
.nav-item:hover:not(:disabled):not(.active) .nav-ic { color: var(--l2); }
.nav-item-label { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.nav-item:disabled { opacity: 0.30; }
.nav-divider { height: 0.5px; background: var(--sys-sep); margin: 4px 18px; }

/* Sidebar footer */

/* Main */
.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--sys-content); }

/* Toolbar — unified title bar + toolbar pattern */
.toolbar {
  height: var(--toolbar-h); display: flex; align-items: center; gap: 6px; padding: 0 12px;
  background: var(--sys-toolbar);
  backdrop-filter: saturate(180%) blur(28px);
  -webkit-backdrop-filter: saturate(180%) blur(28px);
  border-bottom: 0.5px solid rgba(0,0,0,0.10); flex-shrink: 0; z-index: 10;
}

.toolbar-nav-btns { display: flex; gap: 0; flex-shrink: 0; }
.toolbar-nav-btn {
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: default;
  color: var(--l2); border-radius: 6px; transition: background 0.07s, color 0.07s;
}
.toolbar-nav-btn:hover:not(:disabled) { background: var(--fill); color: var(--l1); }
.toolbar-nav-btn:active:not(:disabled) { background: var(--fill2); }
.toolbar-nav-btn:disabled { opacity: 0.26; }

/* Breadcrumb */
.breadcrumb { display: flex; align-items: center; flex: 1; min-width: 0; overflow: hidden; }
.crumb {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 4px; border-radius: 4px;
  font-size: 13px; font-weight: 400; color: var(--l2);
  background: none; border: none; cursor: default; white-space: nowrap;
  transition: background 0.07s, color 0.07s; letter-spacing: -0.003em;
}
.crumb:hover { background: var(--fill); color: var(--l1); }
.crumb:last-child { color: var(--l1); font-weight: 600; }
.crumb-sep { color: var(--l4); display: flex; align-items: center; }

/* Search */
.search-wrap { position: relative; flex-shrink: 0; }
.search-ic { position: absolute; left: 7px; top: 50%; transform: translateY(-50%); color: var(--l3); display: flex; pointer-events: none; }
.search-input {
  background: var(--fill); border: none; border-radius: 7px;
  padding: 0 26px; height: 26px; width: 186px;
  font-family: inherit; font-size: 13px; color: var(--l1);
  outline: none; transition: width 0.16s cubic-bezier(0.4,0,0.2,1), background 0.12s, box-shadow 0.12s;
  letter-spacing: -0.003em;
}
.search-input::placeholder { color: var(--l3); }
.search-input:focus {
  background: rgba(255,255,255,0.94);
  box-shadow: 0 0 0 3px rgba(217,95,127,0.20), var(--sh-sm);
  width: 210px;
}
.search-clear {
  position: absolute; right: 5px; top: 50%; transform: translateY(-50%);
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--l3); border: none; cursor: default;
  display: flex; align-items: center; justify-content: center; color: white; padding: 0;
}
.search-clear:hover { background: var(--l2); }

.toolbar-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

/* macOS segmented control */
.seg-ctrl { display: flex; background: var(--fill); border-radius: 5px; padding: 2px; gap: 1px; }
.seg-btn {
  width: 26px; height: 21px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: default;
  color: var(--l2); border-radius: 3px; transition: all 0.08s;
}
.seg-btn.on {
  background: var(--sys-white); color: var(--l1);
  box-shadow: 0 1px 2px rgba(0,0,0,0.14), 0 0.5px 0.5px rgba(0,0,0,0.09);
}

/* Toolbar buttons — macOS HIG spec */
.tb-btn {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: inherit; font-size: 13px; font-weight: 400;
  border-radius: 5px; padding: 0 8px; height: 24px;
  border: none; cursor: default; transition: all 0.07s;
  white-space: nowrap; user-select: none; letter-spacing: -0.003em;
}
.tb-btn:disabled { opacity: 0.34; }
.tb-btn:active:not(:disabled) { transform: scale(0.97); filter: brightness(0.94); }
.tb-btn-default {
  background: linear-gradient(180deg, #FEFEFE 0%, #F4F4F4 100%);
  color: var(--l1);
  box-shadow: 0 1px 2px rgba(0,0,0,0.12), 0 0.5px 0.5px rgba(0,0,0,0.08), inset 0 0.5px 0 rgba(255,255,255,0.90);
  border: 0.5px solid rgba(0,0,0,0.14);
}
.tb-btn-default:hover:not(:disabled) { background: linear-gradient(180deg, #F8F8F8 0%, #EFEFEF 100%); }
.tb-btn-tint {
  background: var(--tint); color: white;
  box-shadow: 0 1px 3px rgba(217,95,127,0.35), inset 0 0.5px 0 rgba(255,255,255,0.20);
}
.tb-btn-tint:hover:not(:disabled) { filter: brightness(1.06); }
.tb-btn-ghost { background: transparent; color: var(--l2); }
.tb-btn-ghost:hover:not(:disabled) { background: var(--fill); color: var(--l1); }
.tb-btn-destructive { background: transparent; color: var(--red); }
.tb-btn-destructive:hover:not(:disabled) { background: rgba(255,59,48,0.07); }
.tb-icon-btn {
  width: 24px; height: 24px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border: none; cursor: default; border-radius: 5px;
  background: none; color: var(--l2); transition: background 0.07s, color 0.07s;
}
.tb-icon-btn:hover:not(:disabled) { background: var(--fill); color: var(--l1); }
.tb-icon-btn:disabled { opacity: 0.26; }

/* Content */
.content { flex: 1; overflow-y: auto; position: relative; }

/* ── Floating selection pill — precision dark command bar ── */
.float-sel-pill {
  position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
  background: rgba(28,28,30,0.88);
  backdrop-filter: saturate(200%) blur(40px);
  -webkit-backdrop-filter: saturate(200%) blur(40px);
  border-radius: 26px; z-index: 20;
  display: flex; align-items: center; gap: 0;
  padding: 4px 6px;
  border: 0.5px solid rgba(255,255,255,0.09);
  box-shadow:
    0 1px 0 rgba(255,255,255,0.06) inset,
    0 0 0 0.5px rgba(0,0,0,0.5),
    0 4px 16px rgba(0,0,0,0.28),
    0 12px 36px rgba(0,0,0,0.16);
  animation: pillIn 0.26s cubic-bezier(0.34,1.56,0.64,1);
  white-space: nowrap;
}
@keyframes pillIn {
  from { transform: translateX(-50%) scale(0.82) translateY(-6px); opacity: 0; }
  to   { transform: translateX(-50%) scale(1)    translateY(0);    opacity: 1; }
}
.pill-label {
  font-size: 11.5px; font-weight: 600;
  color: rgba(255,255,255,0.46);
  padding: 0 8px 0 4px;
  letter-spacing: 0.002em;
}
.pill-divider {
  width: 0.5px; height: 14px;
  background: rgba(255,255,255,0.10);
  margin: 0 1px; flex-shrink: 0;
}
.pill-btn {
  display: flex; align-items: center; gap: 4px;
  background: none; border: none; cursor: default;
  color: rgba(255,255,255,0.72);
  font-size: 12px; font-weight: 500;
  padding: 5px 9px; border-radius: 20px;
  transition: background 0.08s, color 0.08s;
  letter-spacing: -0.002em; font-family: inherit;
}
.pill-btn:hover:not(:disabled) { background: rgba(255,255,255,0.11); color: white; }
.pill-btn:active:not(:disabled) { background: rgba(255,255,255,0.14); transform: scale(0.95); }
.pill-btn:disabled { opacity: 0.24; }
.pill-btn.danger { color: rgba(255,100,90,0.85); }
.pill-btn.danger:hover:not(:disabled) { background: rgba(255,59,48,0.16); color: #FF6B6B; }

/* ── Finder error/info strip (slim, unobtrusive) ── */
.error-banner {
  display: flex; align-items: center; gap: 7px;
  background: rgba(255,59,48,0.06); border-bottom: 0.5px solid rgba(255,59,48,0.10);
  padding: 6px 12px; font-size: 12px; color: var(--red);
}

/* ── Progress float badge — collapses active transfers into a pill ── */
.progress-float {
  position: fixed; bottom: 20px; right: 20px; z-index: 400;
  display: flex; flex-direction: column; gap: 4px;
  pointer-events: all;
}
.progress-float-badge {
  background: rgba(36,36,38,0.94); backdrop-filter: blur(24px) saturate(180%);
  border-radius: 14px; padding: 10px 14px; min-width: 230px; max-width: 280px;
  box-shadow: var(--sh-lg), inset 0 0.5px 0 rgba(255,255,255,0.08);
  animation: toastIn 0.20s cubic-bezier(0.34,1.56,0.64,1);
}
.progress-float-head { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.progress-float-title { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.85); flex: 1; letter-spacing: -0.003em; }
.progress-float-count { font-size: 11px; color: rgba(255,255,255,0.40); }
.progress-float-clear { font-size: 11px; color: rgba(255,255,255,0.42); background: none; border: none; cursor: default; font-family: inherit; letter-spacing: -0.003em; }
.progress-float-clear:hover { color: rgba(255,255,255,0.65); }
.progress-float-items { display: flex; flex-direction: column; gap: 5px; }
.progress-float-row { display: grid; grid-template-columns: 1fr 38px; gap: 8px; align-items: center; }
.progress-float-name { font-size: 11.5px; color: rgba(255,255,255,0.60); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.003em; }
.progress-float-pct { font-size: 10.5px; color: rgba(255,255,255,0.38); text-align: right; }
.progress-float-track { height: 2px; background: rgba(255,255,255,0.12); border-radius: 99px; overflow: hidden; margin-top: 2px; }
.progress-float-fill { display: block; height: 100%; background: var(--tint); border-radius: 99px; transition: width 0.22s ease; }
.progress-float-track.err .progress-float-fill { background: #FF453A; }

/* ── Desktop right-click context menu — NSMenu-accurate ── */
.ctx-menu {
  position: fixed; z-index: 800;
  background: rgba(245,245,247,0.78);
  backdrop-filter: saturate(300%) blur(60px) brightness(1.04);
  -webkit-backdrop-filter: saturate(300%) blur(60px) brightness(1.04);
  border: 0.5px solid rgba(0,0,0,0.12);
  border-radius: 9px;
  padding: 6px;
  min-width: 220px;
  box-shadow:
    0 0 0 0.5px rgba(0,0,0,0.14),
    0 1px 0 rgba(255,255,255,0.70) inset,
    0 3px 8px rgba(0,0,0,0.09),
    0 8px 24px rgba(0,0,0,0.12),
    0 22px 48px rgba(0,0,0,0.10);
  animation: ctxIn 0.10s cubic-bezier(0.25,0.46,0.45,0.94);
  transform-origin: var(--ctx-origin, top left);
}
.ctx-head {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 6px 8px;
}
.ctx-head-ic {
  width: 28px; height: 28px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: white; flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(0,0,0,0.12), inset 0 0.5px 0 rgba(255,255,255,0.20);
}
.ctx-head-ic.folder { background: rgba(0,0,0,0.10); color: var(--l2); }
.ctx-head-ic.file { background: var(--tint); }
.ctx-head-ic .ctx-ext { font-size: 9px; font-weight: 700; letter-spacing: 0.04em; }
.ctx-head-text { min-width: 0; }
.ctx-head-name {
  font-size: 12.5px; font-weight: 600; color: var(--l1);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  letter-spacing: -0.004em;
}
.ctx-head-sub { font-size: 11px; color: var(--l3); letter-spacing: -0.002em; }
@keyframes ctxIn {
  from { transform: scale(0.94); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}
.ctx-item {
  display: flex; align-items: center; gap: 9px;
  padding: 3.5px 8px; border-radius: 6px;
  font-size: 13px; color: rgba(0,0,0,0.85);
  cursor: default; background: none; border: none;
  width: 100%; text-align: left; font-family: inherit;
  transition: background 0.04s, color 0.04s;
  letter-spacing: -0.003em; line-height: 1.35;
  user-select: none; min-height: 22px;
}
.ctx-item:hover:not(:disabled) {
  background: var(--tint);
  color: white;
}
.ctx-item:hover:not(:disabled) .ctx-ic { color: rgba(255,255,255,0.85); }
.ctx-item.danger { color: rgba(215,30,20,0.90); }
.ctx-item.danger:hover:not(:disabled) { background: rgba(215,30,20,0.88); color: white; }
.ctx-item:disabled { opacity: 0.28; }
.ctx-ic {
  color: rgba(0,0,0,0.42); display: flex; align-items: center;
  flex-shrink: 0; width: 15px; justify-content: center;
}
.ctx-divider {
  height: 0.5px;
  background: rgba(0,0,0,0.09);
  margin: 3px 0;
}

/* Finder list — compact 24px rows */
.finder-table { width: 100%; }
.finder-thead {
  display: grid; grid-template-columns: 2.8fr 90px 68px 52px;
  padding: 2px 12px;
  border-bottom: 0.5px solid var(--sys-sep);
  background: var(--sys-toolbar);
  position: sticky; top: 0; z-index: 5;
}
.finder-thead span { font-size: 11px; font-weight: 500; color: var(--l3); letter-spacing: 0.005em; user-select: none; }
.finder-row {
  display: grid; grid-template-columns: 2.8fr 90px 68px 52px;
  padding: 0 12px; align-items: center; height: 24px;
  background: transparent; border: none;
  border-bottom: 0.5px solid var(--sys-sep2);
  cursor: default; width: 100%; text-align: left;
  transition: background 0.05s; user-select: none;
  position: relative;
}
.finder-row:last-child { border-bottom: none; }
.finder-row:hover { background: rgba(0,0,0,0.034); }
.finder-row.selected { background: var(--tint) !important; }
.finder-row.selected .finder-name,
.finder-row.selected .finder-meta { color: rgba(255,255,255,0.95) !important; }
.finder-row.selected .file-type-badge { border-color: rgba(255,255,255,0.38) !important; }
.finder-row.drop-target { outline: 1.5px solid var(--blue); outline-offset: -1px; background: rgba(0,122,255,0.05); }
.finder-name-cell { display: flex; align-items: center; gap: 6px; min-width: 0; }
.finder-file-ic { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; position: relative; }
.finder-file-ic.is-folder { color: var(--tint); }
.finder-file-ic.is-file   { color: var(--l3); }
.file-type-badge {
  position: absolute; bottom: -2px; right: -5px;
  font-size: 4.5px; font-weight: 700; padding: 0.5px 2px; border-radius: 2px;
  color: white; line-height: 1.4; border: 1px solid white; letter-spacing: 0.01em;
}
.finder-name { font-size: 13px; color: var(--l1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.003em; }
.finder-meta { font-size: 11px; color: var(--l3); }

/* ── Hover-reveal row actions ── */
.row-hover-actions {
  display: flex; align-items: center; gap: 2px; justify-content: flex-end;
  opacity: 0; transition: opacity 0.10s;
}
.finder-row:hover .row-hover-actions { opacity: 1; }
.finder-row.selected .row-hover-actions { opacity: 1; }
.row-action-btn {
  width: 20px; height: 20px; border-radius: 5px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: none; cursor: default;
  color: var(--l3); transition: background 0.07s, color 0.07s;
}
.row-action-btn:hover { background: rgba(0,0,0,0.06); color: var(--l1); }
.row-action-btn.starred { color: var(--tint); }
.finder-row.selected .row-action-btn { color: rgba(255,255,255,0.80); }
.finder-row.selected .row-action-btn:hover { background: rgba(255,255,255,0.15); color: white; }
.finder-row.selected .row-action-btn.starred { color: white; }

/* Grid — icon view */
.finder-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 2px; padding: 8px; }
.grid-item {
  display: flex; flex-direction: column; align-items: center;
  padding: 7px 5px 6px; border-radius: 6px;
  cursor: default; background: none; border: none;
  transition: background 0.05s; position: relative; text-align: center; user-select: none;
}
.grid-item:hover { background: rgba(0,0,0,0.042); }
.grid-item.selected { background: var(--tint-l); outline: 1.5px solid var(--tint); outline-offset: -1px; border-radius: 6px; }
.grid-item.drop-target { outline: 1.5px solid var(--blue); outline-offset: -1px; background: rgba(0,122,255,0.05); }
.grid-item-sel { position: absolute; top: 4px; right: 4px; width: 16px; height: 16px; border-radius: 50%; background: var(--tint); display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 1px 3px rgba(217,95,127,0.35); }
.grid-star-btn {
  position: absolute; top: 3px; left: 3px;
  width: 16px; height: 16px; border-radius: 5px;
  border: none; background: rgba(255,255,255,0.88);
  display: flex; align-items: center; justify-content: center;
  color: var(--l3); cursor: pointer;
  box-shadow: 0 1px 2px rgba(0,0,0,0.09);
  opacity: 0; transition: opacity 0.10s;
}
.grid-item:hover .grid-star-btn,
.grid-item.selected .grid-star-btn { opacity: 1; }
.grid-star-btn.on { color: var(--tint); opacity: 1; }
.grid-file-ic { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 9px; margin-bottom: 4px; position: relative; flex-shrink: 0; }
.grid-file-ic.is-folder { color: var(--tint); background: var(--tint-l); }
.grid-file-ic.is-file   { color: var(--l3); background: var(--fill); }
.grid-ext-badge { position: absolute; bottom: -2px; right: -3px; font-size: 5.5px; font-weight: 700; padding: 0.5px 2.5px; border-radius: 2.5px; color: white; line-height: 1.3; border: 1.5px solid white; }
.grid-item-name { font-size: 11px; color: var(--l1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 82px; letter-spacing: -0.003em; }
.grid-item-sub  { font-size: 10px; color: var(--l3); margin-top: 1px; }

/* Empty */
.empty-state { padding: 60px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; }
.empty-ic { font-size: 40px; margin-bottom: 10px; line-height: 1; opacity: 0.18; }
.empty-title { font-size: 15px; font-weight: 600; color: var(--l1); margin-bottom: 4px; letter-spacing: -0.01em; }
.empty-sub { font-size: 13px; color: var(--l2); letter-spacing: -0.003em; }

/* Skeleton shimmer */
.sk { background: linear-gradient(90deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0.04) 100%); background-size: 300% 100%; animation: sk 1.8s ease-in-out infinite; border-radius: 4px; }
@keyframes sk { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* Drop overlay */
.drop-box-wrap { position: fixed; inset: 0; z-index: 300; display: flex; align-items: center; justify-content: center; background: rgba(220,220,220,0.68); backdrop-filter: blur(12px) saturate(160%); pointer-events: none; }
.drop-box {
  background: rgba(255,255,255,0.92); border: 1.5px dashed var(--tint-border); border-radius: 16px;
  padding: 40px 64px; text-align: center;
  box-shadow: var(--sh-xl), inset 0 0 0 0.5px rgba(255,255,255,0.6);
  animation: popIn 0.18s cubic-bezier(0.34,1.56,0.64,1);
}
@keyframes popIn { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.drop-title { font-size: 16px; font-weight: 600; color: var(--tint); margin-bottom: 4px; letter-spacing: -0.01em; }
.drop-sub { font-size: 13px; color: var(--l2); }

/* ══════════════════════════════════════════
   VIEWER — macOS floating window
══════════════════════════════════════════ */
.viewer-overlay {
  position: fixed; inset: 0; z-index: 500;
  background: rgba(0,0,0,0.38);
  backdrop-filter: blur(48px) saturate(160%);
  -webkit-backdrop-filter: blur(48px) saturate(160%);
  display: flex; align-items: center; justify-content: center;
  padding: 32px;
  animation: overlayIn 0.18s ease;
  overscroll-behavior: contain;
}
@keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes fadeIn    { from { opacity: 0; } to { opacity: 1; } }
.viewer-win {
  background: rgba(246,246,248,0.82);
  backdrop-filter: saturate(220%) blur(72px);
  -webkit-backdrop-filter: saturate(220%) blur(72px);
  border-radius: 12px;
  width: min(1020px, 94vw); max-height: 90vh;
  display: flex; flex-direction: column; overflow: hidden;
  border: 0.5px solid rgba(255,255,255,0.55);
  outline: 0.5px solid rgba(0,0,0,0.18);
  box-shadow:
    0 0 0 0.5px rgba(0,0,0,0.22),
    0 1px 0 rgba(255,255,255,0.55) inset,
    0 2px 4px rgba(0,0,0,0.06),
    0 8px 24px rgba(0,0,0,0.12),
    0 24px 64px rgba(0,0,0,0.20),
    0 64px 140px rgba(0,0,0,0.28);
  animation: winIn 0.24s cubic-bezier(0.34,1.12,0.64,1);
}
@keyframes winIn {
  from { transform: scale(0.95) translateY(12px); opacity: 0; }
  to   { transform: scale(1)    translateY(0);    opacity: 1; }
}

/* Titlebar — traffic lights + centered filename + actions */
.viewer-titlebar {
  display: grid; grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 14px;
  height: 52px;
  border-bottom: 0.5px solid rgba(0,0,0,0.09);
  background: linear-gradient(180deg, rgba(252,252,254,0.72) 0%, rgba(244,244,248,0.60) 100%);
  flex-shrink: 0;
}
.viewer-trafficlights {
  display: flex; gap: 8px; align-items: center;
}
.vw-td {
  width: 13px; height: 13px; border-radius: 50%; cursor: default;
  transition: filter 0.12s;
  position: relative;
}
.vw-td.cl { background: #FF5F57; border: 0.5px solid rgba(220,60,52,0.5); }
.vw-td.mn { background: #FEBC2E; border: 0.5px solid rgba(200,150,20,0.5); }
.vw-td.mx { background: #28C840; border: 0.5px solid rgba(22,160,40,0.5); }
.vw-td:hover { filter: brightness(0.88); }
.vw-td.cl:hover::after { content: '×'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; color: rgba(120,20,16,0.8); line-height: 1; }
.viewer-fname {
  font-size: 13px; font-weight: 600; color: var(--l1);
  letter-spacing: -0.008em; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; max-width: 380px;
  text-align: center;
}
.viewer-fname-ext {
  font-weight: 400; color: var(--l3);
}
.viewer-actions-row {
  display: flex; gap: 6px; justify-content: flex-end; align-items: center;
}
.viewer-action-btn {
  height: 28px; padding: 0 12px; border-radius: 7px;
  border: 0.5px solid rgba(0,0,0,0.12);
  background: linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(238,238,242,0.80) 100%);
  color: var(--l1); font-size: 12px; font-family: var(--font); font-weight: 500;
  cursor: default; display: flex; align-items: center; gap: 5px;
  letter-spacing: -0.005em;
  box-shadow: 0 1px 2px rgba(0,0,0,0.07), 0 0.5px 0 rgba(255,255,255,0.80) inset;
  transition: filter 0.08s, transform 0.08s;
}
.viewer-action-btn:hover { filter: brightness(0.97); }
.viewer-action-btn:active { transform: scale(0.97); }
.viewer-action-btn.tint {
  background: linear-gradient(180deg, var(--tint) 0%, var(--tint-mid) 100%);
  color: white; border-color: rgba(0,0,0,0.10);
  box-shadow: 0 1px 3px rgba(224,96,126,0.30), 0 0.5px 0 rgba(255,255,255,0.22) inset;
}

/* Content body */
.viewer-body {
  flex: 1; overflow: auto; background: rgba(250,250,252,0.55);
  display: flex; flex-direction: column;
  min-height: 0;
}
.viewer-body-inner {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: 28px;
}
.viewer-img {
  max-width: 100%; max-height: 72vh; border-radius: 6px; display: block;
  box-shadow: 0 4px 24px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.10), 0 0 0 0.5px rgba(0,0,0,0.07);
}
.viewer-text {
  width: 100%; white-space: pre-wrap;
  font-size: 12.5px; line-height: 1.72; color: var(--l1);
  font-family: var(--font-mono);
  background: rgba(255,255,255,0.68);
  border-radius: 10px; padding: 20px 22px;
  box-shadow: 0 0 0 0.5px rgba(0,0,0,0.07), 0 2px 8px rgba(0,0,0,0.04);
  margin: 0;
}
.viewer-frame { width: 100%; height: 72vh; border: none; border-radius: 6px; display: block; }
.viewer-video {
  width: 100%; max-height: 72vh; border-radius: 6px; background: #000;
  box-shadow: 0 8px 32px rgba(0,0,0,0.28);
}
.viewer-loading {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  color: var(--l3); font-size: 13px; font-family: var(--font);
}
.viewer-spinner {
  width: 24px; height: 24px; border-radius: 50%;
  border: 2px solid rgba(0,0,0,0.10);
  border-top-color: var(--tint);
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ══════════════════════════════════════════
   SETTINGS — macOS Preferences window
══════════════════════════════════════════ */
.settings-overlay {
  position: fixed; inset: 0; z-index: 520;
  background: rgba(0,0,0,0.36);
  backdrop-filter: blur(44px) saturate(160%);
  -webkit-backdrop-filter: blur(44px) saturate(160%);
  display: flex; align-items: center; justify-content: center;
  padding: 32px;
  animation: overlayIn 0.18s ease;
}
.settings-win {
  background: rgba(246,246,248,0.82);
  backdrop-filter: saturate(220%) blur(72px);
  -webkit-backdrop-filter: saturate(220%) blur(72px);
  border-radius: 12px;
  width: min(560px, 94vw);
  display: flex; flex-direction: column; overflow: hidden;
  border: 0.5px solid rgba(255,255,255,0.55);
  outline: 0.5px solid rgba(0,0,0,0.18);
  box-shadow:
    0 0 0 0.5px rgba(0,0,0,0.22),
    0 1px 0 rgba(255,255,255,0.55) inset,
    0 4px 12px rgba(0,0,0,0.08),
    0 16px 48px rgba(0,0,0,0.18),
    0 48px 120px rgba(0,0,0,0.24);
  animation: winIn 0.24s cubic-bezier(0.34,1.12,0.64,1);
}
.settings-titlebar {
  display: grid; grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 14px;
  height: 52px;
  border-bottom: 0.5px solid rgba(0,0,0,0.09);
  background: linear-gradient(180deg, rgba(252,252,254,0.72) 0%, rgba(244,244,248,0.60) 100%);
  flex-shrink: 0;
}
.settings-title {
  font-size: 13px; font-weight: 600; color: var(--l1);
  letter-spacing: -0.008em; text-align: center;
}
.settings-body {
  padding: 24px 24px 20px;
  background: rgba(250,250,252,0.55);
  overflow: auto; flex: 1;
}

/* Grouped settings form */
.settings-group {
  background: rgba(255,255,255,0.72);
  border-radius: 10px;
  border: 0.5px solid rgba(0,0,0,0.08);
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  margin-bottom: 16px;
}
.settings-group-label {
  font-size: 11px; font-weight: 700; color: var(--l3);
  text-transform: uppercase; letter-spacing: 0.07em;
  padding: 0 0 8px 4px; font-family: var(--font);
}
.settings-row {
  display: flex; align-items: center;
  padding: 0 14px; min-height: 40px; gap: 12px;
  border-bottom: 0.5px solid rgba(0,0,0,0.06);
}
.settings-row:last-child { border-bottom: none; }
.settings-form { display: flex; flex-direction: column; gap: 0; }
.settings-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }
.settings-label {
  font-size: 12.5px; font-weight: 500; color: var(--l2);
  letter-spacing: -0.003em; white-space: nowrap; flex-shrink: 0; min-width: 140px;
  font-family: var(--font);
}
.settings-input {
  flex: 1; height: 28px; border-radius: 6px;
  border: 0.5px solid rgba(0,0,0,0.14);
  padding: 0 10px; font-size: 13px; font-family: var(--font);
  background: rgba(255,255,255,0.88); color: var(--l1);
  box-shadow: 0 0.5px 0 rgba(255,255,255,0.80) inset, 0 1px 2px rgba(0,0,0,0.05);
  letter-spacing: -0.003em; outline: none;
  transition: box-shadow 0.12s, border-color 0.12s;
}
.settings-input:focus {
  box-shadow: 0 0 0 3px rgba(224,96,126,0.18), 0 0.5px 0 rgba(255,255,255,0.80) inset;
  border-color: var(--tint);
}
.settings-hint {
  font-size: 11.5px; color: var(--l3); letter-spacing: -0.003em;
  font-family: var(--font); margin-top: 4px;
}
.settings-foot {
  display: flex; align-items: center; justify-content: flex-end;
  gap: 8px; padding-top: 16px;
  border-top: 0.5px solid rgba(0,0,0,0.07);
}
.settings-actions { display: flex; gap: 8px; }

/* ── New folder / rename modal ── */
.new-folder-overlay,
.rename-overlay {
  position: fixed; inset: 0; z-index: 520;
  background: rgba(0,0,0,0.28);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  display: flex; align-items: center; justify-content: center;
  animation: overlayIn 0.16s ease;
}
.new-folder-modal,
.rename-modal {
  width: min(420px, 92vw);
  background: rgba(250,250,252,0.92);
  border-radius: 12px;
  padding: 16px 16px 14px;
  display: flex; flex-direction: column; gap: 10px;
  border: 0.5px solid rgba(0,0,0,0.10);
  box-shadow:
    0 0 0 0.5px rgba(0,0,0,0.14),
    0 10px 36px rgba(0,0,0,0.18),
    0 28px 80px rgba(0,0,0,0.18);
}
.new-folder-title,
.rename-title { font-size: 14px; font-weight: 600; color: var(--l1); letter-spacing: -0.008em; }
.new-folder-sub,
.rename-sub { font-size: 12px; color: var(--l3); }
.new-folder-input,
.rename-input {
  height: 30px; border-radius: 7px;
  border: 0.5px solid rgba(0,0,0,0.16);
  background: rgba(255,255,255,0.96);
  padding: 0 10px; font-size: 13px; font-family: var(--font); color: var(--l1);
  outline: none;
}
.new-folder-input:focus,
.rename-input:focus {
  border-color: rgba(217,95,127,0.45);
  box-shadow: 0 0 0 3px rgba(217,95,127,0.18);
}
.new-folder-actions,
.rename-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }


/* Toasts — iCloud-grade notification pills */
.toast-shelf {
  position: fixed; bottom: 18px; left: 18px;
  display: flex; flex-direction: column; gap: 6px;
  z-index: 600; pointer-events: none;
}
.toast {
  background: rgba(24,24,26,0.92);
  backdrop-filter: saturate(200%) blur(40px);
  -webkit-backdrop-filter: saturate(200%) blur(40px);
  border-radius: 14px; padding: 10px 16px;
  min-width: 220px; max-width: 300px;
  font-size: 13px; color: rgba(255,255,255,0.88);
  display: flex; align-items: center; gap: 9px;
  border: 0.5px solid rgba(255,255,255,0.08);
  box-shadow:
    0 0 0 0.5px rgba(0,0,0,0.5),
    0 1px 0 rgba(255,255,255,0.06) inset,
    0 4px 16px rgba(0,0,0,0.24),
    0 12px 36px rgba(0,0,0,0.14);
  animation: toastIn 0.22s cubic-bezier(0.34,1.56,0.64,1);
  letter-spacing: -0.003em; line-height: 1.35;
}
@keyframes toastIn {
  from { transform: translateX(-14px) scale(0.94); opacity: 0; }
  to   { transform: translateX(0)     scale(1);    opacity: 1; }
}
.toast.success .t-ic { color: #32D74B; }
.toast.error   .t-ic { color: #FF453A; }
.toast.info    .t-ic { color: #0A84FF; }
.t-ic { display: flex; align-items: center; flex-shrink: 0; }

/* ================================================================
   MOBILE — iOS 17 redesigned interactions
================================================================ */
@media (max-width: 768px) {
  .desktop-view { display: none !important; }
  .mobile-view.ios-viewer-overlay,
  .mobile-view.ios-settings-overlay { display: flex !important; }
  .mobile-view {
    display: flex; flex-direction: column;
    height: var(--vh); min-height: var(--vh);
    background: #F2F2F7; overflow: hidden;
    padding-top: env(safe-area-inset-top, 0px);
  }

  /* iOS Navigation Bar — compact bar (collapses from large title) */
  .ios-nav {
    background: rgba(242,242,247,0.94);
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    border-bottom: 0.33px solid rgba(60,60,67,0.22);
    flex-shrink: 0; z-index: 20; position: relative;
  }

  /* 44pt nav bar */
  .ios-nav-bar {
    display: flex; align-items: center;
    height: 44px; padding: 0 8px 0 4px; position: relative;
  }
  .ios-back-btn {
    display: flex; align-items: center;
    color: var(--tint); background: none; border: none;
    font-size: 17px; cursor: pointer;
    padding: 0 8px; height: 44px; min-width: 44px;
    gap: 2px; -webkit-tap-highlight-color: transparent; white-space: nowrap; flex-shrink: 0;
  }
  .ios-back-label { font-size: 17px; color: var(--tint); line-height: 1; font-weight: 400; }
  .ios-nav-center {
    position: absolute; left: 50%; transform: translateX(-50%);
    font-size: 17px; font-weight: 600; color: var(--l1);
    pointer-events: none; white-space: nowrap;
    max-width: 52vw; overflow: hidden; text-overflow: ellipsis;
    letter-spacing: -0.02em;
  }
  .ios-nav-right { display: flex; align-items: center; gap: 4px; margin-left: auto; flex-shrink: 0; }
  .ios-nav-btn {
    width: 32px; height: 32px; border-radius: 50%;
    background: rgba(118,118,128,0.16);
    border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: var(--tint); -webkit-tap-highlight-color: transparent;
    transition: opacity 0.1s;
  }
  .ios-nav-btn:active { opacity: 0.55; }

  /* iOS Large title — iCloud Drive-caliber header */
  .ios-large-title-wrap {
    padding: 0 20px 10px;
    overflow: hidden;
    max-height: 56px;
    opacity: 1;
    transition:
      max-height 0.30s cubic-bezier(0.32,0.72,0,1),
      opacity    0.20s cubic-bezier(0.32,0.72,0,1),
      padding    0.30s cubic-bezier(0.32,0.72,0,1);
    flex-shrink: 0;
  }
  .ios-large-title-wrap.collapsed {
    max-height: 0;
    opacity: 0;
    padding-bottom: 0;
    pointer-events: none;
  }
  .ios-large-title {
    font-size: 32px;
    font-weight: 700;
    color: var(--l1);
    letter-spacing: -0.028em;
    line-height: 1.06;
    /* Subtle gradient: opaque toward top, slightly lighter at bottom */
    background: linear-gradient(
      160deg,
      rgba(0,0,0,0.92) 0%,
      rgba(0,0,0,0.78) 100%
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* iOS search bar — 36pt spec */
  .ios-search-wrap { padding: 0 16px 8px; position: relative; }
  .ios-search-ic { position: absolute; left: 25px; top: 50%; transform: translateY(-55%); color: var(--l3); pointer-events: none; display: flex; }
  .ios-search {
    width: 100%; background: rgba(118,118,128,0.12);
    border: none; border-radius: 10px;
    padding: 0 32px; height: 36px;
    font-family: inherit; font-size: 17px; color: var(--l1); outline: none;
    -webkit-appearance: none; letter-spacing: -0.01em;
  }
  .ios-search::placeholder { color: rgba(60,60,67,0.38); font-size: 17px; }
  .ios-search:focus { background: rgba(118,118,128,0.14); }
  .ios-search-clear {
    position: absolute; right: 24px; top: 50%; transform: translateY(-55%);
    width: 17px; height: 17px; border-radius: 50%;
    background: rgba(118,118,128,0.38); border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center; color: white; padding: 0;
  }

  /* Segmented control */
  .ios-seg-wrap { padding: 0 16px 10px; display: flex; gap: 8px; align-items: center; }
  .ios-seg { flex: 1; display: flex; background: rgba(118,118,128,0.12); border-radius: 9px; padding: 2px; }
  .ios-seg-btn {
    flex: 1; height: 28px;
    display: flex; align-items: center; justify-content: center; gap: 5px;
    background: none; border: none; cursor: pointer;
    font-family: inherit; font-size: 13px; font-weight: 500; color: rgba(60,60,67,0.55);
    border-radius: 7px; transition: all 0.16s; -webkit-tap-highlight-color: transparent;
    letter-spacing: -0.005em;
  }
  .ios-seg-btn.on {
    background: white; color: var(--l1);
    box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 0.5px 0.5px rgba(0,0,0,0.07);
    font-weight: 600;
  }

  /* Pull-to-refresh */
  .ptr-indicator { display: flex; align-items: center; justify-content: center; overflow: hidden; pointer-events: none; }
  .ptr-spinner {
    width: 26px; height: 26px; border-radius: 50%; background: white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08);
    display: flex; align-items: center; justify-content: center; color: var(--tint);
  }
  @keyframes ptr-spin { to { transform: rotate(360deg); } }
  .ptr-spinning { animation: ptr-spin 0.65s linear infinite; }

  /* Scroll area */
  .ios-scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: 8px; }
  @keyframes sheetUp { from { transform: translateY(110%); } to { transform: translateY(0); } }

  /* Section header */
  .ios-section-header {
    font-size: 13px; font-weight: 400; color: rgba(60,60,67,0.60);
    padding: 20px 20px 6px; text-transform: uppercase; letter-spacing: 0.035em;
  }

  /* Inset grouped list */
  .ios-list { background: white; border-radius: 12px; margin: 0 16px 8px; overflow: hidden; box-shadow: 0 0.5px 0 rgba(0,0,0,0.05); }

  /* iOS row — 52pt min, touch-responsive */
  .ios-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 16px; background: white; border: none;
    cursor: pointer; width: 100%; text-align: left; min-height: 52px;
    -webkit-tap-highlight-color: rgba(0,0,0,0);
    position: relative; transition: background 0.10s;
  }
  .ios-row-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }

  /* Star button — hidden, shown only when starred */
  .ios-star-btn {
    width: 28px; height: 28px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    border: none; background: none;
    color: var(--l4); cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: color 0.12s;
  }
  .ios-star-btn.on { color: var(--tint); }
  .ios-row:active { background: rgba(0,0,0,0.036); }
  .ios-row.selected { background: rgba(217,95,127,0.06); }
  .ios-row::after {
    content: ''; position: absolute; bottom: 0; left: 68px; right: 0;
    height: 0.33px; background: rgba(60,60,67,0.14); pointer-events: none;
  }
  .ios-row:last-child::after { display: none; }

  /* File icon */
  .ios-file-ic { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; position: relative; }
  .ios-file-ic.folder { background: rgba(217,95,127,0.09); color: var(--tint); }
  .ios-file-ic.file   { background: rgba(118,118,128,0.11); color: var(--l3); }
  .ios-file-ext { position: absolute; bottom: -2px; right: -3px; font-size: 5.5px; font-weight: 700; padding: 0.5px 2.5px; border-radius: 2.5px; color: white; line-height: 1.4; border: 1.5px solid white; }

  .ios-row-text { flex: 1; min-width: 0; }
  .ios-row-name { font-size: 17px; font-weight: 400; color: var(--l1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.01em; }
  .ios-row-sub  { font-size: 12px; color: rgba(60,60,67,0.44); margin-top: 1px; }
  .ios-chev { color: rgba(60,60,67,0.22); flex-shrink: 0; display: flex; align-items: center; }
  .ios-row-check { width: 26px; height: 26px; border-radius: 50%; background: var(--tint); display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0; box-shadow: 0 2px 6px rgba(217,95,127,0.32); }

  /* iOS Grid — 3 columns */
  .ios-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; padding: 0 16px 8px; }
  .ios-grid-item { display: flex; flex-direction: column; align-items: center; padding: 14px 8px 10px; border-radius: 12px; cursor: pointer; background: none; border: none; text-align: center; position: relative; -webkit-tap-highlight-color: transparent; transition: background 0.10s; }
  .ios-grid-item:active { background: rgba(0,0,0,0.056); }
  .ios-grid-item.selected { background: rgba(217,95,127,0.07); outline: 1.5px solid var(--tint); outline-offset: -1px; border-radius: 12px; }
  .ios-grid-star-btn { position: absolute; top: 8px; left: 8px; width: 24px; height: 24px; border-radius: 8px; border: none; background: rgba(255,255,255,0.92); display: flex; align-items: center; justify-content: center; color: var(--l3); cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.10); -webkit-tap-highlight-color: transparent; opacity: 0; }
  .ios-grid-item:active .ios-grid-star-btn,
  .ios-grid-star-btn.on { opacity: 1; }
  .ios-grid-star-btn.on { color: var(--tint); }
  .ios-grid-ic { width: 64px; height: 64px; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; position: relative; }
  .ios-grid-ic.folder { background: rgba(217,95,127,0.09); color: var(--tint); }
  .ios-grid-ic.file   { background: rgba(118,118,128,0.11); color: var(--l3); }
  .ios-grid-ext { position: absolute; bottom: -2px; right: -4px; font-size: 6.5px; font-weight: 700; padding: 1px 3px; border-radius: 3.5px; color: white; border: 2px solid white; line-height: 1.3; }
  .ios-grid-name { font-size: 11px; font-weight: 400; color: var(--l1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 84px; letter-spacing: -0.005em; }
  .ios-grid-sub  { font-size: 10px; color: rgba(60,60,67,0.44); margin-top: 2px; }
  .ios-grid-sel { position: absolute; top: 8px; right: 8px; width: 22px; height: 22px; border-radius: 50%; background: var(--tint); display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 2px 6px rgba(217,95,127,0.36); }

  /* ── iOS tab bar ── */
  .ios-bottom-bar {
    flex-shrink: 0; position: relative;
    background: rgba(249,249,249,0.94);
    backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px);
    border-top: 0.33px solid rgba(60,60,67,0.18);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    z-index: 100;
  }
  .ios-tabbar { display: flex; align-items: center; padding: 6px 4px 4px; }
  .ios-tab {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
    background: none; border: none; cursor: pointer; padding: 2px 4px 0;
    -webkit-tap-highlight-color: transparent; min-width: 44px; transition: opacity 0.08s;
  }
  .ios-tab:active { opacity: 0.65; }
  .ios-tab-ic { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; color: rgba(60,60,67,0.34); }
  .ios-tab.active .ios-tab-ic { color: var(--tint); }
  .ios-tab-label { font-size: 10px; font-weight: 500; color: rgba(60,60,67,0.34); letter-spacing: 0.005em; }
  .ios-tab.active .ios-tab-label { color: var(--tint); font-weight: 600; }

  /* ── Expandable FAB ── */
  .ios-fab-group {
    position: absolute;
    bottom: calc(100% + 12px); right: 16px;
    display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
    pointer-events: all;
  }
  /* FAB mini actions — slide up when expanded */
  .ios-fab-mini-actions {
    display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
    transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1);
    transform-origin: bottom right;
  }
  .ios-fab-mini-actions.hidden { opacity: 0; transform: scale(0.6) translateY(16px); pointer-events: none; }
  .ios-fab-mini-actions.visible { opacity: 1; transform: scale(1) translateY(0); pointer-events: all; }
  .ios-fab-mini-row {
    display: flex; align-items: center; gap: 10px;
  }
  .ios-fab-mini-label {
    background: rgba(36,36,38,0.88); backdrop-filter: blur(16px);
    color: white; font-size: 13px; font-weight: 500;
    padding: 5px 10px; border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    letter-spacing: -0.005em; white-space: nowrap;
  }
  .ios-fab-mini {
    width: 42px; height: 42px; border-radius: 13px; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    -webkit-tap-highlight-color: transparent;
    background: white; color: var(--l1);
    box-shadow: 0 3px 10px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.07);
    transition: transform 0.12s cubic-bezier(0.34,1.56,0.64,1);
  }
  .ios-fab-mini:active { transform: scale(0.88); }
  .ios-fab-mini:disabled { opacity: 0.36; }

  /* FAB backdrop — closes FAB when tapped */
  .ios-fab-backdrop {
    position: fixed; inset: 0; z-index: 98;
    background: rgba(0,0,0,0.20);
    backdrop-filter: blur(2px);
    animation: fadeIn 0.18s ease;
  }

  /* Main FAB */
  .ios-fab {
    width: 48px; height: 48px;
    border-radius: 14px; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    -webkit-tap-highlight-color: transparent;
    z-index: 99;
    transition: transform 0.18s cubic-bezier(0.34,1.56,0.64,1), filter 0.10s;
  }
  .ios-fab:active:not(:disabled) { transform: scale(0.88); }
  .ios-fab:disabled { opacity: 0.36; }
  .ios-fab.main {
    background: var(--tint); color: white;
    box-shadow:
      0 4px 14px rgba(217,95,127,0.40),
      0 1px 4px rgba(217,95,127,0.22),
      inset 0 0.5px 0 rgba(255,255,255,0.24);
  }
  /* Rotate icon when expanded */
  .ios-fab.main .fab-icon { transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1); }
  .ios-fab.main.expanded .fab-icon { transform: rotate(45deg); }

  /* ── Selection action bar ── */
  .ios-sel-bar {
    flex-shrink: 0;
    background: rgba(242,242,247,0.97); backdrop-filter: saturate(180%) blur(20px);
    border-top: 0.33px solid rgba(60,60,67,0.16);
    display: flex; align-items: center;
    padding: 10px 12px; gap: 0; z-index: 99;
    padding-bottom: env(safe-area-inset-bottom, 10px);
    animation: selBarUp 0.24s cubic-bezier(0.34,1.40,0.64,1);
  }
  @keyframes selBarUp { from { transform: translateY(100%); opacity: 0; } to { transform: none; opacity: 1; } }
  .ios-sel-label { font-size: 13px; font-weight: 600; color: var(--l1); flex: 1; padding-left: 4px; letter-spacing: -0.005em; }
  .ios-sel-btn {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    background: none; border: none; cursor: pointer;
    padding: 4px 10px; color: var(--tint);
    font-size: 10px; font-weight: 500; letter-spacing: -0.003em;
    -webkit-tap-highlight-color: transparent; min-width: 48px;
    transition: opacity 0.08s; font-family: inherit;
  }
  .ios-sel-btn:active { opacity: 0.46; }
  .ios-sel-btn:disabled { opacity: 0.36; }
  .ios-sel-btn.danger { color: var(--red); }
  .ios-sel-btn-ic { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; }

  /* ── iOS Action Sheet — iCloud UIAlertController grade ── */
  .ios-action-sheet-overlay {
    position: fixed; inset: 0; z-index: 600;
    background: rgba(0,0,0,0.24);
    backdrop-filter: blur(6px) saturate(160%);
    -webkit-backdrop-filter: blur(6px) saturate(160%);
    display: flex; flex-direction: column; justify-content: flex-end;
    padding: 0 8px calc(env(safe-area-inset-bottom, 0px) + 8px);
    animation: fadeIn 0.18s ease;
  }
  .ios-action-sheet {
    background: rgba(246,246,248,0.82);
    backdrop-filter: saturate(200%) blur(60px);
    -webkit-backdrop-filter: saturate(200%) blur(60px);
    border-radius: 16px;
    overflow: hidden;
    border: 0.5px solid rgba(255,255,255,0.60);
    box-shadow:
      0 0 0 0.5px rgba(0,0,0,0.08),
      0 -0.5px 0 rgba(255,255,255,0.60) inset,
      0 4px 20px rgba(0,0,0,0.08),
      0 20px 60px rgba(0,0,0,0.14);
    animation: sheetUp 0.30s cubic-bezier(0.32,0.72,0,1);
    margin-bottom: 8px;
  }
  .ios-action-sheet-header {
    padding: 16px 20px 14px;
    text-align: center;
    background: transparent;
  }
  .ios-action-sheet-title {
    font-size: 13px; font-weight: 600; color: rgba(60,60,67,0.70);
    letter-spacing: -0.003em; line-height: 1.4;
  }
  .ios-action-sheet-sub {
    font-size: 12px; color: rgba(60,60,67,0.44);
    margin-top: 2px; letter-spacing: -0.003em;
  }
  /* Divider between header and first action */
  .ios-action-sheet-header + .ios-action-btn {
    border-top: 0.33px solid rgba(60,60,67,0.12);
  }
  .ios-action-btn {
    display: flex; align-items: center; justify-content: center;
    width: 100%; background: none; border: none; cursor: pointer;
    padding: 15px 20px; text-align: center;
    -webkit-tap-highlight-color: transparent;
    border-bottom: 0.33px solid rgba(60,60,67,0.10);
    font-family: inherit; transition: background 0.10s;
    gap: 0;
  }
  .ios-action-btn:last-child { border-bottom: none; }
  .ios-action-btn:active { background: rgba(0,0,0,0.04); }
  .ios-action-btn-ic { display: none; }
  .ios-action-btn-label {
    font-size: 20px; font-weight: 400; color: var(--tint);
    letter-spacing: -0.014em; line-height: 1.3;
  }
  .ios-action-btn.danger .ios-action-btn-label { color: #FF3B30; font-weight: 400; }

  /* Cancel button — separate white card */
  .ios-action-sheet-cancel {
    background: rgba(246,246,248,0.88);
    backdrop-filter: saturate(200%) blur(60px);
    -webkit-backdrop-filter: saturate(200%) blur(60px);
    border-radius: 16px;
    overflow: hidden;
    border: 0.5px solid rgba(255,255,255,0.60);
    box-shadow:
      0 0 0 0.5px rgba(0,0,0,0.08),
      0 -0.5px 0 rgba(255,255,255,0.60) inset,
      0 4px 20px rgba(0,0,0,0.06);
    animation: sheetUp 0.30s cubic-bezier(0.32,0.72,0,1) 0.02s both;
  }
  .ios-action-cancel-btn {
    display: flex; align-items: center; justify-content: center;
    width: 100%; background: none; border: none; cursor: pointer;
    padding: 15px; font-family: inherit;
    font-size: 20px; font-weight: 600; color: var(--tint);
    letter-spacing: -0.014em;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.10s;
  }
  .ios-action-cancel-btn:active { background: rgba(0,0,0,0.04); }

  /* ── iOS New Folder / Rename sheet ── */
  .ios-new-folder-overlay,
  .ios-rename-overlay {
    position: fixed; inset: 0; z-index: 600;
    background: rgba(0,0,0,0.30);
    backdrop-filter: blur(6px) saturate(160%);
    -webkit-backdrop-filter: blur(6px) saturate(160%);
    display: flex; flex-direction: column; justify-content: flex-end;
    padding: 0 8px calc(env(safe-area-inset-bottom, 0px) + 8px);
    animation: fadeIn 0.16s ease;
  }
  .ios-new-folder-sheet,
  .ios-rename-sheet {
    background: rgba(246,246,248,0.90);
    backdrop-filter: saturate(200%) blur(60px);
    -webkit-backdrop-filter: saturate(200%) blur(60px);
    border-radius: 18px 18px 12px 12px;
    overflow: hidden;
    border: 0.5px solid rgba(255,255,255,0.60);
    box-shadow:
      0 0 0 0.5px rgba(0,0,0,0.08),
      0 -0.5px 0 rgba(255,255,255,0.60) inset,
      0 10px 36px rgba(0,0,0,0.12);
    animation: sheetUp 0.30s cubic-bezier(0.32,0.72,0,1);
    padding: 10px 16px 16px;
  }
  .ios-new-folder-title,
  .ios-rename-title {
    text-align: center; font-size: 17px; font-weight: 600; color: var(--l1);
    margin: 8px 0 10px; letter-spacing: -0.02em;
  }
  .ios-new-folder-input,
  .ios-rename-input {
    height: 44px; border-radius: 12px;
    border: 1px solid rgba(60,60,67,0.18);
    background: white; padding: 0 12px; font-size: 16px; font-family: var(--font);
    color: var(--l1); outline: none; width: 100%;
  }
  .ios-new-folder-input:focus,
  .ios-rename-input:focus { border-color: var(--tint); box-shadow: 0 0 0 3px rgba(217,95,127,0.16); }
  .ios-new-folder-actions,
  .ios-rename-actions { display: flex; gap: 10px; margin-top: 12px; }
  .ios-new-folder-btn,
  .ios-rename-btn {
    flex: 1; height: 44px; border-radius: 12px; border: none; cursor: pointer;
    background: rgba(118,118,128,0.12); color: var(--l1); font-weight: 600;
    -webkit-tap-highlight-color: transparent;
  }
  .ios-new-folder-btn.primary,
  .ios-rename-btn.primary {
    background: var(--tint); color: white;
    box-shadow: 0 4px 14px rgba(217,95,127,0.30), inset 0 0.5px 0 rgba(255,255,255,0.22);
  }
  .ios-new-folder-btn:disabled,
  .ios-rename-btn:disabled { opacity: 0.45; }

  /* Drop overlay */
  .ios-drop-wrap { position: fixed; inset: 0; z-index: 400; display: flex; align-items: center; justify-content: center; background: rgba(242,242,247,0.78); backdrop-filter: saturate(160%) blur(12px); pointer-events: none; }
  .ios-drop-box { background: rgba(255,255,255,0.94); border: 1.5px dashed var(--tint-border); border-radius: 20px; padding: 32px 48px; text-align: center; box-shadow: var(--sh-xl); animation: popIn 0.18s cubic-bezier(0.34,1.56,0.64,1); }

  /* ── iOS Viewer — full bottom sheet ── */
  .ios-viewer-overlay {
    position: fixed; inset: 0; z-index: 500;
    background: rgba(0,0,0,0.50);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex; align-items: flex-end;
    animation: fadeIn 0.16s ease;
    overscroll-behavior: contain;
  }
  .ios-viewer-sheet {
    background: rgba(250,250,252,0.97);
    backdrop-filter: saturate(200%) blur(40px);
    -webkit-backdrop-filter: saturate(200%) blur(40px);
    border-radius: 20px 20px 0 0; width: 100%; max-height: 94vh;
    display: flex; flex-direction: column;
    box-shadow: 0 -2px 0 rgba(0,0,0,0.06), 0 -8px 40px rgba(0,0,0,0.14);
    animation: sheetUp 0.32s cubic-bezier(0.32,0.72,0,1);
    overflow: hidden;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  .ios-sheet-handle {
    width: 36px; height: 5px; border-radius: 99px;
    background: rgba(60,60,67,0.18); margin: 10px auto 0; flex-shrink: 0;
  }
  .ios-sheet-head {
    display: flex; align-items: center; padding: 12px 16px 12px;
    border-bottom: 0.33px solid rgba(60,60,67,0.12);
    flex-shrink: 0;
  }
  .ios-sheet-title {
    font-size: 17px; font-weight: 600; color: var(--l1);
    flex: 1; text-align: center; letter-spacing: -0.020em;
    font-family: var(--font);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    padding: 0 8px;
  }
  .ios-sheet-close {
    font-size: 17px; color: var(--tint); background: none; border: none;
    cursor: pointer; font-weight: 400; flex-shrink: 0;
    -webkit-tap-highlight-color: transparent; padding: 0 4px;
    font-family: var(--font);
  }
  .ios-sheet-dl-btn {
    display: flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; border-radius: 50%;
    background: rgba(118,118,128,0.12);
    border: none; color: var(--tint); cursor: pointer;
    -webkit-tap-highlight-color: transparent; flex-shrink: 0;
  }
  .ios-sheet-body {
    flex: 1; overflow: auto; padding: 20px 16px;
    -webkit-overflow-scrolling: touch;
    display: flex; flex-direction: column; align-items: center;
    min-height: 0;
  }
  .ios-sheet-img {
    max-width: 100%; border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
  }
  .ios-sheet-video { width: 100%; border-radius: 10px; background: black; }
  .ios-sheet-text {
    width: 100%; white-space: pre-wrap; font-size: 13px; line-height: 1.6;
    color: var(--l1); font-family: var(--font-mono);
    background: rgba(118,118,128,0.08); border-radius: 10px;
    padding: 16px; margin: 0;
  }
  .ios-sheet-frame { width: 100%; height: 60vh; border: none; border-radius: 10px; }

  /* ── iOS Settings — pushed nav view ── */
  .ios-settings-overlay {
    position: fixed; inset: 0; z-index: 520;
    background: #F2F2F7;
    display: flex; flex-direction: column;
    animation: slideInRight 0.32s cubic-bezier(0.32,0.72,0,1);
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  @keyframes slideInRight {
    from { transform: translateX(100%); }
    to   { transform: translateX(0); }
  }
  .ios-settings-nav {
    display: flex; align-items: center; height: 44px; padding: 0 8px 0 4px;
    background: rgba(242,242,247,0.94);
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    border-bottom: 0.33px solid rgba(60,60,67,0.20);
    flex-shrink: 0;
  }
  .ios-settings-title-nav {
    position: absolute; left: 50%; transform: translateX(-50%);
    font-size: 17px; font-weight: 600; color: var(--l1);
    letter-spacing: -0.020em; pointer-events: none;
    font-family: var(--font);
  }
  .ios-settings-scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: 32px; }
  .ios-settings-section-hd {
    font-size: 13px; font-weight: 400; color: rgba(60,60,67,0.60);
    text-transform: uppercase; letter-spacing: 0.035em;
    padding: 20px 20px 6px; font-family: var(--font);
  }
  .ios-settings-group {
    background: white; border-radius: 12px;
    margin: 0 16px 8px; overflow: hidden;
    box-shadow: 0 0.5px 0 rgba(0,0,0,0.05);
  }
  .ios-settings-row {
    display: flex; align-items: center; gap: 12px;
    padding: 0 16px; min-height: 48px;
    border-bottom: 0.33px solid rgba(60,60,67,0.10);
    width: 100%; background: none; border-left: none; border-right: none; border-top: none;
    cursor: text;
  }
  .ios-settings-row:last-child { border-bottom: none; }
  .ios-settings-row-label {
    font-size: 17px; color: var(--l1); font-family: var(--font);
    letter-spacing: -0.012em; flex-shrink: 0; min-width: 90px;
  }
  .ios-settings-input {
    flex: 1; border: none; background: none; outline: none;
    font-size: 15px; color: var(--l2); font-family: var(--font);
    letter-spacing: -0.010em; text-align: right;
    -webkit-appearance: none;
  }
  .ios-settings-input::placeholder { color: rgba(60,60,67,0.28); }
  .ios-settings-hint {
    font-size: 13px; color: rgba(60,60,67,0.50); padding: 6px 20px 0;
    font-family: var(--font); line-height: 1.4;
  }
  .ios-settings-save-btn {
    margin: 20px 16px 0; width: calc(100% - 32px);
    height: 50px; border-radius: 14px;
    background: linear-gradient(180deg, var(--tint) 0%, var(--tint-mid) 100%);
    color: white; font-size: 17px; font-weight: 600;
    border: none; cursor: pointer; font-family: var(--font);
    letter-spacing: -0.012em;
    box-shadow: 0 2px 12px rgba(224,96,126,0.32), 0 0.5px 0 rgba(255,255,255,0.20) inset;
    -webkit-tap-highlight-color: transparent;
    transition: opacity 0.10s, transform 0.10s;
  }
  .ios-settings-save-btn:active { opacity: 0.82; transform: scale(0.98); }
  .ios-settings-save-btn:disabled { opacity: 0.4; }
  .ios-settings-reset-btn {
    margin: 10px 16px 0; width: calc(100% - 32px);
    height: 50px; border-radius: 14px;
    background: rgba(255,59,48,0.08);
    color: var(--red); font-size: 17px; font-weight: 400;
    border: none; cursor: pointer; font-family: var(--font);
    letter-spacing: -0.012em;
    -webkit-tap-highlight-color: transparent;
  }

  /* Toast override for mobile */
  .toast-shelf { bottom: 16px; left: 16px; right: 16px; }
  .toast { min-width: unset; width: 100%; border-radius: 14px; font-size: 15px; padding: 11px 16px; animation: toastIn 0.20s cubic-bezier(0.34,1.56,0.64,1); }
  @keyframes toastIn { from { transform: translateY(10px) scale(0.96); opacity: 0; } to { transform: none; opacity: 1; } }

  /* Upload bar override for mobile */
  .upload-bar-wrap { margin: 0 16px 8px; border-radius: 12px; border: none; box-shadow: 0 0.5px 0 rgba(0,0,0,0.05); background: white; padding: 10px 14px; }
  .upload-bar-head { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
  .upload-bar-title { font-size: 13px; font-weight: 600; color: var(--l1); }
  .upload-bar-count { font-size: 12px; color: var(--l3); }
  .upload-items { display: flex; flex-direction: column; gap: 6px; }
  .upload-row { display: grid; grid-template-columns: 1fr 44px; gap: 10px; align-items: center; }
  .upload-fname { font-size: 13px; color: var(--l2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.003em; }
  .upload-pct { font-size: 12px; color: var(--l3); text-align: right; }
  .upload-track { height: 2.5px; background: rgba(118,118,128,0.14); border-radius: 99px; overflow: hidden; margin-top: 4px; }
  .upload-fill { display: block; height: 100%; background: var(--tint); border-radius: 99px; transition: width 0.22s ease; }
  .upload-track.err .upload-fill { background: var(--red); }
  .upload-col { display: flex; flex-direction: column; }

  .error-banner { margin: 0 16px 8px; border-radius: 12px; border: none; }

  .ios-skeleton-list { background: white; border-radius: 12px; margin: 0 16px 8px; overflow: hidden; box-shadow: 0 0.5px 0 rgba(0,0,0,0.05); }
  .ios-skeleton-row { display: flex; align-items: center; gap: 12px; padding: 11px 16px; border-bottom: 0.33px solid rgba(60,60,67,0.10); min-height: 52px; }
  .ios-skeleton-row:last-child { border-bottom: none; }
}

/* ── Reference-style thumbnail grid (screen.png / code.html) ── */
.ref-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 28px;
  padding: 28px;
}
.ref-grid-item {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  background: none; border: none; cursor: default;
  border-radius: 12px; padding: 4px;
  transition: background 0.10s;
}
.ref-grid-item:focus { outline: none; }
.ref-thumb {
  width: 100%; aspect-ratio: 4/3;
  background: var(--sys-content);
  border-radius: 12px;
  border: 0.5px solid rgba(0,0,0,0.07);
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  transition: box-shadow 0.12s, border-color 0.12s;
}
.ref-thumb-folder { background: rgba(224,96,126,0.06); }
.ref-grid-item:hover .ref-thumb {
  box-shadow: 0 0 0 2.5px rgba(224,96,126,0.35);
  border-color: rgba(224,96,126,0.30);
}
.ref-grid-item.selected .ref-thumb {
  box-shadow: 0 0 0 2.5px var(--tint);
  border-color: var(--tint);
  background: rgba(224,96,126,0.06);
}
.ref-thumb.drop-target {
  box-shadow: 0 0 0 2.5px var(--tint);
  background: rgba(224,96,126,0.08);
}
.ref-item-name {
  font-size: 12.5px; font-weight: 500; color: var(--l1);
  max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  text-align: center; letter-spacing: -0.008em; font-family: var(--font);
}
.ref-item-sub {
  font-size: 11px; color: var(--l3); text-align: center;
  margin-top: -4px; font-family: var(--font);
}

/* ── Right inspector panel ── */
.insp-panel {
  width: 288px; flex-shrink: 0;
  background: var(--sys-content);
  border-left: 0.5px solid var(--sys-sep);
  display: flex; flex-direction: column;
  overflow-y: auto;
}
.insp-empty {
  align-items: center; justify-content: center;
}
.insp-empty-msg {
  font-size: 12px; color: var(--l3); font-family: var(--font);
}
.insp-preview-wrap {
  padding: 28px 20px 18px;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  border-bottom: 0.5px solid var(--sys-sep);
}
.insp-preview-thumb {
  width: 128px; height: 128px;
  background: white;
  border-radius: 14px;
  border: 0.5px solid rgba(0,0,0,0.08);
  box-shadow: 0 2px 10px rgba(0,0,0,0.06);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.insp-filename {
  font-size: 13.5px; font-weight: 600; color: var(--l1);
  text-align: center; word-break: break-all;
  letter-spacing: -0.010em; font-family: var(--font);
  line-height: 1.35; max-width: 220px;
}
.insp-filekind {
  font-size: 11.5px; color: var(--l3); font-family: var(--font);
}
.insp-body {
  padding: 18px 20px 24px;
  flex: 1;
}
.insp-section-hd {
  font-size: 10px; font-weight: 700; color: var(--l3);
  text-transform: uppercase; letter-spacing: 0.10em;
  margin-bottom: 10px; font-family: var(--font);
}
.insp-meta-list { display: flex; flex-direction: column; gap: 0; margin-bottom: 4px; }
.insp-meta-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 0;
  border-bottom: 0.5px solid var(--sys-sep2);
  font-family: var(--font);
}
.insp-meta-row:last-child { border-bottom: none; }
.insp-meta-k { font-size: 11.5px; color: var(--l3); }
.insp-meta-v { font-size: 11.5px; color: var(--l2); }
.insp-avatars {
  display: flex; margin-bottom: 20px;
}
.insp-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  border: 2px solid var(--sys-content);
  box-shadow: 0 1px 4px rgba(0,0,0,0.10);
}
.insp-avatar-more {
  background: var(--fill2);
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 600; color: var(--l3); font-family: var(--font);
}
.insp-actions { display: flex; flex-direction: column; gap: 8px; }
.insp-btn {
  width: 100%; height: 32px; border-radius: 8px;
  background: var(--fill2);
  border: 0.5px solid rgba(0,0,0,0.07);
  color: var(--l2); font-size: 12px; font-family: var(--font); font-weight: 500;
  cursor: default; letter-spacing: -0.008em;
  transition: background 0.08s;
}
.insp-btn:hover { background: var(--fill3, rgba(0,0,0,0.07)); }
.insp-btn-danger {
  background: rgba(255,59,48,0.06);
  border-color: rgba(255,59,48,0.15);
  color: var(--red);
}
.insp-btn-danger:hover { background: rgba(255,59,48,0.12); }

/* sidebar tag dot + tag section header row */
.nav-tag-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.nav-sec-hd-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 10px 4px; margin-bottom: 0;
}
.nav-sec-add {
  font-size: 14px; color: var(--l3); cursor: default; line-height: 1;
}
.nav-ic-star { color: var(--tint) !important; }

/* ── iOS FAB bottom sheet ── */
.ios-fab-sheet {
  position: absolute; bottom: calc(100% + 8px); left: 16px; right: 16px;
  background: rgba(250,250,252,0.98);
  backdrop-filter: saturate(200%) blur(40px);
  -webkit-backdrop-filter: saturate(200%) blur(40px);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 40px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(0,0,0,0.08);
  animation: sheetUp 0.26s cubic-bezier(0.32,0.72,0,1);
  z-index: 99;
}
.ios-fab-sheet-title {
  font-size: 13px; font-weight: 600; color: var(--l3);
  text-align: center; padding: 14px 16px 10px;
  border-bottom: 0.5px solid rgba(60,60,67,0.12);
  letter-spacing: -0.005em; font-family: var(--font);
}
.ios-fab-sheet-row {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 18px; width: 100%; background: none; border: none;
  border-bottom: 0.5px solid rgba(60,60,67,0.10); cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.10s;
}
.ios-fab-sheet-row:last-child { border-bottom: none; }
.ios-fab-sheet-row:active { background: rgba(0,0,0,0.04); }
.ios-fab-sheet-row:disabled { opacity: 0.4; }
.ios-fab-sheet-ic {
  width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.ios-fab-sheet-label {
  flex: 1; text-align: left; font-size: 17px; font-weight: 400;
  color: var(--l1); letter-spacing: -0.012em; font-family: var(--font);
}
.ios-fab-sheet-chev {
  color: rgba(60,60,67,0.22); display: flex; align-items: center;
}

/* Action sheet icon box */
.ios-sheet-icon {
  width: 56px; height: 56px; border-radius: 14px;
  background: var(--fill);
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}
.ios-action-chev {
  color: rgba(60,60,67,0.22); display: flex; align-items: center; margin-left: auto;
}
`;




/* ─────────────────────────────────────────
   App
───────────────────────────────────────── */
let toastId = 0;

export default function App() {
  const [path, setPath] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "grid">("list");
  const [dragging, setDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [lastSel, setLastSel] = useState<string | null>(null);
  const [dragItems, setDragItems] = useState<string[]>([]);
  const [pending, setPending] = useState<Map<string, { item: Item; ts: number }>>(new Map());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [viewer, setViewer] = useState<ViewerState>({ open: false });
  const [repoSize, setRepoSize] = useState(0);
  const [section, setSection] = useState<"drive" | "recent" | "starred">("drive");
  const [gitSettings, setGitSettings] = useState<GitSettings>(() => getSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<GitSettings>(() => getSettings());
  const [recent, setRecent] = useState<RecentEntry[]>(() => readStoredList<RecentEntry>(RECENT_KEY));
  const [starred, setStarred] = useState<StarEntry[]>(() => readStoredList<StarEntry>(STARRED_KEY));

  // ── New interaction state ──
  const [ctxMenu, setCtxMenu] = useState<{ item: Item; x: number; y: number } | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [actionSheet, setActionSheet] = useState<{ item: Item } | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renameItem, setRenameItem] = useState<Item | null>(null);
  const [largeTitleCollapsed, setLargeTitleCollapsed] = useState(false);
  const [detailItem, setDetailItem] = useState<Item | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputDesktopRef = useRef<HTMLInputElement>(null);
  const newFolderInputMobileRef = useRef<HTMLInputElement>(null);
  const renameInputDesktopRef = useRef<HTMLInputElement>(null);
  const renameInputMobileRef = useRef<HTMLInputElement>(null);
  const uploadToastRef = useRef<Map<string, number>>(new Map());
  const uploadToastPctRef = useRef<Map<string, number>>(new Map());
  const downloadToastRef = useRef<Map<string, number>>(new Map());
  const downloadToastPctRef = useRef<Map<string, number>>(new Map());
  const dragCounterRef = useRef(0);
  const timersRef = useRef<Map<string, number>>(new Map());
  const viewerUrlRef = useRef<string | null>(null);
  const viewReqId = useRef(0);
  const longPressRef = useRef<number | null>(null);
  const swipeRef = useRef<{ x: number; y: number; item: Item } | null>(null);
  const swipeLockedRef = useRef(false);
  const swipeTapBlockRef = useRef(false);

  const removeToast = useCallback((id: number, delay = 0) => {
    const doRemove = () => setToasts(p => p.filter(t => t.id !== id));
    if (delay > 0) window.setTimeout(doRemove, delay);
    else doRemove();
  }, []);

  const pushToast = useCallback((message: string, kind: Toast["kind"] = "info", sticky = false) => {
    const id = ++toastId;
    setToasts(p => [...p, { id, message, kind, sticky }]);
    if (!sticky) window.setTimeout(() => removeToast(id), 3500);
    return id;
  }, [removeToast]);

  const updateToast = useCallback((id: number, patch: Partial<Toast>) =>
    setToasts(p => p.map(t => t.id === id ? { ...t, ...patch } : t)), []);

  const toast = useCallback((message: string, kind: Toast["kind"] = "info") => {
    pushToast(message, kind, false);
  }, [pushToast]);

  const updateRecent = useCallback((updater: (prev: RecentEntry[]) => RecentEntry[]) =>
    setRecent(prev => {
      const next = updater(prev);
      writeStoredList(RECENT_KEY, next);
      return next;
    }), []);

  const updateStarred = useCallback((updater: (prev: StarEntry[]) => StarEntry[]) =>
    setStarred(prev => {
      const next = updater(prev);
      writeStoredList(STARRED_KEY, next);
      return next;
    }), []);

  const touchRecent = useCallback((item: Item) => {
    updateRecent(prev => {
      const entry: RecentEntry = {
        name: item.name,
        path: item.path,
        type: item.type,
        size: item.size,
        ts: Date.now(),
      };
      const next = [entry, ...prev.filter(r => r.path !== item.path)];
      return next.slice(0, MAX_RECENT);
    });
  }, [updateRecent]);

  const toggleStar = useCallback((item: Item) => {
    updateStarred(prev => {
      const exists = prev.some(s => s.path === item.path);
      if (exists) return prev.filter(s => s.path !== item.path);
      const entry: StarEntry = {
        name: item.name,
        path: item.path,
        type: item.type,
        size: item.size,
        ts: Date.now(),
      };
      return [entry, ...prev].slice(0, MAX_STARRED);
    });
  }, [updateStarred]);

  const openSettings = () => {
    setSettingsDraft(gitSettings);
    setSettingsOpen(true);
  };

  const applySettings = () => {
    const next: GitSettings = {
      ...settingsDraft,
      authToken: settingsDraft.authToken.trim(),
      owner: settingsDraft.owner.trim(),
      repo: settingsDraft.repo.trim(),
      branch: settingsDraft.branch.trim() || "main",
      userFolder: gitSettings.userFolder,
    };
    const saved = saveSettings(next);
    setGitSettings(saved);
    setSettingsOpen(false);
    toast("Settings saved", "success");
  };

  const resetSettings = () => {
    const cleared = clearSettings();
    setGitSettings(cleared);
    setSettingsDraft(cleared);
    toast("Settings cleared", "info");
  };

  const updUpload = useCallback((id: string, patch: Partial<UploadItem>) =>
    setUploads(p => p.map(u => u.id === id ? { ...u, ...patch } : u)), []);

  const updDownload = useCallback((id: string, patch: Partial<DownloadItem>) =>
    setDownloads(p => p.map(d => d.id === id ? { ...d, ...patch } : d)), []);

  const stopProg = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) { clearInterval(t); timersRef.current.delete(id); }
  }, []);

  const startProg = useCallback((id: string, name: string) => {
    stopProg(id);
    const t = window.setInterval(() => {
      let nextPct = 0;
      setUploads(p => p.map(u => {
        if (u.id !== id || u.status !== "uploading") return u;
        const next = Math.min(90, u.progress + 3 + Math.random() * 6);
        nextPct = next;
        return { ...u, progress: next };
      }));
      const tid = uploadToastRef.current.get(id);
      const last = uploadToastPctRef.current.get(id) ?? 0;
      if (tid && nextPct && (nextPct - last >= 10)) {
        updateToast(tid, { message: `Uploading ${name}… ${nextPct}%` });
        uploadToastPctRef.current.set(id, nextPct);
      }
    }, 250);
    timersRef.current.set(id, t);
  }, [stopProg, updateToast]);

  const configOk = useMemo(() =>
    !!(gitSettings.owner && gitSettings.repo && gitSettings.branch && gitSettings.authToken),
    [gitSettings]);

  const base = useMemo(() =>
    gitSettings.userFolder ? gitSettings.userFolder.replace(/^\/+|\/+$/g, "") : "",
    [gitSettings.userFolder]);

  const resolve = useCallback((segs: string[]) =>
    [base, ...segs].filter(Boolean).join("/"), [base]);

  const stripBase = useCallback((fullPath: string) => {
    const cleaned = fullPath.replace(/^\/+|\/+$/g, "");
    if (!base) return cleaned;
    const baseClean = base.replace(/^\/+|\/+$/g, "");
    if (cleaned === baseClean) return "";
    if (cleaned.startsWith(`${baseClean}/`)) return cleaned.slice(baseClean.length + 1);
    return cleaned;
  }, [base]);

  const curPath = useMemo(() => resolve(path), [path, resolve]);
  const sectionLabel = section === "drive" ? "My Drive" : section === "recent" ? "Recent" : "Starred";
  const repoSizeKey = useMemo(() => {
    if (!gitSettings.owner || !gitSettings.repo) return "jrcloud.repoSize.v1.unknown";
    const branch = gitSettings.branch?.trim() || "main";
    return `jrcloud.repoSize.v1.${gitSettings.owner}.${gitSettings.repo}.${branch}`;
  }, [gitSettings.owner, gitSettings.repo, gitSettings.branch]);

  const setRepoSizePersist = useCallback((size: number) => {
    setRepoSize(size);
    writeStoredRepoSize(repoSizeKey, size);
  }, [repoSizeKey]);

  const adjustRepoSize = useCallback((delta: number) => {
    setRepoSize(prev => {
      const next = Math.max(0, prev + delta);
      writeStoredRepoSize(repoSizeKey, next);
      return next;
    });
  }, [repoSizeKey]);

  const crumbs = useMemo(() => (
    section === "drive" ? ["/", ...path] : [sectionLabel]
  ), [path, section, sectionLabel]);

  const driveFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter(i => i.name.toLowerCase().includes(q)) : items;
  }, [items, query]);

  const folders = useMemo(() => driveFiltered.filter(i => i.type === "folder"), [driveFiltered]);
  const files = useMemo(() => driveFiltered.filter(i => i.type === "file"), [driveFiltered]);
  const driveDisplayed = useMemo(() => [...folders, ...files], [folders, files]);

  const recentItems = useMemo(() =>
    [...recent].sort((a, b) => b.ts - a.ts).map(entryToItem), [recent]);
  const recentFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? recentItems.filter(i => i.name.toLowerCase().includes(q)) : recentItems;
  }, [recentItems, query]);

  const starredItems = useMemo(() =>
    [...starred].sort((a, b) => b.ts - a.ts).map(entryToItem), [starred]);
  const starredFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? starredItems.filter(i => i.name.toLowerCase().includes(q)) : starredItems;
  }, [starredItems, query]);

  const displayed = useMemo(() => (
    section === "drive" ? driveDisplayed : section === "recent" ? recentFiltered : starredFiltered
  ), [section, driveDisplayed, recentFiltered, starredFiltered]);

  const imap = useMemo(() => new Map(displayed.map(i => [i.path, i])), [displayed]);
  const activeUps = useMemo(() => uploads.filter(u => u.status === "queued" || u.status === "uploading"), [uploads]);
  const activeDls = useMemo(() => downloads.filter(d => d.status === "downloading"), [downloads]);
  const starredSet = useMemo(() => new Set(starred.map(s => s.path)), [starred]);
  const driveOnly = section === "drive";
  const isStarred = useCallback((path: string) => starredSet.has(path), [starredSet]);

  const jp = useCallback((a: string, b: string) => [a, b].filter(Boolean).join("/"), []);

  const isInput = (el: EventTarget | null) => {
    if (!(el instanceof HTMLElement)) return false;
    return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
  };
  const isFileDrag = (e: { dataTransfer?: DataTransfer | null }) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const isInternalDrag = (e: { dataTransfer?: DataTransfer | null }) => Array.from(e.dataTransfer?.types ?? []).includes("application/x-jr-paths");

  const selOnly = (p: string) => { setSelected(new Set([p])); setLastSel(p); };
  const selRange = (from: string, to: string) => {
    const a = displayed.findIndex(i => i.path === from);
    const b = displayed.findIndex(i => i.path === to);
    if (a === -1 || b === -1) { selOnly(to); return; }
    const [s, e] = a < b ? [a, b] : [b, a];
    setSelected(new Set(displayed.slice(s, e + 1).map(i => i.path)));
  };

  const addPending = useCallback((item: Item) =>
    setPending(p => { const n = new Map(p); n.set(item.path, { item, ts: Date.now() }); return n; }), []);

  const load = useCallback(async () => {
    if (!configOk) {
      setError("Missing GitHub config. Open Settings to connect.");
      setItems([]);
      setRepoSize(0);
      return;
    }
    const localSize = readStoredRepoSize(repoSizeKey);
    if (localSize) setRepoSize(localSize.size);
    setLoading(true); setError(null);
    try {
      const list = await listGitHubPath({ owner: gitSettings.owner, repo: gitSettings.repo, path: curPath, branch: gitSettings.branch });
      const mapped: Item[] = list.map(i => ({ name: i.name, path: i.path, type: i.type === "dir" ? "folder" : "file", size: i.size ?? 0, sha: i.sha, downloadUrl: i.download_url ?? null }));
      const now = Date.now();
      const merged = [...mapped];
      setPending(prev => {
        const next = new Map(prev);
        for (const [p, entry] of prev) {
          if (now - entry.ts > 30000) { next.delete(p); continue; }
          if (merged.some(i => i.path === p)) { next.delete(p); continue; }
          merged.unshift(entry.item);
        }
        return next;
      });
      setItems(merged); setSelected(new Set());
      try {
        const serverSize = await getGitHubRepoSize({ owner: gitSettings.owner, repo: gitSettings.repo });
        const now = Date.now();
        if (!localSize) {
          setRepoSizePersist(serverSize);
        } else {
          const recent = now - localSize.ts < 2 * 60 * 1000;
          if (!recent || serverSize < localSize.size) {
            setRepoSizePersist(serverSize);
          }
        }
      }
      catch (_) { }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load.";
      setError(msg); setItems([]); toast(msg, "error");
    } finally { setLoading(false); }
  }, [configOk, curPath, gitSettings, repoSizeKey, setRepoSizePersist, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setSelected(new Set()); setLastSel(null); }, [section]);
  useEffect(() => { setDragging(false); setDropTarget(null); dragCounterRef.current = 0; }, [section]);
  useEffect(() => {
    if (!newFolderOpen) return;
    const isMobile = window.matchMedia?.("(max-width: 768px)").matches;
    const target = isMobile ? newFolderInputMobileRef.current : newFolderInputDesktopRef.current;
    const id = window.setTimeout(() => target?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [newFolderOpen]);

  useEffect(() => {
    if (!renameOpen) return;
    const isMobile = window.matchMedia?.("(max-width: 768px)").matches;
    const target = isMobile ? renameInputMobileRef.current : renameInputDesktopRef.current;
    const id = window.setTimeout(() => {
      target?.focus();
      target?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [renameOpen]);
  useEffect(() => () => {
    timersRef.current.forEach(t => clearInterval(t));
    timersRef.current.clear();
    if (viewerUrlRef.current) { URL.revokeObjectURL(viewerUrlRef.current); viewerUrlRef.current = null; }
  }, []);

  // Pull-to-refresh — must be after load
  const [pullY, setPullY] = useState(0);
  const [pullTriggered, setPullTriggered] = useState(false);
  const pullStartY = useRef(0);
  const pullActive = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const PULL_THRESHOLD = 72;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0) {
      pullStartY.current = e.touches[0].clientY;
      pullActive.current = true;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pullActive.current) return;
    const dy = e.touches[0].clientY - pullStartY.current;
    if (dy > 0) {
      setPullY(Math.min(dy * 0.42, PULL_THRESHOLD + 20));
      setPullTriggered(dy * 0.42 >= PULL_THRESHOLD);
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!pullActive.current) return;
    pullActive.current = false;
    if (pullTriggered) load();
    setPullY(0);
    setPullTriggered(false);
  }, [pullTriggered, load]);

  // Long press for iOS action sheet
  const startLongPress = useCallback((item: Item) => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
    longPressRef.current = window.setTimeout(() => {
      longPressRef.current = null;
      setActionSheet({ item });
    }, 500);
  }, []);
  const cancelLongPress = useCallback(() => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
  }, []);

  const onItemTouchStart = useCallback((item: Item, e: React.TouchEvent) => {
    startLongPress(item);
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, item };
    swipeLockedRef.current = false;
  }, [startLongPress]);

  const onItemTouchMove = useCallback((e: React.TouchEvent) => {
    const swipe = swipeRef.current;
    if (!swipe || swipeLockedRef.current) return;
    if (selected.size > 0) { cancelLongPress(); return; }

    const dx = e.touches[0].clientX - swipe.x;
    const dy = e.touches[0].clientY - swipe.y;
    if (Math.abs(dx) < 16 && Math.abs(dy) < 16) return;

    if (Math.abs(dy) > Math.abs(dx) + 6) {
      cancelLongPress();
      return;
    }

    cancelLongPress();
    if (Math.abs(dx) < 56) return;

    swipeLockedRef.current = true;
    swipeTapBlockRef.current = true;
    if (dx > 0) {
      const wasStarred = isStarred(swipe.item.path);
      toggleStar(swipe.item);
      toast(wasStarred ? "Removed from Starred" : "Added to Starred", "success");
    } else {
      setActionSheet({ item: swipe.item });
    }
    swipeRef.current = null;
  }, [cancelLongPress, isStarred, selected.size, setActionSheet, toast, toggleStar]);

  const onItemTouchEnd = useCallback(() => {
    cancelLongPress();
    swipeRef.current = null;
    swipeLockedRef.current = false;
    if (swipeTapBlockRef.current) {
      window.setTimeout(() => { swipeTapBlockRef.current = false; }, 180);
    }
  }, [cancelLongPress]);

  // Large title collapses when scroll > 8px
  const onIosScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setLargeTitleCollapsed((e.currentTarget as HTMLDivElement).scrollTop > 8);
  }, []);

  const rowClick = (item: Item, e: React.MouseEvent) => {
    if (e.shiftKey && lastSel) { selRange(lastSel, item.path); return; }
    if (e.metaKey || e.ctrlKey) {
      setSelected(prev => { const n = new Set(prev); n.has(item.path) ? n.delete(item.path) : n.add(item.path); return n; });
      setLastSel(item.path); return;
    }
    selOnly(item.path);
    if (item.type === "file") setDetailItem(item);
    else setDetailItem(null);
  };

  const onRowContextMenu = useCallback((item: Item, e: React.MouseEvent) => {
    e.preventDefault();
    if (!selected.has(item.path)) selOnly(item.path);
    setCtxMenu({ item, x: e.clientX, y: e.clientY });
  }, [selected]);

  const openFolder = useCallback((name: string) => {
    setPath(prev => {
      const next = [...prev, name];
      touchRecent({ name, path: resolve(next), type: "folder", size: 0, sha: "" });
      return next;
    });
    setSection("drive");
    setSelected(new Set());
  }, [resolve, touchRecent]);

  const openFolderPath = useCallback((folderPath: string) => {
    const relative = stripBase(folderPath);
    const next = relative ? relative.split("/").filter(Boolean) : [];
    touchRecent({ name: next[next.length - 1] ?? folderPath, path: folderPath, type: "folder", size: 0, sha: "" });
    setPath(next);
    setSection("drive");
    setSelected(new Set());
  }, [stripBase, touchRecent]);

  const navTo = (i: number) => {
    setPath(i === 0 ? [] : path.slice(0, i));
    setSection("drive");
    setSelected(new Set());
  };
  const goUp = () => {
    if (path.length) {
      setPath(path.slice(0, -1));
      setSection("drive");
      setSelected(new Set());
    }
  };

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await fn(); toast(label, "success"); await load(); }
    catch (e) { const m = e instanceof Error ? e.message : "Error"; setError(m); toast(m, "error"); }
    finally { setBusy(false); }
  }, [busy, load, toast]);

  const clearSel = () => { setSelected(new Set()); setLastSel(null); };
  const selectAll = () => setSelected(new Set(displayed.map(i => i.path)));

  const openNewFolder = useCallback(() => {
    if (!driveOnly || !configOk || busy) return;
    setNewFolderName("");
    setNewFolderOpen(true);
  }, [busy, configOk, driveOnly]);

  const closeNewFolder = useCallback(() => {
    setNewFolderOpen(false);
    setNewFolderName("");
  }, []);

  const confirmNewFolder = useCallback(async () => {
    if (!driveOnly || !configOk || busy) return;
    const trimmed = newFolderName.trim();
    if (!trimmed) { toast("Enter a folder name.", "error"); return; }
    if (/[\\/]/.test(trimmed)) { toast("Folder name cannot include / or \\\\.", "error"); return; }

    closeNewFolder();
    const tp = resolve([...path, trimmed]);
    const opt: Item = { name: trimmed, path: tp, type: "folder", size: 0, sha: "" };
    addPending(opt);
    setItems(p => p.some(i => i.path === tp) ? p : [opt, ...p]);
    await run(`Created "${trimmed}"`, () =>
      createGitHubFolder({ owner: gitSettings.owner, repo: gitSettings.repo, path: tp, branch: gitSettings.branch }));
  }, [addPending, busy, closeNewFolder, configOk, driveOnly, newFolderName, path, run, toast, gitSettings.owner, gitSettings.repo, gitSettings.branch]);

  const applyRename = useCallback((item: Item, nextName: string, nextPath: string) => {
    setItems(p => p.map(i => i.path === item.path ? { ...i, name: nextName, path: nextPath } : i));
    setSelected(prev => {
      if (!prev.size) return prev;
      const n = new Set(prev);
      if (n.delete(item.path)) n.add(nextPath);
      return n;
    });
    setLastSel(prev => prev === item.path ? nextPath : prev);
    setPending(prev => {
      if (!prev.has(item.path)) return prev;
      const n = new Map(prev);
      const entry = n.get(item.path)!;
      n.delete(item.path);
      n.set(nextPath, { item: { ...entry.item, name: nextName, path: nextPath }, ts: entry.ts });
      return n;
    });
    updateRecent(prev => prev.map(r => r.path === item.path ? { ...r, name: nextName, path: nextPath } : r));
    updateStarred(prev => prev.map(s => s.path === item.path ? { ...s, name: nextName, path: nextPath } : s));
  }, [updateRecent, updateStarred]);

  const openRename = useCallback((item: Item) => {
    if (!driveOnly || !configOk || busy) return;
    setRenameItem(item);
    setRenameName(item.name);
    setRenameOpen(true);
  }, [busy, configOk, driveOnly]);

  const closeRename = useCallback(() => {
    setRenameOpen(false);
    setRenameName("");
    setRenameItem(null);
  }, []);

  const confirmRename = useCallback(async () => {
    if (!driveOnly || !configOk || busy || !renameItem) return;
    const trimmed = renameName.trim();
    if (!trimmed) { toast("Enter a name.", "error"); return; }
    if (/[\\/]/.test(trimmed)) { toast("Name cannot include / or \\\\.", "error"); return; }
    if (trimmed === renameItem.name) { closeRename(); return; }

    const parts = renameItem.path.split("/");
    const parent = parts.slice(0, -1).join("/");
    const nextPath = parent ? `${parent}/${trimmed}` : trimmed;
    closeRename();
    applyRename(renameItem, trimmed, nextPath);
    await run(`Renamed "${renameItem.name}"`, () =>
      moveGitHubPath({ owner: gitSettings.owner, repo: gitSettings.repo, from: renameItem.path, to: nextPath, branch: gitSettings.branch, isDir: renameItem.type === "folder" }));
  }, [applyRename, busy, closeRename, configOk, driveOnly, renameItem, renameName, run, toast, gitSettings.owner, gitSettings.repo, gitSettings.branch]);

  const handleUpload = async (files: FileList | null, targetBase = curPath) => {
    if (!driveOnly) return;
    if (!files?.length) return;
    const all = Array.from(files);
    const ok = all.filter(f => f.size <= MAX_FILE_BYTES);
    const skipped = all.length - ok.length;
    if (skipped) toast(`Skipped ${skipped} file${skipped > 1 ? "s" : ""} over 100 MB`, "error");
    if (!ok.length) return;
    if (repoSize + ok.reduce((s, f) => s + f.size, 0) > MAX_REPO_BYTES) { toast("Would exceed 5 GB limit.", "error"); return; }
    const queued: UploadItem[] = ok.map(f => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: f.name, size: f.size, progress: 0, status: "queued" }));
    setUploads(p => [...queued, ...p]);
    for (const f of ok) {
      const tp = jp(targetBase, f.name);
      const opt: Item = { name: f.name, path: tp, type: "file", size: f.size, sha: "" };
      addPending(opt); setItems(p => p.some(i => i.path === tp) ? p : [opt, ...p]);
    }
    await run(`Uploaded ${ok.length} file${ok.length > 1 ? "s" : ""}`, async () => {
      for (let i = 0; i < ok.length; i++) {
        const f = ok[i]; const uid = queued[i]?.id;
        if (uid) {
          updUpload(uid, { status: "uploading", progress: 3 });
          startProg(uid, f.name);
          const tid = pushToast(`Uploading ${f.name}… 0%`, "info", true);
          uploadToastRef.current.set(uid, tid);
          uploadToastPctRef.current.set(uid, 0);
        }
        try {
          await uploadGitHubFile({ owner: gitSettings.owner, repo: gitSettings.repo, path: jp(targetBase, f.name), branch: gitSettings.branch, file: f });
          if (uid) {
            stopProg(uid);
            updUpload(uid, { status: "done", progress: 100 });
            adjustRepoSize(f.size);
            setTimeout(() => setUploads(p => p.filter(u => u.id !== uid)), 4000);
            const tid = uploadToastRef.current.get(uid);
            if (tid) {
              updateToast(tid, { message: `Uploaded ${f.name}`, kind: "success", sticky: false });
              removeToast(tid, 2000);
              uploadToastRef.current.delete(uid);
              uploadToastPctRef.current.delete(uid);
            }
          }
        } catch (err) {
          if (uid) {
            stopProg(uid);
            updUpload(uid, { status: "error", message: err instanceof Error ? err.message : "Failed" });
            const tid = uploadToastRef.current.get(uid);
            if (tid) {
              updateToast(tid, { message: `Upload failed: ${f.name}`, kind: "error", sticky: false });
              removeToast(tid, 3500);
              uploadToastRef.current.delete(uid);
              uploadToastPctRef.current.delete(uid);
            }
          }
          throw err;
        }
      }
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = () => {
    if (!driveOnly) return;
    if (!selected.size) return;
    const n = selected.size;
    if (!confirm(`Delete ${n} item${n > 1 ? "s" : ""}? This cannot be undone.`)) return;
    run(`Deleted ${n} item${n > 1 ? "s" : ""}`, async () => {
      const sizeDelta = Array.from(selected).reduce((sum, p) => {
        const item = imap.get(p);
        return item && item.type === "file" ? sum + (item.size || 0) : sum;
      }, 0);
      for (const p of selected) {
        const item = imap.get(p);
        if (item) await deleteGitHubPath({ owner: gitSettings.owner, repo: gitSettings.repo, path: item.path, branch: gitSettings.branch, isDir: item.type === "folder", sha: item.sha });
      }
      if (sizeDelta) adjustRepoSize(-sizeDelta);
    });
  };

  const handleMoveUp = () => {
    if (!driveOnly) return;
    if (!selected.size || !path.length) return;
    const parent = resolve(path.slice(0, -1));
    run(`Moved ${selected.size} item${selected.size > 1 ? "s" : ""} up`, async () => {
      for (const p of selected) {
        const item = imap.get(p);
        if (item) await moveGitHubPath({ owner: gitSettings.owner, repo: gitSettings.repo, from: item.path, to: [parent, item.name].filter(Boolean).join("/"), branch: gitSettings.branch, isDir: item.type === "folder" });
      }
    });
  };

  const closeViewer = () => {
    viewReqId.current += 1;
    if (viewerUrlRef.current) { URL.revokeObjectURL(viewerUrlRef.current); viewerUrlRef.current = null; }
    setViewer({ open: false, item: undefined, kind: undefined, url: undefined, text: undefined, loading: false, error: null });
  };

  const dlFile = async (item: Item) => {
    touchRecent(item);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setDownloads(p => [{ id, name: item.name, progress: null, status: "downloading" }, ...p]);
    const toastId = pushToast(`Downloading ${item.name}… 0%`, "info", true);
    downloadToastRef.current.set(id, toastId);
    downloadToastPctRef.current.set(id, 0);
    try {
      const { blob, name } = await getGitHubFileBlob(
        { owner: gitSettings.owner, repo: gitSettings.repo, path: item.path, branch: gitSettings.branch },
        pct => {
          updDownload(id, { progress: pct });
          const tid = downloadToastRef.current.get(id);
          const last = downloadToastPctRef.current.get(id) ?? 0;
          const next = Math.max(0, Math.min(100, pct));
          if (tid && (next - last >= 10 || next === 100)) {
            updateToast(tid, { message: `Downloading ${item.name}… ${next}%` });
            downloadToastPctRef.current.set(id, next);
          }
        }
      );
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      updDownload(id, { status: "done", progress: 100 });
      setTimeout(() => setDownloads(p => p.filter(d => d.id !== id)), 4000);
      const tid = downloadToastRef.current.get(id);
      if (tid) {
        updateToast(tid, { message: `Downloaded ${item.name}`, kind: "success", sticky: false });
        removeToast(tid, 2000);
        downloadToastRef.current.delete(id);
        downloadToastPctRef.current.delete(id);
      }
    } catch (err) {
      updDownload(id, { status: "error", message: err instanceof Error ? err.message : "Failed", progress: 0 });
      const tid = downloadToastRef.current.get(id);
      if (tid) {
        updateToast(tid, { message: `Download failed: ${item.name}`, kind: "error", sticky: false });
        removeToast(tid, 3500);
        downloadToastRef.current.delete(id);
        downloadToastPctRef.current.delete(id);
      }
    }
  };

  const viewFile = async (item: Item) => {
    const reqId = ++viewReqId.current;
    touchRecent(item);
    setViewer({ open: true, item, loading: true });
    try {
      const ext = extOf(item.name);
      const kind: ViewerState["kind"] =
        ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext) ? "image" :
          ext === "pdf" ? "pdf" :
            ["mp4", "mov", "webm", "m4v"].includes(ext) ? "video" :
              ["txt", "md", "json", "js", "ts", "tsx", "jsx", "css", "html", "yml", "yaml", "log", "csv"].includes(ext) ? "text" : "unknown";
      if (kind === "unknown") {
        if (reqId !== viewReqId.current) return;
        setViewer({ open: true, item, kind, loading: false, error: "No preview available." });
        return;
      }
      const { blob } = await getGitHubFileBlob({ owner: gitSettings.owner, repo: gitSettings.repo, path: item.path, branch: gitSettings.branch });
      if (reqId !== viewReqId.current) return;
      if (viewerUrlRef.current) { URL.revokeObjectURL(viewerUrlRef.current); viewerUrlRef.current = null; }
      if (kind === "text") {
        const text = await blob.text();
        if (reqId !== viewReqId.current) return;
        setViewer({ open: true, item, kind, text, loading: false });
      } else {
        if (kind === "image") {
          const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
          const isJpeg = head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF;
          const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47;
          const isGif = head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38;
          const isWebp = head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46;
          const isSvg = new TextDecoder().decode(head).toLowerCase().includes("<svg");
          if (!isJpeg && !isPng && !isGif && !isWebp && !isSvg) {
            const txt = await blob.text();
            if (txt.includes("git-lfs.github.com/spec/v1")) {
              throw new Error("This image is stored with Git LFS. LFS downloads are not supported yet.");
            }
            throw new Error("Image data is not a valid image.");
          }
        }
        const url = URL.createObjectURL(blob);
        viewerUrlRef.current = url;
        setViewer({ open: true, item, kind, url, loading: false });
      }
    } catch (err) {
      if (reqId !== viewReqId.current) return;
      setViewer({ open: true, item, loading: false, error: err instanceof Error ? err.message : "Preview failed." });
    }
  };

  const onViewerImageError = useCallback(() => {
    viewReqId.current += 1;
    if (viewerUrlRef.current) { URL.revokeObjectURL(viewerUrlRef.current); viewerUrlRef.current = null; }
    setViewer(prev => ({ ...prev, url: undefined, loading: false, error: "Image failed to load." }));
  }, []);

  const openItem = (item: Item) => {
    if (item.type === "folder") {
      if (section === "drive") openFolder(item.name);
      else openFolderPath(item.path);
    } else {
      void viewFile(item);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isInput(e.target)) return;
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "a") { e.preventDefault(); selectAll(); return; }
      if ((e.metaKey || e.ctrlKey) && k === "n") { e.preventDefault(); openNewFolder(); return; }
      if ((e.metaKey || e.ctrlKey) && k === "u") { e.preventDefault(); fileInputRef.current?.click(); return; }
      if (e.key === "Escape") {
        if (renameOpen) { closeRename(); return; }
        if (newFolderOpen) { closeNewFolder(); return; }
        if (settingsOpen) { setSettingsOpen(false); return; }
        if (ctxMenu) { setCtxMenu(null); return; }
        if (actionSheet) { setActionSheet(null); return; }
        if (viewer.open) closeViewer(); else clearSel();
        return;
      }
      if (e.key === "F2" && selected.size === 1 && driveOnly) {
        e.preventDefault();
        const item = imap.get(Array.from(selected)[0]);
        if (item) openRename(item);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace" && (e.metaKey || e.ctrlKey)) { handleDelete(); return; }
      if (e.key === "Backspace" && !selected.size && driveOnly) { e.preventDefault(); goUp(); return; }
      if (e.key === "Enter" && selected.size === 1) {
        const item = imap.get(Array.from(selected)[0]);
        if (item) openItem(item);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onDragEnter = (e: React.DragEvent) => {
    if (!driveOnly || !isFileDrag(e)) return;
    e.preventDefault(); dragCounterRef.current++; setDragging(true);
  };
  const onDragLeave = () => { if (--dragCounterRef.current <= 0) { dragCounterRef.current = 0; setDragging(false); } };
  const onDrop = (e: React.DragEvent) => {
    if (!driveOnly || !isFileDrag(e)) return;
    e.preventDefault(); dragCounterRef.current = 0; setDragging(false); setDropTarget(null);
    handleUpload(e.dataTransfer?.files ?? null, curPath);
  };

  const onRowDragStart = (item: Item, e: React.DragEvent) => {
    if (busy || !driveOnly) return;
    const payload = selected.has(item.path) ? Array.from(selected) : [item.path];
    setSelected(new Set(payload)); setDragItems(payload);
    e.dataTransfer?.setData("application/x-jr-paths", JSON.stringify(payload));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  };
  const onRowDragEnd = () => { setDragItems([]); setDropTarget(null); };
  const onRowDragOver = (item: Item, e: React.DragEvent) => {
    if (!driveOnly || item.type !== "folder" || (!isFileDrag(e) && !isInternalDrag(e))) return;
    e.preventDefault(); setDropTarget(item.path);
  };
  const onRowDragLeave = (item: Item) => { if (dropTarget === item.path) setDropTarget(null); };

  const moveToFolder = (target: string, paths: string[]) => {
    if (!driveOnly || !paths.length) return;
    run(`Moved ${paths.length} item${paths.length > 1 ? "s" : ""}`, async () => {
      for (const p of paths) {
        const item = imap.get(p);
        if (!item || item.path === target || (item.type === "folder" && target.startsWith(`${item.path}/`))) continue;
        await moveGitHubPath({ owner: gitSettings.owner, repo: gitSettings.repo, from: item.path, to: jp(target, item.name), branch: gitSettings.branch, isDir: item.type === "folder" });
      }
    });
  };
  const onRowDrop = (item: Item, e: React.DragEvent) => {
    if (!driveOnly || item.type !== "folder") return;
    e.preventDefault(); setDropTarget(null);
    const f = e.dataTransfer?.files ?? null;
    if (f?.length) { handleUpload(f, item.path); return; }
    if (isInternalDrag(e)) {
      const raw = e.dataTransfer?.getData("application/x-jr-paths");
      moveToFolder(item.path, raw ? JSON.parse(raw) as string[] : dragItems);
    }
  };

  const rp = (item: Item) => ({
    onDoubleClick: () => openItem(item),
    onContextMenu: (e: React.MouseEvent) => onRowContextMenu(item, e),
    draggable: driveOnly && !busy,
    onDragStart: (e: React.DragEvent) => onRowDragStart(item, e),
    onDragEnd: onRowDragEnd,
    onDragOver: (e: React.DragEvent) => onRowDragOver(item, e),
    onDragLeave: () => onRowDragLeave(item),
    onDrop: (e: React.DragEvent) => onRowDrop(item, e),
  });

  const folderTitle = section === "drive" ? (path.length ? path[path.length - 1] : "My Drive") : sectionLabel;

  /* ─── Shared renderers ─── */
  const renderFinderList = () => (
    <div className="finder-table">
      <div className="finder-thead">
        <span>Name</span><span>Kind</span><span>Size</span><span />
      </div>
      {displayed.length > 0 ? displayed.map(item => {
        const sel = selected.has(item.path);
        const meta = extMeta(item.name);
        const isF = item.type === "folder";
        const starredOn = isStarred(item.path);
        return (
          <button key={item.path}
            className={["finder-row", sel && "selected", dropTarget === item.path && "drop-target"].filter(Boolean).join(" ")}
            onClick={e => rowClick(item, e)}
            {...rp(item)}
          >
            <div className="finder-name-cell">
              <div className={`finder-file-ic ${isF ? "is-folder" : "is-file"}`}>
                {isF
                  ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 8a2 2 0 012-2h4.17a2 2 0 011.42.59l.82.82A2 2 0 0012.83 8H19a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                  : <>{Ic.file()}{extOf(item.name) && <span className="file-type-badge" style={{ background: meta.color }}>{meta.label}</span>}</>
                }
              </div>
              <span className="finder-name">{item.name}</span>
            </div>
            <span className="finder-meta">{isF ? "Folder" : extOf(item.name).toUpperCase() || "File"}</span>
            <span className="finder-meta">{formatBytes(item.size)}</span>
            <div className="row-hover-actions">
              {!isF && <button
                className="row-action-btn" title="Preview"
                onClick={e => { e.stopPropagation(); viewFile(item); }}
              >{Ic.eye()}</button>}
              {!isF && <button
                className="row-action-btn" title="Download"
                onClick={e => { e.stopPropagation(); dlFile(item); }}
              >{Ic.download()}</button>}
              <button
                className={`row-action-btn${starredOn ? " starred" : ""}`}
                title={starredOn ? "Unstar" : "Star"}
                onClick={e => { e.stopPropagation(); toggleStar(item); }}
              >{Ic.star(starredOn)}</button>
            </div>
          </button>
        );
      }) : (
        <div className="empty-state">
          <div className="empty-ic">📁</div>
          <div className="empty-title">
            {query ? `No results for "${query}"` : section === "recent" ? "No recent items" : section === "starred" ? "No starred items" : "This folder is empty"}
          </div>
          <div className="empty-sub">
            {query ? "Try a different search" : section === "recent" ? "Open files or folders to see them here" : section === "starred" ? "Star items to pin them here" : "Drag files here or click Upload"}
          </div>
        </div>
      )}
    </div>
  );

  const renderFinderGrid = () => (
    displayed.length > 0 ? (
      <div className="finder-grid">
        {displayed.map(item => {
          const sel = selected.has(item.path);
          const meta = extMeta(item.name);
          const isF = item.type === "folder";
          const starredOn = isStarred(item.path);
          return (
            <button key={item.path}
              className={["grid-item", sel && "selected", dropTarget === item.path && "drop-target"].filter(Boolean).join(" ")}
              onClick={e => rowClick(item, e)}
              {...rp(item)}
            >
              <span
                className={`grid-star-btn${starredOn ? " on" : ""}`}
                title={starredOn ? "Unstar" : "Star"}
                onClick={e => { e.stopPropagation(); toggleStar(item); }}
              >
                {Ic.star(starredOn)}
              </span>
              {sel && <div className="grid-item-sel">{Ic.check()}</div>}
              <div className={`grid-file-ic ${isF ? "is-folder" : "is-file"}`}>
                {isF
                  ? <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M3 8a2 2 0 012-2h4.17a2 2 0 011.42.59l.82.82A2 2 0 0012.83 8H19a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                  : <>{Ic.file()}{extOf(item.name) && <span className="grid-ext-badge" style={{ background: meta.color }}>{meta.label}</span>}</>
                }
              </div>
              <div className="grid-item-name" title={item.name}>{item.name}</div>
              <div className="grid-item-sub">{isF ? "Folder" : formatBytes(item.size)}</div>
            </button>
          );
        })}
      </div>
    ) : (
      <div className="empty-state">
        <div className="empty-ic">📁</div>
        <div className="empty-title">
          {query ? `No results for "${query}"` : section === "recent" ? "No recent items" : section === "starred" ? "No starred items" : "Empty"}
        </div>
        <div className="empty-sub">
          {query ? "Try a different search" : section === "recent" ? "Open files or folders to see them here" : section === "starred" ? "Star items to pin them here" : "Drop files here or tap Upload"}
        </div>
      </div>
    )
  );

  // Reference-style thumbnail grid (matches screen.png / code.html)
  const renderRefGrid = () => (
    displayed.length > 0 ? (
      <div className="ref-grid">
        {displayed.map(item => {
          const sel = selected.has(item.path);
          const meta = extMeta(item.name);
          const isF = item.type === "folder";
          return (
            <button key={item.path}
              className={["ref-grid-item", sel && "selected"].filter(Boolean).join(" ")}
              onClick={e => rowClick(item, e)}
              onDoubleClick={() => openItem(item)}
              onContextMenu={e => onRowContextMenu(item, e)}
              draggable={driveOnly && !busy}
              onDragStart={e => onRowDragStart(item, e)}
              onDragEnd={onRowDragEnd}
              onDragOver={e => onRowDragOver(item, e)}
              onDragLeave={() => onRowDragLeave(item)}
              onDrop={e => onRowDrop(item, e)}
            >
              <div className={["ref-thumb", isF && "ref-thumb-folder", dropTarget === item.path && "drop-target"].filter(Boolean).join(" ")}>
                {isF
                  ? <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--tint)" }}>
                    <path d="M3 8a2 2 0 012-2h4.17a2 2 0 011.42.59l.82.82A2 2 0 0012.83 8H19a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                  </svg>
                  : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 28, opacity: 0.5 }}>{Ic.file()}</span>
                    {extOf(item.name) && <span style={{ fontSize: 9, fontWeight: 700, background: meta.color, color: "white", padding: "2px 6px", borderRadius: 4, letterSpacing: "0.06em" }}>{meta.label}</span>}
                  </div>
                }
              </div>
              <div className="ref-item-name" title={item.name}>{item.name}</div>
              <div className="ref-item-sub">{sel ? <span style={{ color: "var(--tint)", fontWeight: 600 }}>Selected</span> : isF ? "Folder" : formatBytes(item.size)}</div>
            </button>
          );
        })}
      </div>
    ) : (
      <div className="empty-state">
        <div className="empty-ic">📁</div>
        <div className="empty-title">{query ? `No results for "${query}"` : "This folder is empty"}</div>
        <div className="empty-sub">{query ? "Try a different search" : "Drag files here or click Upload"}</div>
      </div>
    )
  );

  const renderIosList = () => (
    <div className="ios-list">
      {displayed.length > 0 ? displayed.map(item => {
        const sel = selected.has(item.path);
        const meta = extMeta(item.name);
        const isF = item.type === "folder";
        const starredOn = isStarred(item.path);
        return (
          <button key={item.path}
            className={["ios-row", sel && "selected"].filter(Boolean).join(" ")}
            onClick={e => {
              if (swipeTapBlockRef.current) { swipeTapBlockRef.current = false; return; }
              if (selected.size > 0) {
                if (sel) { clearSel(); return; }
                rowClick(item, e);
                return;
              }
              openItem(item);
            }}
            onTouchStart={e => onItemTouchStart(item, e)}
            onTouchEnd={onItemTouchEnd}
            onTouchMove={onItemTouchMove}
          >
            <div className={`ios-file-ic ${isF ? "folder" : "file"}`}>
              {isF
                ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 8a2 2 0 012-2h4.17a2 2 0 011.42.59l.82.82A2 2 0 0012.83 8H19a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                : <>{Ic.file()}{extOf(item.name) && <span className="ios-file-ext" style={{ background: meta.color }}>{meta.label}</span>}</>
              }
            </div>
            <div className="ios-row-text">
              <div className="ios-row-name">{item.name}</div>
              <div className="ios-row-sub">{isF ? "Folder" : `${formatBytes(item.size)} · ${extOf(item.name).toUpperCase() || "File"}`}</div>
            </div>
            <div className="ios-row-actions">
              {starredOn && <span className="ios-star-btn on" onClick={e => { e.stopPropagation(); toggleStar(item); }}>{Ic.star(true)}</span>}
              {sel
                ? <div className="ios-row-check">{Ic.check()}</div>
                : isF ? <span className="ios-chev">{Ic.chevRight()}</span> : null
              }
            </div>
          </button>
        );
      }) : (
        <div className="empty-state">
          <div className="empty-ic">📁</div>
          <div className="empty-title">
            {query ? `No results for "${query}"` : section === "recent" ? "No recent items" : section === "starred" ? "No starred items" : "This folder is empty"}
          </div>
          <div className="empty-sub">
            {query ? "Try a different search" : section === "recent" ? "Open files or folders to see them here" : section === "starred" ? "Star items to pin them here" : "Tap + to upload files"}
          </div>
        </div>
      )}
    </div>
  );

  const renderIosGrid = () => (
    displayed.length > 0 ? (
      <div className="ios-grid">
        {displayed.map(item => {
          const sel = selected.has(item.path);
          const meta = extMeta(item.name);
          const isF = item.type === "folder";
          const starredOn = isStarred(item.path);
          return (
            <button key={item.path}
              className={["ios-grid-item", sel && "selected"].filter(Boolean).join(" ")}
              onClick={() => {
                if (swipeTapBlockRef.current) { swipeTapBlockRef.current = false; return; }
                openItem(item);
              }}
              onTouchStart={e => onItemTouchStart(item, e)}
              onTouchEnd={onItemTouchEnd}
              onTouchMove={onItemTouchMove}
            >
              <span
                className={`ios-grid-star-btn${starredOn ? " on" : ""}`}
                onClick={e => { e.stopPropagation(); toggleStar(item); }}
                title={starredOn ? "Unstar" : "Star"}
              >
                {Ic.star(starredOn)}
              </span>
              {sel && <div className="ios-grid-sel">{Ic.check()}</div>}
              <div className={`ios-grid-ic ${isF ? "folder" : "file"}`}>
                {isF
                  ? <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M3 8a2 2 0 012-2h4.17a2 2 0 011.42.59l.82.82A2 2 0 0012.83 8H19a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                  : <>{Ic.file()}{extOf(item.name) && <span className="ios-grid-ext" style={{ background: meta.color }}>{meta.label}</span>}</>
                }
              </div>
              <div className="ios-grid-name" title={item.name}>{item.name}</div>
              <div className="ios-grid-sub">{isF ? "Folder" : formatBytes(item.size)}</div>
            </button>
          );
        })}
      </div>
    ) : (
      <div className="empty-state">
        <div className="empty-ic">📁</div>
        <div className="empty-title">
          {query ? `No results for "${query}"` : section === "recent" ? "No recent items" : section === "starred" ? "No starred items" : "Empty"}
        </div>
        <div className="empty-sub">
          {query ? "Try a different search" : section === "recent" ? "Open files or folders to see them here" : section === "starred" ? "Star items to pin them here" : "Tap + to add files"}
        </div>
      </div>
    )
  );

  return (
    <>
      <style>{CSS}</style>
      <input ref={fileInputRef} type="file" multiple className="hidden"
        onChange={e => handleUpload(e.currentTarget.files)} />

      {/* ══════════════════════════════════
          DESKTOP — 3-panel reference layout
      ══════════════════════════════════ */}
      <div className="desktop-view"
        onDragEnter={onDragEnter}
        onDragOver={e => { if (driveOnly && isFileDrag(e)) e.preventDefault(); }}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="mac-window" style={{ flex: 1, borderRadius: 0 }}>

          {/* ── LEFT SIDEBAR ── */}
          <aside className="sidebar">
            <nav className="sidebar-nav">
              {/* LIBRARY */}
              <div className="nav-section">
                <div className="nav-sec-hd">Library</div>
                <button className={`nav-item${section === "starred" ? " active" : ""}`} onClick={() => setSection("starred")}>
                  <span className="nav-ic nav-ic-star">{Ic.star(true)}</span>
                  <span className="nav-item-label">Favorites</span>
                </button>
                <button className={`nav-item${section === "recent" ? " active" : ""}`} onClick={() => setSection("recent")}>
                  <span className="nav-ic">{Ic.clock()}</span>
                  <span className="nav-item-label">Recent</span>
                </button>
                <button className="nav-item">
                  <span className="nav-ic">{Ic.drive()}</span>
                  <span className="nav-item-label">Shared</span>
                </button>
              </div>

              <div className="nav-divider" />

              {/* CLOUD */}
              <div className="nav-section">
                <div className="nav-sec-hd">Cloud</div>
                <button className={`nav-item${section === "drive" ? " active" : ""}`} onClick={() => navTo(0)}>
                  <span className="nav-ic">{Ic.icloudUp()}</span>
                  <span className="nav-item-label">My Files</span>
                </button>
              </div>
            </nav>


          </aside>

          {/* ── CENTER MAIN ── */}
          <div className="main">
            {/* Toolbar */}
            <div className="toolbar">
              <div className="toolbar-nav-btns">
                <button className="toolbar-nav-btn" onClick={goUp} disabled={!driveOnly || !path.length}>{Ic.chevLeft()}</button>
                <button className="toolbar-nav-btn" disabled>{Ic.chevRight()}</button>
              </div>

              <nav className="breadcrumb">
                {crumbs.map((seg, i) => (
                  <React.Fragment key={`${seg}-${i}`}>
                    {driveOnly
                      ? <><button className="crumb" onClick={() => navTo(i)}>{seg === "/" ? "Documents" : seg}</button>
                        {i < crumbs.length - 1 && <span className="crumb-sep">{Ic.chevRight()}</span>}</>
                      : <span className="crumb">{seg}</span>}
                  </React.Fragment>
                ))}
              </nav>

              <div className="search-wrap">
                <span className="search-ic">{Ic.search()}</span>
                <input className="search-input" placeholder="Search" value={query} onChange={e => setQuery(e.currentTarget.value)} />
                {query && <button className="search-clear" onClick={() => setQuery("")}><svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M2 2l6 6M8 2L2 8" /></svg></button>}
              </div>

              <div className="toolbar-right">
                <div className="seg-ctrl">
                  <button className={`seg-btn${view === "grid" ? " on" : ""}`} onClick={() => setView("grid")} title="Grid">{Ic.grid()}</button>
                  <button className={`seg-btn${view === "list" ? " on" : ""}`} onClick={() => setView("list")} title="List">{Ic.list()}</button>
                </div>
                <button className="tb-btn tb-btn-tint" onClick={() => fileInputRef.current?.click()} disabled={!driveOnly || !configOk || busy}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 1v10M1 6h10" /></svg>
                  Upload
                </button>
                <button className="tb-btn tb-btn-default" onClick={openNewFolder} disabled={!driveOnly || !configOk || busy}>
                  {Ic.newFolder()}
                  New Folder
                </button>
                <button className="tb-icon-btn" onClick={openSettings} title="Settings">{Ic.settings()}</button>
              </div>
            </div>

            {error && <div className="error-banner">{Ic.info()}<span>{error}</span></div>}

            {/* File content */}
            <div className="content" onClick={e => { if (ctxMenu) setCtxMenu(null); if ((e.target as HTMLElement).classList.contains("content")) { clearSel(); setDetailItem(null); } }}>
              {selected.size > 0 && (
                <div className="float-sel-pill">
                  <span className="pill-label">{selected.size} selected</span>
                  {selected.size === 1 && (() => {
                    const item = imap.get(Array.from(selected)[0]);
                    return item ? <>
                      <div className="pill-divider" />
                      {item.type === "file" && (
                        <>
                          <button className="pill-btn" onClick={() => viewFile(item)} disabled={busy}>{Ic.eye()} Preview</button>
                          <button className="pill-btn" onClick={() => dlFile(item)} disabled={busy}>{Ic.download()} Download</button>
                        </>
                      )}
                      {driveOnly && (
                        <button className="pill-btn" onClick={() => openRename(item)} disabled={busy}>{Ic.rename()} Rename</button>
                      )}
                    </> : null;
                  })()}
                  <div className="pill-divider" />
                  {driveOnly && path.length > 0 && <button className="pill-btn" onClick={handleMoveUp} disabled={busy}>{Ic.moveUp()} Move up</button>}
                  <button className="pill-btn danger" onClick={handleDelete} disabled={!driveOnly || busy}>{Ic.trash()} Delete</button>
                  <div className="pill-divider" />
                  <button className="pill-btn" onClick={clearSel}>{Ic.x()}</button>
                </div>
              )}

              {loading && (
                <div className="ref-grid">
                  {[1, 2, 3, 4, 5, 6].map((n, i) => (
                    <div key={n} className="ref-grid-item">
                      <div className="sk" style={{ width: "100%", aspectRatio: "4/3", borderRadius: 12, marginBottom: 10 }} />
                      <div className="sk" style={{ height: 11, width: "80%", marginBottom: 6 }} />
                      <div className="sk" style={{ height: 9, width: "45%" }} />
                    </div>
                  ))}
                </div>
              )}
              {!loading && (view === "list" ? renderFinderList() : renderRefGrid())}
            </div>
          </div>

          {/* ── RIGHT INSPECTOR PANEL ── */}
          {(() => {
            const inspItem = detailItem;
            if (!inspItem) return null;
            const meta = extMeta(inspItem.name);
            const isF = inspItem.type === "folder";
            return (
              <aside className="insp-panel">
                {/* Large preview */}
                <div className="insp-preview-wrap">
                  <div className="insp-preview-thumb">
                    {isF
                      ? <svg width="56" height="56" viewBox="0 0 24 24" fill="var(--tint)"><path d="M3 8a2 2 0 012-2h4.17a2 2 0 011.42.59l.82.82A2 2 0 0012.83 8H19a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                      : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                        {Ic.file()}
                        {extOf(inspItem.name) && <span style={{ fontSize: 10, fontWeight: 700, background: meta.color, color: "white", padding: "2px 7px", borderRadius: 5, letterSpacing: "0.04em" }}>{meta.label}</span>}
                      </div>
                    }
                  </div>
                  <div className="insp-filename">{inspItem.name}</div>
                  <div className="insp-filekind">{isF ? "Folder" : `${extOf(inspItem.name) ? extOf(inspItem.name).charAt(0).toUpperCase() + extOf(inspItem.name).slice(1) + " " : ""}File`}</div>
                </div>

                <div className="insp-body">
                  {/* INFORMATION */}
                  <div className="insp-section-hd">Information</div>
                  <div className="insp-meta-list">
                    <div className="insp-meta-row"><span className="insp-meta-k">Created</span><span className="insp-meta-v">—</span></div>
                    <div className="insp-meta-row"><span className="insp-meta-k">Modified</span><span className="insp-meta-v">—</span></div>
                    <div className="insp-meta-row"><span className="insp-meta-k">Size</span><span className="insp-meta-v">{formatBytes(inspItem.size)}</span></div>
                    <div className="insp-meta-row"><span className="insp-meta-k">Type</span><span className="insp-meta-v">{isF ? "Folder" : "Document"}</span></div>
                  </div>

                  {/* SHARED WITH */}
                  <div className="insp-section-hd" style={{ marginTop: 20 }}>Shared With</div>
                  <div className="insp-avatars">
                    {["#E0607E", "#0A84FF", "#30C75A"].map((c, i) => (
                      <div key={i} className="insp-avatar" style={{ background: c, marginLeft: i ? -8 : 0 }} />
                    ))}
                    <div className="insp-avatar insp-avatar-more" style={{ marginLeft: -8 }}>+2</div>
                  </div>

                  {/* ACTIONS */}
                  <div className="insp-actions">
                    <button className="insp-btn">Get Link</button>
                    {!isF && <button className="insp-btn" onClick={() => dlFile(inspItem)}>Download</button>}
                    <button className="insp-btn insp-btn-danger" onClick={() => { selOnly(inspItem.path); handleDelete(); }}>Delete File</button>
                  </div>
                </div>
              </aside>
            );
          })()}

        </div>
      </div>

      {/* ══════════════════════════════════
          MOBILE — iOS Files app layout
      ══════════════════════════════════ */}
      <div className="mobile-view"
        onDragEnter={onDragEnter}
        onDragOver={e => { if (driveOnly && isFileDrag(e)) e.preventDefault(); }}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {/* ── Nav bar ── */}
        <div className="ios-nav">
          <div className="ios-nav-bar">
            {driveOnly && path.length > 0
              ? <button className="ios-back-btn" onClick={goUp}>
                {Ic.chevLeft()}
                <span className="ios-back-label">{path.length > 1 ? path[path.length - 2] : "jrcloud"}</span>
              </button>
              : <div style={{ width: 8 }} />
            }
            {largeTitleCollapsed && (
              <div className="ios-nav-center">
                {path.length === 0 && section === "drive" ? "jrcloud" : folderTitle}
              </div>
            )}
            <div className="ios-nav-right" />
          </div>

          {/* Large title */}
          <div className={`ios-large-title-wrap${largeTitleCollapsed ? " collapsed" : " expanded"}`}>
            <div className="ios-large-title">
              {path.length === 0 && section === "drive" ? "jrcloud" : folderTitle}
            </div>
          </div>

          {/* Search */}
          <div className="ios-search-wrap">
            <span className="ios-search-ic">{Ic.search()}</span>
            <input className="ios-search" placeholder="Search" value={query}
              onChange={e => setQuery(e.currentTarget.value)} />
            {query && (
              <button className="ios-search-clear" onClick={() => setQuery("")}>
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M2 2l6 6M8 2L2 8" /></svg>
              </button>
            )}
          </div>
        </div>

        {/* Pull-to-refresh */}
        <div className="ptr-indicator" style={{ height: pullY }}>
          <div className="ptr-spinner" style={{ transform: `rotate(${Math.min(pullY / (PULL_THRESHOLD + 20), 1) * 360}deg)` }}>
            <ArrowClockwise size={14} weight="bold" style={{ animation: loading ? "ptr-spin 0.7s linear infinite" : "none", color: pullTriggered ? "var(--tint)" : "rgba(60,60,67,0.4)" }} />
          </div>
        </div>

        {/* Scroll area */}
        <div className="ios-scroll" ref={scrollRef} onScroll={onIosScroll}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          style={{ transform: pullY > 0 ? `translateY(${pullY}px)` : undefined, transition: pullActive.current ? "none" : "transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)" }}>

          {error && <div className="error-banner">{Ic.info()}<span>{error}</span></div>}

          {/* Upload progress */}
          {(uploads.length > 0 || downloads.length > 0) && (
            <div className="upload-bar-wrap">
              <div className="upload-bar-head">
                <span className="upload-bar-title">{activeUps.length > 0 ? "Uploading" : "Downloads"}</span>
                <span className="upload-bar-count">{activeUps.length + activeDls.length} active</span>
                <button style={{ marginLeft: "auto", fontSize: 12, color: "var(--tint)", background: "none", border: "none", cursor: "pointer" }}
                  onClick={() => { setUploads(p => p.filter(u => u.status === "queued" || u.status === "uploading")); setDownloads(p => p.filter(d => d.status === "downloading")); }}>
                  Clear done
                </button>
              </div>
              <div className="upload-items">
                {[...uploads, ...downloads].map((item: UploadItem | DownloadItem) => (
                  <div key={item.id} className="upload-row">
                    <div className="upload-col">
                      <div className="upload-fname">{item.name}</div>
                      <div className={`upload-track${item.status === "error" ? " err" : ""}`}>
                        <span className="upload-fill" style={{ width: `${"progress" in item ? item.progress : 10}%` }} />
                      </div>
                    </div>
                    <div className="upload-pct">
                      {item.status === "done" ? "✓" : item.status === "error" ? "✗" : "progress" in item && item.progress ? `${Math.round(item.progress as number)}%` : "…"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Item count header */}
          {!loading && !query && displayed.length > 0 && (
            <div className="ios-section-header">
              {displayed.length} item{displayed.length !== 1 ? "s" : ""}
            </div>
          )}

          {/* Skeleton */}
          {loading && (
            <div className="ios-skeleton-list">
              {[1, 2, 3, 4, 5].map((n, i) => (
                <div key={n} className="ios-skeleton-row">
                  <div className="sk" style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="sk" style={{ height: 13, width: `${55 + i * 12}%`, marginBottom: 7 }} />
                    <div className="sk" style={{ height: 10, width: "38%" }} />
                  </div>
                  <div className="sk" style={{ width: 10, height: 16, borderRadius: 3 }} />
                </div>
              ))}
            </div>
          )}

          {!loading && renderIosList()}

          <div style={{ height: 100 }} />
        </div>

        {/* ── Selection bar ── */}
        {selected.size > 0 && (
          <div className="ios-sel-bar">
            <span className="ios-sel-label">{selected.size} selected</span>
            {selected.size === 1 && (() => {
              const item = imap.get(Array.from(selected)[0]);
              return item?.type === "file" ? <>
                <button className="ios-sel-btn" onClick={() => viewFile(item)}><span className="ios-sel-btn-ic">{Ic.eye()}</span>View</button>
                <button className="ios-sel-btn" onClick={() => dlFile(item)}><span className="ios-sel-btn-ic">{Ic.download()}</span>Save</button>
              </> : null;
            })()}
            {driveOnly && path.length > 0 && <button className="ios-sel-btn" onClick={handleMoveUp}><span className="ios-sel-btn-ic">{Ic.moveUp()}</span>Up</button>}
            <button className="ios-sel-btn danger" onClick={handleDelete} disabled={!driveOnly}><span className="ios-sel-btn-ic">{Ic.trash()}</span>Delete</button>
            <button className="ios-sel-btn" onClick={clearSel}><span className="ios-sel-btn-ic">{Ic.x()}</span>Done</button>
          </div>
        )}

        {fabOpen && <div className="ios-fab-backdrop" onClick={() => setFabOpen(false)} />}

        {/* ── Tab bar ── */}
        <div className="ios-bottom-bar">
          {driveOnly && (
            <div className="ios-fab-group">
              <div className={`ios-fab-mini-actions ${fabOpen ? "visible" : "hidden"}`}>
                <div className="ios-fab-mini-row">
                  <span className="ios-fab-mini-label">Upload Files</span>
                  <button className="ios-fab-mini" disabled={!configOk || busy} style={{ color: "var(--tint)" }}
                    onClick={() => { setFabOpen(false); fileInputRef.current?.click(); }}>
                    <UploadSimple size={20} weight="bold" />
                  </button>
                </div>
                <div className="ios-fab-mini-row">
                  <span className="ios-fab-mini-label">New Folder</span>
                  <button className="ios-fab-mini" disabled={!configOk || busy} style={{ color: "#0A84FF" }}
                    onClick={() => { setFabOpen(false); openNewFolder(); }}>
                    <FolderPlus size={20} weight="bold" />
                  </button>
                </div>
              </div>
              <button className={`ios-fab main${fabOpen ? " expanded" : ""}`} onClick={() => setFabOpen(o => !o)} disabled={!configOk || busy}>
                <span className="fab-icon"><Plus size={22} weight="bold" /></span>
              </button>
            </div>
          )}
          <div className="ios-tabbar">
            <button className={`ios-tab${section === "drive" ? " active" : ""}`} onClick={() => { setSection("drive"); setPath([]); }}>
              <div className="ios-tab-ic"><Folder size={24} weight={section === "drive" ? "fill" : "regular"} /></div>
              <span className="ios-tab-label">Files</span>
            </button>
            <button className={`ios-tab${section === "recent" ? " active" : ""}`} onClick={() => setSection("recent")}>
              <div className="ios-tab-ic"><Clock size={24} weight={section === "recent" ? "fill" : "regular"} /></div>
              <span className="ios-tab-label">Recent</span>
            </button>
            <button className={`ios-tab${section === "starred" ? " active" : ""}`} onClick={() => setSection("starred")}>
              <div className="ios-tab-ic"><Star size={24} weight={section === "starred" ? "fill" : "regular"} /></div>
              <span className="ios-tab-label">Starred</span>
            </button>
            <button className="ios-tab" onClick={openSettings}>
              <div className="ios-tab-ic"><GearSix size={24} weight="regular" /></div>
              <span className="ios-tab-label">Settings</span>
            </button>
          </div>
        </div>

        {/* ── Action sheet (long press) ── */}
        {actionSheet && (
          <div className="ios-action-sheet-overlay" onClick={() => setActionSheet(null)}>
            <div onClick={e => e.stopPropagation()}>
              <div className="ios-action-sheet">
                <div className="ios-action-sheet-header">
                  <div className="ios-sheet-icon">
                    {actionSheet.item.type === "folder"
                      ? <svg width="28" height="28" viewBox="0 0 24 24" fill="var(--tint)"><path d="M3 8a2 2 0 012-2h4.17a2 2 0 011.42.59l.82.82A2 2 0 0012.83 8H19a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                      : (() => { const m = extMeta(actionSheet.item.name); return <span style={{ fontSize: 11, fontWeight: 700, background: m.color, color: "white", padding: "3px 8px", borderRadius: 5 }}>{m.label || "FILE"}</span>; })()
                    }
                  </div>
                  <div className="ios-action-sheet-title">{actionSheet.item.name}</div>
                  <div className="ios-action-sheet-sub">{actionSheet.item.type === "folder" ? "Folder" : formatBytes(actionSheet.item.size)}</div>
                </div>
                {actionSheet.item.type === "file" && (
                  <button className="ios-action-btn" onClick={() => { setActionSheet(null); viewFile(actionSheet.item); }}>
                    <span className="ios-action-btn-ic">{Ic.eye()}</span>
                    <span className="ios-action-btn-label">Preview</span>
                    <span className="ios-action-chev">{Ic.chevRight()}</span>
                  </button>
                )}
                {actionSheet.item.type === "file" && (
                  <button className="ios-action-btn" onClick={() => { setActionSheet(null); dlFile(actionSheet.item); }}>
                    <span className="ios-action-btn-ic">{Ic.download()}</span>
                    <span className="ios-action-btn-label">Download</span>
                    <span className="ios-action-chev">{Ic.chevRight()}</span>
                  </button>
                )}
                <button className="ios-action-btn" onClick={() => { setActionSheet(null); toggleStar(actionSheet.item); }}>
                  <span className="ios-action-btn-ic">{Ic.star(isStarred(actionSheet.item.path))}</span>
                  <span className="ios-action-btn-label">{isStarred(actionSheet.item.path) ? "Unstar" : "Add to Starred"}</span>
                  <span className="ios-action-chev">{Ic.chevRight()}</span>
                </button>
                {driveOnly && (
                  <button className="ios-action-btn" onClick={() => { setActionSheet(null); openRename(actionSheet.item); }} disabled={busy}>
                    <span className="ios-action-btn-ic">{Ic.rename()}</span>
                    <span className="ios-action-btn-label">Rename</span>
                    <span className="ios-action-chev">{Ic.chevRight()}</span>
                  </button>
                )}
                {driveOnly && (
                  <button className="ios-action-btn danger" onClick={() => { setActionSheet(null); selOnly(actionSheet.item.path); handleDelete(); }}>
                    <span className="ios-action-btn-ic">{Ic.trash()}</span>
                    <span className="ios-action-btn-label" style={{ color: "var(--red)" }}>Delete</span>
                  </button>
                )}
              </div>
              <div className="ios-action-sheet-cancel">
                <button className="ios-action-cancel-btn" onClick={() => setActionSheet(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Drop overlays ── */}
      {dragging && (
        <div className="drop-box-wrap">
          <div className="drop-box">
            <div style={{ fontSize: 36, marginBottom: 10 }}>☁️</div>
            <div className="drop-title">Drop to upload</div>
            <div className="drop-sub">Files will be added to this folder</div>
          </div>
        </div>
      )}

      {/* ── Floating progress badge (desktop) ── */}
      {(uploads.length > 0 || downloads.length > 0) && (
        <div className="progress-float" style={{ display: "none" }} /* hidden on mobile, shown via CSS on desktop */>
          {uploads.length > 0 && (
            <div className="progress-float-badge">
              <div className="progress-float-head">
                <span className="progress-float-title">Uploading</span>
                <span className="progress-float-count">{activeUps.length} active</span>
                <button className="progress-float-clear" onClick={() => setUploads(p => p.filter(u => u.status === "queued" || u.status === "uploading"))} disabled={activeUps.length === uploads.length}>Clear done</button>
              </div>
              <div className="progress-float-items">
                {uploads.map(u => (
                  <div key={u.id} className="progress-float-row">
                    <div style={{ minWidth: 0 }}>
                      <div className="progress-float-name">{u.name}</div>
                      <div className={`progress-float-track${u.status === "error" ? " err" : ""}`}>
                        <span className="progress-float-fill" style={{ width: `${u.progress}%` }} />
                      </div>
                    </div>
                    <div className="progress-float-pct">{u.status === "done" ? "✓" : u.status === "error" ? "✗" : `${Math.round(u.progress)}%`}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {downloads.length > 0 && (
            <div className="progress-float-badge">
              <div className="progress-float-head">
                <span className="progress-float-title">Downloads</span>
                <span className="progress-float-count">{activeDls.length} active</span>
                <button className="progress-float-clear" onClick={() => setDownloads(p => p.filter(d => d.status === "downloading"))} disabled={activeDls.length === downloads.length}>Clear done</button>
              </div>
              <div className="progress-float-items">
                {downloads.map(d => (
                  <div key={d.id} className="progress-float-row">
                    <div style={{ minWidth: 0 }}>
                      <div className="progress-float-name">{d.name}</div>
                      <div className={`progress-float-track${d.status === "error" ? " err" : ""}`}>
                        <span className="progress-float-fill" style={{ width: `${d.progress ?? 10}%` }} />
                      </div>
                    </div>
                    <div className="progress-float-pct">{d.status === "done" ? "✓" : d.status === "error" ? "✗" : d.progress ? `${Math.round(d.progress)}%` : "…"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── macOS context menu ── */}
      {ctxMenu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 799 }} onClick={() => setCtxMenu(null)} />
          <div className="ctx-menu" style={{ left: Math.min(ctxMenu.x, window.innerWidth - 240), top: Math.min(ctxMenu.y, window.innerHeight - 260) }}>
            {(() => {
              const isFolder = ctxMenu.item.type === "folder";
              const meta = extMeta(ctxMenu.item.name);
              const sub = isFolder ? "Folder" : `${formatBytes(ctxMenu.item.size)} · ${extOf(ctxMenu.item.name).toUpperCase() || "File"}`;
              return (
                <div className="ctx-head">
                  <div className={`ctx-head-ic ${isFolder ? "folder" : "file"}`} style={isFolder ? undefined : { background: meta.color }}>
                    {isFolder ? Ic.folderFill() : <span className="ctx-ext">{meta.label}</span>}
                  </div>
                  <div className="ctx-head-text">
                    <div className="ctx-head-name">{ctxMenu.item.name}</div>
                    <div className="ctx-head-sub">{sub}</div>
                  </div>
                </div>
              );
            })()}
            <div className="ctx-divider" />
            {ctxMenu.item.type === "folder"
              ? <button className="ctx-item" onDoubleClick={undefined} onClick={() => { setCtxMenu(null); openItem(ctxMenu.item); }}>
                <span className="ctx-ic">{Ic.folder()}</span>Open
              </button>
              : <>
                <button className="ctx-item" onClick={() => { setCtxMenu(null); viewFile(ctxMenu.item); }}>
                  <span className="ctx-ic">{Ic.eye()}</span>Preview
                </button>
                <button className="ctx-item" onClick={() => { setCtxMenu(null); dlFile(ctxMenu.item); }}>
                  <span className="ctx-ic">{Ic.download()}</span>Download
                </button>
              </>
            }
            {driveOnly && (
              <button className="ctx-item" onClick={() => { setCtxMenu(null); openRename(ctxMenu.item); }} disabled={busy}>
                <span className="ctx-ic">{Ic.rename()}</span>Rename
              </button>
            )}
            <div className="ctx-divider" />
            <button className="ctx-item" onClick={() => { setCtxMenu(null); toggleStar(ctxMenu.item); }}>
              <span className="ctx-ic">{Ic.star(isStarred(ctxMenu.item.path))}</span>
              {isStarred(ctxMenu.item.path) ? "Remove Star" : "Add Star"}
            </button>
            {driveOnly && path.length > 0 && (
              <button className="ctx-item" onClick={() => { setCtxMenu(null); handleMoveUp(); }} disabled={busy}>
                <span className="ctx-ic">{Ic.moveUp()}</span>Move to Parent
              </button>
            )}
            <div className="ctx-divider" />
            <button className="ctx-item danger" onClick={() => { setCtxMenu(null); handleDelete(); }} disabled={!driveOnly || busy}>
              <span className="ctx-ic">{Ic.trash()}</span>Delete
            </button>
          </div>
        </>
      )}

      {/* ── New folder modal ── */}
      {newFolderOpen && (
        <>
          <div className="new-folder-overlay desktop-view" onClick={closeNewFolder}>
            <div className="new-folder-modal" onClick={e => e.stopPropagation()}>
              <div className="new-folder-title">New Folder</div>
              <div className="new-folder-sub">Create in {folderTitle}</div>
              <input
                ref={newFolderInputDesktopRef}
                className="new-folder-input"
                placeholder="Folder name"
                value={newFolderName}
                onChange={e => setNewFolderName(e.currentTarget.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); void confirmNewFolder(); }
                  if (e.key === "Escape") { e.preventDefault(); closeNewFolder(); }
                }}
              />
              <div className="new-folder-actions">
                <button className="viewer-action-btn" onClick={closeNewFolder}>Cancel</button>
                <button className="viewer-action-btn tint" onClick={confirmNewFolder} disabled={!newFolderName.trim() || busy}>Create</button>
              </div>
            </div>
          </div>
          <div className="ios-new-folder-overlay mobile-view" onClick={closeNewFolder}>
            <div className="ios-new-folder-sheet" onClick={e => e.stopPropagation()}>
              <div className="ios-sheet-handle" />
              <div className="ios-new-folder-title">New Folder</div>
              <input
                ref={newFolderInputMobileRef}
                className="ios-new-folder-input"
                placeholder="Folder name"
                value={newFolderName}
                onChange={e => setNewFolderName(e.currentTarget.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); void confirmNewFolder(); }
                  if (e.key === "Escape") { e.preventDefault(); closeNewFolder(); }
                }}
              />
              <div className="ios-new-folder-actions">
                <button className="ios-new-folder-btn" onClick={closeNewFolder}>Cancel</button>
                <button className="ios-new-folder-btn primary" onClick={confirmNewFolder} disabled={!newFolderName.trim() || busy}>Create</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Rename modal ── */}
      {renameOpen && renameItem && (
        <>
          <div className="rename-overlay desktop-view" onClick={closeRename}>
            <div className="rename-modal" onClick={e => e.stopPropagation()}>
              <div className="rename-title">Rename</div>
              <div className="rename-sub">Renaming {renameItem.name}</div>
              <input
                ref={renameInputDesktopRef}
                className="rename-input"
                placeholder="New name"
                value={renameName}
                onChange={e => setRenameName(e.currentTarget.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); void confirmRename(); }
                  if (e.key === "Escape") { e.preventDefault(); closeRename(); }
                }}
              />
              <div className="rename-actions">
                <button className="viewer-action-btn" onClick={closeRename}>Cancel</button>
                <button className="viewer-action-btn tint" onClick={confirmRename} disabled={!renameName.trim() || busy}>Rename</button>
              </div>
            </div>
          </div>
          <div className="ios-rename-overlay mobile-view" onClick={closeRename}>
            <div className="ios-rename-sheet" onClick={e => e.stopPropagation()}>
              <div className="ios-sheet-handle" />
              <div className="ios-rename-title">Rename</div>
              <input
                ref={renameInputMobileRef}
                className="ios-rename-input"
                placeholder="New name"
                value={renameName}
                onChange={e => setRenameName(e.currentTarget.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); void confirmRename(); }
                  if (e.key === "Escape") { e.preventDefault(); closeRename(); }
                }}
              />
              <div className="ios-rename-actions">
                <button className="ios-rename-btn" onClick={closeRename}>Cancel</button>
                <button className="ios-rename-btn primary" onClick={confirmRename} disabled={!renameName.trim() || busy}>Rename</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Viewer — macOS sheet on desktop, iOS sheet on mobile ── */}
      {viewer.open && (
        <>
          {/* ── Desktop viewer — macOS floating window ── */}
          <div className="viewer-overlay desktop-view" onClick={closeViewer} style={{ display: undefined }}>
            <div className="viewer-win" onClick={e => e.stopPropagation()}>
              {/* Titlebar */}
              <div className="viewer-titlebar">
                <div className="viewer-trafficlights">
                  <div className="vw-td cl" onClick={closeViewer} title="Close" />
                  <div className="vw-td mn" />
                  <div className="vw-td mx" />
                </div>
                <div className="viewer-fname">
                  {(() => {
                    const n = viewer.item?.name ?? "Preview";
                    const dot = n.lastIndexOf(".");
                    return dot > 0
                      ? <>{n.slice(0, dot)}<span className="viewer-fname-ext">{n.slice(dot)}</span></>
                      : n;
                  })()}
                </div>
                <div className="viewer-actions-row">
                  {viewer.item?.type === "file" && (
                    <button className="viewer-action-btn tint" onClick={() => dlFile(viewer.item!)}>
                      {Ic.download()} Download
                    </button>
                  )}
                  <button className="viewer-action-btn" onClick={closeViewer}>Close</button>
                </div>
              </div>
              {/* Body */}
              <div className="viewer-body">
                <div className="viewer-body-inner">
                  {viewer.loading && (
                    <div className="viewer-loading">
                      <div className="viewer-spinner" />
                      <span>Loading…</span>
                    </div>
                  )}
                  {viewer.error && <div className="error-banner">{Ic.info()}<span>{viewer.error}</span></div>}
                  {!viewer.loading && !viewer.error && viewer.kind === "image" && viewer.url && (
                    <img className="viewer-img" src={viewer.url} alt={viewer.item?.name} onError={onViewerImageError} />
                  )}
                  {!viewer.loading && !viewer.error && viewer.kind === "pdf" && viewer.url && (
                    <iframe className="viewer-frame" src={viewer.url} title={viewer.item?.name} />
                  )}
                  {!viewer.loading && !viewer.error && viewer.kind === "video" && viewer.url && (
                    <video className="viewer-video" src={viewer.url} controls playsInline />
                  )}
                  {!viewer.loading && !viewer.error && viewer.kind === "text" && (
                    <pre className="viewer-text">{viewer.text ?? ""}</pre>
                  )}
                  {!viewer.loading && !viewer.error && viewer.kind === "unknown" && (
                    <div className="empty-state">
                      <div className="empty-ic">📄</div>
                      <div className="empty-title">No preview available</div>
                      <div className="empty-sub">Download this file to open it</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── iOS viewer — bottom sheet ── */}
          <div className="ios-viewer-overlay mobile-view" onClick={closeViewer}>
            <div className="ios-viewer-sheet" onClick={e => e.stopPropagation()}>
              <div className="ios-sheet-handle" />
              <div className="ios-sheet-head">
                <button className="ios-sheet-close" onClick={closeViewer}>Done</button>
                <div className="ios-sheet-title">
                  {viewer.item?.name ?? "Preview"}
                </div>
                {viewer.item?.type === "file" && (
                  <button className="ios-sheet-dl-btn" onClick={() => dlFile(viewer.item!)}>
                    {Ic.download()}
                  </button>
                )}
              </div>
              <div className="ios-sheet-body">
                {viewer.loading && (
                  <div className="viewer-loading">
                    <div className="viewer-spinner" />
                    <span>Loading…</span>
                  </div>
                )}
                {viewer.error && <div className="error-banner">{Ic.info()}<span>{viewer.error}</span></div>}
                {!viewer.loading && !viewer.error && viewer.kind === "image" && viewer.url && (
                  <img className="ios-sheet-img" src={viewer.url} alt={viewer.item?.name} onError={onViewerImageError} />
                )}
                {!viewer.loading && !viewer.error && viewer.kind === "pdf" && viewer.url && (
                  <iframe className="ios-sheet-frame" src={viewer.url} title={viewer.item?.name} />
                )}
                {!viewer.loading && !viewer.error && viewer.kind === "video" && viewer.url && (
                  <video className="ios-sheet-video" src={viewer.url} controls playsInline />
                )}
                {!viewer.loading && !viewer.error && viewer.kind === "text" && (
                  <pre className="ios-sheet-text">{viewer.text ?? ""}</pre>
                )}
                {!viewer.loading && !viewer.error && viewer.kind === "unknown" && (
                  <div className="empty-state">
                    <div className="empty-ic">📄</div>
                    <div className="empty-title">No preview</div>
                    <div className="empty-sub">Download to view</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Settings ── */}
      {settingsOpen && (
        <>
          {/* macOS settings panel */}
          <div className="settings-overlay desktop-view" onClick={() => setSettingsOpen(false)}>
            <div className="settings-win" onClick={e => e.stopPropagation()}>
              {/* Titlebar */}
              <div className="settings-titlebar">
                <div className="viewer-trafficlights">
                  <div className="vw-td cl" onClick={() => setSettingsOpen(false)} title="Close" />
                  <div className="vw-td mn" />
                  <div className="vw-td mx" />
                </div>
                <div className="settings-title">GitHub Settings</div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="viewer-action-btn" onClick={resetSettings}>Reset</button>
                </div>
              </div>
              {/* Body */}
              <div className="settings-body">
                <div className="settings-group-label">GitHub Connection</div>
                <div className="settings-group">
                  <div className="settings-row">
                    <span className="settings-label">Auth Token</span>
                    <input className="settings-input" type="password" placeholder="github_pat_…"
                      value={settingsDraft.authToken}
                      onChange={e => setSettingsDraft(p => ({ ...p, authToken: e.currentTarget.value }))} />
                  </div>
                  <div className="settings-row">
                    <span className="settings-label">Owner</span>
                    <input className="settings-input" type="text" placeholder="octocat"
                      value={settingsDraft.owner}
                      onChange={e => setSettingsDraft(p => ({ ...p, owner: e.currentTarget.value }))} />
                  </div>
                  <div className="settings-row">
                    <span className="settings-label">Repository</span>
                    <input className="settings-input" type="text" placeholder="my-repo"
                      value={settingsDraft.repo}
                      onChange={e => setSettingsDraft(p => ({ ...p, repo: e.currentTarget.value }))} />
                  </div>
                  <div className="settings-row">
                    <span className="settings-label">Branch</span>
                    <input className="settings-input" type="text" placeholder="main"
                      value={settingsDraft.branch}
                      onChange={e => setSettingsDraft(p => ({ ...p, branch: e.currentTarget.value }))} />
                  </div>
                </div>
                <div className="settings-hint">Token is stored locally in your browser. Keep it private.</div>
                <div className="settings-foot">
                  <div className="settings-actions">
                    <button className="viewer-action-btn" onClick={() => setSettingsOpen(false)}>Cancel</button>
                    <button className="viewer-action-btn tint" onClick={applySettings}
                      disabled={!settingsDraft.owner.trim() || !settingsDraft.repo.trim() || !settingsDraft.authToken.trim()}>
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* iOS settings — full-screen nav push */}
          <div className="ios-settings-overlay mobile-view">
            <div className="ios-settings-nav" style={{ position: "relative" }}>
              <button className="ios-back-btn" onClick={() => setSettingsOpen(false)}>
                {Ic.chevLeft()}
                <span className="ios-back-label">Back</span>
              </button>
              <div className="ios-settings-title-nav">Settings</div>
            </div>
            <div className="ios-settings-scroll">
              <div className="ios-settings-section-hd">GitHub Connection</div>
              <div className="ios-settings-group">
                <div className="ios-settings-row">
                  <span className="ios-settings-row-label">Token</span>
                  <input className="ios-settings-input" type="password" placeholder="github_pat_…"
                    value={settingsDraft.authToken}
                    onChange={e => setSettingsDraft(p => ({ ...p, authToken: e.currentTarget.value }))} />
                </div>
                <div className="ios-settings-row">
                  <span className="ios-settings-row-label">Owner</span>
                  <input className="ios-settings-input" type="text" placeholder="octocat"
                    value={settingsDraft.owner}
                    onChange={e => setSettingsDraft(p => ({ ...p, owner: e.currentTarget.value }))} />
                </div>
                <div className="ios-settings-row">
                  <span className="ios-settings-row-label">Repository</span>
                  <input className="ios-settings-input" type="text" placeholder="my-repo"
                    value={settingsDraft.repo}
                    onChange={e => setSettingsDraft(p => ({ ...p, repo: e.currentTarget.value }))} />
                </div>
                <div className="ios-settings-row">
                  <span className="ios-settings-row-label">Branch</span>
                  <input className="ios-settings-input" type="text" placeholder="main"
                    value={settingsDraft.branch}
                    onChange={e => setSettingsDraft(p => ({ ...p, branch: e.currentTarget.value }))} />
                </div>
              </div>
              <div className="ios-settings-hint">
                Your token is stored locally in this browser. Never share it.
              </div>
              <button className="ios-settings-save-btn" onClick={applySettings}
                disabled={!settingsDraft.owner.trim() || !settingsDraft.repo.trim() || !settingsDraft.authToken.trim()}>
                Save Changes
              </button>
              <button className="ios-settings-reset-btn" onClick={resetSettings}>
                Reset All Settings
              </button>
            </div>
          </div>
        </>
      )}

      {/* Toasts */}
      <div className="toast-shelf">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span className="t-ic">{t.kind === "success" ? Ic.check() : t.kind === "error" ? Ic.x() : Ic.info()}</span>
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}
