import type { DialogueLine, SceneRecord, ShotRecord, StudioDatabase } from "@avs/storage";
import { sceneIdFor } from "./ids";
import type { DirectorPlan } from "./types";

export interface StoredPlan {
  readonly scenes: SceneRecord[];
  readonly shots: ShotRecord[];
}

/**
 * Saves a plan as scene and shot records. Saving replaces the earlier plan of
 * the project, so planning again never leaves old shots behind.
 */
export class DirectorStore {
  constructor(private readonly db: StudioDatabase) {}

  async save(plan: DirectorPlan): Promise<void> {
    const scenes: SceneRecord[] = [];
    const shots: ShotRecord[] = [];

    for (const scene of plan.scenes) {
      const sceneId = sceneIdFor(plan.projectId, scene.index);
      const dialogue: DialogueLine[] = [];

      for (const shot of scene.shots) {
        for (const line of shot.lines) {
          if (line.kind === "dialogue" && line.speakerId !== null) {
            dialogue.push({ characterId: line.speakerId, text: line.text });
          }
        }
        shots.push({
          id: shot.id,
          sceneId,
          projectId: plan.projectId,
          index: shot.index,
          yaw: shot.yaw,
          pitch: shot.pitch,
          fov: shot.fov,
          shotType: shot.shotType,
          durationMs: shot.durationMs,
          motion: shot.motion,
          clipRef: null,
          plan: shot,
        });
      }

      scenes.push({
        id: sceneId,
        projectId: plan.projectId,
        index: scene.index,
        summary: scene.summary,
        characterIds: [...scene.characterIds],
        environmentId: scene.environmentId,
        dialogue,
        status: "pending",
        cacheKey: null,
      });
    }

    await this.db.transaction("rw", [this.db.scenes, this.db.shots], async () => {
      await this.db.shots.where("projectId").equals(plan.projectId).delete();
      await this.db.scenes.where("projectId").equals(plan.projectId).delete();
      await this.db.scenes.bulkAdd(scenes);
      await this.db.shots.bulkAdd(shots);
    });
  }

  async load(projectId: string): Promise<StoredPlan> {
    const scenes = await this.db.scenes.where("projectId").equals(projectId).toArray();
    const shots = await this.db.shots.where("projectId").equals(projectId).toArray();
    scenes.sort((a, b) => a.index - b.index);
    shots.sort((a, b) => a.sceneId.localeCompare(b.sceneId) || a.index - b.index);
    return { scenes, shots };
  }
}
