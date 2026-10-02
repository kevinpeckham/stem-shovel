/**
 * Pages whose title, intro and tips are a "copy" user doc edited in the app
 * (docs/page-copy.md): the doc's slug and the page it belongs to. The
 * seed script makes the doc from scripts/user-docs/<slug>.md, the page
 * renders it with `pageCopy()` and falls back to that file until then.
 */
export const PAGE_COPY: Record<string, string> = {
	"looper-page": "/looper",
	"drum-machine-page": "/drum-machine",
	"piano-page": "/piano",
	"tuner-page": "/tuner",
	"metronome-page": "/metronome",
};
