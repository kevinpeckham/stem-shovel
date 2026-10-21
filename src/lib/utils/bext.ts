/**
 * The Broadcast Wave `bext` chunk (EBU Tech 3285, version 2): what makes
 * a WAV a file a DAW can place where it was recorded. `timeReference` is
 * the first sample's position in samples at the file's own rate since
 * midnight; Logic ("Move to Original Record Position"), Pro Tools
 * ("Spot" to the original timestamp), Cubase, Reaper and Ardour all read
 * it, so a clip exported with its start there lands at its start
 * (docs/daw-interop-plan.md). The loudness fields carry the clip's
 * measurement when there is one (hundredths of LU and dBTP; 0x7fff is
 * "not set"). Text fields are ASCII by the standard: anything outside
 * Latin-1 becomes "?". `readBext` walks a RIFF file's chunks for the
 * tests and for an import that wants to honor a timestamp.
 */
export interface BextInfo {
	description?: string;
	originator?: string;
	originatorReference?: string;
	/** When the file was made; today when absent. */
	date?: Date;
	/** The first sample's position, in samples at the file's rate. */
	timeReference: number;
	loudness?: { integrated: number | null; truePeak: number };
	/** One line per coding step, as the standard writes them ("A=PCM,F=48000,W=24,M=stereo,T=…"). */
	codingHistory?: string;
}

const NOT_SET = 0x7fff;
const FIXED = 602;

/** The whole chunk: "bext", its size, the 602 fixed bytes and the coding history, padded to an even length. */
export function bextChunk(info: BextInfo): Uint8Array {
	const history = latin1((info.codingHistory ?? "") + (info.codingHistory ? "\r\n" : ""));
	const size = FIXED + history.length;
	const out = new Uint8Array(8 + size + (size % 2));
	const v = new DataView(out.buffer);
	const text = (at: number, s: string, max: number) => {
		const bytes = latin1(s);
		out.set(bytes.subarray(0, max), at);
	};
	text(0, "bext", 4);
	v.setUint32(4, size, true);
	const base = 8;
	text(base, info.description ?? "", 256);
	text(base + 256, info.originator ?? "", 32);
	text(base + 288, info.originatorReference ?? "", 32);
	const d = info.date ?? new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	text(base + 320, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, 10);
	text(base + 330, `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`, 8);
	const ref = Math.max(0, Math.round(info.timeReference));
	v.setUint32(base + 338, ref % 2 ** 32, true);
	v.setUint32(base + 342, Math.floor(ref / 2 ** 32), true);
	v.setUint16(base + 346, 2, true);
	// 64 bytes of UMID stay zero; then the five loudness fields.
	const hundredths = (x: number | null | undefined) =>
		x === null || x === undefined || !Number.isFinite(x)
			? NOT_SET
			: Math.max(-32768, Math.min(32767, Math.round(x * 100)));
	v.setInt16(base + 412, hundredths(info.loudness?.integrated), true);
	v.setInt16(base + 414, NOT_SET, true);
	v.setInt16(base + 416, hundredths(info.loudness ? info.loudness.truePeak : null), true);
	v.setInt16(base + 418, NOT_SET, true);
	v.setInt16(base + 420, NOT_SET, true);
	out.set(history, base + FIXED);
	return out;
}

export interface BextRead {
	description: string;
	originator: string;
	originatorReference: string;
	originationDate: string;
	originationTime: string;
	timeReference: number;
	version: number;
	/** LU, or null when not set. */
	loudnessValue: number | null;
	/** dBTP, or null when not set. */
	maxTruePeakLevel: number | null;
	codingHistory: string;
}

/** The `bext` chunk of a RIFF WAVE file, or null when there is none. */
export function readBext(file: ArrayBuffer | Uint8Array): BextRead | null {
	const bytes = file instanceof Uint8Array ? file : new Uint8Array(file);
	const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const tag = (at: number, n: number) => String.fromCharCode(...bytes.subarray(at, at + n));
	if (bytes.length < 12 || tag(0, 4) !== "RIFF" || tag(8, 4) !== "WAVE") return null;
	let at = 12;
	while (at + 8 <= bytes.length) {
		const id = tag(at, 4);
		const size = v.getUint32(at + 4, true);
		if (id === "bext" && size >= FIXED) {
			const b = at + 8;
			const str = (from: number, n: number) => tag(b + from, n).replace(/\0.*$/s, "");
			const i16 = (from: number) => {
				const x = v.getInt16(b + from, true);
				return x === NOT_SET ? null : x / 100;
			};
			return {
				description: str(0, 256),
				originator: str(256, 32),
				originatorReference: str(288, 32),
				originationDate: str(320, 10),
				originationTime: str(330, 8),
				timeReference: v.getUint32(b + 338, true) + v.getUint32(b + 342, true) * 2 ** 32,
				version: v.getUint16(b + 346, true),
				loudnessValue: i16(412),
				maxTruePeakLevel: i16(416),
				codingHistory: str(FIXED, size - FIXED).replace(/\r?\n$/, ""),
			};
		}
		at += 8 + size + (size % 2);
	}
	return null;
}

function latin1(s: string): Uint8Array {
	const out = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		out[i] = c < 256 ? c : 0x3f;
	}
	return out;
}
