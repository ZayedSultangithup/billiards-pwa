import { DataCollector } from "../collector/datacollector"
import { DatasetExporter } from "../collector/export"
import { DatasetValidator } from "../collector/validator"
import { DatasetStats } from "../collector/storage"
import { id } from "../utils/dom"

export class DatasetManagerView {
  private collector: DataCollector
  private exporter: DatasetExporter
  private modal: HTMLElement | null = null
  private aiModal: HTMLElement | null = null
  private pollIntervalId: number | null = null

  constructor() {
    this.collector = DataCollector.getInstance()
    this.exporter = new DatasetExporter(this.collector.getStorage())
    this.initDOMElements()
  }

  private initDOMElements() {
    this.modal = id("datasetModal")
    this.aiModal = id("aiModal")

    // Dataset Manager button
    const dmBtn = id("datasetManagerBtn")
    if (dmBtn) {
      dmBtn.onclick = () => this.openModal()
    }

    // AI Opponent button
    const aiBtn = id("botOpponentBtn")
    if (aiBtn) {
      aiBtn.onclick = () => this.openAiModal()
    }

    // Close buttons
    const closeBtn = id("closeDatasetModal")
    if (closeBtn) {
      closeBtn.onclick = () => this.closeModal()
    }

    const closeAiBtn = id("closeAiModal")
    if (closeAiBtn) {
      closeAiBtn.onclick = () => this.closeAiModal()
    }

    // Modal overlay click to close
    if (this.modal) {
      this.modal.onclick = (e) => {
        if (e.target === this.modal) this.closeModal()
      }
    }

    if (this.aiModal) {
      this.aiModal.onclick = (e) => {
        if (e.target === this.aiModal) this.closeAiModal()
      }
    }

    // Action handlers
    const toggleCollectBtn = id("dmToggleCollect")
    if (toggleCollectBtn) {
      toggleCollectBtn.onclick = () => {
        this.collector.isEnabled = !this.collector.isEnabled
        this.updateStatsUI()
      }
    }

    const togglePauseBtn = id("dmTogglePause")
    if (togglePauseBtn) {
      togglePauseBtn.onclick = () => {
        this.collector.isPaused = !this.collector.isPaused
        this.updateStatsUI()
      }
    }

    const exportAllBtn = id("dmExportAll")
    if (exportAllBtn) {
      exportAllBtn.onclick = () => this.handleExportAll()
    }

    const exportGameBtn = id("dmExportGame")
    if (exportGameBtn) {
      exportGameBtn.onclick = () => this.handleExportGame()
    }

    const exportJsonBtn = id("dmExportJson")
    if (exportJsonBtn) {
      exportJsonBtn.onclick = () => this.handleExportJson()
    }

    const validateBtn = id("dmValidate")
    if (validateBtn) {
      validateBtn.onclick = () => this.handleValidate()
    }

    const clearBtn = id("dmClear")
    if (clearBtn) {
      clearBtn.onclick = () => this.handleClear()
    }

    const captureModeSelect = id("dmCaptureMode") as HTMLSelectElement | null
    if (captureModeSelect) {
      captureModeSelect.value = this.collector.captureMode
      captureModeSelect.onchange = () => {
        const val = captureModeSelect.value as
          "keyframes" | "full" | "physics_only"
        this.collector.setCaptureMode(val)
      }
    }

    // Bind AI Mode options
    this.initAiOptions()
  }

  private initAiOptions() {
    const aiSolo = id("aiOptionSolo")
    const aiClawBreak = id("aiOptionClawBreak")
    const aiTheFarJaw = id("aiOptionTheFarJaw")
    const aiBotVsBot = id("aiOptionBotVsBot")
    const ruleSelect = id("aiRuleSelect") as HTMLSelectElement | null

    const startMatch = (botParam: string | null) => {
      const rule = ruleSelect?.value || "eightball"
      const url = new URL(window.location.href)
      url.searchParams.set("ruletype", rule)
      if (botParam) {
        url.searchParams.set("bot", botParam)
      } else {
        url.searchParams.delete("bot")
      }
      url.searchParams.delete("state")
      window.location.href = url.toString()
    }

    if (aiSolo) aiSolo.onclick = () => startMatch(null)
    if (aiClawBreak) aiClawBreak.onclick = () => startMatch("ClawBreak")
    if (aiTheFarJaw) aiTheFarJaw.onclick = () => startMatch("TheFarJaw")
    if (aiBotVsBot) aiBotVsBot.onclick = () => startMatch("TheFarJaw")
  }

  openModal() {
    if (!this.modal) return
    this.modal.classList.add("open")
    const captureModeSelect = id("dmCaptureMode") as HTMLSelectElement | null
    if (captureModeSelect) {
      captureModeSelect.value = this.collector.captureMode
    }
    this.updateStatsUI()
    this.pollIntervalId = window.setInterval(() => this.updateStatsUI(), 2000)
  }

  closeModal() {
    if (!this.modal) return
    this.modal.classList.remove("open")
    if (this.pollIntervalId !== null) {
      clearInterval(this.pollIntervalId)
      this.pollIntervalId = null
    }
  }

  openAiModal() {
    if (!this.aiModal) return
    this.aiModal.classList.add("open")
  }

  closeAiModal() {
    if (!this.aiModal) return
    this.aiModal.classList.remove("open")
  }

  private getStatusInfo(isCollecting: boolean, isPaused: boolean) {
    if (!isCollecting) {
      return { className: "status-pill disabled", text: "Collection Disabled" }
    }
    if (isPaused) {
      return { className: "status-pill paused", text: "Collection Paused" }
    }
    return { className: "status-pill recording", text: "Actively Recording" }
  }

