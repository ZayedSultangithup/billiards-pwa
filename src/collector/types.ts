export interface Vector2D {
  x: number
  y: number
}

export interface TablePocketSpec {
  pocket_id: number
  position: [number, number]
  radius: number
}

export interface TableSpec {
  width: number
  height: number
  unit: string
  coordinate_origin: string
  pockets: TablePocketSpec[]
}

export interface PlayerSpec {
  player_id: string
  assigned_group: string | null
}

export interface GameInfo {
  mode: string
  ruleset: string
  status: string
  game_phase: string
  current_player: string
  table: TableSpec
  players: PlayerSpec[]
  score: { [playerId: string]: number }
}

export interface BallState {
  ball_id: number
  number: number
  color: string
  type: string
  position: Vector2D
  radius: number
  velocity: Vector2D
  angular_velocity: number
  is_pocketed: boolean
  is_active: boolean
}

export interface CueState {
  position: Vector2D
  velocity: Vector2D
  is_active: boolean
}

export interface TableState {
  balls_at_rest: boolean
  remaining_balls: number
}

export interface StateBefore {
  balls: BallState[]
  cue_state: CueState
  table_state: TableState
}

export interface ShotAction {
  aim_angle_degrees: number
  shot_power: number
  direction_vector: Vector2D
  cue_impact_point: Vector2D
  timestamp_ms: number
  input_source: "human" | "agent"
}

export interface ShotSpin {
  side_spin: number
  top_spin: number
  back_spin: number
  spin_vector: Vector2D
  unit: string
}

export interface VisualFrameRef {
  path: string
  frame_id: number
  timestamp_ms: number
}

export interface VisualData {
  image_width: number
  image_height: number
  color_space: string
  frame_rate: number
  image_before: VisualFrameRef
  frames_during: VisualFrameRef[]
  image_after: VisualFrameRef
}

export interface PhysicsFrameBall {
  ball_id: number
  position: Vector2D
  velocity: Vector2D
  acceleration: Vector2D
  angular_velocity: number
  is_pocketed: boolean
}

export interface PhysicsFrame {
  frame_id: number
  timestamp_ms: number
  balls: PhysicsFrameBall[]
}

export interface PhysicsSequence {
  sampling_rate_fps: number
  frames: PhysicsFrame[]
}

export interface CollisionRecord {
  collision_id: number
  collision_type: "ball_ball" | "ball_rail" | "ball_knuckle" | string
  ball_a_id: number | string
  ball_b_id: number | string
  timestamp_ms: number
  time_from_shot_start_ms: number
  position: Vector2D
  normal: Vector2D
  pre_collision_velocity: {
    ball_a: Vector2D
    ball_b: Vector2D
  }
  impulse: number
}

export interface TrajectorySample {
  frame_id: number
  timestamp_ms: number
  position: Vector2D
}

export interface BallTrajectory {
  ball_id: number
  samples: TrajectorySample[]
  total_path_length: number
}

export interface PocketEvent {
  event_id: number
  ball_id: number
  pocket_id: number
  timestamp_ms: number
  entry_position: Vector2D
  entry_velocity: Vector2D
}

export interface ShotOutcome {
  pocketed_ball_ids: number[]
  scratch: boolean
  foul: boolean
  foul_type: string | null
  score_before: { [playerId: string]: number }
  score_after: { [playerId: string]: number }
  turn_changed: boolean
  next_player: string
  game_won: boolean
  game_lost: boolean
  shot_success: boolean
}

export interface RewardComponents {
  pocket_reward: number
  legal_first_contact_reward: number
  position_reward: number
  collision_reward: number
  foul_penalty: number
  scratch_penalty: number
  win_reward: number
  lose_penalty: number
}

export interface ShotReward {
  total: number
  components: RewardComponents
  reward_definition_version: string
}

export interface StateAfterBall {
  ball_id: number
  number: number
  color: string
  type: string
  position: Vector2D
  velocity: Vector2D
  is_pocketed: boolean
  is_active: boolean
}

export interface StateAfter {
  balls: StateAfterBall[]
}

export interface DataQuality {
  physics_source: string
  image_physics_synchronized: boolean
  missing_fields: string[]
  is_valid: boolean
}

export interface ShotRecord {
  shot_id: string
  shot_index: number
  player_id: string
  start_timestamp_ms: number
  end_timestamp_ms: number
  duration_ms: number
  state_before: StateBefore
  action: ShotAction
  spin: ShotSpin
  visual_data: VisualData
  physics_sequence: PhysicsSequence
  collisions: CollisionRecord[]
  trajectories: BallTrajectory[]
  pocket_events: PocketEvent[]
  outcome: ShotOutcome
  reward: ShotReward
  state_after: StateAfter
  data_quality: DataQuality
}

export interface TrainingDatasetItem {
  dataset_version: string
  game_id: string
  session_id: string
  game: GameInfo
  shot: ShotRecord
}

export interface DatasetStats {
  gamesCount: number
  shotsCount: number
  framesCount: number
  totalBytes: number
  storageQuotaBytes: number
  storageUsedBytes: number
  isCollecting: boolean
  isPaused: boolean
  lastSaveTimeMs: number | null
  lastError: string | null
}
