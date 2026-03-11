import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MagnifyingGlass, Folder, File, UploadSimple, FolderPlus,
  Trash, ArrowUp, ArrowClockwise, CaretRight, CaretLeft, Check, X,
  SquaresFour, Rows, DownloadSimple, Eye, Info, Clock, Star,
  HardDrives, DotsThree, Plus, CloudArrowUp,
} from "@phosphor-icons/react";
import {
  GitInfo,
  createGitHubFolder,
  deleteGitHubPath,
  getGitHubFileBlob,
  getGitHubRepoSize,
  listGitHubPath,
  moveGitHubPath,
  uploadGitHubFile,
} from "./lib/github";

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
type Toast = { id: number; message: string; kind: "info" | "success" | "error" };
type UploadItem = {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  message?: string;
};
type ViewerState = {
  open: boolean;
  item?: Item;
  kind?: "image" | "pdf" | "text" | "unknown";
  url?: string;
  text?: string;
  loading?: boolean;
  error?: string | null;
};

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_REPO_BYTES = 5 * 1024 * 1024 * 1024;

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
  star: () => <Star size={15} weight="regular" />,
  drive: () => <HardDrives size={15} weight="regular" />,
  ellipsis: () => <DotsThree size={16} weight="fill" />,
  plus: () => <Plus size={16} weight="regular" />,
  icloudUp: () => <CloudArrowUp size={22} weight="regular" />,
};

/* ─────────────────────────────────────────
   CSS
───────────────────────────────────────── */
const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --sys-bg:       #E5E5E5;
  --sys-sidebar:  rgba(232,232,232,0.75);
  --sys-toolbar:  rgba(248,248,248,0.95);
  --sys-content:  #F2F2F2;
  --sys-white:    #FFFFFF;
  --sys-sep:      rgba(0,0,0,0.09);
  --sys-sep2:     rgba(0,0,0,0.055);

  --l1: rgba(0,0,0,0.85);
  --l2: rgba(0,0,0,0.50);
  --l3: rgba(0,0,0,0.28);
  --l4: rgba(0,0,0,0.14);

  --tint:        #D95F7F;
  --tint-l:      rgba(217,95,127,0.10);
  --tint-border: rgba(217,95,127,0.25);

  --green:  #34C759;
  --red:    #FF3B30;
  --blue:   #007AFF;
  --fill:   rgba(120,120,128,0.12);
  --fill2:  rgba(120,120,128,0.16);
  --fill3:  rgba(120,120,128,0.22);

  --sidebar-w: 220px;
  --toolbar-h: 52px;
  --vh: 100vh;

  --sh-sm: 0 1px 3px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06);
  --sh-md: 0 4px 14px rgba(0,0,0,0.11), 0 2px 4px rgba(0,0,0,0.05);
  --sh-lg: 0 12px 40px rgba(0,0,0,0.13), 0 4px 10px rgba(0,0,0,0.07);
  --sh-xl: 0 24px 72px rgba(0,0,0,0.16), 0 6px 18px rgba(0,0,0,0.09);
}

@supports (height: 100dvh) {
  :root { --vh: 100dvh; }
}

html, body, #root {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  font-size: 13px;
  line-height: 1.45;
  color: var(--l1);
  background: var(--sys-bg);
}
body { overflow: hidden; }

/* macOS overlay scrollbars */
::-webkit-scrollbar { width: 7px; height: 7px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: transparent; border-radius: 10px; }
.sidebar-nav::-webkit-scrollbar-thumb,
.content::-webkit-scrollbar-thumb,
.ios-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.18); border-radius: 10px; }

.hidden { display: none !important; }

/* ================================================================
   DESKTOP — macOS Finder
================================================================ */
.desktop-view { display: flex; flex: 1; overflow: hidden; height: var(--vh); min-height: var(--vh); }
.mobile-view  { display: none; }

/* Window chrome */
.mac-window {
  display: flex; flex: 1; overflow: hidden;
  box-shadow:
    0 0 0 0.5px rgba(0,0,0,0.20),
    0 0 0 1px rgba(255,255,255,0.08) inset,
    0 22px 72px rgba(0,0,0,0.30),
    0 4px 14px rgba(0,0,0,0.13);
}

/* Sidebar */
.sidebar {
  width: var(--sidebar-w); flex-shrink: 0;
  display: flex; flex-direction: column;
  background: var(--sys-sidebar);
  backdrop-filter: blur(60px) saturate(220%) brightness(1.04);
  -webkit-backdrop-filter: blur(60px) saturate(220%) brightness(1.04);
  border-right: 0.5px solid var(--sys-sep);
  overflow: hidden; z-index: 10;
}