  private updateStatusPill(isCollecting: boolean, isPaused: boolean) {
    const pill = id("dmStatusPill")
    const pillText = id("dmStatusText")
    if (!pill || !pillText) return
    const info = this.getStatusInfo(isCollecting, isPaused)
    pill.className = info.className
    pillText.textContent = info.text
  }

  private updateCountMetrics(
    games: number,
    shots: number,
    frames: number,
    bytes: number
  ) {
    const gamesEl = id("dmGamesCount")
    if (gamesEl) gamesEl.textContent = String(games)

    const shotsEl = id("dmShotsCount")
    if (shotsEl) shotsEl.textContent = String(shots)

    const framesEl = id("dmFramesCount")
    if (framesEl) framesEl.textContent = String(frames)

    const sizeEl = id("dmDatasetSize")
    if (sizeEl) {
      const mb = (bytes / (1024 * 1024)).toFixed(1)
      sizeEl.textContent = `${mb} MB`
    }
  }

  private updateMetaInfo(stats: DatasetStats) {
    const metaEl = id("dmMetaInfo")
    if (!metaEl) return
    const quotaMb = (stats.storageQuotaBytes / (1024 * 1024)).toFixed(0)
    const usedMb = (stats.storageUsedBytes / (1024 * 1024)).toFixed(1)
    const lastSaveStr = stats.lastSaveTimeMs
      ? new Date(stats.lastSaveTimeMs).toLocaleTimeString()
      : "None"
    const errStr = stats.lastError
      ? `<br><span style="color:#f87171">Error: ${stats.lastError}</span>`
      : ""
    metaEl.innerHTML = `<strong>Storage:</strong> ${usedMb} MB used of ${quotaMb} MB available quota<br><strong>Last Save:</strong> ${lastSaveStr}${errStr}`
  }

  private async updateStatsUI() {
    const stats = await this.collector
      .getStorage()
      .getStats(
        this.collector.isEnabled,
        this.collector.isPaused,
        this.collector.lastError
      )

    this.updateStatusPill(stats.isCollecting, stats.isPaused)

    const pauseBtn = id("dmTogglePause")
    if (pauseBtn) {
      pauseBtn.textContent = stats.isPaused ? "▶ Resume" : "⏸ Pause"
    }

    const collectBtn = id("dmToggleCollect")
    if (collectBtn) {
      collectBtn.textContent = stats.isCollecting ? "Disable" : "Enable"
    }

    this.updateCountMetrics(
      stats.gamesCount,
      stats.shotsCount,
      stats.framesCount,
      stats.totalBytes
    )
    this.updateMetaInfo(stats)
  }

  private showProgress(text: string, pct: number) {
    const progBox = id("dmProgress")
    const progBar = id("dmProgressBar")
    const progText = id("dmProgressText")
    if (progBox && progBar && progText) {
      progBox.style.display = "block"
      progBar.style.width = `${pct}%`
      progText.textContent = `${text} (${pct}%)`
      if (pct >= 100) {
        setTimeout(() => {
          progBox.style.display = "none"
        }, 1500)
      }
    }
  }

  private async handleExportAll() {
    try {
      this.showProgress("Starting complete dataset export...", 5)
      await this.exporter.exportAllAsZip((pct, msg) => {
        this.showProgress(msg, pct)
      })
    } catch (e: any) {
      alert("Export failed: " + (e?.message || e))
      this.showProgress("Failed", 0)
    }
  }

  private async handleExportGame() {
    try {
      const shots = await this.collector.getStorage().getAllShots()
      if (shots.length === 0) {
        alert("No shots to export")
        return
      }
      const lastGameId = shots[shots.length - 1].game_id
      this.showProgress(`Exporting game ${lastGameId}...`, 5)
      await this.exporter.exportGameAsZip(lastGameId, (pct, msg) => {
        this.showProgress(msg, pct)
      })
    } catch (e: any) {
      alert("Export failed: " + (e?.message || e))
    }
  }

  private async handleExportJson() {
    try {
      const json = await this.exporter.exportMetadataAsJson()
      DatasetExporter.downloadJson(json, "dataset_metadata.json")
    } catch (e: any) {
      alert("Export failed: " + (e?.message || e))
    }
  }

  private async handleValidate() {
    const shots = await this.collector.getStorage().getAllShots()
    if (shots.length === 0) {
      alert("Dataset is empty. Play a shot first!")
      return
    }

    let validCount = 0
    let invalidCount = 0
    const sampleErrors: string[] = []

    for (const item of shots) {
      const res = DatasetValidator.validate(item)
      if (res.isValid) {
        validCount++
      } else {
        invalidCount++
        if (sampleErrors.length < 3) {
          sampleErrors.push(
            `${item.shot.shot_id}: ${res.missingFields.concat(res.errors).join(", ")}`
          )
        }
      }
    }

    let report = `Dataset Validation Result:\nTotal Shots: ${shots.length}\nValid: ${validCount}\nInvalid: ${invalidCount}`
    if (invalidCount > 0) {
      report += `\n\nSample Issues:\n${sampleErrors.join("\n")}`
    } else {
      report += `\n\nAll shots 100% compliant with DataFormat.json specification!`
    }
    alert(report)
  }

  private async handleClear() {
    const confirmed = confirm(
      "Are you sure you want to completely clear the local dataset?\n\nThis will permanently delete all recorded games, shots, and frame images from your device."
    )
    if (!confirmed) return

    try {
      await this.collector.getStorage().clearDataset()
      await this.updateStatsUI()
      alert("Dataset cleared successfully.")
    } catch (e: any) {
      alert("Failed to clear dataset: " + (e?.message || e))
    }
  }
}
