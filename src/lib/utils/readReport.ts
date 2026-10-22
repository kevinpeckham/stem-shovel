/**
 * What a project reader reports beside the arrangement (utils/dawprojectRead.ts
 * `DawprojectRead`): `dropped`, what the file holds that Dawn has no place
 * for, and `fixed`, what was read into Dawn's ways; each line once. The
 * Reaper, Live and MIDI readers share it.
 */
export function readReport(): {
	dropped: string[];
	fixed: string[];
	drop: (what: string) => void;
	fix: (what: string) => void;
} {
	const dropped: string[] = [];
	const fixed: string[] = [];
	return {
		dropped,
		fixed,
		drop: (what) => {
			if (!dropped.includes(what)) dropped.push(what);
		},
		fix: (what) => {
			if (!fixed.includes(what)) fixed.push(what);
		},
	};
}
