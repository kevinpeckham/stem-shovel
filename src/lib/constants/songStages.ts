import type { SongStage } from "../val/SongStageSchema";

/** What each stage is called, and the phase it stands for (docs/mixes.md, "Phase 2"). */
export const STAGE_LABEL: Record<SongStage, string> = {
	writing: "Writing",
	arranging: "Arranging",
	mixing: "Mixing",
	finished: "Finished",
};

export const STAGE_PHASE: Record<SongStage, string> = {
	writing: "Songwriting: the idea, its demos, lyrics and a chart",
	arranging: "Practising and arranging: stems to play along with and build on",
	mixing: "Recording and mixing: the engineer's mixes for the band's feedback",
	finished: "Done: listed under Finished Songs, everything still editable",
};
