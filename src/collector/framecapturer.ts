export class FrameCapturer {
  private targetWidth: number
  private targetHeight: number
  private offscreenCanvas: HTMLCanvasElement | null = null
  private offscreenCtx: CanvasRenderingContext2D | null = null

  constructor(targetWidth = 1280, targetHeight = 720) {
    this.targetWidth = targetWidth
    this.targetHeight = targetHeight
  }

  private getContext(): CanvasRenderingContext2D | null {
    if (!this.offscreenCanvas && typeof document !== "undefined") {
      this.offscreenCanvas = document.createElement("canvas")
      this.offscreenCanvas.width = this.targetWidth
      this.offscreenCanvas.height = this.targetHeight
      this.offscreenCtx = this.offscreenCanvas.getContext("2d", {
        willReadFrequently: false,
      })
    }
    return this.offscreenCtx
  }

  async capture(sourceCanvas: HTMLCanvasElement): Promise<Blob | null> {
    if (
      !sourceCanvas ||
      !sourceCanvas.width ||
      typeof document === "undefined"
    ) {
      return null
    }

    const ctx = this.getContext()
    if (!ctx || !this.offscreenCanvas) {
      return null
    }

    try {
      ctx.drawImage(
        sourceCanvas,
        0,
        0,
        sourceCanvas.width,
        sourceCanvas.height,
        0,
        0,
        this.targetWidth,
        this.targetHeight
      )

      return new Promise<Blob | null>((resolve) => {
        this.offscreenCanvas!.toBlob((blob) => {
          resolve(blob)
        }, "image/png")
      })
    } catch (e) {
      console.warn("[FrameCapturer] Capture error:", e)
      return null
    }
  }
}
