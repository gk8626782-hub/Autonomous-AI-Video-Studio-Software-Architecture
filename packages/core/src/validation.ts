/**
 * Validation registry for the red-alert system.
 *
 * Every required slot registers a rule. The Generate button is enabled only
 * when no rule reports an issue. Rules are pure functions over project state.
 * A rule that throws is treated as invalid (fail closed).
 */
export interface ValidationRule {
  readonly id: string;
  /** Grouping key, for example "project:<id>" or "char:<id>". */
  readonly scope: string;
  /** i18n key for the message shown next to the invalid slot. */
  readonly messageKey: string;
  /** DOM selector or path used to scroll to and blink the slot. */
  readonly domPath?: string;
  /** Lower numbers are reported first. Defaults to 0. */
  readonly order?: number;
  readonly isValid: () => boolean;
}

export interface ValidationIssue {
  readonly id: string;
  readonly scope: string;
  readonly messageKey: string;
  readonly domPath?: string;
}

export class ValidationRegistry {
  private readonly rules = new Map<string, ValidationRule>();
  private readonly listeners = new Set<() => void>();

  /** Registers a rule and returns a function that unregisters it. */
  register(rule: ValidationRule): () => void {
    if (this.rules.has(rule.id)) {
      throw new Error(`Validation rule already registered: ${rule.id}`);
    }
    this.rules.set(rule.id, rule);
    this.notify();
    return () => this.unregister(rule.id);
  }

  unregister(id: string): void {
    if (this.rules.delete(id)) {
      this.notify();
    }
  }

  /** Returns all current issues, optionally limited to one scope. */
  evaluate(scope?: string): ValidationIssue[] {
    const ordered = [...this.rules.values()]
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => scope === undefined || rule.scope === scope)
      .sort((a, b) => (a.rule.order ?? 0) - (b.rule.order ?? 0) || a.index - b.index);

    const issues: ValidationIssue[] = [];
    for (const { rule } of ordered) {
      if (!runCheck(rule)) {
        issues.push({
          id: rule.id,
          scope: rule.scope,
          messageKey: rule.messageKey,
          domPath: rule.domPath,
        });
      }
    }
    return issues;
  }

  isValid(scope?: string): boolean {
    return this.evaluate(scope).length === 0;
  }

  /** The first invalid slot, used to scroll to it and blink it red. */
  firstIssue(scope?: string): ValidationIssue | undefined {
    return this.evaluate(scope)[0];
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}

function runCheck(rule: ValidationRule): boolean {
  try {
    return rule.isValid();
  } catch {
    return false;
  }
}
