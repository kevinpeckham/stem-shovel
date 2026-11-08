/**
 * The beats in a bar of `meter` ("6/8", "3/4"): its numerator, the
 * meter's bottom note counting as the beat as the song's changes count it
 * (`chartBarSeconds`). A meter without a readable numerator counts four.
 */
export function meterBeats(meter: string): number {
	return Number(/^\s*(\d+)\s*\//.exec(meter)?.[1] ?? 4) || 4;
}
