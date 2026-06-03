// Extract the newly-created Model3D object id from a publish tx's objectChanges
// (plan-001 U5, D-080). Mirrors the objectChanges-reading pattern in
// ModelDetailPage / LaunchCollectionPage (dodges indexer lag). Pure + testable.

export interface ObjectChangeLike {
  type?: string;
  objectType?: string;
  objectId?: string;
}

/** The created `…::model3d::Model3D` object id, or null if none is present. */
export function extractCreatedModelId(changes: ReadonlyArray<ObjectChangeLike>): string | null {
  const created = changes.find(
    (c) =>
      c.type === 'created' &&
      typeof c.objectType === 'string' &&
      c.objectType.endsWith('::model3d::Model3D'),
  );
  return created?.objectId ?? null;
}
