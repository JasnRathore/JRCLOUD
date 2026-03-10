import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const EXT_COLOR: Record<string, string> = {
  pdf: "#f87171",
  md: "#60a5fa",
  txt: "#a3e635",
  docx: "#34d399",
  xlsx: "#4ade80",
  pptx: "#fb923c",
  jpg: "#e879f9",
  jpeg: "#e879f9",
  png: "#e879f9",
  gif: "#e879f9",
  svg: "#e879f9",
  mp4: "#f472b6",
  mov: "#f472b6",
  zip: "#fbbf24",
  sketch: "#fb923c",
  ts: "#38bdf8",
  tsx: "#38bdf8",
  js: "#facc15",
  jsx: "#facc15",
  json: "#fcd34d",
  bin: "#94a3b8",
};
const extColor = (name: string) => EXT_COLOR[extOf(name)] ?? "#94a3b8";

/* ─────────────────────────────────────────
   SVG Icons
───────────────────────────────────────── */
const I = {
  search: () => (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="9" r="5.5" />
      <path d="M14 14l3 3" />
    </svg>
  ),
  folder: (color = "var(--accent)") => (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.6">
      <path d="M3 6a2 2 0 012-2h3l2 2h7a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" />
    </svg>
  ),
  file: () => (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--muted)" strokeWidth="1.7">
      <path d="M6 3h5l4 4v10a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" />
      <path d="M11 3v5h5" />
    </svg>
  ),
  upload: () => (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 13V4M6 8l4-4 4 4M4 16h12" />
    </svg>
  ),
  newFolder: () => (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 6a2 2 0 012-2h3l2 2h7a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" />
      <path d="M10 9v4M8 11h4" />
    </svg>
  ),
  trash: () => (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 7h10l-1 9H6L5 7zM3 7h14M8 7V5h4v2" />
    </svg>
  ),
  moveUp: () => (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M10 15V5M5 10l5-5 5 5" />
    </svg>
  ),
  refresh: () => (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10a6 6 0 106-6H6m0 0L3 7m3-3l3 3" />
    </svg>
  ),
  chevron: () => (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M7 4l6 6-6 6" />
    </svg>
  ),
  home: () => (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
    </svg>
  ),
  check: () => (
    <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M4 10l5 5 7-7" />
    </svg>
  ),
  x: () => (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  ),
  grid: () => (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="11" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="11" width="6" height="6" rx="1" />
      <rect x="11" y="11" width="6" height="6" rx="1" />
    </svg>
  ),
  list: () => (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 6h12M4 10h12M4 14h12" />
    </svg>
  ),
  menu: () => (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 5h14M3 10h14M3 15h14" />
    </svg>
  ),
  download: () => (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M10 3v9M6 8l4 4 4-4M4 16h12" />
    </svg>
  ),
  view: () => (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  ),
  cloud: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M17.5 19H9a7 7 0 110-14 4.5 4.5 0 014.5 4.5A4.5 4.5 0 0118 14a4 4 0 01-.5 5z" />
    </svg>
  ),
  info: () => (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 9v5M10 7v.01" />
    </svg>
  ),
};

