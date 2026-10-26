import { EQ_BAND_SPECS, EQ_BANDS } from "#lib/constants/playbackEq.js";
import { DEFAULT_PLAYBACK_EQ, type PlaybackEqSettings } from "#lib/val/PlaybackEqSchema.js";
import { eqFreq, eqGain } from "./normalizePlaybackEq.js";

/**
 * The playback EQ as a query string, for the download with the EQ applied
 * (`GET /api/sessions/[id]/eq.mp3`): the page writes it, the endpoint reads
 * it back. `hp=1` for the high-pass, `<band>=<dB>` for a gain and
 * `<band>f=<Hz>` for a center, each only when it is not the default, so
 * flat settings make an empty query.
 */
export function eqSearchParams(settings: PlaybackEqSettings): URLSearchParams {
	const p = new URLSearchParams();
	if (settings.highPass) p.set("hp", "1");
	for (const band of EQ_BANDS) {
		if (settings[band].gain !== 0) p.set(band, String(settings[band].gain));
		if (settings[band].freq !== EQ_BAND_SPECS[band].defaultFreq)
			p.set(`${band}f`, String(settings[band].freq));
	}
	return p;
}

function num(v: string | null): unknown {
	return v === null || v === "" ? undefined : Number(v);
}

/** The settings a query carries; anything missing is the default, anything malformed is ignored. */
export function parseEqSearchParams(params: URLSearchParams): PlaybackEqSettings {
	const s = structuredClone(DEFAULT_PLAYBACK_EQ) as PlaybackEqSettings;
	s.highPass = params.get("hp") === "1";
	for (const band of EQ_BANDS) {
		s[band] = {
			gain: eqGain(num(params.get(band))),
			freq: eqFreq(band, num(params.get(`${band}f`))),
		};
	}
	return s;
}
