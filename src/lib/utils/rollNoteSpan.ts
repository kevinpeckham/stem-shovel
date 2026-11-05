/**
 * Where a MIDI note sits on a piano roll drawn to the song's time scale
 * (`MidiRoll.svelte`): the file's seconds plus `offset`, the song's
 * `startAt` (a DAW exports from bar 1, the recording may carry a count-in
 * before it, so a file's 0 is the song's first downbeat), as an x and a
 * width in pixels over `width` for `seconds` of song; at least one pixel
 * wide, and nothing before 0 when there is no song length yet.
 */
export function rollNoteSpan(
	note: { start: number; duration: number },
	offset: number,
	seconds: number,
	width: number,
): { x: number; width: number } {
	const px = (t: number) => (seconds > 0 ? (t / seconds) * width : 0);
	const x = px(note.start + offset);
	return { x, width: Math.max(1, px(note.start + offset + note.duration) - x) };
}
