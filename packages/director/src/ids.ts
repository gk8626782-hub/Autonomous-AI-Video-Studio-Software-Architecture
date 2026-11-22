/** Stable ids, so planning the same project again replaces the earlier plan instead of piling up. */
export const sceneIdFor = (projectId: string, sceneIndex: number): string => `scene:${projectId}:${sceneIndex}`;

export const shotIdFor = (projectId: string, sceneIndex: number, shotIndex: number): string =>
  `shot:${projectId}:${sceneIndex}:${shotIndex}`;
