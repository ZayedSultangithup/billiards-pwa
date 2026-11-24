import { Zip, ZipPassThrough, strToU8 } from "fflate"
import { DatasetStorage } from "./storage"
import { TrainingDatasetItem } from "./types"

export class DatasetExporter {
  private storage: DatasetStorage

  constructor(storage: DatasetStorage) {
    this.storage = storage
  }

  static downloadBlob(blob: Blob, filename: string): void {
    if (typeof document === "undefined") return
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 1000)
  }

  static downloadJson(data: any, filename: string): void {
    const jsonStr =
      typeof data === "string" ? data : JSON.stringify(data, null, 2)
    const blob = new Blob([jsonStr], { type: "application/json" })
    this.downloadBlob(blob, filename)
  }

  async exportMetadataAsJson(gameId?: string): Promise<string> {
    const shots = gameId
      ? await this.storage.getShotsForGame(gameId)
      : await this.storage.getAllShots()
    return JSON.stringify(shots, null, 2)
  }

  private collectImagePaths(shots: TrainingDatasetItem[]): Set<string> {
    const paths = new Set<string>()
    for (const item of shots) {
      const v = item.shot.visual_data
      if (v.image_before?.path) paths.add(v.image_before.path)
      if (v.image_after?.path) paths.add(v.image_after.path)
      if (Array.isArray(v.frames_during)) {
        for (const f of v.frames_during) {
          if (f.path) paths.add(f.path)
        }
      }
    }
    return paths
  }

  private async streamImages(
    zip: Zip,
    imagePaths: Set<string>,
    onProgress?: (pct: number, msg: string) => void
  ): Promise<void> {
    const totalImages = imagePaths.size
    let processedImages = 0

    for (const imgPath of imagePaths) {
      processedImages++
      const pct = Math.round(5 + (processedImages / (totalImages || 1)) * 90)
      onProgress?.(
        pct,
        `Packaging image ${processedImages} of ${totalImages}...`
      )

      const blob = await this.storage.getImage(imgPath)
      if (blob) {
        const arrayBuf = await blob.arrayBuffer()
        const fileStream = new ZipPassThrough(imgPath)
        zip.add(fileStream)
        fileStream.push(new Uint8Array(arrayBuf), true)
      }
    }
  }

  async exportShotsAsZip(
    shots: TrainingDatasetItem[],
    zipFilename: string,
    onProgress?: (pct: number, msg: string) => void
  ): Promise<void> {
    if (shots.length === 0) {
      throw new Error("No shots to export")
    }

    const zipChunks: Uint8Array[] = []
    let zipError: any = null

    const zip = new Zip((err, chunk, _isFinal) => {
      if (err) zipError = err
      if (chunk) zipChunks.push(chunk)
    })

    onProgress?.(5, "Writing dataset.json...")
    const datasetJson = JSON.stringify(shots, null, 2)
    const jsonFile = new ZipPassThrough("dataset.json")
    zip.add(jsonFile)
    jsonFile.push(strToU8(datasetJson), true)

    const imagePaths = this.collectImagePaths(shots)
    await this.streamImages(zip, imagePaths, onProgress)

    onProgress?.(98, "Finalizing ZIP archive...")
    zip.end()

    if (zipError) {
      throw zipError
    }

    const finalBlob = new Blob(zipChunks as any, { type: "application/zip" })
    onProgress?.(100, "Done")
    DatasetExporter.downloadBlob(finalBlob, zipFilename)
  }

  async exportGameAsZip(
    gameId: string,
    onProgress?: (pct: number, msg: string) => void
  ): Promise<void> {
    const shots = await this.storage.getShotsForGame(gameId)
    await this.exportShotsAsZip(shots, `${gameId}.zip`, onProgress)
  }

  async exportAllAsZip(
    onProgress?: (pct: number, msg: string) => void
  ): Promise<void> {
    const shots = await this.storage.getAllShots()
    await this.exportShotsAsZip(
      shots,
      "billiards_training_dataset.zip",
      onProgress
    )
  }
}
