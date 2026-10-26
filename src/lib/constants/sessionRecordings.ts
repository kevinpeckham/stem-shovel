import type { SessionDevice } from "../val/SessionRecordingSchema";

/**
 * Session recordings (docs/uploads-and-blob.md, "Sessions"): the band's
 * practice and show recordings, uploaded by members and kept on the
 * account for everyone in it to hear and download. One audio file each,
 * whatever a phone or recorder hands over (the demo formats), played in
 * the browser as uploaded.
 */
export const SESSION_KINDS = ["practice", "show"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const SESSION_KIND_LABELS: Record<SessionKind, string> = {
	practice: "Practice",
	show: "Show",
};

/** The input device's label, by its stored key; "" (unset) has none. */
export const SESSION_DEVICE_LABELS: Record<SessionDevice, string> = {
	soundboard: "Soundboard",
	"field-rig": "Field Recording Rig",
	phone: "Phone",
	handheld: "Handheld Recorder (non-phone)",
	other: "Other",
	"": "",
};

/** The input device select's options, in order (the unset "—" is the select's own first option). */
export const SESSION_DEVICE_OPTIONS: { value: Exclude<SessionDevice, "">; label: string }[] = [
	{ value: "soundboard", label: SESSION_DEVICE_LABELS.soundboard },
	{ value: "field-rig", label: SESSION_DEVICE_LABELS["field-rig"] },
	{ value: "phone", label: SESSION_DEVICE_LABELS.phone },
	{ value: "handheld", label: SESSION_DEVICE_LABELS.handheld },
	{ value: "other", label: SESSION_DEVICE_LABELS.other },
];

/** A session can run an evening: the ceiling is a stem's four times over. */
export const SESSION_MAX_BYTES = 2 * 1024 * 1024 * 1024;
/** Sessions an account keeps at most; a band that records every week is years from it. */
export const MAX_SESSIONS_PER_ACCOUNT = 1000;
