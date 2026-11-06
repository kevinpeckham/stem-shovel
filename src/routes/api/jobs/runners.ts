import { eachJob } from "#lib/server/eachJob.js";
import { renderDawprojectExport } from "#lib/server/dawprojectExport.js";
import { ensureOriginalMix } from "#lib/server/mix.js";
import { ensureSongChords } from "#lib/server/chords.js";
import { ensureSongNotes } from "#lib/server/notes.js";
import { renderNotationPdf } from "#lib/server/notationPdf.js";
import {
	flacStudioSources,
	measureDemos,
	measureSessions,
	measureSessionSpectra,
	measureStemMetadata,
	renderDemos,
	renderMixes,
	renderRecordings,
	renderSessions,
	renderStems,
} from "#lib/server/transcode.js";
import type { JobKind } from "#lib/val/JobSchema.js";

/**
 * What the jobs function runs for each kind (docs/effect-adoption.md,
 * Phase 2 step 3). The per-id kinds go through `eachJob`, so one bad id
 * leaves the rest of the batch to run; the batch functions isolate their
 * ids themselves. `satisfies` refuses a kind without a runner and a runner
 * without a kind.
 */
export const RUNNERS = {
	// A mix rendered again (stems removed or reordered) is read again by the chord model; one already read is skipped.
	mix: async (ids) => {
		await eachJob("mix", ids, ensureOriginalMix);
		await eachJob("chords", ids, ensureSongChords);
	},
	notes: (ids) => eachJob("notes", ids, ensureSongNotes),
	chords: (ids) => eachJob("chords", ids, ensureSongChords),
	"stem-playback": renderStems,
	"demo-playback": renderDemos,
	"mix-playback": renderMixes,
	"recording-playback": renderRecordings,
	"session-playback": renderSessions,
	"demo-peaks": measureDemos,
	"session-peaks": measureSessions,
	"session-spectrum": measureSessionSpectra,
	"stem-metadata": measureStemMetadata,
	"notation-pdf": (ids) => eachJob("notation-pdf", ids, renderNotationPdf),
	"dawproject-export": (ids) => eachJob("dawproject-export", ids, renderDawprojectExport),
	"studio-flac": flacStudioSources,
} satisfies Record<JobKind, (ids: string[]) => Promise<void>>;
