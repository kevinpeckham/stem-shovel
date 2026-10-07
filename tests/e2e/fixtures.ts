import { test as base, expect, type Page } from "@playwright/test";

/**
 * The browser tests' fixtures: a page signed in as the Screenshot Bot
 * (the `preview_token` cookie from `PREVIEW_AUTH_TOKEN`; the suite skips
 * without it), collecting page errors so a spec can assert none happened.
 * The engines are reached through the dev server's `window.__*` hooks
 * (`__studio`, `__looper`, `__drums`, `__piano`, `__metronome`, `__inputs`),
 * which exist on the dev build only.
 */
export interface BotPage {
	page: Page;
	errors: string[];
}

export const test = base.extend<BotPage>({
	// Playwright insists on the destructuring pattern here, used or not.
	// oxlint-disable-next-line no-empty-pattern
	errors: async ({}, use) => {
		await use([]);
	},
	page: async ({ page, context, baseURL, errors }, use) => {
		const token = process.env.PREVIEW_AUTH_TOKEN;
		test.skip(!token, "PREVIEW_AUTH_TOKEN is not set: run through varlock on the dev VM");
		await context.addCookies([{ name: "preview_token", value: token!, url: baseURL! }]);
		page.on("pageerror", (e) => errors.push(e.message.slice(0, 300)));
		await use(page);
	},
});

export { expect };

/** A hook on the dev server's window, typed loosely: the engines are runes classes the test only pokes. */
export type Hooked = Window & Record<`__${string}`, any>;

/**
 * The engine's state read through a hook, in one round trip: `fn` runs in
 * the page, handed `[window, arg]` (the window as a handle, since the CSP
 * forbids evaluating a string; `arg` because a closure over a test variable
 * does not travel).
 */
export async function hooked<T, A = undefined>(
	page: Page,
	fn: (pair: [Hooked, A]) => T,
	arg?: A,
): Promise<T> {
	const w = await page.evaluateHandle(() => window);
	try {
		return (await page.evaluate(fn as (pair: [Window, A]) => T, [w, arg] as never)) as T;
	} finally {
		await w.dispose();
	}
}

/**
 * Navigates and waits for the page to hydrate: the network quiet and, when
 * named, the engine's dev hook on the window. A click on a server-rendered
 * button before hydration does nothing, which is the usual flaky failure.
 */
export async function open(page: Page, path: string, hook?: `__${string}`): Promise<void> {
	await page.goto(path, { waitUntil: "networkidle" });
	if (hook) await page.waitForFunction((h) => !!(window as unknown as Hooked)[h], hook);
}

/** Polls until `fn`, run in the page with `[window, arg]`, is true; fails after `ms`. */
export async function until<A = undefined>(
	page: Page,
	fn: (pair: [Hooked, A]) => boolean,
	opts: { arg?: A; ms?: number } = {},
): Promise<void> {
	const w = await page.evaluateHandle(() => window);
	try {
		await page.waitForFunction(fn as (pair: [Window, A]) => boolean, [w, opts.arg] as never, {
			timeout: opts.ms ?? 15_000,
		});
	} finally {
		await w.dispose();
	}
}

/** Deletes every Studio song the bot has, through the app, so a spec leaves nothing behind. */
export async function deleteStudioSongs(page: Page): Promise<void> {
	for (let i = 0; i < 10; i++) {
		if (!(await page.locator("section[aria-label=Songs] li > details").count())) return;
		await page.getByRole("button", { name: "Song actions" }).click();
		const del = page.getByRole("button", { name: "Delete song" });
		if (!(await del.count())) {
			await page.keyboard.press("Escape");
			return;
		}
		page.once("dialog", (d) => d.accept());
		await del.click();
		await page.waitForTimeout(1200);
	}
}
