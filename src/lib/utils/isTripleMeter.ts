/**
 * Whether a meter is a bar of three beats: 3/4, 3/8, 3/2. It is the meter
 * whose bar a detector hears as one compound beat (a fast waltz's bar of
 * three quarters reads as a dotted beat of 6/8), so its tempo can sit a
 * factor of three from the detected one. 6/8 and 9/8 divide their beats in
 * three but are not three to the bar (`isCompoundMeter`).
 */
export function isTripleMeter(meter: string | null | undefined): boolean {
	const match = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(meter ?? "");
	return match !== null && Number(match[1]) === 3;
}
