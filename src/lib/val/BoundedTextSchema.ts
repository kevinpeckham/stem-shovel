import * as v from "valibot";

/** Trimmed text of at most `max` characters, refused beyond with "Keep the <what> under <max> characters." */
export const boundedText = (max: number, what: string) =>
	v.pipe(
		v.string(),
		v.trim(),
		v.maxLength(max, `Keep the ${what} under ${max.toLocaleString("en-US")} characters.`),
	);
