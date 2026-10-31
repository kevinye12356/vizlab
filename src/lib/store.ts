import { promises as fs } from "node:fs";
import path from "node:path";
import type { Project } from "./types";

/**
 * 档案层：作品以文件形式持久化在 data/vizlab.json。
 *
 * 选择文件存储而不是数据库，是为了让评审 `npm install && npm run dev`
 * 之后立刻可用，不需要装任何数据库或跑迁移。
 * 这一层是仓库接口，后续要换成 Postgres 只需要替换本文件。
 */

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "vizlab.json");

interface DB {
  projects: Project[];
}

async function readDB(): Promise<DB> {
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    const parsed = JSON.parse(raw) as DB;
    return { projects: Array.isArray(parsed.projects) ? parsed.projects : [] };
  } catch {
    return { projects: [] };
  }
}

async function writeDB(db: DB): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

export function newId(): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.random().toString(36).slice(2, 5);
  return `vz-${t}${r}`;
}

export async function listProjects(): Promise<Project[]> {
  const db = await readDB();
  return [...db.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<Project | null> {
  const db = await readDB();
  return db.projects.find((p) => p.id === id) ?? null;
}

export async function saveProject(project: Project): Promise<Project> {
  const db = await readDB();
  const i = db.projects.findIndex((p) => p.id === project.id);
  const next = { ...project, updatedAt: new Date().toISOString() };
  if (i >= 0) db.projects[i] = next;
  else db.projects.push(next);
  await writeDB(db);
  return next;
}

export async function deleteProject(id: string): Promise<void> {
  const db = await readDB();
  db.projects = db.projects.filter((p) => p.id !== id);
  await writeDB(db);
}
