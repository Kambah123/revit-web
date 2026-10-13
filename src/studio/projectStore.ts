import type { Project } from "../model/types";
import {
  parseProject,
  serializeProject,
  PROJECT_FORMAT,
} from "../model/schema";
import type { KeyValueStorage } from "../persistence/autosave";
import { readAutosave } from "../persistence/autosave";

export interface StoredProject {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  project: Project;
}
const DB_NAME = "contour-projects";
const STORE = "projects";

/** IDB transaction completion, not request success, is our durability boundary. */
export async function openProjectStore(factory: IDBFactory = indexedDB) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
      request.result.createObjectStore("meta");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(
        new Error(
          "Close other Contour tabs, then retry opening the project library.",
        ),
      );
  });
  db.onversionchange = () => db.close();
  function transaction<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = operation(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () =>
        reject(tx.error ?? new Error("Project storage transaction failed."));
    });
  }
  return {
    async initialized(): Promise<boolean> {
      return new Promise((resolve, reject) => {
        const req = db
          .transaction("meta")
          .objectStore("meta")
          .get("initialized");
        req.onsuccess = () => resolve(req.result === true);
        req.onerror = () => reject(req.error);
      });
    },
    async markInitialized() {
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction("meta", "readwrite");
        tx.objectStore("meta").put(true, "initialized");
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    },
    async list(): Promise<StoredProject[]> {
      const rows = await transaction<StoredProject[]>("readonly", (store) =>
        store.getAll(),
      );
      // Validate at the read boundary, including legacy version migration. Do not silently discard corrupt data.
      return rows
        .map((row) => ({
          ...row,
          project: parseProject(
            JSON.stringify({ format: PROJECT_FORMAT, ...row.project }),
          ),
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async put(
      project: Project,
      createdAt = Date.now(),
    ): Promise<StoredProject> {
      const valid = parseProject(serializeProject(project));
      const row = {
        id: valid.id,
        name: valid.name,
        project: valid,
        createdAt,
        updatedAt: Date.now(),
      };
      await transaction("readwrite", (store) => store.put(row));
      return row;
    },
    async remove(id: string) {
      await transaction("readwrite", (store) => store.delete(id));
    },
    close() {
      db.close();
    },
  };
}
export type ProjectStore = Awaited<ReturnType<typeof openProjectStore>>;

/** Import once by project identity; retain the legacy recovery slot even after success. */
export async function migrateLegacyProject(
  store: ProjectStore,
  storage: KeyValueStorage,
) {
  const saved = readAutosave(storage);
  if (saved.status === "invalid")
    throw new Error(
      "Legacy autosave needs recovery. Its original bytes have been preserved.",
    );
  if (saved.status !== "ok") return;
  if (!(await store.list()).some((row) => row.id === saved.project.id))
    await store.put(saved.project);
}
