/**
 * An account name with its middle hidden, the way /support shows the
 * line-up: "MMKK" → "M*KK", "Mahony" → "M***ny". Each word keeps its first
 * letter and last two, with a star per hidden letter; a three-letter word
 * keeps its ends ("Bob" → "B*b"), shorter ones keep only the first.
 */
export function obscureName(name: string): string {
	return name
		.trim()
		.split(/\s+/)
		.map((word) => {
			// Graphemes, so an accented letter or an emoji counts as one character.
			const chars = Array.from(new Intl.Segmenter().segment(word), (s) => s.segment);
			if (chars.length <= 2) return chars[0] + "*".repeat(Math.max(0, chars.length - 1));
			if (chars.length === 3) return `${chars[0]}*${chars[2]}`;
			return chars[0] + "*".repeat(chars.length - 3) + chars.slice(-2).join("");
		})
		.join(" ");
}
