/** iPhone, iPod, and iPad (which reports itself as a Mac with touch). False during SSR. */
export function isIOS(
	nav: Pick<Navigator, "platform" | "maxTouchPoints"> | undefined = globalThis.navigator,
): boolean {
	if (!nav) return false;
	return (
		/iP(hone|ad|od)/.test(nav.platform) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1)
	);
}
