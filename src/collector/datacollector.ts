import { Table } from "../model/table"
import { Ball } from "../model/ball"
import { Rules } from "../controller/rules/rules"
import { AimEvent } from "../events/aimevent"
import { Outcome, OutcomeType } from "../model/outcome"
import { TableGeometry } from "../view/tablegeometry"
import { PocketGeometry } from "../view/pocketgeometry"
import { R, maxPower } from "../model/physics/constants"
import { Session } from "../network/client/session"
import { FrameCapturer } from "./framecapturer"
import { DatasetStorage } from "./storage"
import { DatasetValidator } from "./validator"
import {
  TrainingDatasetItem,
  GameInfo,
  ShotRecord,
  BallState,
  BallTrajectory,
  ShotReward,
  StateAfterBall,
  Vector2D,
} from "./types"

export class DataCollector {
  private static instance: DataCollector | null = null

  public isEnabled: boolean = true
  public isPaused: boolean = false
  public lastError: string | null = null
  public captureMode: "keyframes" | "full" | "physics_only" = "keyframes"

  private storage: DatasetStorage
  private capturer: FrameCapturer

  private sessionId: string
  private gameId: string
  private shotIndex: number = 0

  private activeShot: ShotRecord | null = null
  private shotStartTimeMs: number = 0
  private lastSampleTimeMs: number = 0
  private readonly targetFps: number = 30
  private readonly sampleIntervalMs: number = 1000 / 30

  private previousVelocities: Map<number, Vector2D> = new Map()
  private processedOutcomeCount: number = 0
  private frameIdCounter: number = 1000

  private scoreBeforeShot: { [playerId: string]: number } = {
    player_1: 0,
    player_2: 0,
  }
  private currentShooter: "player_1" | "player_2" = "player_1"
  private inputSource: "human" | "agent" = "human"

