import { DatasetValidator } from "../../src/collector/validator"
import { TrainingDatasetItem } from "../../src/collector/types"
import { DatasetExporter } from "../../src/collector/export"
import { DataCollector } from "../../src/collector/datacollector"

describe("DatasetValidator", () => {
  const validMockItem: TrainingDatasetItem = {
    dataset_version: "1.0.0",
    game_id: "game_000001",
    session_id: "session_000001",
    game: {
      mode: "8_ball",
      ruleset: "standard_8_ball",
      status: "in_progress",
      game_phase: "mid_game",
      current_player: "player_1",
      table: {
        width: 1000,
        height: 500,
        unit: "game_world_units",
        coordinate_origin: "top_left",
        pockets: [
          { pocket_id: 1, position: [0, 0], radius: 28 },
          { pocket_id: 2, position: [500, 0], radius: 28 },
          { pocket_id: 3, position: [1000, 0], radius: 28 },
          { pocket_id: 4, position: [0, 500], radius: 28 },
          { pocket_id: 5, position: [500, 500], radius: 28 },
          { pocket_id: 6, position: [1000, 500], radius: 28 },
        ],
      },
      players: [
        { player_id: "player_1", assigned_group: "solids" },
        { player_id: "player_2", assigned_group: "stripes" },
      ],
      score: { player_1: 2, player_2: 1 },
    },
    shot: {
      shot_id: "shot_000042",
      shot_index: 42,
      player_id: "player_1",
      start_timestamp_ms: 125000,
      end_timestamp_ms: 128450,
      duration_ms: 3450,
      state_before: {
        balls: [
          {
            ball_id: 0,
            number: 0,
            color: "white",
            type: "cue",
            position: { x: 180.0, y: 250.0 },
            radius: 10.0,
            velocity: { x: 0.0, y: 0.0 },
            angular_velocity: 0.0,
            is_pocketed: false,
            is_active: true,
          },
        ],
        cue_state: {
          position: { x: 180.0, y: 250.0 },
          velocity: { x: 0.0, y: 0.0 },
          is_active: true,
        },
        table_state: {
          balls_at_rest: true,
          remaining_balls: 3,
        },
      },
      action: {
        aim_angle_degrees: 35.5,
        shot_power: 0.75,
        direction_vector: { x: 0.8141, y: 0.5807 },
        cue_impact_point: { x: 0.0, y: 0.0 },
        timestamp_ms: 125120,
        input_source: "agent",
      },
      spin: {
        side_spin: 0.2,
        top_spin: 0.4,
        back_spin: 0.0,
        spin_vector: { x: 0.2, y: 0.4 },
        unit: "normalized",
      },
      visual_data: {
        image_width: 1280,
        image_height: 720,
        color_space: "RGB",
        frame_rate: 30,
        image_before: {
          path: "images/game_000001/shot_000042/before.png",
          frame_id: 3750,
          timestamp_ms: 125000,
        },
        frames_during: [
          {
            path: "images/game_000001/shot_000042/frame_0001.png",
            frame_id: 3751,
            timestamp_ms: 125033,
          },
        ],
        image_after: {
          path: "images/game_000001/shot_000042/after.png",
          frame_id: 3853,
          timestamp_ms: 128450,
        },
      },
      physics_sequence: {
        sampling_rate_fps: 30,
        frames: [
          {
            frame_id: 3751,
            timestamp_ms: 125033,
            balls: [
              {
                ball_id: 0,
                position: { x: 185.0, y: 253.0 },
                velocity: { x: 150.0, y: 90.0 },
                acceleration: { x: 0.0, y: 0.0 },
                angular_velocity: 0.0,
                is_pocketed: false,
              },
            ],
          },
        ],
      },
      collisions: [],
      trajectories: [
        {
          ball_id: 0,
          samples: [
            {
              frame_id: 3751,
              timestamp_ms: 125033,
              position: { x: 185.0, y: 253.0 },
            },
          ],
          total_path_length: 240.5,
        },
      ],
      pocket_events: [],
      outcome: {
        pocketed_ball_ids: [1],
        scratch: false,
        foul: false,
        foul_type: null,
        score_before: { player_1: 2, player_2: 1 },
        score_after: { player_1: 3, player_2: 1 },
        turn_changed: false,
        next_player: "player_1",
        game_won: false,
        game_lost: false,
        shot_success: true,
      },
      reward: {
        total: 10.0,
        components: {
          pocket_reward: 8.0,
          legal_first_contact_reward: 2.0,
          position_reward: 1.0,
          collision_reward: 0.0,
          foul_penalty: 0.0,
          scratch_penalty: 0.0,
          win_reward: 0.0,
          lose_penalty: 0.0,
        },
        reward_definition_version: "reward_v1",
      },
      state_after: {
        balls: [
          {
            ball_id: 0,
            number: 0,
            color: "white",
            type: "cue",
            position: { x: 350.0, y: 300.0 },
            velocity: { x: 0.0, y: 0.0 },
            is_pocketed: false,
            is_active: true,
          },
        ],
      },
      data_quality: {
        physics_source: "game_engine",
        image_physics_synchronized: true,
        missing_fields: [],
        is_valid: true,
      },
    },
  }

  it("validates a compliant training dataset item", () => {
    const result = DatasetValidator.validate(validMockItem)
    expect(result.isValid).toBe(true)
    expect(result.missingFields).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
  })

  it("flags missing critical fields", () => {
    const invalidItem = JSON.parse(JSON.stringify(validMockItem))
    delete invalidItem.dataset_version
    delete invalidItem.shot.action
    delete invalidItem.game.table.pockets

    const result = DatasetValidator.validate(invalidItem)
    expect(result.isValid).toBe(false)
    expect(result.missingFields).toContain("dataset_version")
    expect(result.missingFields).toContain("shot.action")
    expect(result.missingFields).toContain("game.table.pockets")
  })

  it("exports metadata as valid JSON string", async () => {
    const mockStorage: any = {
      getAllShots: async () => [validMockItem],
    }
    const exporter = new DatasetExporter(mockStorage)
    const jsonStr = await exporter.exportMetadataAsJson()
    const parsed = JSON.parse(jsonStr)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].shot.shot_id).toBe("shot_000042")
  })

  it("validates keyframes-only mode with empty frames_during", () => {
    const keyframesItem = JSON.parse(JSON.stringify(validMockItem))
    keyframesItem.shot.visual_data.frames_during = []
    const result = DatasetValidator.validate(keyframesItem)
    expect(result.isValid).toBe(true)
    expect(result.missingFields).toHaveLength(0)
  })
})

describe("DataCollector Capture Mode", () => {
  it("defaults to keyframes mode and updates mode correctly", () => {
    const collector = DataCollector.getInstance()
    expect(collector.captureMode).toBe("keyframes")

    collector.setCaptureMode("physics_only")
    expect(collector.captureMode).toBe("physics_only")

    collector.setCaptureMode("full")
    expect(collector.captureMode).toBe("full")

    collector.setCaptureMode("keyframes")
    expect(collector.captureMode).toBe("keyframes")
  })
})
