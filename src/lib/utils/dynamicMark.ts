/** A level from 0 to 1 as the dynamic marking a musician reads: pp, p, mp, mf, f, ff (docs/chord-player.md, the Touch control). */
export function dynamicMark(level: number): string {
	if (level < 0.3) return "pp";
	if (level < 0.45) return "p";
	if (level < 0.6) return "mp";
	if (level < 0.75) return "mf";
	if (level < 0.9) return "f";
	return "ff";
}
