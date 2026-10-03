<script lang="ts">
	import { piano } from "$lib/audio/piano.svelte";
	import ContextMenu from "$lib/components/ContextMenu.svelte";
	import { clearSitePianoPreset, setSitePianoPreset } from "$lib/remote/admin.remote";
	import {
		renamePianoPreset,
		savePianoPreset,
		setPianoPresetSlot,
	} from "$lib/remote/pianoPresets.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { savePianoSlotOverrides } from "$lib/utils/pianoSlotOverrides";
	import type { PianoSlot } from "$lib/utils/resolvePianoSlots";
	import {
		PIANO_PRESET_SLOTS,
		type NamedPianoPreset,
		type PianoPresetData,
	} from "$lib/val/PianoPresetSchema";

	/**
	 * The chord player's five preset buttons and their manage menu
	 * (docs/piano.md, "Presets"): the same library of sounds as the piano's,
	 * each instrument with its own buttons (`chord_slot`). A button plays its
	 * preset; the menu saves the sound now playing onto a button (a new
	 * library preset, or the button's own brought up to date), puts any
	 * library preset on a button, renames, clears; a system admin keeps the
	 * site's defaults the same way; signed out, the buttons are this
	 * browser's.
	 */
	interface SavedPreset {
		id: string;
		name: string;
		slot: number | null;
		chordSlot?: number | null;
		data: PianoPresetData;
	}
	interface Props {
		account: { id: string; name: string; canEdit: boolean } | null;
		presetAdmin?: boolean;
		slots: (PianoSlot | null)[];
		activeSlot: number;
		saved: SavedPreset[];
		site: (NamedPianoPreset | null)[];
		overrides: Record<number, NamedPianoPreset>;
		onload: (preset: NamedPianoPreset) => void;
	}
	let {
		account,
		presetAdmin = false,
		slots,
		activeSlot,
		saved = $bindable(),
		site = $bindable(),
		overrides = $bindable(),
		onload,
	}: Props = $props();
	const SLOT_NUMBERS = Array.from({ length: PIANO_PRESET_SLOTS }, (_, i) => i + 1);
	let busy = $state(false);

	/** The sound now playing onto button `n`: the account's own preset there brought up to date, else a new library preset (or this browser's slot). */
	async function saveHere(n: number) {
		const held = slots[n - 1];
		const name = window.prompt(`Name for preset ${n}`, held?.name ?? "")?.trim();
		if (name === undefined) return;
		const data = piano.currentPreset();
		if (account?.canEdit) {
			busy = true;
			try {
				const id = held?.source === "account" ? held.id : undefined;
				const row = await savePianoPreset({
					accountId: account.id,
					id,
					name: name || "Untitled preset",
					slot: n,
					instrument: "chords",
					data,
				});
				saved = [
					{ id: row.id, name: row.name, slot: row.slot, chordSlot: row.chordSlot, data },
					...saved
						.filter((p) => p.id !== row.id)
						.map((p) => (p.chordSlot === n ? { ...p, chordSlot: null } : p)),
				];
				onload({ name: row.name, data });
				notify(`“${row.name}” saved to preset ${n}`);
			} catch (e) {
				notify(`Could not save the preset: ${errorMessage(e)}`, { kind: "error" });
			} finally {
				busy = false;
			}
		} else {
			overrides = { ...overrides, [n]: { name: name || "Untitled preset", data } };
			savePianoSlotOverrides(overrides, "chords");
			onload({ name: name || "Untitled preset", data });
			notify(`“${name || "Untitled preset"}” saved to preset ${n} in this browser`);
		}
	}
	/** Any library preset onto button `n`, or the button cleared (""). */
	async function pick(n: number, id: string) {
		if (!account?.canEdit) return;
		busy = true;
		try {
			const held = slots[n - 1];
			if (!id) {
				if (held?.source !== "account" || !held.id) return;
				await setPianoPresetSlot({ id: held.id, slot: null, instrument: "chords" });
				saved = saved.map((p) => (p.id === held.id ? { ...p, chordSlot: null } : p));
				notify(`Preset ${n} cleared`);
				return;
			}
			await setPianoPresetSlot({ id, slot: n, instrument: "chords" });
			saved = saved.map((p) =>
				p.id === id ? { ...p, chordSlot: n } : p.chordSlot === n ? { ...p, chordSlot: null } : p,
			);
			const chosen = saved.find((p) => p.id === id);
			if (chosen) notify(`“${chosen.name}” is on preset ${n}`);
		} catch (e) {
			notify(`Could not change the preset: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			busy = false;
		}
	}
	async function rename(n: number) {
		const held = slots[n - 1];
		if (!held) return;
		const name = window.prompt(`Rename preset ${n}`, held.name)?.trim();
		if (!name || name === held.name) return;
		if (held.source === "account" && held.id) {
			try {
				const row = await renamePianoPreset({ id: held.id, name });
				saved = saved.map((p) => (p.id === row.id ? { ...p, name: row.name } : p));
			} catch (e) {
				notify(`Could not rename it: ${errorMessage(e)}`, { kind: "error" });
			}
		} else if (held.source === "browser") {
			overrides = { ...overrides, [n]: { ...overrides[n], name } };
			savePianoSlotOverrides(overrides, "chords");
		}
	}
	function clearBrowser(n: number) {
		const { [n]: _, ...rest } = overrides;
		overrides = rest;
		savePianoSlotOverrides(overrides, "chords");
		notify(`Preset ${n} cleared in this browser`);
	}

	// ---- the site's defaults (a system admin) ----
	async function writeSite(n: number, preset: NamedPianoPreset | null) {
		if (preset)
			await setSitePianoPreset({
				slot: n,
				instrument: "chords",
				name: preset.name,
				data: preset.data,
			});
		else await clearSitePianoPreset({ slot: n, instrument: "chords" });
		site = site.map((p, i) => (i === n - 1 ? preset : p));
		while (site.length < PIANO_PRESET_SLOTS) site.push(null);
	}
	async function siteSaveHere(n: number) {
		const current = site[n - 1];
		const name = window.prompt(`Name for the site's preset ${n}`, current?.name ?? "");
		if (name === null) return;
		try {
			await writeSite(n, { name: name.trim() || "Untitled preset", data: piano.currentPreset() });
			notify(`“${name.trim() || "Untitled preset"}” is now the site's chord player preset ${n}`);
		} catch (e) {
			notify(`Could not save the site preset: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function siteRename(n: number) {
		const current = site[n - 1];
		if (!current) return;
		const name = window.prompt(`Rename the site's preset ${n}`, current.name)?.trim();
		if (!name || name === current.name) return;
		try {
			await writeSite(n, { name, data: current.data });
		} catch (e) {
			notify(`Could not rename it: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function siteClear(n: number) {
		if (!site[n - 1] || !window.confirm(`Clear the site's preset ${n}?`)) return;
		try {
			await writeSite(n, null);
		} catch (e) {
			notify(`Could not clear it: ${errorMessage(e)}`, { kind: "error" });
		}
	}
</script>

<div class="flex gap-1" role="group" aria-label="Presets">
	{#each SLOT_NUMBERS as n (n)}
		{@const p = slots[n - 1]}
		<button
			class="device-button-sm px-3 {activeSlot === n - 1 ? 'text-accent' : ''} {p
				? ''
				: 'opacity-50'}"
			type="button"
			aria-pressed={activeSlot === n - 1}
			disabled={!p}
			aria-label="Preset {n}{p ? `: ${p.name}` : ' (empty)'}"
			title={p ? p.name : `Empty preset ${n}`}
			onclick={() => p && onload(p)}>{n}</button
		>
	{/each}
	<ContextMenu
		ariaLabel="Manage presets"
		title="Save the sound to a button, put a library preset on one, rename, clear"
		iconClass="i-ph-bookmarks-simple"
		position="bottom left"
		buttonBaseClasses="device-button-sm px-2"
		popoverClasses="min-w-80 max-w-lg !max-h-[calc(100%-0.5rem)] overflow-y-auto"
		items={[
			{ id: "presets-heading", kind: "heading", label: "Presets" },
			{ id: "presets-block", kind: "snippet", snippet: manageBlock },
		]}
	/>
</div>

{#snippet manageBlock()}
	<div class="px-3 pt-3 pb-4 grid gap-3 text-13px">
		<p class="text-12px opacity-70">
			The buttons hold sounds from the same library as the piano's; these five are the chord
			player's own. Save the sound playing now to a button{account?.canEdit
				? ", or put any saved preset on one"
				: ""}.
		</p>
		<ul class="grid gap-2" aria-label="Preset buttons">
			{#each SLOT_NUMBERS as n (n)}
				{@const p = slots[n - 1]}
				<li class="grid grid-cols-[1.5rem_1fr] items-center gap-2">
					<span class="tabular-nums opacity-70">{n}</span>
					<div class="grid gap-1">
						{#if account?.canEdit}
							<select
								class="device-field w-full"
								aria-label="Preset {n}"
								disabled={busy}
								value={p?.source === "account" ? (p.id ?? "") : ""}
								onchange={(e) => void pick(n, e.currentTarget.value)}
							>
								<option value=""
									>{p && p.source !== "account" ? `${p.name} (${p.source})` : "— empty —"}</option
								>
								{#each saved as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
							</select>
						{:else}
							<span class="truncate {p ? '' : 'opacity-50'}">{p ? p.name : "empty"}</span>
						{/if}
						<div class="flex flex-wrap gap-1">
							<button
								class="device-button-sm px-2 !h-7 text-12px"
								type="button"
								disabled={busy}
								title="The sound playing now, onto this button"
								onclick={() => void saveHere(n)}>Save here</button
							>
							{#if p && (p.source === "account" || p.source === "browser")}
								<button
									class="device-button-sm px-2 !h-7 text-12px"
									type="button"
									disabled={busy}
									onclick={() => void rename(n)}>Rename</button
								>
							{/if}
							{#if p?.source === "browser"}
								<button
									class="device-button-sm px-2 !h-7 text-12px"
									type="button"
									onclick={() => clearBrowser(n)}>Clear</button
								>
							{/if}
						</div>
					</div>
				</li>
			{/each}
		</ul>
		{#if presetAdmin}
			<div class="border-t border-current/10 pt-3 grid gap-2">
				<div class="text-11px uppercase tracking-wider text-accent">Site defaults</div>
				<p class="text-12px opacity-70">
					What every visitor's chord player buttons hold until they save their own.
				</p>
				<ul class="grid gap-1" aria-label="Site defaults">
					{#each SLOT_NUMBERS as n (n)}
						{@const s = site[n - 1]}
						<li class="flex items-center gap-2">
							<span class="tabular-nums opacity-70 w-4">{n}</span>
							<span class="grow truncate {s ? '' : 'opacity-50'}">{s ? s.name : "empty"}</span>
							<button
								class="device-button-sm px-2 !h-7 text-12px"
								type="button"
								onclick={() => void siteSaveHere(n)}>Save here</button
							>
							{#if s}
								<button
									class="device-button-sm px-2 !h-7 text-12px"
									type="button"
									onclick={() => void siteRename(n)}>Rename</button
								>
								<button
									class="device-button-sm px-2 !h-7 text-12px"
									type="button"
									onclick={() => void siteClear(n)}>Clear</button
								>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
{/snippet}
