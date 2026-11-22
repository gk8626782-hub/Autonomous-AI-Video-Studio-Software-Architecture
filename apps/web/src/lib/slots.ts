/**
 * CSS selectors for slots and sections. The validation rules in @avs/board use
 * the same format, so a rule can point the screen at the exact slot to blink.
 */
export const slotPath = (name: string): string => `[data-slot="${name}"]`;
export const sectionPath = (name: string): string => `[data-section="${name}"]`;