/* ─────────────────────────────────────────
   CSS
───────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Figtree:wght@300;400;500;600&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:#080a0f;
  --bg2:#0d1017;
  --surface:#111520;
  --surface2:#161b29;
  --surface3:#1c2235;
  --border:rgba(255,255,255,0.055);
  --border2:rgba(255,255,255,0.1);
  --text:#dde3f0;
  --text2:#8892aa;
  --muted:#454e66;
  --accent:#5b8df5;
  --accent2:#7aa3ff;
  --accent-dim:rgba(91,141,245,0.12);
  --accent-glow:rgba(91,141,245,0.3);
  --green:#22d3a0;
  --green-dim:rgba(34,211,160,0.1);
  --red:#f06060;
  --red-dim:rgba(240,96,96,0.1);
  --r:10px;
  --r-lg:14px;
  --sidebar:220px;
}

html,body{height:100%;background:var(--bg);color:var(--text);font-family:'Figtree',sans-serif;-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{width:3px;height:3px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--surface3);border-radius:3px}

.hidden{display:none!important}

.app{display:flex;height:100vh;overflow:hidden}

.sidebar{
  width:var(--sidebar);flex-shrink:0;
  background:var(--bg2);border-right:1px solid var(--border);
  display:flex;flex-direction:column;padding:0;
}
.sidebar-top{padding:18px 16px 16px;border-bottom:1px solid var(--border);}
.logo-mark{display:flex;align-items:center;gap:10px;}
.logo-icon{
  width:30px;height:30px;
  background:linear-gradient(135deg,var(--accent) 0%,#8b5cf6 100%);
  border-radius:8px;display:flex;align-items:center;justify-content:center;
  color:#fff;box-shadow:0 3px 12px rgba(91,141,245,0.4);flex-shrink:0;
}
.logo-text{font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:var(--text);}
.logo-text span{color:var(--accent);}
.logo-sub{font-size:9.5px;color:var(--muted);font-family:'JetBrains Mono',monospace;letter-spacing:0.09em;margin-top:1px;}

.sidebar-nav{flex:1;padding:10px 8px;overflow-y:auto;}
.nav-label{font-size:9.5px;font-family:'JetBrains Mono',monospace;color:var(--muted);letter-spacing:0.1em;text-transform:uppercase;padding:8px 8px 5px;}
.nav-item{
  display:flex;align-items:center;gap:8px;
  padding:6px 8px;border-radius:7px;
  font-size:13px;font-weight:500;color:var(--text2);
  cursor:pointer;transition:all 0.12s;
  border:none;background:none;width:100%;text-align:left;
  margin-bottom:1px;
}
.nav-item:hover{background:var(--surface);color:var(--text);}
.nav-item.active{background:var(--accent-dim);color:var(--accent);}
.nav-item-icon{flex-shrink:0;display:flex;align-items:center;}

.sidebar-bottom{padding:12px 8px;border-top:1px solid var(--border);}
.status-card{
  background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);
  padding:10px 12px;
}
.status-row{display:flex;align-items:center;gap:7px;}
.status-dot{width:6px;height:6px;border-radius:50%;background:var(--green);animation:blink 2s ease infinite;flex-shrink:0;}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.35}}
.status-name{font-size:11.5px;font-weight:600;color:var(--green);font-family:'JetBrains Mono',monospace;}
.status-repo{font-size:10px;color:var(--muted);margin-top:3px;font-family:'JetBrains Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

.main-area{flex:1;display:flex;flex-direction:column;overflow:hidden;background:var(--bg);}

.topbar{
  display:flex;align-items:center;gap:10px;
  padding:0 20px;height:54px;
  border-bottom:1px solid var(--border);
  background:var(--bg2);flex-shrink:0;
}
.breadcrumb{display:flex;align-items:center;gap:0;flex:1;min-width:0;overflow:hidden;}
.crumb{
  display:inline-flex;align-items:center;gap:5px;
  padding:4px 7px;border-radius:6px;
  font-size:13px;font-weight:500;color:var(--text2);
  background:none;border:none;cursor:pointer;transition:all 0.12s;white-space:nowrap;
}
.crumb:hover{background:var(--surface2);color:var(--text);}
.crumb:last-child{color:var(--text);}
.crumb-sep{color:var(--muted);padding:0;font-size:11px;user-select:none;display:flex;align-items:center;}

.search-box{
  display:flex;align-items:center;gap:8px;
  background:var(--surface);border:1px solid var(--border);
  border-radius:8px;padding:0 11px;height:34px;width:220px;
  transition:border-color 0.15s,box-shadow 0.15s,width 0.2s;
}
.search-box:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-dim);width:260px;}
.search-box input{background:none;border:none;outline:none;color:var(--text);font-family:'Figtree',sans-serif;font-size:13px;width:100%;}
.search-box input::placeholder{color:var(--muted);}

.topbar-right{display:flex;align-items:center;gap:6px;flex-shrink:0;}
.view-toggle{display:flex;background:var(--surface);border:1px solid var(--border);border-radius:7px;overflow:hidden;padding:2px;}
.vt-btn{width:28px;height:26px;display:flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;color:var(--muted);transition:all 0.12s;border-radius:5px;}
.vt-btn.active{background:var(--surface3);color:var(--text);}

.btn{
  display:inline-flex;align-items:center;gap:6px;
  font-family:'Figtree',sans-serif;font-size:13px;font-weight:500;
  border-radius:8px;padding:5px 13px;height:32px;
  border:1px solid var(--border);background:var(--surface);color:var(--text2);
  cursor:pointer;transition:all 0.12s;
}
.btn:hover:not(:disabled){background:var(--surface2);color:var(--text);}
.btn:disabled{opacity:0.5;cursor:not-allowed;}
.btn-primary{background:var(--accent);color:#fff;border-color:rgba(0,0,0,0.2);box-shadow:0 6px 16px rgba(91,141,245,0.25);}
.btn-primary:hover:not(:disabled){filter:brightness(1.05);color:#fff;}
.btn-soft{background:var(--accent-dim);color:var(--accent);border-color:rgba(91,141,245,0.2);}
.btn-soft:hover:not(:disabled){background:rgba(91,141,245,0.18);}
.btn-ghost{background:transparent;border-color:transparent;color:var(--text2);}
.btn-ghost:hover:not(:disabled){background:var(--surface2);color:var(--text);}
.btn-danger{background:transparent;color:var(--text2);border:1px solid var(--border);}
.btn-danger:hover:not(:disabled){background:var(--red-dim);color:var(--red);border-color:rgba(240,96,96,0.25);}
.btn-icon{width:32px;height:32px;padding:0;justify-content:center;}

.content{flex:1;overflow-y:auto;padding:20px;position:relative;}

.action-bar{display:flex;align-items:center;gap:7px;margin-bottom:14px;flex-wrap:wrap;}
.ab-pill{
  font-size:11.5px;font-family:'JetBrains Mono',monospace;
  background:var(--surface2);border:1px solid var(--border);border-radius:6px;
  padding:3px 9px;color:var(--text2);
}
.ab-pill.accent{color:var(--accent);border-color:rgba(91,141,245,0.2);background:var(--accent-dim);}
.ab-sep{width:1px;height:16px;background:var(--border2);}
.ab-space{flex:1;}

.error-bar{
  display:flex;align-items:center;gap:9px;
  background:var(--red-dim);border:1px solid rgba(240,96,96,0.2);
  border-radius:var(--r);padding:10px 14px;margin-bottom:14px;
  font-size:13px;color:var(--red);
}

.file-table{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;}
.ft-head{
  display:grid;grid-template-columns:2.4fr 88px 80px 32px;gap:8px;
  padding:8px 14px;border-bottom:1px solid var(--border);background:var(--surface2);
}
.ft-head span{font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em;}

.ft-row{
  display:grid;grid-template-columns:2.4fr 88px 80px 32px;gap:8px;
  padding:0 14px;align-items:center;height:52px;
  background:transparent;border:none;border-bottom:1px solid var(--border);
  cursor:pointer;transition:background 0.1s;
  width:100%;text-align:left;position:relative;
}
.ft-row:last-child{border-bottom:none;}
.ft-row:hover{background:var(--surface2);}
.ft-row.selected{background:var(--accent-dim);}
.ft-row.selected::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--accent);}
.ft-row.drop-target{background:var(--accent-dim);outline:1px dashed var(--accent);outline-offset:-2px;}

.name-cell{display:flex;align-items:center;gap:10px;min-width:0;}
.icon-wrap{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;}
.icon-folder{background:var(--accent-dim);}
.icon-file{background:var(--surface3);}
.ext-pip{position:absolute;bottom:-2px;right:-2px;width:9px;height:9px;border-radius:50%;border:2px solid var(--surface);}
.item-name{font-size:13.5px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.item-sub{font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace;margin-top:1px;}
.cell-mono{font-size:12px;color:var(--text2);font-family:'JetBrains Mono',monospace;}
.sel-check{width:20px;height:20px;border-radius:5px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;}

.file-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;}
.grid-card{
  background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);
  padding:14px 10px 10px;cursor:pointer;transition:all 0.15s;text-align:center;
  position:relative;width:100%;
}
.grid-card:hover{background:var(--surface2);border-color:var(--border2);transform:translateY(-1px);box-shadow:0 8px 24px rgba(0,0,0,0.3);}
.grid-card.selected{background:var(--accent-dim);border-color:rgba(91,141,245,0.3);}
.grid-card.drop-target{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-dim);}
.grid-sel-badge{
  position:absolute;top:8px;right:8px;
  width:16px;height:16px;border-radius:4px;background:var(--accent);
  display:flex;align-items:center;justify-content:center;color:#fff;
}
.grid-icon{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;margin:0 auto 9px;position:relative;}
.grid-icon.fi{background:var(--accent-dim);}
.grid-icon.di{background:var(--surface3);}
.grid-name{font-size:11.5px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.grid-meta{font-size:10px;color:var(--muted);font-family:'JetBrains Mono',monospace;margin-top:3px;}

.skeleton{background:linear-gradient(90deg,var(--surface2) 0%,var(--surface3) 50%,var(--surface2) 100%);background-size:200% 100%;animation:shimmer 1.4s ease infinite;border-radius:5px;}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}

.empty{padding:64px 20px;text-align:center;}
.empty-icon{width:52px;height:52px;background:var(--surface2);border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;}
.empty p{font-size:14px;font-weight:500;color:var(--text2);}
.empty span{font-size:12px;color:var(--muted);margin-top:4px;display:block;}

.toast-shelf{position:fixed;bottom:20px;right:20px;display:flex;flex-direction:column;gap:7px;z-index:200;pointer-events:none;}
.toast{
  background:var(--surface);border:1px solid var(--border);border-radius:9px;
  padding:8px 12px;min-width:220px;max-width:320px;
  font-size:12.5px;color:var(--text2);display:flex;align-items:center;gap:8px;
  box-shadow:0 8px 24px rgba(0,0,0,0.35);
  animation:toastIn 0.16s ease;
}
.toast.success{border-color:rgba(34,211,160,0.4);color:var(--green);}
.toast.error{border-color:rgba(240,96,96,0.4);color:var(--red);}
.toast .ti{width:16px;height:16px;display:flex;align-items:center;justify-content:center;}
.toast.success .ti{color:var(--green);} 
.toast.error .ti{color:var(--red);} 
.toast.info .ti{color:var(--accent);} 
@keyframes toastIn{from{transform:translateX(16px);opacity:0}to{transform:none;opacity:1}}

.upload-panel{
  background:var(--surface2);border:1px solid var(--border);
  border-radius:12px;padding:10px 12px;margin-bottom:14px;
}
.upload-head{display:flex;align-items:center;gap:10px;margin-bottom:8px;}
.upload-title{font-size:12px;font-weight:600;color:var(--text);}
.upload-count{font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace;}
.upload-list{display:flex;flex-direction:column;gap:8px;}
.upload-item{display:grid;grid-template-columns:1fr 56px;gap:10px;align-items:center;}
.upload-name{font-size:12px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.upload-status{font-size:11px;color:var(--muted);text-align:right;}
.upload-bar{height:6px;background:var(--surface3);border-radius:999px;overflow:hidden;}
.upload-bar > span{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));}
.upload-bar.error > span{background:linear-gradient(90deg,#f87171,#fb7185);}
.upload-row{display:flex;flex-direction:column;gap:6px;}

.drop-overlay{
  position:fixed;inset:0;z-index:100;
  display:flex;align-items:center;justify-content:center;
  background:rgba(8,10,15,0.8);backdrop-filter:blur(4px);
  pointer-events:none;
}
.drop-card{
  background:var(--surface3);border:2px dashed var(--accent);
  border-radius:20px;padding:40px 60px;text-align:center;
  animation:dropIn 0.2s ease;
}
@keyframes dropIn{from{transform:scale(0.95);opacity:0}to{transform:scale(1);opacity:1}}
.drop-icon{font-size:36px;margin-bottom:10px;}
.drop-title{font-size:16px;font-weight:700;color:var(--accent);font-family:'Syne',sans-serif;}
.drop-sub{font-size:12px;color:var(--text2);margin-top:5px;}

.viewer-overlay{
  position:fixed;inset:0;z-index:300;background:rgba(5,8,14,0.7);
  display:flex;align-items:center;justify-content:center;padding:24px;
}
.viewer-card{
  background:var(--surface);border:1px solid var(--border2);border-radius:16px;
  width:min(980px,92vw);max-height:88vh;display:flex;flex-direction:column;
  box-shadow:0 24px 80px rgba(0,0,0,0.45);
}
.viewer-head{
  display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);
}
.viewer-title{font-size:13px;color:var(--text);font-weight:600;}
.viewer-body{padding:16px;overflow:auto;flex:1;}
.viewer-img{max-width:100%;max-height:70vh;border-radius:12px;display:block;margin:0 auto;}
.viewer-text{white-space:pre-wrap;font-size:12.5px;line-height:1.5;color:var(--text2);font-family:'JetBrains Mono',monospace;}
.viewer-actions{margin-left:auto;display:flex;gap:6px;}
.viewer-iframe{width:100%;height:70vh;border:none;border-radius:12px;background:var(--surface2);}

.mobile-menu-btn{
  display:none;align-items:center;justify-content:center;
  width:34px;height:34px;border-radius:9px;
  border:1px solid var(--border);background:var(--surface);color:var(--text2);
  cursor:pointer;transition:all 0.12s;
}
.mobile-menu-btn:hover{background:var(--surface2);color:var(--text);}
.sidebar-backdrop{
  position:fixed;inset:0;z-index:400;
  background:rgba(6,9,14,0.62);backdrop-filter:blur(2px);
}

@media (max-width: 900px){
  .app{position:relative;}
  .sidebar{
    position:fixed;left:0;top:0;bottom:0;
    width:min(78vw,320px);
    transform:translateX(-100%);
    transition:transform 0.2s ease;
    z-index:500;border-right:1px solid var(--border2);
  }
  .sidebar.open{transform:translateX(0);box-shadow:0 16px 40px rgba(0,0,0,0.45);}
  .main-area{width:100%;}
  .topbar{height:auto;padding:10px 12px;flex-wrap:wrap;gap:8px;}
  .mobile-menu-btn{display:flex;}
  .breadcrumb{order:1;flex:1;min-width:0;}
  .search-box{order:3;width:100%;}
  .search-box:focus-within{width:100%;}
  .topbar-right{order:4;width:100%;justify-content:space-between;}
  .view-toggle{display:none;}
  .content{padding:12px;}
  .upload-panel{padding:10px;}
  .action-bar{gap:6px;margin-bottom:10px;}
  .btn{height:34px;font-size:12.5px;padding:6px 11px;}
  .btn-icon{width:34px;height:34px;}
  .file-table .ft-head{display:none;}
  .file-table .cell-mono{display:none;}
  .ft-row{padding:10px 12px;}
  .grid-card{min-height:130px;padding:12px;}
  .grid-name{font-size:12.5px;}
  .grid-meta{font-size:11px;}
  .toast-shelf{left:50%;transform:translateX(-50%);right:auto;bottom:14px;}
  .drop-card{padding:28px 24px;}
  .viewer-card{width:96vw;max-height:90vh;}
  .viewer-head{flex-wrap:wrap;}
  .viewer-actions{width:100%;justify-content:flex-end;}
}

@media (max-width: 640px){
  .search-box{height:36px;}
  .logo-text{font-size:14px;}
  .logo-sub{font-size:9px;}
  .nav-item{font-size:12.5px;}
  .grid-card{min-height:120px;}
  .grid-icon{width:44px;height:44px;}
  .ab-pill{font-size:10.5px;}
  .upload-item{grid-template-columns:1fr;}
  .upload-status{text-align:left;}
  .viewer-img{max-height:60vh;}
}
`;

/* ─────────────────────────────────────────
   App Component
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
  const [lastSelected, setLastSelected] = useState<string | null>(null);
  const [dragItems, setDragItems] = useState<string[]>([]);
  const [pending, setPending] = useState<Map<string, { item: Item; ts: number }>>(
    new Map()
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [viewer, setViewer] = useState<ViewerState>({ open: false });
  const [repoSize, setRepoSize] = useState<number>(0);
  const [repoSizeError, setRepoSizeError] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const uploadTimersRef = useRef<Map<string, number>>(new Map());
  const viewerUrlRef = useRef<string | null>(null);

  const addToast = useCallback((message: string, kind: Toast["kind"] = "info") => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      3500
    );
  }, []);

  const updateUpload = useCallback((id: string, patch: Partial<UploadItem>) => {
    setUploads((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }, []);

  const stopUploadProgress = useCallback((id: string) => {
    const timer = uploadTimersRef.current.get(id);
    if (timer) {
      window.clearInterval(timer);
      uploadTimersRef.current.delete(id);
    }
  }, []);

  const startUploadProgress = useCallback((id: string) => {
    stopUploadProgress(id);
    const timer = window.setInterval(() => {
      setUploads((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          if (item.status !== "uploading") return item;
          const next = Math.min(90, item.progress + 3 + Math.random() * 6);
          return { ...item, progress: next };
        })
      );
    }, 250);
    uploadTimersRef.current.set(id, timer);
  }, [stopUploadProgress]);

  const configReady = useMemo(
    () =>
      !!(
        GitInfo.content_owner &&
        GitInfo.content_repo &&
        GitInfo.content_branch &&
        GitInfo.content_token
      ),
    []
  );

  const base = useMemo(
    () => (GitInfo.user_folder ? GitInfo.user_folder.replace(/^\/+|\/+$/g, "") : ""),
    []
  );

  const resolve = useCallback(
    (segs: string[]) => [base, ...segs].filter(Boolean).join("/"),
    [base]
  );

  const currentPath = useMemo(() => resolve(path), [path, resolve]);
  const breadcrumb = useMemo(() => ["/", ...path], [path]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  }, [items, query]);

  const folders = useMemo(() => filtered.filter((i) => i.type === "folder"), [filtered]);
  const files = useMemo(() => filtered.filter((i) => i.type === "file"), [filtered]);
  const itemMap = useMemo(() => new Map(items.map((i) => [i.path, i])), [items]);
  const displayed = useMemo(() => [...folders, ...files], [folders, files]);
  const activeUploads = useMemo(
    () => uploads.filter((u) => u.status === "queued" || u.status === "uploading"),
    [uploads]
  );
  const repoUsagePct = useMemo(
    () => Math.min(100, Math.round((repoSize / MAX_REPO_BYTES) * 100)),
    [repoSize]
  );

  const joinPath = useCallback((basePath: string, name: string) => [basePath, name].filter(Boolean).join("/"), []);

  const isInputTarget = (el: EventTarget | null) => {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    return el.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  };

  const isFileDrag = (e: { dataTransfer?: DataTransfer | null }) =>
    Array.from(e.dataTransfer?.types ?? []).includes("Files");

  const isInternalDrag = (e: { dataTransfer?: DataTransfer | null }) =>
    Array.from(e.dataTransfer?.types ?? []).includes("application/x-jrcloud-paths");

  const selectOnly = (pathValue: string) => {
    setSelected(new Set([pathValue]));
    setLastSelected(pathValue);
  };

  const selectRange = (fromPath: string, toPath: string) => {
    const list = displayed;
    const a = list.findIndex((i) => i.path === fromPath);
    const b = list.findIndex((i) => i.path === toPath);
    if (a === -1 || b === -1) {
      selectOnly(toPath);
      return;
    }
    const [start, end] = a < b ? [a, b] : [b, a];
    const next = new Set(list.slice(start, end + 1).map((i) => i.path));
    setSelected(next);
  };

  const addPending = useCallback((item: Item) => {
    setPending((prev) => {
      const next = new Map(prev);
      next.set(item.path, { item, ts: Date.now() });
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    if (!configReady) {
      setError("Missing GitHub config — check your .env values.");
      setItems([]);
      setSelected(new Set());
      return;
    }
    setLoading(true);
    setError(null);
    setRepoSizeError(null);
    try {
      const list = await listGitHubPath({
        owner: GitInfo.content_owner,
        repo: GitInfo.content_repo,
        path: currentPath,
        branch: GitInfo.content_branch,
      });
      const mapped = list.map((i) => ({
        name: i.name,
        path: i.path,
        type: i.type === "dir" ? "folder" : "file",
        size: i.size ?? 0,
        sha: i.sha,
        downloadUrl: i.download_url ?? null,
      }));
      const now = Date.now();
      const merged = [...mapped];
      setPending((prev) => {
        const next = new Map(prev);
        for (const [p, entry] of prev) {
          if (now - entry.ts > 30000) {
            next.delete(p);
            continue;
          }
          if (merged.some((i) => i.path === p)) {
            next.delete(p);
            continue;
          }
          merged.unshift(entry.item);
        }
        return next;
      });
      setItems(merged);
      setSelected(new Set());
      try {
        const size = await getGitHubRepoSize({
          owner: GitInfo.content_owner,
          repo: GitInfo.content_repo,
        });
        setRepoSize(size);
      } catch (err) {
        setRepoSizeError(err instanceof Error ? err.message : "Failed to read repo size.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load files.";
      setError(msg);
      setItems([]);
      setSelected(new Set());
      addToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [addToast, configReady, currentPath]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      for (const timer of uploadTimersRef.current.values()) {
        window.clearInterval(timer);
      }
      uploadTimersRef.current.clear();
      if (viewerUrlRef.current) {
        URL.revokeObjectURL(viewerUrlRef.current);
        viewerUrlRef.current = null;
      }
    };
  }, []);

  const handleRowClick = (item: Item, e: React.MouseEvent) => {
    if (e.shiftKey && lastSelected) {
      selectRange(lastSelected, item.path);
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      setSelected((prev) => {
        const n = new Set(prev);
        n.has(item.path) ? n.delete(item.path) : n.add(item.path);
        return n;
      });
      setLastSelected(item.path);
      return;
    }
    selectOnly(item.path);
  };

  const openFolder = (name: string) => {
    setPath((p) => [...p, name]);
    setSelected(new Set());
    setMobileNav(false);
  };

  const navTo = (i: number) => {
    setPath(i === 0 ? [] : path.slice(0, i));
    setSelected(new Set());
    setMobileNav(false);
  };

  const run = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await fn();
        addToast(label, "success");
        await load();
      } catch (e) {
        const m = e instanceof Error ? e.message : "Something went wrong";
        setError(m);
        addToast(m, "error");
      } finally {
        setBusy(false);
      }
    },
    [addToast, busy, load]
  );

  const clearSelection = () => {
    setSelected(new Set());
    setLastSelected(null);
  };
  const clearFinishedUploads = () =>
    setUploads((prev) =>
      prev.filter((u) => u.status === "queued" || u.status === "uploading")
    );
  const selectAll = () => setSelected(new Set(items.map((i) => i.path)));
  const goUp = () => {
    if (path.length) {
      setPath(path.slice(0, -1));
      clearSelection();
    }
  };

  const handleNewFolder = async () => {
    const name = window.prompt("Folder name");
    if (!name?.trim()) return;
    const trimmed = name.trim();
    const targetPath = resolve([...path, trimmed]);
    const optimistic: Item = { name: trimmed, path: targetPath, type: "folder", size: 0, sha: "" };
    addPending(optimistic);
    setItems((prev) => (prev.some((item) => item.path === targetPath) ? prev : [optimistic, ...prev]));
    await run(`Created "${trimmed}"`, () =>
      createGitHubFolder({
        owner: GitInfo.content_owner,
        repo: GitInfo.content_repo,
        path: targetPath,
        branch: GitInfo.content_branch,
      })
    );
  };

  const handleUpload = async (files: FileList | null, targetBasePath = currentPath) => {
    if (!files || !files.length) return;
    const fileList = Array.from(files);
    const tooLarge = fileList.filter((f) => f.size > MAX_FILE_BYTES);
    if (tooLarge.length) {
      addToast(
        `Skipped ${tooLarge.length} file${tooLarge.length > 1 ? "s" : ""} over 100 MB`,
        "error"
      );
    }
    const accepted = fileList.filter((f) => f.size <= MAX_FILE_BYTES);
    if (!accepted.length) return;

    const totalIncoming = accepted.reduce((sum, f) => sum + f.size, 0);
    if (repoSize + totalIncoming > MAX_REPO_BYTES) {
      addToast("Upload would exceed 5 GB repo limit.", "error");
      return;
    }
    const queued = accepted.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: f.name,
      size: f.size,
      progress: 0,
      status: "queued" as const,
    }));
    setUploads((prev) => [...queued, ...prev]);

    for (const f of accepted) {
      const targetPath = joinPath(targetBasePath, f.name);
      const optimistic: Item = { name: f.name, path: targetPath, type: "file", size: f.size, sha: "" };
      addPending(optimistic);
      setItems((prev) => (prev.some((item) => item.path === targetPath) ? prev : [optimistic, ...prev]));
    }
    await run(`Uploaded ${accepted.length} file${accepted.length > 1 ? "s" : ""}`, async () => {
      for (let i = 0; i < accepted.length; i++) {
        const f = accepted[i];
        const uploadId = queued[i]?.id;
        if (uploadId) {
          updateUpload(uploadId, { status: "uploading", progress: 3 });
          startUploadProgress(uploadId);
        }
        try {
          await uploadGitHubFile({
            owner: GitInfo.content_owner,
            repo: GitInfo.content_repo,
            path: joinPath(targetBasePath, f.name),
            branch: GitInfo.content_branch,
            file: f,
          });
          if (uploadId) {
            stopUploadProgress(uploadId);
            updateUpload(uploadId, { status: "done", progress: 100 });
            window.setTimeout(
              () => setUploads((prev) => prev.filter((u) => u.id !== uploadId)),
              4000
            );
          }
        } catch (err) {
          if (uploadId) {
            stopUploadProgress(uploadId);
            updateUpload(uploadId, {
              status: "error",
              message: err instanceof Error ? err.message : "Upload failed",
            });
          }
          throw err;
        }
      }
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = () => {
    if (!selected.size) return;
    const n = selected.size;
    if (!window.confirm(`Delete ${n} item${n > 1 ? "s" : ""}? This cannot be undone.`)) return;
    run(`Deleted ${n} item${n > 1 ? "s" : ""}`, async () => {
      for (const p of selected) {
        const item = itemMap.get(p);
        if (item) {
          await deleteGitHubPath({
            owner: GitInfo.content_owner,
            repo: GitInfo.content_repo,
            path: item.path,
            branch: GitInfo.content_branch,
            isDir: item.type === "folder",
            sha: item.sha,
          });
        }
      }
    });
  };

  const handleMoveUp = () => {
    if (!selected.size || path.length === 0) return;
    const parent = resolve(path.slice(0, -1));
    run(`Moved ${selected.size} item${selected.size > 1 ? "s" : ""} up`, async () => {
      for (const p of selected) {
        const item = itemMap.get(p);
        if (item) {
          await moveGitHubPath({
            owner: GitInfo.content_owner,
            repo: GitInfo.content_repo,
            from: item.path,
            to: [parent, item.name].filter(Boolean).join("/"),
            branch: GitInfo.content_branch,
            isDir: item.type === "folder",
          });
        }
      }
    });
  };

  const closeViewer = () => {
    if (viewerUrlRef.current) {
      URL.revokeObjectURL(viewerUrlRef.current);
      viewerUrlRef.current = null;
    }
    setViewer({ open: false });
  };

  const downloadFile = async (item: Item) => {
    const { blob, name } = await getGitHubFileBlob({
      owner: GitInfo.content_owner,
      repo: GitInfo.content_repo,
      path: item.path,
      branch: GitInfo.content_branch,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const viewFile = async (item: Item) => {
    setViewer({ open: true, item, loading: true });
    try {
      const ext = extOf(item.name);
      const kind: ViewerState["kind"] =
        ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)
          ? "image"
          : ext === "pdf"
            ? "pdf"
            : ["txt", "md", "json", "js", "ts", "tsx", "jsx", "css", "html", "yml", "yaml", "log", "csv"].includes(ext)
              ? "text"
              : "unknown";

      if (kind === "unknown") {
        setViewer({ open: true, item, kind, loading: false, error: "Preview not available." });
        return;
      }

      const { blob } = await getGitHubFileBlob({
        owner: GitInfo.content_owner,
        repo: GitInfo.content_repo,
        path: item.path,
        branch: GitInfo.content_branch,
      });

      if (viewerUrlRef.current) {
        URL.revokeObjectURL(viewerUrlRef.current);
        viewerUrlRef.current = null;
      }

      if (kind === "text") {
        const text = await blob.text();
        setViewer({ open: true, item, kind, text, loading: false });
      } else {
        const url = URL.createObjectURL(blob);
        viewerUrlRef.current = url;
        setViewer({ open: true, item, kind, url, loading: false });
      }
    } catch (err) {
      setViewer({
        open: true,
        item,
        loading: false,
        error: err instanceof Error ? err.message : "Preview failed.",
      });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isInputTarget(e.target)) return;
      const key = e.key.toLowerCase();

      if ((e.metaKey || e.ctrlKey) && key === "a") {
        e.preventDefault();
        selectAll();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && key === "n") {
        e.preventDefault();
        void handleNewFolder();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && key === "u") {
        e.preventDefault();
        fileInputRef.current?.click();
        return;
      }

      if (e.key === "Escape") {
        clearSelection();
        return;
      }
      if (e.key === "Delete") {
        handleDelete();
        return;
      }
      if (e.key === "Backspace" && selected.size === 0) {
        e.preventDefault();
        goUp();
        return;
      }
      if (e.key === "Enter" && selected.size === 1) {
        const only = Array.from(selected)[0];
        const item = itemMap.get(only);
        if (item?.type === "folder") openFolder(item.name);
        if (item?.type === "file") void viewFile(item);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleDelete, handleNewFolder, itemMap, openFolder, selected, path, viewFile]);

  const onDragEnter = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setDragging(true);
  };
  const onDragLeave = () => {
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragging(false);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragging(false);
    setDropTarget(null);
    handleUpload(e.dataTransfer?.files ?? null, currentPath);
  };

  const onRowDragStart = (item: Item, e: React.DragEvent) => {
    if (busy) return;
    const payload = selected.has(item.path) ? Array.from(selected) : [item.path];
    setSelected(new Set(payload));
    setDragItems(payload);
    e.dataTransfer?.setData("application/x-jrcloud-paths", JSON.stringify(payload));
    e.dataTransfer?.setData("text/plain", payload.join("\n"));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  };

  const onRowDragEnd = () => {
    setDragItems([]);
    setDropTarget(null);
  };

  const onRowDragOver = (item: Item, e: React.DragEvent) => {
    if (item.type !== "folder") return;
    if (!isFileDrag(e) && !isInternalDrag(e)) return;
    e.preventDefault();
    setDropTarget(item.path);
  };

  const onRowDragLeave = (item: Item) => {
    if (dropTarget === item.path) setDropTarget(null);
  };

  const handleMoveToFolder = (targetFolderPath: string, pathsToMove: string[]) => {
    if (!pathsToMove.length) return;
    run(`Moved ${pathsToMove.length} item${pathsToMove.length > 1 ? "s" : ""}`, async () => {
      for (const p of pathsToMove) {
        const item = itemMap.get(p);
        if (!item) continue;
        if (item.path === targetFolderPath) continue;
        if (item.type === "folder" && targetFolderPath.startsWith(`${item.path}/`)) continue;
        await moveGitHubPath({
          owner: GitInfo.content_owner,
          repo: GitInfo.content_repo,
          from: item.path,
          to: joinPath(targetFolderPath, item.name),
          branch: GitInfo.content_branch,
          isDir: item.type === "folder",
        });
      }
    });
  };

  const onRowDrop = (item: Item, e: React.DragEvent) => {
    if (item.type !== "folder") return;
    e.preventDefault();
    setDropTarget(null);
    const files = e.dataTransfer?.files ?? null;
    if (files && files.length > 0) {
      handleUpload(files, item.path);
      return;
    }
    if (isInternalDrag(e)) {
      const payload = e.dataTransfer?.getData("application/x-jrcloud-paths");
      const pathsToMove = payload ? (JSON.parse(payload) as string[]) : dragItems;
      handleMoveToFolder(item.path, pathsToMove);
    }
  };

  const statusText = activeUploads.length
    ? `Uploading ${activeUploads.length}`
    : busy
      ? "Syncing…"
      : loading
        ? "Loading…"
        : "Connected";

  return (
    <>
      <style>{CSS}</style>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleUpload(e.currentTarget.files)}
      />

      {mobileNav ? (
        <div className="sidebar-backdrop" onClick={() => setMobileNav(false)} />
      ) : null}

      <div className="app">
        {/* ── Sidebar ── */}
        <aside className={`sidebar${mobileNav ? " open" : ""}`}>
          <div className="sidebar-top">
            <div className="logo-mark">
              <div className="logo-icon">{I.cloud()}</div>
              <div>
                <div className="logo-text">
                  Jr<span>Cloud</span>
                </div>
                <div className="logo-sub">personal github drive</div>
              </div>
            </div>
          </div>

          <nav className="sidebar-nav">
            <div className="nav-label">Storage</div>
            <button className="nav-item active" onClick={() => navTo(0)}>
              <span className="nav-item-icon" style={{ color: "var(--accent)" }}>
                {I.folder()}
              </span>
              My Drive
            </button>
            <button className="nav-item" style={{ opacity: 0.35, cursor: "default" }} disabled>
              <span className="nav-item-icon" style={{ color: "var(--muted)" }}>
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <circle cx="10" cy="10" r="7" />
                  <path d="M10 6v4l2.5 2" />
                </svg>
              </span>
              Recent
            </button>
            <button className="nav-item" style={{ opacity: 0.35, cursor: "default" }} disabled>
              <span className="nav-item-icon" style={{ color: "var(--muted)" }}>
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M5 7h10l-1 9H6L5 7zM3 7h14M8 7V5h4v2" />
                </svg>
              </span>
              Trash
            </button>

            <div className="nav-label" style={{ marginTop: 10 }}>Quick Access</div>
            {(path.length > 0 ? path : []).map((seg, i) => (
              <button key={seg + i} className="nav-item" onClick={() => navTo(i + 1)}>
                <span className="nav-item-icon" style={{ color: "var(--muted)" }}>
                  {I.folder("var(--muted)")}
                </span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{seg}</span>
              </button>
            ))}
            {path.length === 0 ? (
              <div style={{ fontSize: 11.5, color: "var(--muted)", padding: "4px 8px" }}>
                No subfolders opened
              </div>
            ) : null}
          </nav>

          <div className="sidebar-bottom">
            <div className="status-card" style={{ marginBottom: 8 }}>
              <div className="status-row" style={{ justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      position: "relative",
                    }}
                  >
                    <svg width="48" height="48" viewBox="0 0 48 48">
                      <circle
                        cx="24"
                        cy="24"
                        r="18"
                        stroke="var(--surface3)"
                        strokeWidth="6"
                        fill="none"
                      />
                      <circle
                        cx="24"
                        cy="24"
                        r="18"
                        stroke="var(--accent)"
                        strokeWidth="6"
                        fill="none"
                        strokeDasharray={`${Math.round(2 * Math.PI * 18 * repoUsagePct / 100)} ${Math.round(2 * Math.PI * 18)}`}
                        strokeLinecap="round"
                        transform="rotate(-90 24 24)"
                      />
                    </svg>
                  </div>
                  <div>
                    <div className="logo-text" style={{ fontSize: 12, fontWeight: 600 }}>
                      Storage
                    </div>
                    <div className="logo-sub" style={{ fontSize: 10 }}>
                      {formatBytes(repoSize)} / 5 GB
                    </div>
                  </div>
                </div>
                <div className="status-name" style={{ fontSize: 12 }}>
                  {repoUsagePct}%
                </div>
              </div>
              {repoSizeError ? (
                <div className="logo-sub" style={{ color: "var(--red)", marginTop: 6 }}>
                  {repoSizeError}
                </div>
              ) : null}
            </div>
            <div className="status-card">
              <div className="status-row">
                <div className="status-dot" />
                <div className="status-name">{statusText}</div>
              </div>
              <div className="status-repo">
                {GitInfo.content_repo
                  ? `${GitInfo.content_owner}/${GitInfo.content_repo}`
                  : "github.com"}
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <div
          className="main-area"
          onDragEnter={onDragEnter}
          onDragOver={(e) => {
            if (isFileDrag(e)) e.preventDefault();
          }}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {/* Topbar */}
          <div className="topbar">
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileNav(true)}
              aria-label="Open sidebar"
              type="button"
            >
              {I.menu()}
            </button>
            <nav className="breadcrumb">
              {breadcrumb.map((crumb, i) => (
                <React.Fragment key={`${crumb}-${i}`}>
                  <button className="crumb" onClick={() => navTo(i)}>
                    {i === 0 ? I.home() : null}
                    {crumb === "/" ? "Home" : crumb}
                  </button>
                  {i < breadcrumb.length - 1 ? (
                    <span className="crumb-sep">{I.chevron()}</span>
                  ) : null}
                </React.Fragment>
              ))}
            </nav>

            <div className="search-box">
              <span style={{ color: "var(--muted)", flexShrink: 0 }}>{I.search()}</span>
              <input
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
              />
              {query ? (
                <button
                  onClick={() => setQuery("")}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--muted)",
                    display: "flex",
                    padding: 0,
                  }}
                >
                  {I.x()}
                </button>
              ) : null}
            </div>

            <div className="topbar-right">
              <div className="view-toggle">
                <button
                  className={`vt-btn${view === "list" ? " active" : ""}`}
                  onClick={() => setView("list")}
                  title="List view"
                >
                  {I.list()}
                </button>
                <button
                  className={`vt-btn${view === "grid" ? " active" : ""}`}
                  onClick={() => setView("grid")}
                  title="Grid view"
                >
                  {I.grid()}
                </button>
              </div>
              <button className="btn btn-soft" onClick={handleNewFolder} disabled={!configReady || busy}>
                {I.newFolder()} New folder
              </button>
              <button
                className="btn btn-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={!configReady || busy}
              >
                {I.upload()} Upload
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="content">
            {error ? (
              <div className="error-bar">
                {I.info()}
                <span>{error}</span>
              </div>
            ) : null}

            {uploads.length > 0 ? (
              <div className="upload-panel">
                <div className="upload-head">
                  <div className="upload-title">Uploads</div>
                  <div className="upload-count">
                    {activeUploads.length} active · {uploads.length} total
                  </div>
                  <div style={{ marginLeft: "auto" }}>
                    <button
                      className="btn btn-ghost"
                      onClick={clearFinishedUploads}
                      disabled={activeUploads.length === uploads.length}
                    >
                      Clear finished
                    </button>
                  </div>
                </div>
                <div className="upload-list">
                  {uploads.map((u) => (
                    <div key={u.id} className="upload-item" title={u.message ?? ""}>
                      <div className="upload-row">
                        <div className="upload-name">{u.name}</div>
                        <div className={`upload-bar${u.status === "error" ? " error" : ""}`}>
                          <span style={{ width: `${u.progress}%` }} />
                        </div>
                      </div>
                      <div className="upload-status">
                        {u.status === "done"
                          ? "Done"
                          : u.status === "error"
                            ? "Failed"
                            : `${Math.round(u.progress)}%`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Action bar */}
            <div className="action-bar">
              <span className="ab-pill">
                {filtered.length} item{filtered.length !== 1 ? "s" : ""}
              </span>
              {selected.size > 0 ? (
                <>
                  <div className="ab-sep" />
                  <span className="ab-pill accent">{selected.size} selected</span>
                  {selected.size === 1
                    ? (() => {
                        const only = Array.from(selected)[0];
                        const item = itemMap.get(only);
                        return item?.type === "file" ? (
                          <>
                            <button className="btn btn-ghost" onClick={() => viewFile(item)} disabled={busy}>
                              {I.view()} View
                            </button>
                            <button className="btn btn-ghost" onClick={() => downloadFile(item)} disabled={busy}>
                              {I.download()} Download
                            </button>
                          </>
                        ) : null;
                      })()
                    : null}
                  <button className="btn btn-danger" onClick={handleDelete} disabled={busy}>
                    {I.trash()} Delete
                  </button>
                  {path.length > 0 ? (
                    <button className="btn btn-ghost" onClick={handleMoveUp} disabled={busy}>
                      {I.moveUp()} Move up
                    </button>
                  ) : null}
                  <button className="btn btn-ghost" onClick={clearSelection}>
                    {I.x()} Deselect
                  </button>
                </>
              ) : null}
              <div className="ab-space" />
              <button
                className="btn btn-icon btn-ghost"
                onClick={load}
                disabled={loading || busy}
                title="Refresh"
              >
                {I.refresh()}
              </button>
            </div>

            {/* Loading skeletons */}
            {loading ? (
              <div className="file-table">
                <div className="ft-head">
                  <span>Name</span>
                  <span>Size</span>
                  <span>Type</span>
                  <span />
                </div>
                {[1, 2, 3, 4, 5].map((n, i) => (
                  <div key={`sk-${n}`} className="ft-row" style={{ cursor: "default" }}>
                    <div className="name-cell">
                      <div
                        className="skeleton"
                        style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          className="skeleton"
                          style={{ height: 11, width: 100 + i * 22, marginBottom: 6 }}
                        />
                        <div className="skeleton" style={{ height: 9, width: 44 }} />
                      </div>
                    </div>
                    <div className="skeleton" style={{ height: 9, width: 36 }} />
                    <div className="skeleton" style={{ height: 9, width: 28 }} />
                  </div>
                ))}
              </div>
            ) : null}

            {/* List view */}
            {!loading && view === "list" ? (
              <div className="file-table">
                <div className="ft-head">
                  <span>Name</span>
                  <span>Size</span>
                  <span>Type</span>
                  <span />
                </div>
                {filtered.length > 0 ? (
                  [...folders, ...files].map((item) => {
                    const sel = selected.has(item.path);
                    const ext = extOf(item.name);
                    return (
                      <button
                        key={item.path}
                        className={["ft-row", sel && "selected", dropTarget === item.path && "drop-target"].filter(Boolean).join(" ")}
                        onClick={(e) => handleRowClick(item, e)}
                        onDoubleClick={() => (item.type === "folder" ? openFolder(item.name) : viewFile(item))}
                        draggable={!busy}
                        onDragStart={(e) => onRowDragStart(item, e)}
                        onDragEnd={onRowDragEnd}
                        onDragOver={(e) => onRowDragOver(item, e)}
                        onDragLeave={() => onRowDragLeave(item)}
                        onDrop={(e) => onRowDrop(item, e)}
                      >
                        <div className="name-cell">
                          <div className={`icon-wrap ${item.type === "folder" ? "icon-folder" : "icon-file"}`}>
                            {item.type === "folder" ? I.folder() : null}
                            {item.type === "file" ? (
                              <>
                                {I.file()}
                                {ext ? (
                                  <div className="ext-pip" style={{ background: extColor(item.name) }} />
                                ) : null}
                              </>
                            ) : null}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div className="item-name">{item.name}</div>
                            <div className="item-sub">
                              {item.type === "folder" ? "folder" : ext ? `.${ext}` : "file"}
                            </div>
                          </div>
                        </div>
                        <div className="cell-mono">{formatBytes(item.size)}</div>
                        <div className="cell-mono" style={{ color: "var(--muted2)" }}>
                          {item.type === "folder" ? "Dir" : "File"}
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                          {sel ? <div className="sel-check">{I.check()}</div> : null}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="empty">
                    <div className="empty-icon">{I.folder("var(--muted)")}</div>
                    <p>{query ? `No results for "${query}"` : "This folder is empty"}</p>
                    <span>{query ? "Try a different search term" : "Drag & drop files here or click Upload"}</span>
                  </div>
                )}
              </div>
            ) : null}

            {/* Grid view */}
            {!loading && view === "grid" ? (
              filtered.length > 0 ? (
                <div className="file-grid">
                  {[...folders, ...files].map((item) => {
                    const sel = selected.has(item.path);
                    const ext = extOf(item.name);
                    return (
                      <button
                        key={item.path}
                        className={["grid-card", sel && "selected", dropTarget === item.path && "drop-target"].filter(Boolean).join(" ")}
                        onClick={(e) => handleRowClick(item, e)}
                        onDoubleClick={() => (item.type === "folder" ? openFolder(item.name) : viewFile(item))}
                        draggable={!busy}
                        onDragStart={(e) => onRowDragStart(item, e)}
                        onDragEnd={onRowDragEnd}
                        onDragOver={(e) => onRowDragOver(item, e)}
                        onDragLeave={() => onRowDragLeave(item)}
                        onDrop={(e) => onRowDrop(item, e)}
                      >
                        {sel ? <div className="grid-sel-badge">{I.check()}</div> : null}
                        <div className={`grid-icon ${item.type === "folder" ? "fi" : "di"}`}>
                          {item.type === "folder" ? (
                            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="var(--accent)" strokeWidth="1.4">
                              <path d="M3 6a2 2 0 012-2h3l2 2h7a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" />
                            </svg>
                          ) : null}
                          {item.type === "file" ? (
                            <>
                              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--muted)" strokeWidth="1.5">
                                <path d="M6 3h5l4 4v10a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" />
                                <path d="M11 3v5h5" />
                              </svg>
                              {ext ? (
                                <div
                                  style={{
                                    position: "absolute",
                                    bottom: -3,
                                    right: -3,
                                    width: 10,
                                    height: 10,
                                    borderRadius: "50%",
                                    background: extColor(item.name),
                                    border: "2px solid var(--surface)",
                                  }}
                                />
                              ) : null}
                            </>
                          ) : null}
                        </div>
                        <div className="grid-name" title={item.name}>
                          {item.name}
                        </div>
                        <div className="grid-meta">{item.type === "folder" ? "folder" : formatBytes(item.size)}</div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="empty">
                  <div className="empty-icon">{I.folder("var(--muted)")}</div>
                  <p>{query ? `No results for "${query}"` : "This folder is empty"}</p>
                  <span>{query ? "Try a different search term" : "Drag & drop files or click Upload"}</span>
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      {dragging ? (
        <div className="drop-overlay">
          <div className="drop-card">
            <div className="drop-icon">📂</div>
            <div className="drop-title">Drop to upload</div>
            <div className="drop-sub">Files will be added to current folder</div>
          </div>
        </div>
      ) : null}

      {/* Viewer */}
      {viewer.open ? (
        <div className="viewer-overlay" onClick={closeViewer}>
          <div className="viewer-card" onClick={(e) => e.stopPropagation()}>
            <div className="viewer-head">
              <div className="viewer-title">{viewer.item?.name ?? "Preview"}</div>
              <div className="viewer-actions">
                {viewer.item?.type === "file" ? (
                  <button className="btn btn-ghost" onClick={() => viewFile(viewer.item!)}>
                    {I.view()} Refresh
                  </button>
                ) : null}
                {viewer.item?.type === "file" ? (
                  <button className="btn btn-ghost" onClick={() => downloadFile(viewer.item!)}>
                    {I.download()} Download
                  </button>
                ) : null}
                <button className="btn btn-ghost" onClick={closeViewer}>
                  {I.x()} Close
                </button>
              </div>
            </div>
            <div className="viewer-body">
              {viewer.loading ? <div className="empty">Loading preview…</div> : null}
              {viewer.error ? <div className="error-bar">{I.info()}<span>{viewer.error}</span></div> : null}
              {!viewer.loading && !viewer.error && viewer.kind === "image" && viewer.url ? (
                <img className="viewer-img" src={viewer.url} alt={viewer.item?.name ?? "Preview"} />
              ) : null}
              {!viewer.loading && !viewer.error && viewer.kind === "pdf" && viewer.url ? (
                <iframe className="viewer-iframe" src={viewer.url} title={viewer.item?.name ?? "Preview"} />
              ) : null}
              {!viewer.loading && !viewer.error && viewer.kind === "text" ? (
                <pre className="viewer-text">{viewer.text ?? ""}</pre>
              ) : null}
              {!viewer.loading && !viewer.error && viewer.kind === "unknown" ? (
                <div className="empty">
                  <p>Preview not available.</p>
                  <span>Use Download to access this file.</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Toasts */}
      <div className="toast-shelf">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span className="ti">
              {t.kind === "success" ? I.check() : null}
              {t.kind === "error" ? I.x() : null}
              {t.kind === "info" ? I.info() : null}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}
