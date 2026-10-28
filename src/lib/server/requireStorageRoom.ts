import { background } from "#lib/server/background.js";
import { storageRoom } from "#lib/server/data.js";
import { checkStorage } from "#lib/server/notifications.js";
import { formatBytes } from "#lib/utils/formatBytes.js";
import { error } from "@sveltejs/kit";

/**
 * A reserve route's storage check: 409 when the account has no room for
 * `sizeBytes` more. The reservation may cross a warning line, so the
 * account's admins hear after the response (notifications.ts, checkStorage).
 */
export async function requireStorageRoom(accountId: string, sizeBytes: number): Promise<void> {
	const room = await storageRoom(accountId, sizeBytes);
	if (!room.ok) {
		error(
			409,
			`This account's storage is full: ${formatBytes(room.used)} of ${formatBytes(room.limit)}. Remove files you no longer need, or ask about more storage.`,
		);
	}
	background(() => checkStorage(accountId));
}