/* Traffic lights — 12px circles, 8px gap, 20px left */
.sidebar-traffic { height: var(--toolbar-h); display: flex; align-items: center; padding: 0 20px; gap: 8px; flex-shrink: 0; }
.td { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; position: relative; }
.td::after {
  content: ''; position: absolute;
  top: 1px; left: 1px; right: 4px; bottom: 5px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(255,255,255,0.55) 0%, transparent 55%);
}
.td.cl { background: #FF5F57; box-shadow: 0 0 0 0.5px rgba(160,0,0,0.28); }
.td.mn { background: #FEBC2E; box-shadow: 0 0 0 0.5px rgba(160,100,0,0.28); }
.td.mx { background: #28C840; box-shadow: 0 0 0 0.5px rgba(0,120,0,0.28); }

.sidebar-nav { flex: 1; padding: 6px 0 8px; overflow-y: auto; }
.nav-section { margin-bottom: 2px; }
.nav-sec-hd {
  font-size: 11px; font-weight: 700; color: var(--l3);
  letter-spacing: 0.06em; text-transform: uppercase;
  padding: 10px 20px 2px; user-select: none;
}
.nav-item {
  display: flex; align-items: center; gap: 6px;
  height: 26px; padding: 0 8px 0 20px;
  border-radius: 7px; margin: 1px 8px;
  font-size: 13px; font-weight: 400; color: var(--l1);
  background: none; border: none; cursor: default;
  width: calc(100% - 16px); text-align: left;
  transition: background 0.08s; user-select: none; white-space: nowrap;
}
.nav-item:hover:not(:disabled) { background: rgba(0,0,0,0.055); }
.nav-item.active { background: var(--tint); color: white; }
.nav-item.active .nav-ic { color: white; }
.nav-ic { color: var(--l3); display: flex; align-items: center; flex-shrink: 0; }
.nav-item:hover:not(:disabled) .nav-ic { color: var(--l2); }
.nav-item-label { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.nav-item:disabled { opacity: 0.32; }
.nav-divider { height: 0.5px; background: var(--sys-sep); margin: 5px 20px; }

/* Sidebar footer */
.sidebar-foot { border-top: 0.5px solid var(--sys-sep); padding: 9px 14px 11px; }
.storage-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.storage-label { font-size: 11px; color: var(--l2); flex: 1; }
.storage-pct   { font-size: 11px; color: var(--l3); }
.storage-bar   { height: 3px; background: var(--fill3); border-radius: 99px; overflow: hidden; margin-bottom: 3px; }
.storage-fill  { height: 100%; background: var(--tint); border-radius: 99px; transition: width 0.8s cubic-bezier(0.4,0,0.2,1); }
.storage-cap   { font-size: 10px; color: var(--l3); }
.status-row    { display: flex; align-items: center; gap: 5px; margin-top: 7px; }
.status-led    { width: 6px; height: 6px; border-radius: 50%; background: var(--green); flex-shrink: 0; animation: ledpulse 2.8s ease-in-out infinite; }
@keyframes ledpulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
.status-txt    { font-size: 10.5px; color: var(--l3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Main */
.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--sys-content); }

/* Toolbar */
.toolbar {
  height: var(--toolbar-h); display: flex; align-items: center; gap: 7px; padding: 0 14px;
  background: var(--sys-toolbar);
  backdrop-filter: blur(40px) saturate(180%); -webkit-backdrop-filter: blur(40px) saturate(180%);
  border-bottom: 0.5px solid var(--sys-sep); flex-shrink: 0; z-index: 10;
}

.toolbar-nav-btns { display: flex; gap: 0; flex-shrink: 0; }
.toolbar-nav-btn {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: default;
  color: var(--l2); border-radius: 7px; transition: background 0.08s, color 0.08s;
}
.toolbar-nav-btn:hover:not(:disabled) { background: var(--fill); color: var(--l1); }
.toolbar-nav-btn:active:not(:disabled) { background: var(--fill2); }
.toolbar-nav-btn:disabled { opacity: 0.28; }

/* Breadcrumb */
.breadcrumb { display: flex; align-items: center; flex: 1; min-width: 0; overflow: hidden; }
.crumb {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 5px; border-radius: 5px;
  font-size: 13px; font-weight: 400; color: var(--l2);
  background: none; border: none; cursor: default; white-space: nowrap;
  transition: background 0.08s, color 0.08s;
}
.crumb:hover { background: var(--fill); color: var(--l1); }
.crumb:last-child { color: var(--l1); font-weight: 600; }
.crumb-sep { color: var(--l4); display: flex; align-items: center; }

/* Search */
.search-wrap { position: relative; flex-shrink: 0; }
.search-ic { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: var(--l3); display: flex; pointer-events: none; }
.search-input {
  background: var(--fill); border: none; border-radius: 7px;
  padding: 0 28px 0 28px; height: 28px; width: 190px;
  font-family: inherit; font-size: 13px; color: var(--l1);
  outline: none; transition: all 0.14s;
}
.search-input::placeholder { color: var(--l3); }
.search-input:focus { background: white; box-shadow: 0 0 0 3.5px rgba(217,95,127,0.22), var(--sh-sm); width: 216px; }
.search-clear {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  width: 15px; height: 15px; border-radius: 50%;
  background: var(--l3); border: none; cursor: default;
  display: flex; align-items: center; justify-content: center; color: white; padding: 0;
}
.search-clear:hover { background: var(--l2); }

.toolbar-right { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }

/* macOS segmented control */
.seg-ctrl { display: flex; background: var(--fill); border-radius: 6px; padding: 2px; gap: 1px; }
.seg-btn {
  width: 28px; height: 23px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; cursor: default;
  color: var(--l2); border-radius: 4px; transition: all 0.1s;
}
.seg-btn.on { background: var(--sys-white); color: var(--l1); box-shadow: 0 1px 3px rgba(0,0,0,0.16), 0 0.5px 1px rgba(0,0,0,0.10); }

/* Toolbar buttons */
.tb-btn {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: inherit; font-size: 13px; font-weight: 400;
  border-radius: 6px; padding: 0 9px; height: 26px;
  border: none; cursor: default; transition: all 0.08s;
  white-space: nowrap; user-select: none;
}
.tb-btn:disabled { opacity: 0.36; }
.tb-btn:active:not(:disabled) { transform: scale(0.97); filter: brightness(0.96); }
.tb-btn-default {
  background: var(--sys-white); color: var(--l1);
  box-shadow: 0 1px 3px rgba(0,0,0,0.13), 0 0.5px 1px rgba(0,0,0,0.10), inset 0 0.5px 0 rgba(255,255,255,0.80);
  border: 0.5px solid rgba(0,0,0,0.15);
}
.tb-btn-default:hover:not(:disabled) { background: #F3F3F3; }
.tb-btn-tint { background: var(--tint); color: white; box-shadow: 0 1px 3px rgba(217,95,127,0.38), 0 0.5px 1px rgba(217,95,127,0.22); }
.tb-btn-tint:hover:not(:disabled) { filter: brightness(1.07); }
.tb-btn-ghost { background: transparent; color: var(--l2); }
.tb-btn-ghost:hover:not(:disabled) { background: var(--fill); color: var(--l1); }
.tb-btn-destructive { background: transparent; color: var(--red); }
.tb-btn-destructive:hover:not(:disabled) { background: rgba(255,59,48,0.08); }
.tb-icon-btn {
  width: 26px; height: 26px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border: none; cursor: default; border-radius: 6px;
  background: none; color: var(--l2); transition: background 0.08s, color 0.08s;
}
.tb-icon-btn:hover:not(:disabled) { background: var(--fill); color: var(--l1); }
.tb-icon-btn:disabled { opacity: 0.28; }

/* Content */
.content { flex: 1; overflow-y: auto; }

/* Finder status bar */
.finder-bar {
  display: flex; align-items: center; gap: 4px;
  padding: 5px 14px;
  border-bottom: 0.5px solid var(--sys-sep2);
  background: var(--sys-toolbar);
  flex-wrap: wrap; min-height: 34px;
}
.finder-chip { font-size: 11.5px; color: var(--l2); }
.finder-chip.sel { color: var(--tint); font-weight: 600; }
.finder-div { width: 0.5px; height: 13px; background: var(--sys-sep); }
.finder-flex { flex: 1; }

.error-banner {
  display: flex; align-items: center; gap: 8px;
  background: rgba(255,59,48,0.07); border-bottom: 0.5px solid rgba(255,59,48,0.15);
  padding: 8px 14px; font-size: 13px; color: var(--red);
}

/* Upload bar */
.upload-bar-wrap { background: var(--sys-toolbar); border-bottom: 0.5px solid var(--sys-sep); padding: 9px 14px; }
.upload-bar-head { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.upload-bar-title { font-size: 12px; font-weight: 600; color: var(--l1); }
.upload-bar-count { font-size: 11px; color: var(--l3); }
.upload-items { display: flex; flex-direction: column; gap: 6px; }
.upload-row { display: grid; grid-template-columns: 1fr 48px; gap: 10px; align-items: center; }
.upload-fname { font-size: 12px; color: var(--l2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.upload-pct { font-size: 11px; color: var(--l3); text-align: right; }
.upload-track { height: 3px; background: var(--fill2); border-radius: 99px; overflow: hidden; margin-top: 3px; }
.upload-fill { display: block; height: 100%; background: var(--tint); border-radius: 99px; transition: width 0.22s ease; }
.upload-track.err .upload-fill { background: var(--red); }
.upload-col { display: flex; flex-direction: column; }

/* Finder list — 28px rows (compact Finder density) */
.finder-table { width: 100%; }
.finder-thead {
  display: grid; grid-template-columns: 2.8fr 90px 68px 32px;
  padding: 3px 14px;
  border-bottom: 0.5px solid var(--sys-sep);
  background: var(--sys-toolbar);
  position: sticky; top: 0; z-index: 5;
}
.finder-thead span { font-size: 11px; font-weight: 500; color: var(--l3); letter-spacing: 0.01em; user-select: none; }
.finder-row {
  display: grid; grid-template-columns: 2.8fr 90px 68px 32px;
  padding: 0 14px; align-items: center; height: 28px;
  background: transparent; border: none;
  border-bottom: 0.5px solid var(--sys-sep2);
  cursor: default; width: 100%; text-align: left;
  transition: background 0.06s; user-select: none;
}
.finder-row:last-child { border-bottom: none; }
.finder-row:hover { background: rgba(0,0,0,0.038); }
.finder-row.selected { background: var(--tint) !important; }
.finder-row.selected .finder-name,
.finder-row.selected .finder-meta { color: rgba(255,255,255,0.95) !important; }
.finder-row.selected .file-type-badge { border-color: rgba(255,255,255,0.4) !important; }
.finder-row.drop-target { outline: 1.5px solid var(--blue); outline-offset: -1px; background: rgba(0,122,255,0.06); }
.finder-name-cell { display: flex; align-items: center; gap: 7px; min-width: 0; }
.finder-file-ic { width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; position: relative; }
.finder-file-ic.is-folder { color: var(--tint); }
.finder-file-ic.is-file   { color: var(--l3); }
.file-type-badge {
  position: absolute; bottom: -2px; right: -5px;
  font-size: 5.5px; font-weight: 700; padding: 0.5px 2px; border-radius: 2px;
  color: white; line-height: 1.4; border: 1px solid white; letter-spacing: 0.01em;
}
.finder-name { font-size: 13px; color: var(--l1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.finder-meta { font-size: 11.5px; color: var(--l3); }
.sel-check-mac { width: 16px; height: 16px; border-radius: 50%; background: white; display: flex; align-items: center; justify-content: center; color: var(--tint); margin-left: auto; }

/* Grid */
.finder-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 2px; padding: 10px; }
.grid-item {
  display: flex; flex-direction: column; align-items: center;
  padding: 8px 6px 7px; border-radius: 6px;
  cursor: default; background: none; border: none;
  transition: background 0.06s; position: relative; text-align: center; user-select: none;
}
.grid-item:hover { background: rgba(0,0,0,0.045); }
.grid-item.selected { background: var(--tint-l); outline: 2px solid var(--tint); outline-offset: -1px; border-radius: 6px; }
.grid-item.drop-target { outline: 2px solid var(--blue); outline-offset: -1px; background: rgba(0,122,255,0.06); }
.grid-item-sel { position: absolute; top: 5px; right: 5px; width: 17px; height: 17px; border-radius: 50%; background: var(--tint); display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 1px 4px rgba(217,95,127,0.4); }
.grid-file-ic { width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; border-radius: 10px; margin-bottom: 5px; position: relative; flex-shrink: 0; }
.grid-file-ic.is-folder { color: var(--tint); background: var(--tint-l); }
.grid-file-ic.is-file   { color: var(--l3); background: var(--fill); }
.grid-ext-badge { position: absolute; bottom: -2px; right: -4px; font-size: 6px; font-weight: 700; padding: 1px 3px; border-radius: 3px; color: white; line-height: 1.3; border: 1.5px solid white; }
.grid-item-name { font-size: 11px; color: var(--l1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 86px; }
.grid-item-sub  { font-size: 10px; color: var(--l3); margin-top: 1px; }

/* Empty */
.empty-state { padding: 56px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; }
.empty-ic { font-size: 44px; margin-bottom: 10px; line-height: 1; opacity: 0.22; }
.empty-title { font-size: 15px; font-weight: 600; color: var(--l1); margin-bottom: 4px; }
.empty-sub { font-size: 13px; color: var(--l2); }

/* Skeleton */
.sk { background: linear-gradient(90deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.09) 50%, rgba(0,0,0,0.05) 100%); background-size: 300% 100%; animation: sk 1.6s ease-in-out infinite; border-radius: 4px; }
@keyframes sk { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* Drop overlay */
.drop-box-wrap { position: fixed; inset: 0; z-index: 300; display: flex; align-items: center; justify-content: center; background: rgba(230,230,230,0.70); backdrop-filter: blur(10px); pointer-events: none; }
.drop-box { background: white; border: 2px dashed var(--tint-border); border-radius: 18px; padding: 40px 64px; text-align: center; box-shadow: var(--sh-xl); animation: popIn 0.18s cubic-bezier(0.34,1.56,0.64,1); }
@keyframes popIn { from { transform: scale(0.90); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.drop-title { font-size: 17px; font-weight: 600; color: var(--tint); margin-bottom: 4px; }
.drop-sub { font-size: 13px; color: var(--l2); }

/* Viewer */
.viewer-overlay { position: fixed; inset: 0; z-index: 500; background: rgba(0,0,0,0.42); backdrop-filter: blur(22px) saturate(160%); display: flex; align-items: center; justify-content: center; padding: 24px; animation: fadeIn 0.14s ease; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.viewer-win {
  background: var(--sys-toolbar); backdrop-filter: blur(60px);
  border: 0.5px solid rgba(0,0,0,0.20); border-radius: 12px;
  width: min(1000px, 92vw); max-height: 88vh;
  display: flex; flex-direction: column;
  box-shadow: 0 30px 90px rgba(0,0,0,0.36), 0 0 0 0.5px rgba(255,255,255,0.08) inset;
  animation: winIn 0.18s cubic-bezier(0.34,1.56,0.64,1); overflow: hidden;
}
@keyframes winIn { from { transform: scale(0.94) translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
.viewer-titlebar { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-bottom: 0.5px solid var(--sys-sep); background: var(--sys-toolbar); }
.viewer-fname { font-size: 13px; font-weight: 600; color: var(--l1); flex: 1; text-align: center; }
.viewer-actions-row { display: flex; gap: 6px; }
.viewer-body { padding: 16px; overflow: auto; flex: 1; background: var(--sys-content); }
.viewer-img { max-width: 100%; max-height: 66vh; border-radius: 10px; display: block; margin: 0 auto; box-shadow: var(--sh-lg); }
.viewer-text { white-space: pre-wrap; font-size: 12px; line-height: 1.7; color: var(--l1); font-family: 'SF Mono','Menlo','Monaco',monospace; background: white; border-radius: 8px; padding: 16px; box-shadow: var(--sh-sm); }
.viewer-frame { width: 100%; height: 66vh; border: none; border-radius: 8px; }

/* Toasts */
.toast-shelf { position: fixed; bottom: 18px; right: 18px; display: flex; flex-direction: column; gap: 6px; z-index: 600; pointer-events: none; }
.toast { background: rgba(44,44,46,0.94); backdrop-filter: blur(24px); border-radius: 13px; padding: 10px 14px; min-width: 220px; max-width: 300px; font-size: 12.5px; color: white; display: flex; align-items: center; gap: 9px; box-shadow: var(--sh-lg); animation: toastIn 0.18s cubic-bezier(0.34,1.56,0.64,1); }
@keyframes toastIn { from { transform: translateX(12px) scale(0.96); opacity: 0; } to { transform: none; opacity: 1; } }
.toast.success .t-ic { color: #30D158; }
.toast.error   .t-ic { color: #FF453A; }
.toast.info    .t-ic { color: #64D2FF; }
.t-ic { display: flex; align-items: center; flex-shrink: 0; }

/* ================================================================
   MOBILE — iOS/Android native feel
================================================================ */
@media (max-width: 768px) {
  .desktop-view { display: none; }
  .mobile-view {
    display: flex; flex-direction: column;
    height: var(--vh); min-height: var(--vh);
    background: #F2F2F7; overflow: hidden;
    /* Android status bar clearance */
    padding-top: env(safe-area-inset-top, 28px);
  }

  /* iOS Nav bar */
  .ios-nav {
    background: rgba(242,242,247,0.96);
    backdrop-filter: blur(28px) saturate(180%);
    -webkit-backdrop-filter: blur(28px) saturate(180%);
    border-bottom: 0.5px solid rgba(60,60,67,0.18);
    flex-shrink: 0; z-index: 20; position: relative;
  }

  /* Standard 44pt bar: back | center title | right (refresh only) */
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
  .ios-back-label { font-size: 17px; color: var(--tint); line-height: 1; }
  .ios-nav-center {
    position: absolute; left: 50%; transform: translateX(-50%);
    font-size: 17px; font-weight: 600; color: var(--l1);
    pointer-events: none; white-space: nowrap;
    max-width: 50vw; overflow: hidden; text-overflow: ellipsis;
  }
  .ios-nav-right { display: flex; align-items: center; gap: 6px; margin-left: auto; flex-shrink: 0; }
  .ios-nav-btn {
    width: 34px; height: 34px; border-radius: 50%;
    background: rgba(120,120,128,0.16);
    border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: var(--tint); -webkit-tap-highlight-color: transparent;
  }
  .ios-nav-btn:active { opacity: 0.6; }

  /* Search bar */
  .ios-search-wrap { padding: 0 16px 8px; position: relative; }
  .ios-search-ic { position: absolute; left: 25px; top: 50%; transform: translateY(-55%); color: var(--l3); pointer-events: none; display: flex; }
  .ios-search {
    width: 100%; background: rgba(120,120,128,0.12);
    border: none; border-radius: 10px;
    padding: 0 32px 0 32px; height: 36px;
    font-family: inherit; font-size: 17px; color: var(--l1); outline: none;
    -webkit-appearance: none;
  }
  .ios-search::placeholder { color: var(--l3); font-size: 17px; }
  .ios-search-clear {
    position: absolute; right: 24px; top: 50%; transform: translateY(-55%);
    width: 18px; height: 18px; border-radius: 50%;
    background: rgba(120,120,128,0.36); border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center; color: white; padding: 0;
  }

  /* Segmented control */
  .ios-seg-wrap { padding: 0 16px 10px; display: flex; gap: 8px; align-items: center; }
  .ios-seg { flex: 1; display: flex; background: rgba(120,120,128,0.12); border-radius: 9px; padding: 2px; }
  .ios-seg-btn {
    flex: 1; height: 30px;
    display: flex; align-items: center; justify-content: center; gap: 5px;
    background: none; border: none; cursor: pointer;
    font-family: inherit; font-size: 13px; font-weight: 500; color: var(--l2);
    border-radius: 7px; transition: all 0.14s; -webkit-tap-highlight-color: transparent;
  }
  .ios-seg-btn.on { background: white; color: var(--l1); box-shadow: 0 1px 3px rgba(0,0,0,0.15), 0 0.5px 1px rgba(0,0,0,0.08); }

  /* Scroll area */
  .ios-scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: 16px; }

  /* Section header */
  .ios-section-header {
    font-size: 13px; font-weight: 400; color: rgba(60,60,67,0.60);
    padding: 20px 20px 7px; text-transform: uppercase; letter-spacing: 0.04em;
  }

  /* Inset grouped list card */
  .ios-list {
    background: white; border-radius: 12px;
    margin: 0 16px 10px; overflow: hidden;
    box-shadow: 0 1px 0 rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04);
  }

  /* iOS row — 54pt min, inset separator */
  .ios-row {
    display: flex; align-items: center; gap: 13px;
    padding: 10px 16px; background: white; border: none;
    cursor: pointer; width: 100%; text-align: left; min-height: 54px;
    -webkit-tap-highlight-color: rgba(0,0,0,0);
    position: relative; transition: background 0.12s;
  }
  .ios-row:active { background: rgba(0,0,0,0.04); }
  .ios-row.selected { background: rgba(217,95,127,0.07); }
  /* Inset separator — starts after the icon (69px in) */
  .ios-row::after {
    content: ''; position: absolute; bottom: 0; left: 69px; right: 0;
    height: 0.5px; background: rgba(60,60,67,0.14); pointer-events: none;
  }
  .ios-row:last-child::after { display: none; }

  /* File icon — 40x40, 10px corner radius */
  .ios-file-ic { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; position: relative; }
  .ios-file-ic.folder { background: rgba(217,95,127,0.10); color: var(--tint); }
  .ios-file-ic.file   { background: rgba(120,120,128,0.12); color: var(--l3); }
  .ios-file-ext { position: absolute; bottom: -2px; right: -3px; font-size: 5.5px; font-weight: 700; padding: 0.5px 2.5px; border-radius: 2.5px; color: white; line-height: 1.4; border: 1.5px solid white; }

  .ios-row-text { flex: 1; min-width: 0; }
  .ios-row-name { font-size: 17px; font-weight: 400; color: var(--l1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ios-row-sub  { font-size: 12px; color: var(--l3); margin-top: 1px; }
  /* iOS-style thin chevron */
  .ios-chev { color: rgba(60,60,67,0.25); flex-shrink: 0; display: flex; align-items: center; }
  .ios-row-check { width: 26px; height: 26px; border-radius: 50%; background: var(--tint); display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0; }

  /* iOS Grid — 3 columns like iOS Files */
  .ios-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; padding: 0 16px 10px; }
  .ios-grid-item { display: flex; flex-direction: column; align-items: center; padding: 14px 8px 11px; border-radius: 12px; cursor: pointer; background: none; border: none; text-align: center; position: relative; -webkit-tap-highlight-color: transparent; }
  .ios-grid-item:active { background: rgba(0,0,0,0.06); }
  .ios-grid-item.selected { background: rgba(217,95,127,0.08); outline: 2px solid var(--tint); outline-offset: -2px; border-radius: 12px; }
  .ios-grid-ic { width: 68px; height: 68px; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; position: relative; }
  .ios-grid-ic.folder { background: rgba(217,95,127,0.10); color: var(--tint); }
  .ios-grid-ic.file   { background: rgba(120,120,128,0.12); color: var(--l3); }
  .ios-grid-ext { position: absolute; bottom: -2px; right: -4px; font-size: 6.5px; font-weight: 700; padding: 1px 3px; border-radius: 3.5px; color: white; border: 2px solid white; line-height: 1.3; }
  .ios-grid-name { font-size: 12px; font-weight: 400; color: var(--l1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 88px; }
  .ios-grid-sub  { font-size: 10.5px; color: var(--l3); margin-top: 2px; }
  .ios-grid-sel { position: absolute; top: 8px; right: 8px; width: 22px; height: 22px; border-radius: 50%; background: var(--tint); display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 1px 4px rgba(217,95,127,0.4); }

  /* ── Bottom bar ── */
  .ios-bottom-bar {
    flex-shrink: 0; position: relative;
    background: rgba(249,249,249,0.97);
    backdrop-filter: blur(32px) saturate(180%); -webkit-backdrop-filter: blur(32px) saturate(180%);
    border-top: 0.5px solid rgba(60,60,67,0.18);
    padding-bottom: env(safe-area-inset-bottom, 16px);
    z-index: 100;
  }

  /* Floating action buttons — hover above the bar */
  .ios-fab-group {
    position: absolute;
    bottom: calc(100% + 10px); right: 16px;
    display: flex; align-items: center; gap: 8px;
    pointer-events: all;
  }

  /* Single nav tab row */
  .ios-tabbar {
    display: flex; align-items: center;
    padding: 8px 4px 6px;
  }
  .ios-fab {
    width: 36px; height: 36px;
    border-radius: 10px; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.12s, filter 0.12s;
  }
  .ios-fab:active { transform: scale(0.88); }
  .ios-fab.upload {
    background: var(--tint); color: white;
    box-shadow: 0 3px 10px rgba(217,95,127,0.38), 0 1px 4px rgba(217,95,127,0.20), 0 0 0 0.5px rgba(217,95,127,0.30);
  }
  .ios-fab.newfolder {
    background: white; color: var(--l2);
    box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.08);
  }
  .ios-fab.upload:active { filter: brightness(0.9); }
  .ios-fab.newfolder:active { filter: brightness(0.95); }
  .ios-tab {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
    background: none; border: none; cursor: pointer; padding: 2px 4px 0;
    -webkit-tap-highlight-color: transparent; min-width: 44px;
  }
  .ios-tab:active { opacity: 0.7; }
  .ios-tab-ic { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; color: rgba(60,60,67,0.38); }
  .ios-tab.active .ios-tab-ic { color: var(--tint); }
  .ios-tab-label { font-size: 10px; font-weight: 500; color: rgba(60,60,67,0.38); letter-spacing: 0.01em; }
  .ios-tab.active .ios-tab-label { color: var(--tint); font-weight: 600; }

  /* Selection action bar — replaces the bottom bar when items are selected */
  .ios-sel-bar {
    flex-shrink: 0;
    background: rgba(242,242,247,0.97); backdrop-filter: blur(28px);
    border-top: 0.5px solid rgba(60,60,67,0.18);
    display: flex; align-items: center;
    padding: 10px 12px; gap: 0; z-index: 99;
    animation: selBarUp 0.22s cubic-bezier(0.34,1.56,0.64,1);
  }
  @keyframes selBarUp { from { transform: translateY(100%); opacity: 0; } to { transform: none; opacity: 1; } }
  .ios-sel-label { font-size: 13px; font-weight: 600; color: var(--l1); flex: 1; padding-left: 4px; }
  .ios-sel-btn {
    display: flex; flex-direction: column; align-items: center; gap: 1px;
    background: none; border: none; cursor: pointer;
    padding: 4px 10px; color: var(--tint);
    font-size: 10px; font-weight: 500;
    -webkit-tap-highlight-color: transparent; min-width: 44px;
  }
  .ios-sel-btn:active { opacity: 0.5; }
  .ios-sel-btn.danger { color: var(--red); }
  .ios-sel-btn-ic { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; }

  /* Drop overlay */
  .ios-drop-wrap { position: fixed; inset: 0; z-index: 400; display: flex; align-items: center; justify-content: center; background: rgba(242,242,247,0.80); backdrop-filter: blur(10px); pointer-events: none; }
  .ios-drop-box { background: white; border: 2px dashed var(--tint-border); border-radius: 22px; padding: 32px 48px; text-align: center; box-shadow: var(--sh-xl); animation: popIn 0.18s cubic-bezier(0.34,1.56,0.64,1); }

  /* iOS viewer sheet */
  .ios-viewer-overlay { position: fixed; inset: 0; z-index: 500; background: rgba(0,0,0,0.38); display: flex; align-items: flex-end; animation: fadeIn 0.16s ease; }
  .ios-viewer-sheet { background: white; border-radius: 13px 13px 0 0; width: 100%; max-height: 92vh; display: flex; flex-direction: column; box-shadow: 0 -4px 30px rgba(0,0,0,0.12); animation: sheetUp 0.26s cubic-bezier(0.34,1.56,0.64,1); overflow: hidden; padding-bottom: env(safe-area-inset-bottom, 0px); }
  @keyframes sheetUp { from { transform: translateY(100%); } to { transform: none; } }
  .ios-sheet-handle { width: 36px; height: 5px; border-radius: 99px; background: rgba(60,60,67,0.18); margin: 8px auto 0; flex-shrink: 0; }
  .ios-sheet-head { display: flex; align-items: center; padding: 12px 16px 10px; border-bottom: 0.5px solid rgba(60,60,67,0.14); }
  .ios-sheet-title { font-size: 17px; font-weight: 600; color: var(--l1); flex: 1; text-align: center; }
  .ios-sheet-body { flex: 1; overflow: auto; padding: 16px; -webkit-overflow-scrolling: touch; }
  .ios-sheet-close { font-size: 17px; color: var(--tint); background: none; border: none; cursor: pointer; font-weight: 400; flex-shrink: 0; }

  /* Toast / upload / error for mobile */
  .toast-shelf { bottom: 16px; left: 16px; right: 16px; }
  .toast { min-width: unset; width: 100%; border-radius: 14px; font-size: 15px; padding: 12px 16px; }
  .upload-bar-wrap { margin: 0 16px 10px; border-radius: 12px; border: none; box-shadow: 0 1px 0 rgba(0,0,0,0.06); }
  .error-banner { margin: 0 16px 10px; border-radius: 12px; border: none; }

  .ios-skeleton-list { background: white; border-radius: 12px; margin: 0 16px 10px; overflow: hidden; box-shadow: 0 1px 0 rgba(0,0,0,0.06); }
  .ios-skeleton-row { display: flex; align-items: center; gap: 13px; padding: 11px 16px; border-bottom: 0.5px solid rgba(60,60,67,0.10); min-height: 54px; }
  .ios-skeleton-row:last-child { border-bottom: none; }
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
  const [viewer, setViewer] = useState<ViewerState>({ open: false });
  const [repoSize, setRepoSize] = useState(0);
  const [mobileTab, setMobileTab] = useState<"drive" | "recent" | "shared">("drive");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const timersRef = useRef<Map<string, number>>(new Map());
  const viewerUrlRef = useRef<string | null>(null);

  const toast = useCallback((message: string, kind: Toast["kind"] = "info") => {
    const id = ++toastId;
    setToasts(p => [...p, { id, message, kind }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  const updUpload = useCallback((id: string, patch: Partial<UploadItem>) =>
    setUploads(p => p.map(u => u.id === id ? { ...u, ...patch } : u)), []);

  const stopProg = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) { clearInterval(t); timersRef.current.delete(id); }
  }, []);

  const startProg = useCallback((id: string) => {
    stopProg(id);
    const t = window.setInterval(() =>
      setUploads(p => p.map(u =>
        u.id !== id || u.status !== "uploading" ? u
          : { ...u, progress: Math.min(90, u.progress + 3 + Math.random() * 6) }
      )), 250);
    timersRef.current.set(id, t);
  }, [stopProg]);

  const configOk = useMemo(() =>
    !!(GitInfo.content_owner && GitInfo.content_repo && GitInfo.content_branch && GitInfo.content_token), []);

  const base = useMemo(() =>
    GitInfo.user_folder ? GitInfo.user_folder.replace(/^\/+|\/+$/g, "") : "", []);

  const resolve = useCallback((segs: string[]) =>
    [base, ...segs].filter(Boolean).join("/"), [base]);

  const curPath = useMemo(() => resolve(path), [path, resolve]);
  const crumbs = useMemo(() => ["/", ...path], [path]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter(i => i.name.toLowerCase().includes(q)) : items;
  }, [items, query]);

  const folders = useMemo(() => filtered.filter(i => i.type === "folder"), [filtered]);
  const files = useMemo(() => filtered.filter(i => i.type === "file"), [filtered]);
  const displayed = useMemo(() => [...folders, ...files], [folders, files]);
  const imap = useMemo(() => new Map(items.map(i => [i.path, i])), [items]);
  const activeUps = useMemo(() => uploads.filter(u => u.status === "queued" || u.status === "uploading"), [uploads]);
  const usedPct = useMemo(() => Math.min(100, Math.round(repoSize / MAX_REPO_BYTES * 100)), [repoSize]);

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
    if (!configOk) { setError("Missing GitHub config."); setItems([]); return; }
    setLoading(true); setError(null);
    try {
      const list = await listGitHubPath({ owner: GitInfo.content_owner, repo: GitInfo.content_repo, path: curPath, branch: GitInfo.content_branch });
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
      try { setRepoSize(await getGitHubRepoSize({ owner: GitInfo.content_owner, repo: GitInfo.content_repo })); }
      catch (_) { }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load.";
      setError(msg); setItems([]); toast(msg, "error");
    } finally { setLoading(false); }
  }, [configOk, curPath, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => {
    timersRef.current.forEach(t => clearInterval(t));
    timersRef.current.clear();
    if (viewerUrlRef.current) { URL.revokeObjectURL(viewerUrlRef.current); viewerUrlRef.current = null; }
  }, []);

  const rowClick = (item: Item, e: React.MouseEvent) => {
    if (e.shiftKey && lastSel) { selRange(lastSel, item.path); return; }
    if (e.metaKey || e.ctrlKey) {
      setSelected(prev => { const n = new Set(prev); n.has(item.path) ? n.delete(item.path) : n.add(item.path); return n; });
      setLastSel(item.path); return;
    }
    selOnly(item.path);
  };

  const openFolder = (name: string) => { setPath(p => [...p, name]); setSelected(new Set()); };
  const navTo = (i: number) => { setPath(i === 0 ? [] : path.slice(0, i)); setSelected(new Set()); };
  const goUp = () => { if (path.length) { setPath(path.slice(0, -1)); setSelected(new Set()); } };

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await fn(); toast(label, "success"); await load(); }
    catch (e) { const m = e instanceof Error ? e.message : "Error"; setError(m); toast(m, "error"); }
    finally { setBusy(false); }
  }, [busy, load, toast]);

  const clearSel = () => { setSelected(new Set()); setLastSel(null); };
  const selectAll = () => setSelected(new Set(items.map(i => i.path)));

  const handleNewFolder = async () => {
    const name = window.prompt("New folder name:"); if (!name?.trim()) return;
    const trimmed = name.trim();
    const tp = resolve([...path, trimmed]);
    const opt: Item = { name: trimmed, path: tp, type: "folder", size: 0, sha: "" };
    addPending(opt);
    setItems(p => p.some(i => i.path === tp) ? p : [opt, ...p]);
    await run(`Created "${trimmed}"`, () =>
      createGitHubFolder({ owner: GitInfo.content_owner, repo: GitInfo.content_repo, path: tp, branch: GitInfo.content_branch }));
  };

  const handleUpload = async (files: FileList | null, targetBase = curPath) => {
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
        if (uid) { updUpload(uid, { status: "uploading", progress: 3 }); startProg(uid); }
        try {
          await uploadGitHubFile({ owner: GitInfo.content_owner, repo: GitInfo.content_repo, path: jp(targetBase, f.name), branch: GitInfo.content_branch, file: f });
          if (uid) { stopProg(uid); updUpload(uid, { status: "done", progress: 100 }); setTimeout(() => setUploads(p => p.filter(u => u.id !== uid)), 4000); }
        } catch (err) {
          if (uid) { stopProg(uid); updUpload(uid, { status: "error", message: err instanceof Error ? err.message : "Failed" }); }
          throw err;
        }
      }
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = () => {
    if (!selected.size) return;
    const n = selected.size;
    if (!confirm(`Delete ${n} item${n > 1 ? "s" : ""}? This cannot be undone.`)) return;
    run(`Deleted ${n} item${n > 1 ? "s" : ""}`, async () => {
      for (const p of selected) {
        const item = imap.get(p);
        if (item) await deleteGitHubPath({ owner: GitInfo.content_owner, repo: GitInfo.content_repo, path: item.path, branch: GitInfo.content_branch, isDir: item.type === "folder", sha: item.sha });
      }
    });
  };

  const handleMoveUp = () => {
    if (!selected.size || !path.length) return;
    const parent = resolve(path.slice(0, -1));
    run(`Moved ${selected.size} item${selected.size > 1 ? "s" : ""} up`, async () => {
      for (const p of selected) {
        const item = imap.get(p);
        if (item) await moveGitHubPath({ owner: GitInfo.content_owner, repo: GitInfo.content_repo, from: item.path, to: [parent, item.name].filter(Boolean).join("/"), branch: GitInfo.content_branch, isDir: item.type === "folder" });
      }
    });
  };

  const closeViewer = () => {
    if (viewerUrlRef.current) { URL.revokeObjectURL(viewerUrlRef.current); viewerUrlRef.current = null; }
    setViewer({ open: false });
  };

  const dlFile = async (item: Item) => {
    const { blob, name } = await getGitHubFileBlob({ owner: GitInfo.content_owner, repo: GitInfo.content_repo, path: item.path, branch: GitInfo.content_branch });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const viewFile = async (item: Item) => {
    setViewer({ open: true, item, loading: true });
    try {
      const ext = extOf(item.name);
      const kind: ViewerState["kind"] =
        ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext) ? "image" :
          ext === "pdf" ? "pdf" :
            ["txt", "md", "json", "js", "ts", "tsx", "jsx", "css", "html", "yml", "yaml", "log", "csv"].includes(ext) ? "text" : "unknown";
      if (kind === "unknown") { setViewer({ open: true, item, kind, loading: false, error: "No preview available." }); return; }
      const { blob } = await getGitHubFileBlob({ owner: GitInfo.content_owner, repo: GitInfo.content_repo, path: item.path, branch: GitInfo.content_branch });
      if (viewerUrlRef.current) { URL.revokeObjectURL(viewerUrlRef.current); viewerUrlRef.current = null; }
      if (kind === "text") {
        setViewer({ open: true, item, kind, text: await blob.text(), loading: false });
      } else {
        const url = URL.createObjectURL(blob);
        viewerUrlRef.current = url;
        setViewer({ open: true, item, kind, url, loading: false });
      }
    } catch (err) { setViewer({ open: true, item, loading: false, error: err instanceof Error ? err.message : "Preview failed." }); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isInput(e.target)) return;
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "a") { e.preventDefault(); selectAll(); return; }
      if ((e.metaKey || e.ctrlKey) && k === "n") { e.preventDefault(); void handleNewFolder(); return; }
      if ((e.metaKey || e.ctrlKey) && k === "u") { e.preventDefault(); fileInputRef.current?.click(); return; }
      if (e.key === "Escape") { if (viewer.open) closeViewer(); else clearSel(); return; }
      if (e.key === "Delete" || e.key === "Backspace" && (e.metaKey || e.ctrlKey)) { handleDelete(); return; }
      if (e.key === "Backspace" && !selected.size) { e.preventDefault(); goUp(); return; }
      if (e.key === "Enter" && selected.size === 1) {
        const item = imap.get(Array.from(selected)[0]);
        if (item?.type === "folder") openFolder(item.name);
        if (item?.type === "file") void viewFile(item);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onDragEnter = (e: React.DragEvent) => { if (!isFileDrag(e)) return; e.preventDefault(); dragCounterRef.current++; setDragging(true); };
  const onDragLeave = () => { if (--dragCounterRef.current <= 0) { dragCounterRef.current = 0; setDragging(false); } };
  const onDrop = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault(); dragCounterRef.current = 0; setDragging(false); setDropTarget(null);
    handleUpload(e.dataTransfer?.files ?? null, curPath);
  };

  const onRowDragStart = (item: Item, e: React.DragEvent) => {
    if (busy) return;
    const payload = selected.has(item.path) ? Array.from(selected) : [item.path];
    setSelected(new Set(payload)); setDragItems(payload);
    e.dataTransfer?.setData("application/x-jr-paths", JSON.stringify(payload));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  };
  const onRowDragEnd = () => { setDragItems([]); setDropTarget(null); };
  const onRowDragOver = (item: Item, e: React.DragEvent) => { if (item.type !== "folder" || (!isFileDrag(e) && !isInternalDrag(e))) return; e.preventDefault(); setDropTarget(item.path); };
  const onRowDragLeave = (item: Item) => { if (dropTarget === item.path) setDropTarget(null); };

  const moveToFolder = (target: string, paths: string[]) => {
    if (!paths.length) return;
    run(`Moved ${paths.length} item${paths.length > 1 ? "s" : ""}`, async () => {
      for (const p of paths) {
        const item = imap.get(p);
        if (!item || item.path === target || (item.type === "folder" && target.startsWith(`${item.path}/`))) continue;
        await moveGitHubPath({ owner: GitInfo.content_owner, repo: GitInfo.content_repo, from: item.path, to: jp(target, item.name), branch: GitInfo.content_branch, isDir: item.type === "folder" });
      }
    });
  };
  const onRowDrop = (item: Item, e: React.DragEvent) => {
    if (item.type !== "folder") return;
    e.preventDefault(); setDropTarget(null);
    const f = e.dataTransfer?.files ?? null;
    if (f?.length) { handleUpload(f, item.path); return; }
    if (isInternalDrag(e)) {
      const raw = e.dataTransfer?.getData("application/x-jr-paths");
      moveToFolder(item.path, raw ? JSON.parse(raw) as string[] : dragItems);
    }
  };

  const rp = (item: Item) => ({
    onDoubleClick: () => item.type === "folder" ? openFolder(item.name) : viewFile(item),
    draggable: !busy,
    onDragStart: (e: React.DragEvent) => onRowDragStart(item, e),
    onDragEnd: onRowDragEnd,
    onDragOver: (e: React.DragEvent) => onRowDragOver(item, e),
    onDragLeave: () => onRowDragLeave(item),
    onDrop: (e: React.DragEvent) => onRowDrop(item, e),
  });

  const statusLabel = activeUps.length ? `Uploading ${activeUps.length}…` : busy ? "Syncing…" : loading ? "Loading…" : "Connected";
  const folderTitle = path.length ? path[path.length - 1] : "My Drive";

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
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {sel && <div className="sel-check-mac">{Ic.check()}</div>}
            </div>
          </button>
        );
      }) : (
        <div className="empty-state">
          <div className="empty-ic">📁</div>
          <div className="empty-title">{query ? `No results for "${query}"` : "This folder is empty"}</div>
          <div className="empty-sub">{query ? "Try a different search" : "Drag files here or click Upload"}</div>
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
          return (
            <button key={item.path}
              className={["grid-item", sel && "selected", dropTarget === item.path && "drop-target"].filter(Boolean).join(" ")}
              onClick={e => rowClick(item, e)}
              {...rp(item)}
            >
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
        <div className="empty-title">{query ? `No results for "${query}"` : "Empty"}</div>
        <div className="empty-sub">{query ? "Try a different search" : "Drop files here or tap Upload"}</div>
      </div>
    )
  );

  const renderIosList = () => (
    <div className="ios-list">
      {displayed.length > 0 ? displayed.map(item => {
        const sel = selected.has(item.path);
        const meta = extMeta(item.name);
        const isF = item.type === "folder";
        return (
          <button key={item.path}
            className={["ios-row", sel && "selected"].filter(Boolean).join(" ")}
            onClick={e => {
              if (sel) { clearSel(); return; }
              rowClick(item, e);
              if (!e.shiftKey && !e.metaKey && !e.ctrlKey && item.type === "folder") openFolder(item.name);
              if (!e.shiftKey && !e.metaKey && !e.ctrlKey && item.type === "file") void viewFile(item);
            }}
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
            {sel
              ? <div className="ios-row-check">{Ic.check()}</div>
              : isF ? <span className="ios-chev">{Ic.chevRight()}</span> : null
            }
          </button>
        );
      }) : (
        <div className="empty-state">
          <div className="empty-ic">📁</div>
          <div className="empty-title">{query ? `No results for "${query}"` : "This folder is empty"}</div>
          <div className="empty-sub">{query ? "Try a different search" : "Tap + to upload files"}</div>
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
          return (
            <button key={item.path}
              className={["ios-grid-item", sel && "selected"].filter(Boolean).join(" ")}
              onClick={() => {
                if (item.type === "folder") openFolder(item.name);
                else void viewFile(item);
              }}
            >
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
        <div className="empty-title">Empty</div>
        <div className="empty-sub">Tap + to add files</div>
      </div>
    )
  );

  return (
    <>
      <style>{CSS}</style>
      <input ref={fileInputRef} type="file" multiple className="hidden"
        onChange={e => handleUpload(e.currentTarget.files)} />

      {/* ══════════════════════════════════
          DESKTOP — macOS Finder layout
      ══════════════════════════════════ */}
      <div className="desktop-view"
        onDragEnter={onDragEnter}
        onDragOver={e => { if (isFileDrag(e)) e.preventDefault(); }}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="mac-window" style={{ flex: 1, borderRadius: 0 }}>
          {/* Sidebar */}
          <aside className="sidebar">
            <div className="sidebar-traffic">
              <div className="td cl" />
              <div className="td mn" />
              <div className="td mx" />
            </div>

            <nav className="sidebar-nav">
              <div className="nav-section">
                <div className="nav-sec-hd">Favourites</div>
                <button className="nav-item active" onClick={() => navTo(0)}>
                  <span className="nav-ic">{Ic.drive()}</span>
                  <span className="nav-item-label">My Drive</span>
                </button>
                <button className="nav-item" style={{ opacity: 0.4, cursor: "default" }} disabled>
                  <span className="nav-ic">{Ic.clock()}</span>
                  <span className="nav-item-label">Recent</span>
                </button>
                <button className="nav-item" style={{ opacity: 0.4, cursor: "default" }} disabled>
                  <span className="nav-ic">{Ic.star()}</span>
                  <span className="nav-item-label">Starred</span>
                </button>
              </div>

              {path.length > 0 && <>
                <div className="nav-divider" />
                <div className="nav-section">
                  <div className="nav-sec-hd">Open</div>
                  {path.map((seg, i) => (
                    <button key={seg + i} className="nav-item" onClick={() => navTo(i + 1)}>
                      <span className="nav-ic">{Ic.folder()}</span>
                      <span className="nav-item-label">{seg}</span>
                    </button>
                  ))}
                </div>
              </>}
            </nav>

            <div className="sidebar-foot">
              <div className="storage-row">
                <span className="storage-label">Storage</span>
                <span className="storage-pct">{usedPct}%</span>
              </div>
              <div className="storage-bar">
                <div className="storage-fill" style={{ width: `${usedPct}%` }} />
              </div>
              <div className="storage-cap">{formatBytes(repoSize)} of 5 GB</div>
              <div className="status-row">
                <div className="status-led" />
                <div className="status-txt">{statusLabel} · {GitInfo.content_repo || "github.com"}</div>
              </div>
            </div>
          </aside>

          {/* Main */}
          <div className="main">
            {/* Toolbar */}
            <div className="toolbar">
              <div className="toolbar-nav-btns">
                <button className="toolbar-nav-btn" onClick={goUp} disabled={!path.length} title="Back">{Ic.chevLeft()}</button>
              </div>

              <nav className="breadcrumb">
                {crumbs.map((seg, i) => (
                  <React.Fragment key={`${seg}-${i}`}>
                    <button className="crumb" onClick={() => navTo(i)}>
                      {seg === "/" ? "Home" : seg}
                    </button>
                    {i < crumbs.length - 1 && <span className="crumb-sep">{Ic.chevRight()}</span>}
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
                  <button className={`seg-btn${view === "list" ? " on" : ""}`} onClick={() => setView("list")} title="List">{Ic.list()}</button>
                  <button className={`seg-btn${view === "grid" ? " on" : ""}`} onClick={() => setView("grid")} title="Grid">{Ic.grid()}</button>
                </div>
                <button className="tb-icon-btn" onClick={load} disabled={loading || busy} title="Refresh">{Ic.refresh()}</button>
                <button className="tb-btn tb-btn-default" onClick={handleNewFolder} disabled={!configOk || busy}>{Ic.newFolder()} New Folder</button>
                <button className="tb-btn tb-btn-tint" onClick={() => fileInputRef.current?.click()} disabled={!configOk || busy}>{Ic.upload()} Upload</button>
              </div>
            </div>

            {/* Finder bar */}
            <div className="finder-bar">
              <span className="finder-chip">{filtered.length} item{filtered.length !== 1 ? "s" : ""}</span>
              {selected.size > 0 && <>
                <span className="finder-div" />
                <span className="finder-chip sel">{selected.size} selected</span>
                {selected.size === 1 && (() => {
                  const item = imap.get(Array.from(selected)[0]);
                  return item?.type === "file" ? <>
                    <button className="tb-btn tb-btn-ghost" style={{ height: 24, fontSize: 12 }} onClick={() => viewFile(item)} disabled={busy}>{Ic.eye()} View</button>
                    <button className="tb-btn tb-btn-ghost" style={{ height: 24, fontSize: 12 }} onClick={() => dlFile(item)} disabled={busy}>{Ic.download()} Download</button>
                  </> : null;
                })()}
                <button className="tb-btn tb-btn-destructive" style={{ height: 24, fontSize: 12 }} onClick={handleDelete} disabled={busy}>{Ic.trash()} Delete</button>
                {path.length > 0 && <button className="tb-btn tb-btn-ghost" style={{ height: 24, fontSize: 12 }} onClick={handleMoveUp} disabled={busy}>{Ic.moveUp()} Move up</button>}
                <button className="tb-btn tb-btn-ghost" style={{ height: 24, fontSize: 12 }} onClick={clearSel}>{Ic.x()} Deselect</button>
              </>}
              <span className="finder-flex" />
            </div>

            {error && <div className="error-banner">{Ic.info()}<span>{error}</span></div>}

            {uploads.length > 0 && (
              <div className="upload-bar-wrap">
                <div className="upload-bar-head">
                  <span className="upload-bar-title">Uploads</span>
                  <span className="upload-bar-count">{activeUps.length} active</span>
                  <button className="tb-btn tb-btn-ghost" style={{ height: 22, fontSize: 11.5, marginLeft: "auto" }}
                    onClick={() => setUploads(p => p.filter(u => u.status === "queued" || u.status === "uploading"))}
                    disabled={activeUps.length === uploads.length}>Clear done</button>
                </div>
                <div className="upload-items">
                  {uploads.map(u => (
                    <div key={u.id} className="upload-row">
                      <div className="upload-col">
                        <div className="upload-fname">{u.name}</div>
                        <div className={`upload-track${u.status === "error" ? " err" : ""}`}>
                          <span className="upload-fill" style={{ width: `${u.progress}%` }} />
                        </div>
                      </div>
                      <div className="upload-pct">{u.status === "done" ? "Done" : u.status === "error" ? "Error" : `${Math.round(u.progress)}%`}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* File list / grid */}
            <div className="content">
              {loading && (
                <div className="finder-table">
                  <div className="finder-thead"><span>Name</span><span>Kind</span><span>Size</span><span /></div>
                  {[1, 2, 3, 4, 5, 6].map((n, i) => (
                    <div key={n} className="finder-row" style={{ cursor: "default" }}>
                      <div className="finder-name-cell">
                        <div className="sk" style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0 }} />
                        <div className="sk" style={{ height: 11, width: 80 + i * 22 }} />
                      </div>
                      <div className="sk" style={{ height: 9, width: 32 }} />
                      <div className="sk" style={{ height: 9, width: 28 }} />
                    </div>
                  ))}
                </div>
              )}
              {!loading && (view === "list" ? renderFinderList() : renderFinderGrid())}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════
          MOBILE — iOS Files layout
      ══════════════════════════════════ */}
      <div className="mobile-view"
        onDragEnter={onDragEnter}
        onDragOver={e => { if (isFileDrag(e)) e.preventDefault(); }}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {/* iOS Navigation bar */}
        <div className="ios-nav">
          {/* Standard nav bar: back | centered title | refresh */}
          <div className="ios-nav-bar">
            {path.length > 0
              ? <button className="ios-back-btn" onClick={goUp}>
                {Ic.chevLeft()}
                <span className="ios-back-label">{path.length > 1 ? path[path.length - 2] : "Home"}</span>
              </button>
              : <div style={{ width: 8 }} />
            }
            {path.length > 0 && <div className="ios-nav-center">{folderTitle}</div>}
            <div className="ios-nav-right">
              <button className="ios-nav-btn" onClick={load} disabled={loading || busy} title="Refresh">{Ic.refresh()}</button>
            </div>
          </div>
          <div className="ios-search-wrap">
            <span className="ios-search-ic">{Ic.search()}</span>
            <input className="ios-search" placeholder="Search" value={query} onChange={e => setQuery(e.currentTarget.value)} />
            {query && <button className="ios-search-clear" onClick={() => setQuery("")}><svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M2 2l6 6M8 2L2 8" /></svg></button>}
          </div>
          <div className="ios-seg-wrap">
            <div className="ios-seg">
              <button className={`ios-seg-btn${view === "list" ? " on" : ""}`} onClick={() => setView("list")}>
                {Ic.list()} List
              </button>
              <button className={`ios-seg-btn${view === "grid" ? " on" : ""}`} onClick={() => setView("grid")}>
                {Ic.grid()} Grid
              </button>
            </div>
          </div>
        </div>

        {/* Scroll content */}
        <div className="ios-scroll">
          {error && <div className="error-banner">{Ic.info()}<span>{error}</span></div>}

          {uploads.length > 0 && (
            <div className="upload-bar-wrap" style={{ margin: "8px 16px", borderRadius: 12, border: "none", boxShadow: "0 1px 0 rgba(0,0,0,0.06)" }}>
              <div className="upload-bar-head">
                <span className="upload-bar-title">Uploads</span>
                <span className="upload-bar-count">{activeUps.length} active</span>
                <button className="tb-btn tb-btn-ghost" style={{ height: 22, fontSize: 11.5, marginLeft: "auto" }}
                  onClick={() => setUploads(p => p.filter(u => u.status === "queued" || u.status === "uploading"))}
                  disabled={activeUps.length === uploads.length}>Clear</button>
              </div>
              <div className="upload-items">
                {uploads.map(u => (
                  <div key={u.id} className="upload-row">
                    <div className="upload-col">
                      <div className="upload-fname">{u.name}</div>
                      <div className={`upload-track${u.status === "error" ? " err" : ""}`}>
                        <span className="upload-fill" style={{ width: `${u.progress}%` }} />
                      </div>
                    </div>
                    <div className="upload-pct">{u.status === "done" ? "Done" : u.status === "error" ? "Error" : `${Math.round(u.progress)}%`}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section header */}
          {!loading && !query && displayed.length > 0 && (
            <div className="ios-section-header">{displayed.length} item{displayed.length !== 1 ? "s" : ""}</div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="ios-skeleton-list">
              {[1, 2, 3, 4, 5].map((n, i) => (
                <div key={n} className="ios-skeleton-row">
                  <div className="sk" style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="sk" style={{ height: 13, width: `${55 + i * 12}%`, marginBottom: 7 }} />
                    <div className="sk" style={{ height: 10, width: "38%" }} />
                  </div>
                  <div className="sk" style={{ width: 10, height: 16, borderRadius: 3 }} />
                </div>
              ))}
            </div>
          )}

          {!loading && mobileTab === "drive" && (view === "list" ? renderIosList() : renderIosGrid())}
          {!loading && mobileTab !== "drive" && (
            <div className="empty-state" style={{ paddingTop: 80 }}>
              <div className="empty-ic">🔜</div>
              <div className="empty-title">Coming Soon</div>
              <div className="empty-sub">This section is not yet available</div>
            </div>
          )}
        </div>

        {/* iOS selection action bar — shown when items selected, replaces bottom bar */}
        {selected.size > 0 && (
          <div className="ios-sel-bar">
            <span className="ios-sel-label">{selected.size} selected</span>
            {selected.size === 1 && (() => {
              const item = imap.get(Array.from(selected)[0]);
              return item?.type === "file" ? <>
                <button className="ios-sel-btn" onClick={() => viewFile(item)}>
                  <span className="ios-sel-btn-ic">{Ic.eye()}</span>View
                </button>
                <button className="ios-sel-btn" onClick={() => dlFile(item)}>
                  <span className="ios-sel-btn-ic">{Ic.download()}</span>Save
                </button>
              </> : null;
            })()}
            {path.length > 0 && <button className="ios-sel-btn" onClick={handleMoveUp}><span className="ios-sel-btn-ic">{Ic.moveUp()}</span>Up</button>}
            <button className="ios-sel-btn danger" onClick={handleDelete}>
              <span className="ios-sel-btn-ic">{Ic.trash()}</span>Delete
            </button>
            <button className="ios-sel-btn" onClick={clearSel}>
              <span className="ios-sel-btn-ic">{Ic.x()}</span>Done
            </button>
          </div>
        )}

        {/* Bottom bar — floating action btns + nav tabs in one row */}
        {selected.size === 0 && (
          <div className="ios-bottom-bar">
            {/* Floating action buttons — above the nav bar */}
            <div className="ios-fab-group">
              <button className="ios-fab newfolder" onClick={handleNewFolder} title="New Folder">
                <FolderPlus size={18} weight="regular" />
              </button>
              <button className="ios-fab upload" onClick={() => fileInputRef.current?.click()} title="Upload">
                <UploadSimple size={18} weight="bold" />
              </button>
            </div>
            {/* Nav tabs */}
            <div className="ios-tabbar">
              <button className={`ios-tab${mobileTab === "drive" ? " active" : ""}`} onClick={() => setMobileTab("drive")}>
                <div className="ios-tab-ic">
                  <Folder size={24} weight={mobileTab === "drive" ? "fill" : "regular"} />
                </div>
                <span className="ios-tab-label">Browse</span>
              </button>
              <button className={`ios-tab${mobileTab === "recent" ? " active" : ""}`} onClick={() => setMobileTab("recent")}>
                <div className="ios-tab-ic"><Clock size={24} weight={mobileTab === "recent" ? "fill" : "regular"} /></div>
                <span className="ios-tab-label">Recent</span>
              </button>
              <button className={`ios-tab${mobileTab === "shared" ? " active" : ""}`} onClick={() => setMobileTab("shared")}>
                <div className="ios-tab-ic"><Star size={24} weight={mobileTab === "shared" ? "fill" : "regular"} /></div>
                <span className="ios-tab-label">Starred</span>
              </button>
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

      {/* ── Viewer — macOS sheet on desktop, iOS sheet on mobile ── */}
      {viewer.open && (
        <>
          {/* Desktop viewer */}
          <div className="viewer-overlay" onClick={closeViewer} style={{ display: undefined }}>
            <div className="viewer-win" onClick={e => e.stopPropagation()}>
              <div className="viewer-titlebar">
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="tb-btn tb-btn-ghost" style={{ height: 26, fontSize: 12 }} onClick={closeViewer}>{Ic.x()} Close</button>
                </div>
                <div className="viewer-fname">{viewer.item?.name ?? "Preview"}</div>
                <div className="viewer-actions-row">
                  {viewer.item?.type === "file" && <button className="tb-btn tb-btn-default" style={{ height: 26, fontSize: 12 }} onClick={() => dlFile(viewer.item!)}>{Ic.download()} Download</button>}
                </div>
              </div>
              <div className="viewer-body">
                {viewer.loading && <div className="empty-state"><div className="empty-sub">Loading…</div></div>}
                {viewer.error && <div className="error-banner">{Ic.info()}<span>{viewer.error}</span></div>}
                {!viewer.loading && !viewer.error && viewer.kind === "image" && viewer.url && <img className="viewer-img" src={viewer.url} alt={viewer.item?.name} />}
                {!viewer.loading && !viewer.error && viewer.kind === "pdf" && viewer.url && <iframe className="viewer-frame" src={viewer.url} title={viewer.item?.name} />}
                {!viewer.loading && !viewer.error && viewer.kind === "text" && <pre className="viewer-text">{viewer.text ?? ""}</pre>}
                {!viewer.loading && !viewer.error && viewer.kind === "unknown" && <div className="empty-state"><div className="empty-ic">📄</div><div className="empty-title">No preview</div><div className="empty-sub">Download to view this file</div></div>}
              </div>
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