import { ValidationRegistry } from "@avs/core";
import type { ValidationRule } from "@avs/core";
import type { Capability } from "@avs/providers";
import type {
  CharacterRecord,
  EnvironmentRecord,
  MediaStatus,
  StorageLevel,
  VoiceSlot,
} from "@avs/storage";
import { REQUIRED_VIEWS, isVoiceComplete } from "./slots";

/** The Generate button is enabled only when every rule in this scope is valid. */
export const GENERATE_SCOPE = "project";

export interface BoardSnapshot {
  readonly storyPassed: boolean;
  readonly durationMin: number | null;
  readonly characters: readonly CharacterRecord[];
  readonly environments: readonly EnvironmentRecord[];
  /** Status of every media file used by a slot. A missing entry counts as missing. */
  readonly mediaStatus: ReadonlyMap<string, MediaStatus>;
  readonly configuredCapabilities: ReadonlySet<Capability>;
  readonly requiredCapabilities: ReadonlySet<Capability>;
  readonly storageLevel: StorageLevel | "unknown";
}

type Statuses = ReadonlyMap<string, MediaStatus>;

export function isMediaReady(mediaId: string | null, statuses: Statuses): boolean {
  return mediaId !== null && statuses.get(mediaId) === "ok";
}

export function isVoiceReady(slot: VoiceSlot, statuses: Statuses): boolean {
  if (!slot.locked || !isVoiceComplete(slot)) {
    return false;
  }
  return slot.mode === "upload" ? isMediaReady(slot.sampleRef, statuses) : true;
}

export function isPanoramaReady(environment: EnvironmentRecord, statuses: Statuses): boolean {
  return (
    isMediaReady(environment.panoramaRef, statuses) &&
    environment.seamScore !== null &&
    environment.seamScore <= 1
  );
}

const ORDER = {
  story: 0,
  duration: 1,
  environments: 2,
  character: 10,
  environment: 1_000,
  provider: 2_000,
  storage: 3_000,
} as const;

/**
 * Keeps the validation registry in step with the board. Call sync() whenever
 * characters or environments are added or removed. Whether a rule passes is
 * always read from the latest snapshot, so slot changes need no re-sync.
 */
export class BoardValidation {
  private readonly active = new Map<string, () => void>();

  constructor(
    private readonly registry: ValidationRegistry,
    private readonly getSnapshot: () => BoardSnapshot,
  ) {}

  sync(): void {
    const rules = this.buildRules(this.getSnapshot());
    const wanted = new Set(rules.map((rule) => rule.id));

    for (const [id, unregister] of this.active) {
      if (!wanted.has(id)) {
        unregister();
        this.active.delete(id);
      }
    }
    for (const rule of rules) {
      if (!this.active.has(rule.id)) {
        this.active.set(rule.id, this.registry.register(rule));
      }
    }
  }

  dispose(): void {
    for (const unregister of this.active.values()) {
      unregister();
    }
    this.active.clear();
  }

  private buildRules(snapshot: BoardSnapshot): ValidationRule[] {
    const rules: ValidationRule[] = [];
    const add = (rule: Omit<ValidationRule, "scope">): void => {
      rules.push({ scope: GENERATE_SCOPE, ...rule });
    };

    add({
      id: "story:passed",
      messageKey: "validation.story.passed",
      domPath: '[data-section="story"]',
      order: ORDER.story,
      isValid: () => this.getSnapshot().storyPassed,
    });

    add({
      id: "story:duration",
      messageKey: "validation.story.duration",
      domPath: '[data-section="story"]',
      order: ORDER.duration,
      isValid: () => {
        const { durationMin } = this.getSnapshot();
        return durationMin !== null && durationMin > 0;
      },
    });

    add({
      id: "board:environments",
      messageKey: "validation.board.environments",
      domPath: '[data-section="environments"]',
      order: ORDER.environments,
      isValid: () => this.getSnapshot().environments.length > 0,
    });

    snapshot.characters.forEach((character, characterIndex) => {
      const id = character.id;
      const base = ORDER.character + characterIndex * 10;
      const find = (): CharacterRecord | undefined =>
        this.getSnapshot().characters.find((candidate) => candidate.id === id);

      REQUIRED_VIEWS.forEach((view, viewIndex) => {
        add({
          id: `char:${id}:view:${view}`,
          messageKey: "validation.char.view",
          domPath: `[data-slot="char-${id}-view-${view}"]`,
          order: base + viewIndex,
          isValid: () => {
            const current = find();
            return current !== undefined && isMediaReady(current.viewSlots[view], this.getSnapshot().mediaStatus);
          },
        });
      });

      add({
        id: `char:${id}:views_locked`,
        messageKey: "validation.char.viewsLocked",
        domPath: `[data-slot="char-${id}-views-lock"]`,
        order: base + 5,
        isValid: () => find()?.viewsLocked === true,
      });

      add({
        id: `char:${id}:voice`,
        messageKey: "validation.char.voice",
        domPath: `[data-slot="char-${id}-voice"]`,
        order: base + 6,
        isValid: () => {
          const current = find();
          return current !== undefined && isVoiceReady(current.voiceSlot, this.getSnapshot().mediaStatus);
        },
      });
    });

    snapshot.environments.forEach((environment, index) => {
      const id = environment.id;
      add({
        id: `env:${id}:panorama`,
        messageKey: "validation.env.panorama",
        domPath: `[data-slot="env-${id}-panorama"]`,
        order: ORDER.environment + index,
        isValid: () => {
          const current = this.getSnapshot().environments.find((candidate) => candidate.id === id);
          return current !== undefined && isPanoramaReady(current, this.getSnapshot().mediaStatus);
        },
      });
    });

    [...snapshot.requiredCapabilities].sort().forEach((capability, index) => {
      add({
        id: `provider:${capability}`,
        messageKey: "validation.provider.missing",
        domPath: '[data-section="providers"]',
        order: ORDER.provider + index,
        isValid: () => this.getSnapshot().configuredCapabilities.has(capability),
      });
    });

    add({
      id: "device:storage",
      messageKey: "validation.device.storage",
      domPath: '[data-section="storage"]',
      order: ORDER.storage,
      isValid: () => this.getSnapshot().storageLevel !== "block",
    });

    return rules;
  }
}