  constructor() {
    this.storage = new DatasetStorage()
    this.capturer = new FrameCapturer(1280, 720)
    this.sessionId = `session_${Date.now().toString(36)}`
    this.gameId = `game_${Date.now().toString(36)}`
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("billiards_capture_mode")
      if (
        saved === "keyframes" ||
        saved === "full" ||
        saved === "physics_only"
      ) {
        this.captureMode = saved
      }
    }
  }

  setCaptureMode(mode: "keyframes" | "full" | "physics_only") {
    this.captureMode = mode
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("billiards_capture_mode", mode)
    }
    console.log(`[DataCollector] Capture mode set to ${mode}`)
  }

  static getInstance(): DataCollector {
    if (!this.instance) {
      this.instance = new DataCollector()
      this.instance.initStorage()
    }
    return this.instance
  }

  private async initStorage() {
    try {
      await this.storage.init()
    } catch (e: any) {
      this.lastError = `Storage init failed: ${e?.message || e}`
      console.warn("[DataCollector]", this.lastError)
    }
  }

  getStorage(): DatasetStorage {
    return this.storage
  }

  startNewGame(rulename: string): void {
    this.gameId = `game_${Date.now().toString(36)}`
    this.shotIndex = 0
    this.scoreBeforeShot = { player_1: 0, player_2: 0 }
    console.log(`[DataCollector] Started new game ${this.gameId} (${rulename})`)
  }

  // --- Coordinate Transformations (Engine centered -> Top-Left origin) ---

  private toTopLeftPos(x: number, y: number): Vector2D {
    const tableX = TableGeometry.tableX || R * 43
    const tableY = TableGeometry.tableY || R * 21
    return {
      x: Math.round((x + tableX) * 1000) / 1000,
      y: Math.round((tableY - y) * 1000) / 1000,
    }
  }

  private toTopLeftVel(vx: number, vy: number): Vector2D {
    return {
      x: Math.round(vx * 1000) / 1000,
      y: Math.round(-vy * 1000) / 1000,
    }
  }

  private getBallColor(ball: Ball): string {
    const label = ball.label
    if (label === undefined || label === 0) return "white"
    if (label === 8) return "black"
    const colors = [
      "white",
      "yellow",
      "blue",
      "red",
      "purple",
      "orange",
      "green",
      "maroon",
      "black",
      "yellow",
      "blue",
      "red",
      "purple",
      "orange",
      "green",
      "maroon",
    ]
    return colors[label] || "object"
  }

  private getBallType(ball: Ball): string {
    const label = ball.label
    if (label === undefined || label === 0) return "cue"
    if (label === 8) return "eight_ball"
    if (label >= 1 && label <= 7) return "solid"
    if (label >= 9 && label <= 15) return "stripe"
    return "object"
  }

  // --- Shot Lifecycle Hooks ---

  async onBeforeHit(
    table: Table,
    cueBall: Ball,
    aim: AimEvent,
    isBot: boolean,
    activePlayerSlot: 1 | 2,
    scores: { p1: number; p2: number },
    canvas: HTMLCanvasElement
  ): Promise<void> {
    if (!this.isEnabled || this.isPaused) return

    this.shotIndex++
    this.shotStartTimeMs = Date.now()
    this.lastSampleTimeMs = this.shotStartTimeMs
    this.currentShooter = activePlayerSlot === 1 ? "player_1" : "player_2"
    this.inputSource = isBot ? "agent" : "human"
    this.scoreBeforeShot = { player_1: scores.p1, player_2: scores.p2 }
    this.processedOutcomeCount = 0
    this.previousVelocities.clear()

    const shotId = `shot_${String(this.shotIndex).padStart(6, "0")}`
    const beforeFrameId = this.frameIdCounter++
    const imageBeforePath = `images/${this.gameId}/${shotId}/before.png`

    // 1. Capture before image
    if (this.captureMode !== "physics_only") {
      const beforeBlob = await this.capturer.capture(canvas)
      if (beforeBlob) {
        this.storage
          .saveImage(imageBeforePath, beforeBlob)
          .catch((e) => console.warn(e))
      }
    }

    // 2. Capture state_before
    const ballStates: BallState[] = table.balls.map((b) => {
      const pos = this.toTopLeftPos(b.pos.x, b.pos.y)
      const vel = this.toTopLeftVel(b.vel.x, b.vel.y)
      return {
        ball_id: b.id,
        number: b.label ?? (b === cueBall ? 0 : b.id),
        color: this.getBallColor(b),
        type: this.getBallType(b),
        position: pos,
        radius: Math.round(R * 1000) / 1000,
        velocity: vel,
        angular_velocity: Math.round(b.rvel.length() * 1000) / 1000,
        is_pocketed: !b.onTable(),
        is_active: b.onTable(),
      }
    })

    const cueBallPos = this.toTopLeftPos(cueBall.pos.x, cueBall.pos.y)
    const aimAngleDeg =
      Math.round((((((aim.angle * 180) / Math.PI) % 360) + 360) % 360) * 100) /
      100
    const powerNorm =
      Math.round(Math.min(1.0, aim.power / (maxPower || 1)) * 1000) / 1000

    // Top-left direction vector: dy is flipped
    const dirVec = {
      x: Math.round(Math.cos(aim.angle) * 10000) / 10000,
      y: Math.round(-Math.sin(aim.angle) * 10000) / 10000,
    }

    const impactPoint = {
      x: Math.round((aim.offset?.x ?? 0) * 1000) / 1000,
      y: Math.round((aim.offset?.y ?? 0) * 1000) / 1000,
    }

    const sideSpin = impactPoint.x
    const topSpin = impactPoint.y > 0 ? impactPoint.y : 0
    const backSpin = impactPoint.y < 0 ? -impactPoint.y : 0

    // Initialize initial trajectories
    const trajectories: BallTrajectory[] = table.balls.map((b) => ({
      ball_id: b.id,
      samples: [
        {
          frame_id: beforeFrameId,
          timestamp_ms: this.shotStartTimeMs,
          position: this.toTopLeftPos(b.pos.x, b.pos.y),
        },
      ],
      total_path_length: 0,
    }))

    this.activeShot = {
      shot_id: shotId,
      shot_index: this.shotIndex,
      player_id: this.currentShooter,
      start_timestamp_ms: this.shotStartTimeMs,
      end_timestamp_ms: 0,
      duration_ms: 0,
      state_before: {
        balls: ballStates,
        cue_state: {
          position: cueBallPos,
          velocity: { x: 0, y: 0 },
          is_active: true,
        },
        table_state: {
          balls_at_rest: true,
          remaining_balls: table.balls.filter((b) => b.onTable()).length,
        },
      },
      action: {
        aim_angle_degrees: aimAngleDeg,
        shot_power: powerNorm,
        direction_vector: dirVec,
        cue_impact_point: impactPoint,
        timestamp_ms: this.shotStartTimeMs,
        input_source: this.inputSource,
      },
      spin: {
        side_spin: sideSpin,
        top_spin: topSpin,
        back_spin: backSpin,
        spin_vector: impactPoint,
        unit: "normalized",
      },
      visual_data: {
        image_width: 1280,
        image_height: 720,
        color_space: "RGB",
        frame_rate: this.targetFps,
        image_before: {
          path: imageBeforePath,
          frame_id: beforeFrameId,
          timestamp_ms: this.shotStartTimeMs,
        },
        frames_during: [],
        image_after: {
          path: `images/${this.gameId}/${shotId}/after.png`,
          frame_id: 0,
          timestamp_ms: 0,
        },
      },
      physics_sequence: {
        sampling_rate_fps: this.targetFps,
        frames: [],
      },
      collisions: [],
      trajectories,
      pocket_events: [],
      outcome: {
        pocketed_ball_ids: [],
        scratch: false,
        foul: false,
        foul_type: null,
        score_before: { ...this.scoreBeforeShot },
        score_after: { ...this.scoreBeforeShot },
        turn_changed: false,
        next_player: this.currentShooter,
        game_won: false,
        game_lost: false,
        shot_success: false,
      },
      reward: {
        total: 0,
        components: {
          pocket_reward: 0,
          legal_first_contact_reward: 0,
          position_reward: 0,
          collision_reward: 0,
          foul_penalty: 0,
          scratch_penalty: 0,
          win_reward: 0,
          lose_penalty: 0,
        },
        reward_definition_version: "reward_v1",
      },
      state_after: {
        balls: [],
      },
      data_quality: {
        physics_source: "game_engine",
        image_physics_synchronized: true,
        missing_fields: [],
        is_valid: true,
      },
    }
  }

  onAdvance(table: Table, canvas: HTMLCanvasElement): void {
    if (!this.activeShot) return

    const now = Date.now()
    if (now - this.lastSampleTimeMs < this.sampleIntervalMs) {
      return
    }

    const elapsedFromShotStart = now - this.shotStartTimeMs
    const dt = (now - this.lastSampleTimeMs) / 1000
    this.lastSampleTimeMs = now
    const frameId = this.frameIdCounter++

    if (this.captureMode === "full") {
      this.captureDuringFrame(canvas, now, frameId)
    }
    this.samplePhysicsSequence(table, now, frameId, dt)
    this.updateTrajectories(table, now, frameId)
    this.processOutcomes(table, now, elapsedFromShotStart)
  }

  private captureDuringFrame(
    canvas: HTMLCanvasElement,
    now: number,
    frameId: number
  ): void {
    if (!this.activeShot) return
    const duringFrameIndex =
      this.activeShot.visual_data.frames_during.length + 1
    const framePath = `images/${this.gameId}/${this.activeShot.shot_id}/frame_${String(duringFrameIndex).padStart(4, "0")}.png`
    this.activeShot.visual_data.frames_during.push({
      path: framePath,
      frame_id: frameId,
      timestamp_ms: now,
    })

    this.capturer.capture(canvas).then((blob) => {
      if (blob) {
        this.storage.saveImage(framePath, blob).catch(() => {})
      }
    })
  }

  private samplePhysicsSequence(
    table: Table,
    now: number,
    frameId: number,
    dt: number
  ): void {
    if (!this.activeShot) return
    const frameBalls = table.balls.map((b) => {
      const pos = this.toTopLeftPos(b.pos.x, b.pos.y)
      const vel = this.toTopLeftVel(b.vel.x, b.vel.y)
      const prevVel = this.previousVelocities.get(b.id) || vel
      const acc = {
        x: Math.round(((vel.x - prevVel.x) / (dt || 0.033)) * 10) / 10,
        y: Math.round(((vel.y - prevVel.y) / (dt || 0.033)) * 10) / 10,
      }
      this.previousVelocities.set(b.id, vel)

      return {
        ball_id: b.id,
        position: pos,
        velocity: vel,
        acceleration: acc,
        angular_velocity: Math.round(b.rvel.length() * 1000) / 1000,
        is_pocketed: !b.onTable(),
      }
    })

    this.activeShot.physics_sequence.frames.push({
      frame_id: frameId,
      timestamp_ms: now,
      balls: frameBalls,
    })
  }

  private updateTrajectories(table: Table, now: number, frameId: number): void {
    if (!this.activeShot) return
    for (const b of table.balls) {
      const traj = this.activeShot.trajectories.find((t) => t.ball_id === b.id)
      if (traj) {
        const currentPos = this.toTopLeftPos(b.pos.x, b.pos.y)
        const lastSample = traj.samples[traj.samples.length - 1]
        if (lastSample) {
          const dx = currentPos.x - lastSample.position.x
          const dy = currentPos.y - lastSample.position.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          traj.total_path_length =
            Math.round((traj.total_path_length + dist) * 100) / 100
        }
        traj.samples.push({
          frame_id: frameId,
          timestamp_ms: now,
          position: currentPos,
        })
      }
    }
  }

  private processOutcomes(
    table: Table,
    now: number,
    elapsedFromShotStart: number
  ): void {
    if (!this.activeShot) return
    while (this.processedOutcomeCount < table.outcome.length) {
      const outcome = table.outcome[this.processedOutcomeCount++]
      this.recordOutcome(outcome, now, elapsedFromShotStart)
    }
  }

  private recordOutcome(
    outcome: Outcome,
    now: number,
    elapsedFromShotStart: number
  ): void {
    if (!this.activeShot) return
    if (
      outcome.type === OutcomeType.Collision &&
      outcome.ballA &&
      outcome.ballB
    ) {
      const colPos = this.toTopLeftPos(outcome.ballA.pos.x, outcome.ballA.pos.y)
      const velA = this.toTopLeftVel(outcome.ballA.vel.x, outcome.ballA.vel.y)
      const velB = this.toTopLeftVel(outcome.ballB.vel.x, outcome.ballB.vel.y)
      this.activeShot.collisions.push({
        collision_id: this.activeShot.collisions.length + 1,
        collision_type: "ball_ball",
        ball_a_id: outcome.ballA.id,
        ball_b_id: outcome.ballB.id,
        timestamp_ms: now,
        time_from_shot_start_ms: elapsedFromShotStart,
        position: colPos,
        normal: { x: 1, y: 0 },
        pre_collision_velocity: { ball_a: velA, ball_b: velB },
        impulse: Math.round(outcome.incidentSpeed * 100) / 100,
      })
    } else if (outcome.type === OutcomeType.Cushion && outcome.ballA) {
      const colPos = this.toTopLeftPos(outcome.ballA.pos.x, outcome.ballA.pos.y)
      const velA = this.toTopLeftVel(outcome.ballA.vel.x, outcome.ballA.vel.y)
      this.activeShot.collisions.push({
        collision_id: this.activeShot.collisions.length + 1,
        collision_type: "ball_rail",
        ball_a_id: outcome.ballA.id,
        ball_b_id: outcome.cushion ? `rail_${outcome.cushion}` : "rail",
        timestamp_ms: now,
        time_from_shot_start_ms: elapsedFromShotStart,
        position: colPos,
        normal: { x: 0, y: 1 },
        pre_collision_velocity: { ball_a: velA, ball_b: { x: 0, y: 0 } },
        impulse: Math.round(outcome.incidentSpeed * 100) / 100,
      })
    } else if (outcome.type === OutcomeType.Pot && outcome.ballA) {
      const potPos = this.toTopLeftPos(outcome.ballA.pos.x, outcome.ballA.pos.y)
      const potVel = this.toTopLeftVel(outcome.ballA.vel.x, outcome.ballA.vel.y)
      this.activeShot.pocket_events.push({
        event_id: this.activeShot.pocket_events.length + 1,
        ball_id: outcome.ballA.id,
        pocket_id: 1,
        timestamp_ms: now,
        entry_position: potPos,
        entry_velocity: potVel,
      })
    }
  }

  async onStationary(
    table: Table,
    rules: Rules,
    _nextControllerName: string,
    canvas: HTMLCanvasElement
  ): Promise<void> {
    if (!this.activeShot) return

    const now = Date.now()
    const shot = this.activeShot
    this.activeShot = null // Release active shot pointer

    shot.end_timestamp_ms = now
    shot.duration_ms = now - shot.start_timestamp_ms
    const afterFrameId = this.frameIdCounter++

    // 1. Capture after image
    shot.visual_data.image_after.frame_id = afterFrameId
    shot.visual_data.image_after.timestamp_ms = now

    if (this.captureMode !== "physics_only") {
      const afterBlob = await this.capturer.capture(canvas)
      if (afterBlob) {
        this.storage
          .saveImage(shot.visual_data.image_after.path, afterBlob)
          .catch(() => {})
      }
    }

    // 2. State After
    shot.state_after = { balls: this.buildStateAfter(table) }

    // 3. Outcomes
    const pottedBalls = Outcome.pots(table.outcome)
    const pottedIds = pottedBalls.map((b) => b.id)
    const isScratch = Outcome.isCueBallPotted(table.cueball, table.outcome)
    const foulReason = rules.foulReason(table.outcome)
    const isFoul = isScratch || foulReason !== null

    const isGameEnd = rules.isEndOfGame(table.outcome)
    const isBreakPart = rules.isPartOfBreak(table.outcome)

    const session = Session.getInstance()
    const { p1: s1, p2: s2 } = session.orderedScoresForHud()
    const scoreAfter = { player_1: s1, player_2: s2 }

    const isTurnChanged = !isBreakPart || isFoul
    const nextPlayer = this.computeNextPlayer(isTurnChanged)

    const gameWon = isGameEnd && !isFoul
    const gameLost = isGameEnd && isFoul

    shot.outcome = {
      pocketed_ball_ids: pottedIds,
      scratch: isScratch,
      foul: isFoul,
      foul_type: foulReason || (isScratch ? "scratch" : null),
      score_before: { ...this.scoreBeforeShot },
      score_after: scoreAfter,
      turn_changed: isTurnChanged,
      next_player: nextPlayer,
      game_won: gameWon,
      game_lost: gameLost,
      shot_success: isBreakPart && !isFoul,
    }

    // 4. Rewards
    shot.reward = this.computeRewards(
      table,
      pottedBalls,
      isFoul,
      isScratch,
      gameWon,
      gameLost
    )

    // 5. Construct Table & Game specification
    const gameInfo = this.buildGameInfo(table, rules, isGameEnd, scoreAfter)

    // 6. Complete dataset record & validation
    const item: TrainingDatasetItem = {
      dataset_version: "1.0.0",
      game_id: this.gameId,
      session_id: this.sessionId,
      game: gameInfo,
      shot,
    }

    const validation = DatasetValidator.validate(item)
    shot.data_quality = {
      physics_source: "game_engine",
      image_physics_synchronized: true,
      missing_fields: validation.missingFields,
      is_valid: validation.isValid,
    }

    // 7. Persist shot
    try {
      await this.storage.saveShot(item)
      console.log(
        `[DataCollector] Saved ${shot.shot_id} (${validation.isValid ? "VALID" : "INVALID"})`
      )
    } catch (e: any) {
      this.lastError = `Failed to save shot ${shot.shot_id}: ${e?.message || e}`
      console.error("[DataCollector]", this.lastError)
    }
  }

  private buildStateAfter(table: Table): StateAfterBall[] {
    return table.balls.map((b) => ({
      ball_id: b.id,
      number: b.label ?? (b === table.cueball ? 0 : b.id),
      color: this.getBallColor(b),
      type: this.getBallType(b),
      position: this.toTopLeftPos(b.pos.x, b.pos.y),
      velocity: { x: 0, y: 0 },
      is_pocketed: !b.onTable(),
      is_active: b.onTable(),
    }))
  }

  private computeNextPlayer(isTurnChanged: boolean): string {
    if (!isTurnChanged) return this.currentShooter
    return this.currentShooter === "player_1" ? "player_2" : "player_1"
  }

  private determineGroup(pType: number, isP1: boolean): string | null {
    if (pType === 1) return isP1 ? "solids" : "stripes"
    if (pType === 2) return isP1 ? "stripes" : "solids"
    return null
  }

  private determineGamePhase(remainingCount: number): string {
    if (this.shotIndex === 1) return "break"
    if (remainingCount > 10) return "early_game"
    if (remainingCount > 4) return "mid_game"
    return "end_game"
  }

  private computeRewards(
    table: Table,
    pottedBalls: Ball[],
    isFoul: boolean,
    isScratch: boolean,
    gameWon: boolean,
    gameLost: boolean
  ): ShotReward {
    const legalObjectPots = pottedBalls.filter(
      (b) => b !== table.cueball
    ).length
    const pocketReward = legalObjectPots * 8.0
    const firstCol = Outcome.firstCollision(table.outcome)
    const legalFirstContactReward = firstCol && firstCol.ballB ? 2.0 : 0.0
    const positionReward = table.cueball.onTable() ? 1.0 : 0.0
    const foulPenalty = isFoul ? -5.0 : 0.0
    const scratchPenalty = isScratch ? -10.0 : 0.0
    const winReward = gameWon ? 50.0 : 0.0
    const losePenalty = gameLost ? -50.0 : 0.0

    const totalReward =
      pocketReward +
      legalFirstContactReward +
      positionReward +
      foulPenalty +
      scratchPenalty +
      winReward +
      losePenalty

    return {
      total: Math.round(totalReward * 100) / 100,
      components: {
        pocket_reward: pocketReward,
        legal_first_contact_reward: legalFirstContactReward,
        position_reward: positionReward,
        collision_reward: 0,
        foul_penalty: foulPenalty,
        scratch_penalty: scratchPenalty,
        win_reward: winReward,
        lose_penalty: losePenalty,
      },
      reward_definition_version: "reward_v1",
    }
  }

  private buildGameInfo(
    table: Table,
    rules: Rules,
    isGameEnd: boolean,
    scoreAfter: { player_1: number; player_2: number }
  ): GameInfo {
    const tableWidth = Math.round(TableGeometry.tableX * 2 * 1000) / 1000
    const tableHeight = Math.round(TableGeometry.tableY * 2 * 1000) / 1000

    const pocketsSpec = PocketGeometry.pocketCenters.map((p, idx) => {
      const pos = this.toTopLeftPos(p.pos.x, p.pos.y)
      return {
        pocket_id: idx + 1,
        position: [pos.x, pos.y] as [number, number],
        radius: Math.round(p.radius * 1000) / 1000,
      }
    })

    const session = Session.getInstance()
    const p1Group = this.determineGroup(session.p1type, true)
    const p2Group = this.determineGroup(session.p1type, false)

    const remainingCount = table.balls.filter(
      (b) => b.onTable() && b !== table.cueball
    ).length
    const gamePhase = this.determineGamePhase(remainingCount)

    return {
      mode: rules.rulename,
      ruleset: `standard_${rules.rulename}`,
      status: isGameEnd ? "completed" : "in_progress",
      game_phase: gamePhase,
      current_player: this.currentShooter,
      table: {
        width: tableWidth,
        height: tableHeight,
        unit: "game_world_units",
        coordinate_origin: "top_left",
        pockets: pocketsSpec,
      },
      players: [
        { player_id: "player_1", assigned_group: p1Group },
        { player_id: "player_2", assigned_group: p2Group },
      ],
      score: scoreAfter,
    }
  }
}
