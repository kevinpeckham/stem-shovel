/**
 * Notifications, replicator's keyed list with timeouts on top: `notify()` for
 * a passing message ("Song settings saved") that evaporates on its own,
 * `upsert`/`sync` for keyed banners that track a condition, `dismiss` for
 * the close button. Rendered once by Notifications.svelte in the root layout,
 * fixed to a corner, so nothing on the page moves.
 */
export type NotificationKind = "info" | "success" | "error";

export interface Notification {
	id: string;
	message: string;
	kind: NotificationKind;
	/** Milliseconds until it goes away by itself; null = stays until dismissed. */
	timeout: number | null;
	dismissable: boolean;
}

export interface NotifyOptions {
	id?: string;
	kind?: NotificationKind;
	timeout?: number | null;
	dismissable?: boolean;
}

const DEFAULT_TIMEOUT: Record<NotificationKind, number | null> = {
	success: 4000,
	info: 6000,
	error: null,
};

let counter = 0;

export class NotificationsStore {
	items: Notification[] = $state([]);
	#timers = new Map<string, ReturnType<typeof setTimeout>>();

	/** Add or replace the entry with the same id, (re)starting its timeout. */
	upsert = (notification: Notification): void => {
		const idx = this.items.findIndex((n) => n.id === notification.id);
		this.items =
			idx === -1
				? [...this.items, notification]
				: this.items.map((n, i) => (i === idx ? notification : n));
		this.#schedule(notification);
	};

	dismiss = (id: string): void => {
		const timer = this.#timers.get(id);
		if (timer) clearTimeout(timer);
		this.#timers.delete(id);
		if (!this.items.some((n) => n.id === id)) return;
		this.items = this.items.filter((n) => n.id !== id);
	};

	/** A passing message; returns its id. */
	notify = (message: string, opts: NotifyOptions = {}): string => {
		const kind = opts.kind ?? "success";
		const id = opts.id ?? `n${++counter}`;
		this.upsert({
			id,
			message,
			kind,
			timeout: opts.timeout === undefined ? DEFAULT_TIMEOUT[kind] : opts.timeout,
			dismissable: opts.dismissable ?? true,
		});
		return id;
	};

	/** Keep a keyed entry present iff `active`. */
	sync = (
		id: string,
		active: boolean,
		message: string,
		opts: Omit<NotifyOptions, "id"> = {},
	): void => {
		const found = this.items.some((n) => n.id === id);
		if (active && !found) this.notify(message, { ...opts, id, timeout: opts.timeout ?? null });
		else if (!active && found) this.dismiss(id);
	};

	#schedule(n: Notification) {
		const existing = this.#timers.get(n.id);
		if (existing) clearTimeout(existing);
		if (n.timeout === null) return;
		this.#timers.set(
			n.id,
			setTimeout(() => this.dismiss(n.id), n.timeout),
		);
	}
}

export const notifications = new NotificationsStore();

/** Shorthand for the common case. */
export const notify = notifications.notify;
