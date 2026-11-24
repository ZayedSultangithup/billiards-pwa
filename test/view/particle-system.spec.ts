import { ParticleSystem } from "../../src/view/particle-system"
import { Scene, InstancedMesh } from "three"

describe("ParticleSystem", () => {
  let scene: Scene
  let originalGetContext: any
  let pixels: Map<HTMLCanvasElement, Uint8ClampedArray>

  beforeEach(() => {
    scene = new Scene()
    scene.add = jest.fn()
    scene.remove = jest.fn()

    pixels = new Map()
    originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (contextId: string) {
      if (contextId === "2d") {
        const canvas = this as HTMLCanvasElement
        let data = pixels.get(canvas)
        const total = (canvas.width || 88) * (canvas.height || 44)
        if (!data || data.length !== total * 4) {
          data = new Uint8ClampedArray(total * 4)
          pixels.set(canvas, data)
        }
        const ctx = {
          fillStyle: "#000000",
          fillRect: (x: number, y: number, w: number, h: number) => {
            const isWhite = ctx.fillStyle === "#ffffff"
            const cw = canvas.width || 88
            for (let py = y; py < y + h; py++) {
              for (let px = x; px < x + w; px++) {
                const idx = (py * cw + px) * 4
                data![idx] = isWhite ? 255 : 0
                data![idx + 1] = isWhite ? 255 : 0
                data![idx + 2] = isWhite ? 255 : 0
                data![idx + 3] = 255
              }
            }
          },
          getImageData: (_x: number, _y: number, _w: number, _h: number) => ({
            data: pixels.get(canvas)!,
          }),
        }
        return ctx as any
      }
      return null
    }
  })

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext
  })

  it("should initialize with the correct number of particles based on background filtering", () => {
    const system = new ParticleSystem({
      tableWidth: 10,
      tableLength: 10,
      backgroundColor: "#000000",
    })

    const canvas = document.createElement("canvas")
    canvas.width = 10
    canvas.height = 10
    const ctx = canvas.getContext("2d")!

    // Fill background with black
    ctx.fillStyle = "#000000"
    ctx.fillRect(0, 0, 10, 10)

    // Draw 3 white pixels
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, 3, 1)

    system.initialise(scene, canvas)

    // Expected 3 particles because only 3 pixels are white (non-black)
    // The count property is private, but we can check the instancedMesh count
    const instancedMesh = (system as any).instancedMesh as InstancedMesh
    expect(instancedMesh.count).toBe(3)
    expect(scene.add).toHaveBeenCalledWith(instancedMesh)
  })

  it("should dispose of old particles when re-initialized", () => {
    const system = new ParticleSystem({
      tableWidth: 10,
      tableLength: 10,
      backgroundColor: "#000000",
    })

    const canvas = document.createElement("canvas")
    canvas.width = 10
    canvas.height = 10
    const ctx = canvas.getContext("2d")!
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, 10, 10)

    system.initialise(scene, canvas)
    const firstMesh = (system as any).instancedMesh

    system.initialise(scene, canvas)
    const secondMesh = (system as any).instancedMesh

    expect(scene.remove).toHaveBeenCalledWith(firstMesh)
    expect(firstMesh).not.toBe(secondMesh)
  })

  it("should dispose properly", () => {
    const system = new ParticleSystem()
    const canvas = document.createElement("canvas")
    canvas.width = 88
    canvas.height = 44
    system.initialise(scene, canvas)

    const mesh = (system as any).instancedMesh
    system.dispose()

    expect(scene.remove).toHaveBeenCalledWith(mesh)
    expect((system as any).instancedMesh).toBeNull()
  })
})
