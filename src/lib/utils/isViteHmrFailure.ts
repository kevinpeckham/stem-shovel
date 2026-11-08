/** The shape of a Sentry event this needs: its exceptions and their frames' files. */
type SentryEventLike = {
	exception?: {
		values?: {
			type?: string;
			value?: string;
			stacktrace?: { frames?: { filename?: string }[] };
		}[];
	};
};

/** Chrome's, Firefox's and Safari's words for reading `default` of an undefined module. */
const READING_DEFAULT = /reading 'default'|\.default is undefined|evaluating '[^']*\.default'/;
/** Vite's dev client, which drives every hot update. */
const VITE_CLIENT = "/@vite/client";

/**
 * Whether an event is a hot update the dev server could not apply: Vite failed
 * to re-import the edited module (a syntax error mid-edit, a bad import, the dev
 * server restarting) and handed `undefined` to the component's HMR accept
 * handler, which read its `default`. Only errors thrown under Vite's client
 * match; the same message from the app's own code is a real fault.
 */
export function isViteHmrFailure(event: SentryEventLike): boolean {
	return (event.exception?.values ?? []).some(
		(exception) =>
			exception.type === "TypeError" &&
			READING_DEFAULT.test(exception.value ?? "") &&
			(exception.stacktrace?.frames ?? []).some((frame) => frame.filename?.includes(VITE_CLIENT)),
	);
}

/** The app module whose hot update failed (the first frame outside Vite's client), if the stack names one. */
export function hmrFailedModule(event: SentryEventLike): string | undefined {
	for (const exception of event.exception?.values ?? []) {
		const file = exception.stacktrace?.frames?.find(
			(frame) => frame.filename?.startsWith("/") && !frame.filename.includes(VITE_CLIENT),
		)?.filename;
		if (file) return file;
	}
	return undefined;
}
