/**
 * Extension → lucide icon mapping for the file tree. Single source of
 * truth so the tree, palette, and breadcrumbs stay consistent.
 */
import {
  File as FileIcon,
  FileCode, FileText, FileJson, FileSpreadsheet,
  Image as ImageIcon, Music, Film, Braces,
  Settings as SettingsIcon, Lock,
} from "lucide-react";
import type { ComponentType } from "react";

type IconCmp = ComponentType<{ size?: number | string; className?: string; color?: string }>;

const MAP: Record<string, IconCmp> = {
  // markdown / docs
  md: FileText, mdx: FileText, markdown: FileText, txt: FileText,
  rst: FileText, adoc: FileText,

  // code
  ts: FileCode, tsx: FileCode, js: FileCode, jsx: FileCode, mjs: FileCode, cjs: FileCode,
  py: FileCode, rs: FileCode, go: FileCode, rb: FileCode, java: FileCode,
  c: FileCode, cpp: FileCode, h: FileCode, hpp: FileCode,
  swift: FileCode, kt: FileCode, php: FileCode, lua: FileCode, sh: FileCode, bash: FileCode, zsh: FileCode,
  sql: FileCode,
  html: FileCode, htm: FileCode, css: FileCode, scss: FileCode, sass: FileCode,

  // data / config
  json: Braces, json5: Braces, jsonc: Braces,
  yaml: FileJson, yml: FileJson,
  toml: FileJson, ini: FileJson, env: FileJson,
  xml: FileJson, plist: FileJson,
  csv: FileSpreadsheet, tsv: FileSpreadsheet, xls: FileSpreadsheet, xlsx: FileSpreadsheet,

  // media
  png: ImageIcon, jpg: ImageIcon, jpeg: ImageIcon, gif: ImageIcon, webp: ImageIcon,
  svg: ImageIcon, bmp: ImageIcon, ico: ImageIcon, heic: ImageIcon,
  mp3: Music, wav: Music, ogg: Music, flac: Music, m4a: Music, aiff: Music,
  mp4: Film, mov: Film, mkv: Film, webm: Film, avi: Film,

  // misc
  lock: Lock, conf: SettingsIcon,
};

export function iconForFile(name: string): IconCmp {
  const lower = name.toLowerCase();
  // Special-cased dotfiles where the "extension" is the whole name.
  if (lower === ".env" || lower.startsWith(".env.")) return FileJson;
  if (lower === "dockerfile" || lower === "makefile") return FileCode;
  if (lower === ".gitignore" || lower === ".dockerignore") return FileJson;
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return FileIcon;
  const ext = lower.slice(dot + 1);
  return MAP[ext] ?? FileIcon;
}
