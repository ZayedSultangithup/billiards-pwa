import { TrainingDatasetItem, GameInfo, ShotRecord } from "./types"

export class DatasetValidator {
  static validate(item: TrainingDatasetItem): {
    isValid: boolean
    missingFields: string[]
    errors: string[]
  } {
    const missingFields: string[] = []
    const errors: string[] = []

    this.validateTopLevel(item, missingFields)
    if (!item.game || !item.shot) {
      return {
        isValid: false,
        missingFields,
        errors: ["Missing critical game or shot object"],
      }
    }

    this.validateGame(item.game, missingFields, errors)
    this.validateShot(item.shot, missingFields, errors)

    const isValid = missingFields.length === 0 && errors.length === 0
    return { isValid, missingFields, errors }
  }

  private static validateTopLevel(
    item: TrainingDatasetItem,
    missing: string[]
  ): void {
    if (!item.dataset_version) missing.push("dataset_version")
    if (!item.game_id) missing.push("game_id")
    if (!item.session_id) missing.push("session_id")
    if (!item.game) missing.push("game")
    if (!item.shot) missing.push("shot")
  }

  private static validateGame(
    g: GameInfo,
    missing: string[],
    errors: string[]
  ): void {
    if (!g.mode) missing.push("game.mode")
    if (!g.ruleset) missing.push("game.ruleset")
    if (!g.table) {
      missing.push("game.table")
    } else {
      if (typeof g.table.width !== "number" || isNaN(g.table.width))
        errors.push("Invalid table.width")
      if (typeof g.table.height !== "number" || isNaN(g.table.height))
        errors.push("Invalid table.height")
      if (!Array.isArray(g.table.pockets)) missing.push("game.table.pockets")
    }
    if (!Array.isArray(g.players) || g.players.length === 0)
      missing.push("game.players")
    if (!g.score) missing.push("game.score")
  }

  private static validateShot(
    s: ShotRecord,
    missing: string[],
    errors: string[]
  ): void {
    if (!s.shot_id) missing.push("shot.shot_id")
    if (typeof s.shot_index !== "number") missing.push("shot.shot_index")
    if (!s.player_id) missing.push("shot.player_id")

    this.validateStateBefore(s, missing)
    this.validateAction(s, missing, errors)
    this.validateSpin(s, missing)
    this.validateVisualAndPhysics(s, missing)
    this.validateOutcomeAndReward(s, missing, errors)
    if (!s.state_after || !Array.isArray(s.state_after.balls))
      missing.push("shot.state_after.balls")
  }

  private static validateStateBefore(s: ShotRecord, missing: string[]): void {
    if (!s.state_before) {
      missing.push("shot.state_before")
      return
    }
    if (!Array.isArray(s.state_before.balls))
      missing.push("shot.state_before.balls")
    if (!s.state_before.cue_state) missing.push("shot.state_before.cue_state")
    if (!s.state_before.table_state)
      missing.push("shot.state_before.table_state")
  }

  private static validateAction(
    s: ShotRecord,
    missing: string[],
    errors: string[]
  ): void {
    if (!s.action) {
      missing.push("shot.action")
      return
    }
    if (
      typeof s.action.aim_angle_degrees !== "number" ||
      isNaN(s.action.aim_angle_degrees)
    ) {
      errors.push("Invalid action.aim_angle_degrees")
    }
    if (typeof s.action.shot_power !== "number" || isNaN(s.action.shot_power)) {
      errors.push("Invalid action.shot_power")
    }
    if (!s.action.direction_vector) missing.push("shot.action.direction_vector")
    if (!s.action.cue_impact_point) missing.push("shot.action.cue_impact_point")
    if (!s.action.input_source) missing.push("shot.action.input_source")
  }

  private static validateSpin(s: ShotRecord, missing: string[]): void {
    if (!s.spin) {
      missing.push("shot.spin")
      return
    }
    if (typeof s.spin.side_spin !== "number")
      missing.push("shot.spin.side_spin")
    if (typeof s.spin.top_spin !== "number") missing.push("shot.spin.top_spin")
    if (typeof s.spin.back_spin !== "number")
      missing.push("shot.spin.back_spin")
  }

  private static validateVisualAndPhysics(
    s: ShotRecord,
    missing: string[]
  ): void {
    if (!s.visual_data) {
      missing.push("shot.visual_data")
    } else {
      if (!s.visual_data.image_before?.path)
        missing.push("shot.visual_data.image_before.path")
      if (!s.visual_data.image_after?.path)
        missing.push("shot.visual_data.image_after.path")
      if (!Array.isArray(s.visual_data.frames_during))
        missing.push("shot.visual_data.frames_during")
    }

    if (!s.physics_sequence || !Array.isArray(s.physics_sequence.frames)) {
      missing.push("shot.physics_sequence")
    }
    if (!Array.isArray(s.collisions)) missing.push("shot.collisions")
    if (!Array.isArray(s.trajectories)) missing.push("shot.trajectories")
    if (!Array.isArray(s.pocket_events)) missing.push("shot.pocket_events")
  }

  private static validateOutcomeAndReward(
    s: ShotRecord,
    missing: string[],
    errors: string[]
  ): void {
    if (!s.outcome) {
      missing.push("shot.outcome")
    } else {
      if (!Array.isArray(s.outcome.pocketed_ball_ids))
        missing.push("shot.outcome.pocketed_ball_ids")
      if (typeof s.outcome.scratch !== "boolean")
        missing.push("shot.outcome.scratch")
      if (typeof s.outcome.foul !== "boolean") missing.push("shot.outcome.foul")
    }

    if (!s.reward) {
      missing.push("shot.reward")
    } else {
      if (typeof s.reward.total !== "number" || isNaN(s.reward.total))
        errors.push("Invalid reward.total")
      if (!s.reward.components) missing.push("shot.reward.components")
    }
  }
}
