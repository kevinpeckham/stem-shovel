import type { SongStage } from "../val/SongStageSchema";

/**
 * The stage a song is at (docs/mixes.md, "Phase 2"): the one set in its
 * settings, else read from what it holds: finished when marked so, mixing
 * once a mix exists, arranging once a stem does, writing until then. The
 * project page's grouping, the tile's and the playlist's choice of what
 * to play, and the song page's default view all follow it.
 */
export function songStage(song: {
	stage: SongStage | null;
	isFinished: boolean;
	hasMix: boolean;
	hasStem: boolean;
}): SongStage {
	if (song.stage) return song.stage;
	if (song.isFinished) return "finished";
	if (song.hasMix) return "mixing";
	if (song.hasStem) return "arranging";
	return "writing";
}
