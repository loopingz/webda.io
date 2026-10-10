/**
 * Implemented by models listed in `SyncService.models`: `_rev` is the object revision the SyncService maintains,
 * declared so the compiler puts it in the model schema
 */
export interface Syncable {
  /**
   * Revision, incremented by the SyncService on every write
   * @readOnly
   */
  _rev?: number;
}
