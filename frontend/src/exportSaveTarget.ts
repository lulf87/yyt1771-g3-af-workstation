export const EXPORT_DIRECTORY_DB_NAME = "yyt1771-g3-export-picker";
export const EXPORT_DIRECTORY_STORE_NAME = "directory-handles";
export const LAST_EXPORT_DIRECTORY_KEY = "last-directory";

type DirectoryPickerGlobal = (object & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}) | null | undefined;

type PermissionMode = "read" | "readwrite";
type DirectoryPermissionDescriptor = { mode?: PermissionMode };
type PermissionCapableDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor?: DirectoryPermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (descriptor?: DirectoryPermissionDescriptor) => Promise<PermissionState>;
};

export function isExportDirectoryPickerSupported(globalLike: DirectoryPickerGlobal = globalThis): boolean {
  return typeof globalLike?.showDirectoryPicker === "function";
}

export async function chooseExportDirectory(
  globalLike: DirectoryPickerGlobal = globalThis
): Promise<FileSystemDirectoryHandle> {
  if (!isExportDirectoryPickerSupported(globalLike) || !globalLike?.showDirectoryPicker) {
    throw new Error("Directory picker is not supported by this browser.");
  }
  return globalLike.showDirectoryPicker();
}

export async function queryExportDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  mode: PermissionMode = "readwrite"
): Promise<PermissionState | "unsupported"> {
  const permissionHandle = handle as PermissionCapableDirectoryHandle;
  if (typeof permissionHandle.queryPermission !== "function") return "unsupported";
  return permissionHandle.queryPermission({ mode });
}

export async function ensureExportDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  mode: PermissionMode = "readwrite"
): Promise<boolean> {
  const currentPermission = await queryExportDirectoryPermission(handle, mode);
  if (currentPermission === "granted" || currentPermission === "unsupported") return true;
  const permissionHandle = handle as PermissionCapableDirectoryHandle;
  if (typeof permissionHandle.requestPermission !== "function") return false;
  return (await permissionHandle.requestPermission({ mode })) === "granted";
}

export async function writeBlobToDirectory(
  handle: FileSystemDirectoryHandle,
  filename: string,
  blob: Blob
): Promise<void> {
  if (!(await ensureExportDirectoryPermission(handle, "readwrite"))) {
    throw new Error("No permission to write to the selected export folder.");
  }
  const fileHandle = await handle.getFileHandle(sanitizeExportFilename(filename), { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
}

export type ExportDirectoryHandleStore = {
  load: () => Promise<FileSystemDirectoryHandle | null>;
  save: (handle: FileSystemDirectoryHandle) => Promise<void>;
};

export function createIndexedDbExportDirectoryStore(
  indexedDB: IDBFactory | undefined = globalThis.indexedDB
): ExportDirectoryHandleStore {
  return {
    async load() {
      if (!indexedDB) return null;
      const database = await openExportDirectoryDatabase(indexedDB);
      try {
        return await getLastExportDirectoryHandle(database);
      } finally {
        database.close();
      }
    },
    async save(handle) {
      if (!indexedDB) return;
      const database = await openExportDirectoryDatabase(indexedDB);
      try {
        await putLastExportDirectoryHandle(database, handle);
      } finally {
        database.close();
      }
    }
  };
}

function openExportDirectoryDatabase(indexedDB: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(EXPORT_DIRECTORY_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(EXPORT_DIRECTORY_STORE_NAME)) {
        database.createObjectStore(EXPORT_DIRECTORY_STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to open export directory database."));
    request.onsuccess = () => resolve(request.result);
  });
}

function getLastExportDirectoryHandle(database: IDBDatabase): Promise<FileSystemDirectoryHandle | null> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(EXPORT_DIRECTORY_STORE_NAME, "readonly");
    const store = transaction.objectStore(EXPORT_DIRECTORY_STORE_NAME);
    const request = store.get(LAST_EXPORT_DIRECTORY_KEY);
    request.onerror = () => reject(request.error ?? new Error("Failed to load export directory handle."));
    request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null);
  });
}

function putLastExportDirectoryHandle(
  database: IDBDatabase,
  handle: FileSystemDirectoryHandle
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(EXPORT_DIRECTORY_STORE_NAME, "readwrite");
    const store = transaction.objectStore(EXPORT_DIRECTORY_STORE_NAME);
    const request = store.put(handle, LAST_EXPORT_DIRECTORY_KEY);
    request.onerror = () => reject(request.error ?? new Error("Failed to save export directory handle."));
    request.onsuccess = () => resolve();
  });
}

function sanitizeExportFilename(filename: string): string {
  const clean = filename.trim().replace(/[/:\\]/g, "_");
  return clean || "yyt1771-g3-export.zip";
}
