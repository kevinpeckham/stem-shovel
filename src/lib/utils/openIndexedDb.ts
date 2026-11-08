/**
 * An IndexedDB database opened at version 1, `upgrade` creating its stores
 * the first time. Rejects on an error or a blocked open, so a caller that
 * must never throw (audio/alignmentFeaturesCache.ts) catches once.
 */
export function openIndexedDb(
	name: string,
	upgrade: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const open = indexedDB.open(name, 1);
		open.onupgradeneeded = () => upgrade(open.result);
		open.onsuccess = () => resolve(open.result);
		open.onerror = () => reject(open.error);
		open.onblocked = () => reject(new Error(`${name} is blocked`));
	});
}
