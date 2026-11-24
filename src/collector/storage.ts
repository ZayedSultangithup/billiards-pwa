import { TrainingDatasetItem, DatasetStats } from "./types"
export { DatasetStats }

const DB_NAME = "BilliardsTrainingDB"
const DB_VERSION = 1
const STORE_SHOTS = "shots"
const STORE_GAMES = "games"
const STORE_IMAGES = "images"
const STORE_METADATA = "metadata"

export class DatasetStorage {
  private db: IDBDatabase | null = null
  private opfsRoot: FileSystemDirectoryHandle | null = null
  private useOpfs: boolean = false

  async init(): Promise<void> {
    if (this.db) return
    if (typeof indexedDB === "undefined") {
      return
    }

    // Initialize OPFS if available
    if (typeof navigator !== "undefined" && navigator.storage?.getDirectory) {
      try {
        this.opfsRoot = await navigator.storage.getDirectory()
        this.useOpfs = true
      } catch (e) {
        console.warn(
          "[DatasetStorage] OPFS not accessible, falling back to IndexedDB for images",
          e
        )
        this.useOpfs = false
      }
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        if (!db.objectStoreNames.contains(STORE_SHOTS)) {
          const shotStore = db.createObjectStore(STORE_SHOTS, {
            keyPath: "shot.shot_id",
          })
          shotStore.createIndex("game_id", "game_id", { unique: false })
          shotStore.createIndex(
            "start_timestamp_ms",
            "shot.start_timestamp_ms",
            { unique: false }
          )
        }

        if (!db.objectStoreNames.contains(STORE_GAMES)) {
          db.createObjectStore(STORE_GAMES, { keyPath: "game_id" })
        }

        if (!db.objectStoreNames.contains(STORE_IMAGES)) {
          db.createObjectStore(STORE_IMAGES, { keyPath: "path" })
        }

        if (!db.objectStoreNames.contains(STORE_METADATA)) {
          db.createObjectStore(STORE_METADATA, { keyPath: "key" })
        }
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onerror = () => {
        reject(request.error)
      }
    })
  }

  private async ensureDb(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init()
    }
    if (!this.db) {
      throw new Error("Failed to initialize IndexedDB")
    }
    return this.db
  }

  // --- Image Storage (OPFS with IndexedDB fallback) ---

  async saveImage(path: string, blob: Blob): Promise<void> {
    if (this.useOpfs && this.opfsRoot) {
      try {
        const parts = path.split("/").filter(Boolean)
        const filename = parts.pop()!
        let dir = this.opfsRoot

        for (const part of parts) {
          dir = await dir.getDirectoryHandle(part, { create: true })
        }

        const fileHandle = await dir.getFileHandle(filename, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(blob)
        await writable.close()
        return
      } catch (e) {
        console.warn(
          "[DatasetStorage] OPFS save failed, falling back to IDB for " + path,
          e
        )
      }
    }

    // Fallback to IndexedDB Blob store
    const db = await this.ensureDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGES, "readwrite")
      const store = tx.objectStore(STORE_IMAGES)
      const req = store.put({ path, blob, timestamp: Date.now() })
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async getImage(path: string): Promise<Blob | null> {
    if (this.useOpfs && this.opfsRoot) {
      try {
        const parts = path.split("/").filter(Boolean)
        const filename = parts.pop()!
        let dir = this.opfsRoot

        for (const part of parts) {
          dir = await dir.getDirectoryHandle(part)
        }

        const fileHandle = await dir.getFileHandle(filename)
        const file = await fileHandle.getFile()
        return file
      } catch {
        // Fall through to IndexedDB
      }
    }

    const db = await this.ensureDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_IMAGES, "readonly")
      const store = tx.objectStore(STORE_IMAGES)
      const req = store.get(path)
      req.onsuccess = () => {
        resolve(req.result ? req.result.blob : null)
      }
      req.onerror = () => reject(req.error)
    })
  }

  // --- Structured Shot Record Storage ---

  async saveShot(item: TrainingDatasetItem): Promise<void> {
    const db = await this.ensureDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_SHOTS, STORE_GAMES], "readwrite")
      const shotStore = tx.objectStore(STORE_SHOTS)
      const gameStore = tx.objectStore(STORE_GAMES)

      shotStore.put(item)

      // Update or insert game metadata
      const gameReq = gameStore.get(item.game_id)
      gameReq.onsuccess = () => {
        const existingGame = gameReq.result || {
          game_id: item.game_id,
          session_id: item.session_id,
          mode: item.game.mode,
          start_timestamp_ms: item.shot.start_timestamp_ms,
          shots_count: 0,
          status: item.game.status,
          last_update_ms: Date.now(),
        }
        existingGame.shots_count++
        existingGame.status = item.game.status
        existingGame.last_update_ms = Date.now()
        gameStore.put(existingGame)
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async getAllShots(): Promise<TrainingDatasetItem[]> {
    const db = await this.ensureDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SHOTS, "readonly")
      const store = tx.objectStore(STORE_SHOTS)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  }

  async getShotsForGame(gameId: string): Promise<TrainingDatasetItem[]> {
    const db = await this.ensureDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SHOTS, "readonly")
      const store = tx.objectStore(STORE_SHOTS)
      const index = store.index("game_id")
      const req = index.getAll(gameId)
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  }

  async getAllGames(): Promise<any[]> {
    const db = await this.ensureDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_GAMES, "readonly")
      const store = tx.objectStore(STORE_GAMES)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  }

  // --- Stats & Quota ---

  async getStats(
    isCollecting: boolean,
    isPaused: boolean,
    lastError: string | null
  ): Promise<DatasetStats> {
    const db = await this.ensureDb()
    const shotsCount = await new Promise<number>((res) => {
      const tx = db.transaction(STORE_SHOTS, "readonly")
      const req = tx.objectStore(STORE_SHOTS).count()
      req.onsuccess = () => res(req.result)
      req.onerror = () => res(0)
    })

    const gamesCount = await new Promise<number>((res) => {
      const tx = db.transaction(STORE_GAMES, "readonly")
      const req = tx.objectStore(STORE_GAMES).count()
      req.onsuccess = () => res(req.result)
      req.onerror = () => res(0)
    })

    // Approximate frame count from shots (each shot has 1 before + N during + 1 after)
    // We can query shots to sum frame count
    const allShots = await this.getAllShots()
    let framesCount = 0
    let lastSaveTimeMs: number | null = null
    for (const s of allShots) {
      framesCount += 2 + (s.shot.visual_data.frames_during?.length || 0)
      if (!lastSaveTimeMs || s.shot.end_timestamp_ms > lastSaveTimeMs) {
        lastSaveTimeMs = s.shot.end_timestamp_ms
      }
    }

    let storageQuotaBytes = 0
    let storageUsedBytes = 0
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate()
        storageQuotaBytes = est.quota || 0
        storageUsedBytes = est.usage || 0
      } catch {
        // Ignore
      }
    }

    return {
      gamesCount,
      shotsCount,
      framesCount,
      totalBytes: storageUsedBytes,
      storageQuotaBytes,
      storageUsedBytes,
      isCollecting,
      isPaused,
      lastSaveTimeMs,
      lastError,
    }
  }

  // --- Dataset Deletion (with explicit confirmation) ---

  async clearDataset(): Promise<void> {
    const db = await this.ensureDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [STORE_SHOTS, STORE_GAMES, STORE_IMAGES, STORE_METADATA],
        "readwrite"
      )
      tx.objectStore(STORE_SHOTS).clear()
      tx.objectStore(STORE_GAMES).clear()
      tx.objectStore(STORE_IMAGES).clear()
      tx.objectStore(STORE_METADATA).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    // Remove OPFS directories if possible
    if (this.useOpfs && this.opfsRoot) {
      try {
        const root = this.opfsRoot as any
        if (root.removeEntry) {
          await root.removeEntry("images", { recursive: true }).catch(() => {})
        }
      } catch (e) {
        console.warn("[DatasetStorage] Error clearing OPFS images directory", e)
      }
    }
  }
}
