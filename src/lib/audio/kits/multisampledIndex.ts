import type {
	DrumKitLayer,
	MultisampledKitManifest,
	MultisampledKitSample,
} from "#lib/constants/drumKits.js";
import { DEFAULT_MULTISAMPLED_KIT } from "#lib/constants/expressionDrums.js";
import { MultisampledKit, type MultisampledKitFiles } from "./multisampledKit";
import { ElectronicKit } from "./electronic";
import { LayeredSynthKit } from "./layeredSynthKit";
import type { LayeredDrumKit } from "./types";

/** The built-in kits with no files, synthesized (the drum machine's own), played by layer. */
const SYNTHESIZED_KITS: Record<string, () => LayeredDrumKit> = {
	electronic: () => new LayeredSynthKit("electronic", new ElectronicKit()),
};

/**
 * The multisampled kits (docs/drum-machine.md, "Multisampled kits"): the
 * built-in ones, each a measured list in ./multisampled/<id>.json for the
 * files in static/kits/<id>/ (`bun run measure:multisampled-kit`), and the
 * custom kits the page was given (multisampledKitManifests), and the
 * synthesized Electronic played by layer (LayeredSynthKit). A kit id this
 * page cannot play plays DEFAULT_MULTISAMPLED_KIT.
 */

/** A built-in kit's list as the measuring script writes it. */
type BuiltInList = Record<string, { layer: number; rr: number; file: string; loudness: number | null }[]>;

const BUILT_IN_LISTS = import.meta.glob<BuiltInList>("./multisampled/*.json", {
	eager: true,
	import: "default",
});

/** Every built-in kit's files by kit id (the JSON file's name), URLs into static/kits/<id>/. */
const MULTISAMPLED_KIT_FILES = new Map<string, MultisampledKitFiles>(
	Object.entries(BUILT_IN_LISTS).map(([path, list]) => {
		const id = path.slice(path.lastIndexOf("/") + 1, -".json".length);
		const files = Object.fromEntries(
			Object.entries(list).map(([voice, samples]) => [
				voice,
				samples.map(
					(s): MultisampledKitSample => ({
						id: s.file,
						layer: s.layer as DrumKitLayer,
						rr: s.rr,
						url: `/kits/${id}/${encodeURIComponent(s.file)}`,
						loudness: s.loudness,
					}),
				),
			]),
		) as MultisampledKitFiles;
		return [id, files];
	}),
);

const kits = new Map<string, LayeredDrumKit>();
/** Each custom kit's files as last registered, to tell a changed kit (made afresh) from the same one (kept, decoded). */
const signatures = new Map<string, string>();

/** The custom kits this page may play; a kit whose files changed is made afresh, one no longer listed is dropped. */
export function registerDrumKits(list: MultisampledKitManifest[]) {
	const listed = new Set<string>();
	for (const m of list) {
		if (isBuiltIn(m.id)) continue; // a built-in id is never a custom kit
		listed.add(m.id);
		const signature = JSON.stringify(m.samples);
		if (signatures.get(m.id) === signature && kits.has(m.id)) continue;
		signatures.set(m.id, signature);
		kits.set(m.id, new MultisampledKit(m.id, m.samples));
	}
	for (const id of [...signatures.keys()]) {
		if (!listed.has(id)) {
			kits.delete(id);
			signatures.delete(id);
		}
	}
}

const isBuiltIn = (id: string) => MULTISAMPLED_KIT_FILES.has(id) || id in SYNTHESIZED_KITS;

export function hasDrumKit(id: string): boolean {
	return isBuiltIn(id) || kits.has(id);
}

/** The kit by id, made once per page; an id this page cannot play gives the default kit. */
export function drumKit(id: string): LayeredDrumKit {
	const known = hasDrumKit(id) ? id : DEFAULT_MULTISAMPLED_KIT;
	let kit = kits.get(known);
	if (!kit) {
		kit =
			SYNTHESIZED_KITS[known]?.() ??
			new MultisampledKit(known, MULTISAMPLED_KIT_FILES.get(known) ?? {});
		kits.set(known, kit);
	}
	return kit;
}
