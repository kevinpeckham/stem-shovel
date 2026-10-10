<script lang="ts">
	import { amp } from "#lib/audio/amp.svelte.js";
	import ComboBox from "#lib/components/ComboBox.svelte";
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import { AMP_INSTRUMENT_LABELS } from "#lib/constants/amp.js";
	import { clearSiteAmpPreset, setSiteAmpPreset } from "#lib/remote/admin.remote.js";
	import {
		deleteAmpPreset,
		renameAmpPreset,
		saveAmpPreset,
		setAmpPresetSlot,
	} from "#lib/remote/ampPresets.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { ampPresetKey } from "#lib/utils/ampPresetKey.js";
	import { loadAmpSlotOverrides, saveAmpSlotOverrides } from "#lib/utils/ampSlotOverrides.js";
	import { decodeAmpPreset } from "#lib/utils/decodeAmpPreset.js";
	import { encodeAmpPreset } from "#lib/utils/encodeAmpPreset.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { resolveAmpSlots, type AmpSlot } from "#lib/utils/resolveAmpSlots.js";
	import { shortenShareLink } from "#lib/utils/shortenShareLink.js";
	import {
		AMP_PRESET_SLOTS,
		type AmpPresetData,
		type NamedAmpPreset,
	} from "#lib/val/AmpPresetSchema.js";
	import type { AmpInstrument } from "#lib/val/AmpSchema.js";
	import { onMount } from "svelte";

	/**
	 * The Practice Amp's presets (docs/practice-amp.md, "Presets"), the
	 * piano's shape: six slot buttons per instrument, lit on the one the rig
	 * sits on, and a manage menu with the save form, the slots as they
	 * stand, the site's defaults for a system admin, and the account's
	 * library. Three layers (resolveAmpSlots): the account's slotted
	 * presets, a signed-out browser's own, the site's under both. A share
	 * link (`#preset=…`) loads on the amp's own page.
	 */
	export interface SavedAmpPreset {
		id: string;
		name: string;
		instrument: AmpInstrument;
		slot: number | null;
		data: AmpPresetData;
	}
	interface Props {
		/** The site's six defaults per instrument (a system admin's), a null per empty slot. */
		sitePresets: Record<AmpInstrument, (NamedAmpPreset | null)[]>;
		/** A signed-in member's account: presets save to it and load from it. */
		account?: { id: string; name: string; canEdit: boolean } | null;
		/** The account's saved presets, both instruments. */
		presets?: SavedAmpPreset[];
		/** A system admin: a preset can be saved as the site's default for its slot. */
		presetAdmin?: boolean;
		/** Read a `#preset=` link on mount (the amp's own page). */
		readLink?: boolean;
	}
	let {
		sitePresets,
		account = null,
		presets = [],
		presetAdmin = false,
		readLink = false,
	}: Props = $props();

	const SLOT_NUMBERS = Array.from({ length: AMP_PRESET_SLOTS }, (_, i) => i + 1);
	// svelte-ignore state_referenced_locally
	let site = $state<Record<AmpInstrument, (NamedAmpPreset | null)[]>>(structuredClone(sitePresets));
	// svelte-ignore state_referenced_locally
	let saved = $state<SavedAmpPreset[]>(presets);
	let overrides = $state<Record<AmpInstrument, Record<number, NamedAmpPreset>>>({
		guitar: {},
		bass: {},
	});
	/** The last preset loaded (a slot, the library or a link): the readout names it, "edited" once the rig drifts from it. */
	let loaded = $state<NamedAmpPreset | null>(null);
	const instrument = $derived(amp.instrument);
	const slots = $derived(
		resolveAmpSlots(instrument, site[instrument], overrides[instrument], account ? saved : null),
	);
	const currentKey = $derived(ampPresetKey(amp.currentPreset()));
	const activeSlot = $derived(slots.findIndex((p) => p && ampPresetKey(p.data) === currentKey));
	/** What the readout says: the slot the rig sits on, else the loaded preset, edited or not. */
	const presetLine = $derived.by(() => {
		if (activeSlot >= 0) return { name: slots[activeSlot]!.name, edited: false };
		if (loaded) return { name: loaded.name, edited: ampPresetKey(loaded.data) !== currentKey };
		return null;
	});
	onMount(() => {
		overrides = { guitar: loadAmpSlotOverrides("guitar"), bass: loadAmpSlotOverrides("bass") };
		if (!readLink) return;
		const hash = window.location.hash;
		if (hash.startsWith("#preset=")) {
			const preset = decodeAmpPreset(hash.slice("#preset=".length));
			if (preset) {
				loadPreset(preset);
				notify(`Preset “${preset.name}” loaded from the link; save it to keep it`);
			} else notify("That preset link could not be read", { kind: "error" });
		}
	});
	function loadPreset(preset: NamedAmpPreset) {
		amp.applyPreset(preset.data);
		loaded = { name: preset.name, data: preset.data };
	}
	function loadSlot(n: number) {
		const p = slots[n - 1];
		if (p) loadPreset(p);
		else openSave(n);
	}
	// Saving: a popover with the name and the slot, opened by ⌘-click (Ctrl on Windows) or a hold on a slot button, or from the manage menu.
	let saveOpen = $state<"open" | "closed">("closed");
	let saveSlot = $state<number | null>(null);
	let saveName = $state("");
	let saving = $state(false);
	let search = $state("");
	/** The manage button itself opens the popover with no slot chosen and the current name. */
	function freshSaveForm(e: PointerEvent) {
		const t = e.target as HTMLElement;
		if (t.closest("button[popovertarget]") && !t.closest("[popover]")) {
			saveSlot = null;
			saveName = presetLine?.name ?? "";
		}
	}
	function openSave(n: number | null) {
		saveSlot = n;
		const held = n ? slots[n - 1] : null;
		saveName = held?.source === "account" ? held.name : (presetLine?.name ?? "");
		saveOpen = "open";
	}
	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	let holdFired = false;
	function holdStart() {
		holdFired = false;
		holdTimer = setTimeout(() => (holdFired = true), 550);
	}
	function holdEnd() {
		if (holdTimer) clearTimeout(holdTimer);
		holdTimer = null;
	}
	function slotClick(e: MouseEvent, n: number) {
		const held = holdFired;
		holdFired = false;
		if (held || e.metaKey || e.ctrlKey) openSave(n);
		else loadSlot(n);
	}
	const mine = $derived(saved.filter((p) => p.instrument === instrument));
	const filtered = $derived(
		search.trim()
			? mine.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
			: mine,
	);
	/** Save the rig as it stands: to the account (replacing the account's own preset on the slot, else a new one), or into this browser's slot. */
	async function savePreset() {
		const name = saveName.trim() || "Untitled preset";
		const data = amp.currentPreset();
		if (account?.canEdit) {
			const held = saveSlot ? slots[saveSlot - 1] : null;
			const id = held?.source === "account" ? held.id : undefined;
			saving = true;
			try {
				const row = await saveAmpPreset({
					accountId: account.id,
					id,
					name,
					instrument,
					slot: saveSlot,
					data,
				});
				const entry: SavedAmpPreset = {
					id: row.id,
					name: row.name,
					instrument,
					slot: row.slot,
					data,
				};
				saved = [
					entry,
					...saved
						.filter((p) => p.id !== row.id)
						.map((p) =>
							p.instrument === instrument && row.slot && p.slot === row.slot
								? { ...p, slot: null }
								: p,
						),
				];
				loaded = { name: row.name, data };
				saveOpen = "closed";
				notify(saveSlot ? `“${row.name}” saved to preset ${saveSlot}` : `“${row.name}” saved`);
			} catch (e) {
				notify(`Could not save the preset: ${errorMessage(e)}`, { kind: "error" });
			} finally {
				saving = false;
			}
			return;
		}
		if (!saveSlot) return;
		overrides[instrument] = { ...overrides[instrument], [saveSlot]: { name, data } };
		saveAmpSlotOverrides(instrument, overrides[instrument]);
		loaded = { name, data };
		saveOpen = "closed";
		notify(`“${name}” saved to preset ${saveSlot} in this browser`);
	}
	async function writeSite(n: number, preset: NamedAmpPreset | null) {
		if (preset)
			await setSiteAmpPreset({ instrument, slot: n, name: preset.name, data: preset.data });
		else await clearSiteAmpPreset({ instrument, slot: n });
		site[instrument] = site[instrument].map((p, i) => (i === n - 1 ? preset : p));
	}
	async function saveSitePreset() {
		if (!saveSlot) return;
		const name = saveName.trim() || "Untitled preset";
		const data = amp.currentPreset();
		saving = true;
		try {
			await writeSite(saveSlot, { name, data });
			loaded = { name, data };
			saveOpen = "closed";
			notify(
				`“${name}” is now the site's ${AMP_INSTRUMENT_LABELS[instrument].toLowerCase()} preset ${saveSlot}`,
			);
		} catch (e) {
			notify(`Could not save the site preset: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			saving = false;
		}
	}
	async function siteSaveHere(n: number) {
		const name = window.prompt(
			`Name for the site's ${AMP_INSTRUMENT_LABELS[instrument].toLowerCase()} preset ${n}`,
			site[instrument][n - 1]?.name ?? presetLine?.name ?? "",
		);
		if (name === null) return;
		const data = amp.currentPreset();
		try {
			await writeSite(n, { name: name.trim() || "Untitled preset", data });
			loaded = { name: name.trim() || "Untitled preset", data };
			notify(`“${name.trim() || "Untitled preset"}” is now the site's preset ${n}`);
		} catch (e) {
			notify(`Could not save the site preset: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function siteRename(n: number) {
		const current = site[instrument][n - 1];
		if (!current) return;
		const name = window.prompt(`Rename the site's preset ${n}`, current.name)?.trim();
		if (!name || name === current.name) return;
		try {
			await writeSite(n, { ...current, name });
			notify(`Site preset ${n} renamed to “${name}”`);
		} catch (e) {
			notify(`Could not rename the site preset: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function siteMove(n: number, dir: -1 | 1) {
		const m = n + dir;
		if (m < 1 || m > AMP_PRESET_SLOTS) return;
		const a = site[instrument][n - 1] ?? null;
		const b = site[instrument][m - 1] ?? null;
		try {
			await writeSite(n, b);
			await writeSite(m, a);
			notify(`Site presets ${n} and ${m} swapped`);
		} catch (e) {
			notify(`Could not move the site preset: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function clearSitePreset(n: number) {
		if (!window.confirm(`Clear the site's preset ${n}?`)) return;
		try {
			await writeSite(n, null);
			notify(`Site preset ${n} cleared`);
		} catch (e) {
			notify(`Could not clear the site preset: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	function clearBrowserSlot(n: number) {
		const { [n]: _gone, ...rest } = overrides[instrument];
		overrides[instrument] = rest;
		saveAmpSlotOverrides(instrument, rest);
		notify(`Preset ${n} is back to the site's`);
	}
	async function renameSaved(p: SavedAmpPreset) {
		const name = window.prompt("Rename the preset", p.name)?.trim();
		if (!name || name === p.name) return;
		try {
			const row = await renameAmpPreset({ id: p.id, name });
			saved = saved.map((x) => (x.id === row.id ? { ...x, name: row.name } : x));
			if (loaded && ampPresetKey(loaded.data) === ampPresetKey(p.data))
				loaded = { ...loaded, name: row.name };
		} catch (e) {
			notify(`Could not rename the preset: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function deleteSaved(p: SavedAmpPreset) {
		if (!window.confirm(`Delete “${p.name}”?`)) return;
		try {
			await deleteAmpPreset({ id: p.id });
			saved = saved.filter((x) => x.id !== p.id);
			notify(`“${p.name}” deleted`);
		} catch (e) {
			notify(`Could not delete the preset: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function placeSaved(p: SavedAmpPreset, slot: number | null) {
		try {
			const row = await setAmpPresetSlot({ id: p.id, slot });
			saved = saved.map((x) =>
				x.id === row.id
					? { ...x, slot: row.slot }
					: x.instrument === p.instrument && x.slot && x.slot === row.slot
						? { ...x, slot: null }
						: x,
			);
		} catch (e) {
			notify(`Could not move the preset: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	/** A link that opens the amp with a preset: a saved one, or the rig as it stands. */
	async function copyLink(preset?: NamedAmpPreset) {
		const p = preset ?? { name: presetLine?.name ?? amp.model.name, data: amp.currentPreset() };
		const url = await shortenShareLink(
			`${window.location.origin}/practice-amp#preset=${encodeAmpPreset(p)}`,
			"practice-amp",
		);
		try {
			await navigator.clipboard.writeText(url);
			notify(`Link to “${p.name}” copied`);
		} catch {
			window.prompt("Copy this link", url);
		}
	}
	const SLOT_OPTIONS = [
		{ value: "", label: "–" },
		...SLOT_NUMBERS.map((n) => ({ value: String(n), label: String(n) })),
	];
	const slotAt = (n: number): AmpSlot | null => slots[n - 1] ?? null;
</script>

{#snippet iconButton(icon: string, title: string, onclick: () => void, disabled = false)}
	<button
		class="opacity-70 hover-opacity-100 inline-grid place-items-center w-6 h-6 text-14px shrink-0 disabled:opacity-20"
		type="button"
		{disabled}
		{title}
		aria-label={title}
		{onclick}
	>
		<span class={icon} aria-hidden="true"></span>
	</button>
{/snippet}

{#snippet presetsMenuBlock()}
	<div
		class="px-3 pt-2 grid grid-cols-1 gap-3 text-13px text-blue-100/90 [&_span.device-button-label]-(block mb-1)"
	>
		<form
			class="grid gap-2"
			onsubmit={(e) => {
				e.preventDefault();
				void savePreset();
			}}
		>
			<label class="block">
				<span class="device-button-label">Name</span>
				<input
					class="w-full rounded-md bg-slate-900 border border-current/20 px-2 py-1.5 text-14px"
					type="text"
					maxlength="120"
					placeholder="Spring clean, Fuzz lead…"
					bind:value={saveName}
					aria-label="Preset name"
				/>
			</label>
			<div>
				<span class="device-button-label">Slot ({AMP_INSTRUMENT_LABELS[instrument]})</span>
				<div class="flex gap-1" role="group" aria-label="Save to slot">
					{#each SLOT_NUMBERS as n (n)}
						<button
							class="device-button-xs w-8 border {saveSlot === n ? 'text-accent' : ''}"
							type="button"
							aria-pressed={saveSlot === n}
							onclick={() => (saveSlot = saveSlot === n ? null : n)}>{n}</button
						>
					{/each}
				</div>
			</div>
			<div class="flex flex-wrap gap-2 items-center">
				<button
					class="device-button-xs px-3 border"
					type="submit"
					disabled={saving || (!account?.canEdit && !saveSlot)}
					title={account?.canEdit
						? "Keep the rig as a preset in the account"
						: "Keep the rig on this slot in this browser"}
					>{account?.canEdit ? "Save" : "Save in this browser"}</button
				>
				{#if presetAdmin}
					<button
						class="device-button-xs px-3 border"
						type="button"
						disabled={saving || !saveSlot}
						title="What every visitor's button holds until they save their own"
						onclick={() => void saveSitePreset()}>Save as site default</button
					>
				{/if}
				<button
					class="device-button-xs px-3 border"
					type="button"
					title="A link that opens the amp with this rig"
					onclick={() => void copyLink()}
				>
					<span class="i-ph-link" aria-hidden="true"></span>
					Copy link
				</button>
			</div>
			{#if !account}
				<div class="text-12px opacity-70">
					Signed out, a preset lives on the six buttons in this browser. Sign in to keep more and
					share them with your band.
				</div>
			{:else if !account.canEdit}
				<div class="text-12px opacity-70">
					Viewers can load the account's presets, not save them.
				</div>
			{/if}
		</form>

		<div>
			<span class="device-button-label">On the buttons</span>
			<ul class="m-0 p-0 list-none grid gap-1">
				{#each SLOT_NUMBERS as n (n)}
					{@const p = slotAt(n)}
					<li class="flex items-center gap-2">
						<span class="w-5 text-center opacity-70">{n}</span>
						{#if p}
							<button
								class="flex-1 min-w-0 text-left truncate hover-text-accent {activeSlot === n - 1
									? 'text-accent'
									: ''}"
								type="button"
								title="Load this preset"
								onclick={() => loadPreset(p)}>{p.name}</button
							>
							<span class="text-11px opacity-50"
								>{p.source === "site" ? "site" : p.source === "browser" ? "this browser" : ""}</span
							>
							{@render iconButton("i-ph-link", `Copy a link to ${p.name}`, () => void copyLink(p))}
							{#if p.source === "browser"}
								{@render iconButton("i-ph-x", `Clear preset ${n} in this browser`, () =>
									clearBrowserSlot(n),
								)}
							{:else if p.source === "site" && presetAdmin}
								{@render iconButton(
									"i-ph-x",
									`Clear site preset ${n}`,
									() => void clearSitePreset(n),
								)}
							{/if}
						{:else}
							<span class="flex-1 opacity-50">empty</span>
						{/if}
					</li>
				{/each}
			</ul>
		</div>

		{#if presetAdmin}
			<div>
				<span class="device-button-label">Site defaults ({AMP_INSTRUMENT_LABELS[instrument]})</span>
				<ul class="m-0 p-0 list-none grid gap-1" aria-label="Site presets">
					{#each SLOT_NUMBERS as n (n)}
						{@const p = site[instrument][n - 1] ?? null}
						<li class="flex items-center gap-1">
							<span class="w-5 text-center opacity-70">{n}</span>
							{#if p}
								<button
									class="flex-1 min-w-0 text-left truncate hover-text-accent"
									type="button"
									title="Load the site's preset"
									onclick={() => loadPreset(p)}>{p.name}</button
								>
							{:else}
								<span class="flex-1 opacity-50">empty</span>
							{/if}
							{@render iconButton(
								"i-ph-floppy-disk",
								`Save the current rig as site preset ${n}`,
								() => void siteSaveHere(n),
							)}
							{@render iconButton(
								"i-ph-pencil-simple",
								`Rename site preset ${n}`,
								() => void siteRename(n),
								!p,
							)}
							{@render iconButton(
								"i-ph-arrow-up",
								`Move site preset ${n} up`,
								() => void siteMove(n, -1),
								n === 1 || (!p && !site[instrument][n - 2]),
							)}
							{@render iconButton(
								"i-ph-arrow-down",
								`Move site preset ${n} down`,
								() => void siteMove(n, 1),
								n === AMP_PRESET_SLOTS || (!p && !site[instrument][n]),
							)}
							{@render iconButton(
								"i-ph-x",
								`Clear site preset ${n}`,
								() => void clearSitePreset(n),
								!p,
							)}
						</li>
					{/each}
				</ul>
				<p class="text-12px opacity-70 mt-1">
					What every visitor's buttons hold until they save their own; the list above shows yours.
				</p>
			</div>
		{/if}

		{#if account}
			<div>
				<span class="device-button-label"
					>Saved in {account.name} · {mine.length}
					{AMP_INSTRUMENT_LABELS[instrument].toLowerCase()}</span
				>
				{#if mine.length > 5}
					<input
						class="w-full rounded-md bg-slate-900 border border-current/20 px-2 py-1 text-13px mb-2"
						type="search"
						placeholder="Search presets"
						bind:value={search}
						aria-label="Search presets"
					/>
				{/if}
				<ul class="m-0 p-0 list-none grid gap-1 max-h-60 overflow-y-auto">
					{#each filtered as p (p.id)}
						<li class="flex items-center gap-2">
							<button
								class="flex-1 min-w-0 text-left truncate hover-text-accent {ampPresetKey(p.data) ===
								currentKey
									? 'text-accent'
									: ''}"
								type="button"
								title="Load this preset"
								onclick={() => loadPreset(p)}>{p.name}</button
							>
							{#if account.canEdit}
								<div class="w-14 shrink-0" title="The button this preset sits on">
									<ComboBox
										ariaLabel="Slot for {p.name}"
										buttonClasses="!px-2 !py-0.5 !text-12px w-full"
										options={SLOT_OPTIONS}
										value={p.slot ? String(p.slot) : ""}
										onchange={(v) => void placeSaved(p, v ? Number(v) : null)}
									/>
								</div>
							{:else if p.slot}
								<span class="text-11px opacity-50">slot {p.slot}</span>
							{/if}
							{@render iconButton("i-ph-link", `Copy a link to ${p.name}`, () => void copyLink(p))}
							{#if account.canEdit}
								{@render iconButton(
									"i-ph-pencil-simple",
									`Rename ${p.name}`,
									() => void renameSaved(p),
								)}
								{@render iconButton("i-ph-trash", `Delete ${p.name}`, () => void deleteSaved(p))}
							{/if}
						</li>
					{:else}
						<li class="opacity-60">{search ? "No preset matches" : "No presets saved yet"}</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
{/snippet}

<div class="flex flex-wrap items-center gap-2">
	<span class="text-11px uppercase tracking-wider text-dark/80 select-none">Presets</span>
	<div class="flex gap-1" role="group" aria-label="Presets">
		{#each SLOT_NUMBERS as n (n)}
			{@const p = slotAt(n)}
			<button
				class="device-button-xs w-8 border {activeSlot === n - 1 ? 'text-accent' : ''} {p
					? ''
					: 'opacity-50'}"
				type="button"
				aria-pressed={activeSlot === n - 1}
				aria-label="Preset {n}{p ? `: ${p.name}` : ' (empty)'}"
				title={p
					? `${p.name} (⌘-click or hold to save here)`
					: `Empty preset ${n}: click to save the rig here`}
				onclick={(e) => slotClick(e, n)}
				onpointerdown={holdStart}
				onpointerup={holdEnd}
				onpointerleave={holdEnd}
				onpointercancel={holdEnd}
				oncontextmenu={(e) => e.preventDefault()}>{n}</button
			>
		{/each}
	</div>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div onpointerdowncapture={freshSaveForm}>
		<ContextMenu
			ariaLabel="Manage presets"
			title="Save, name, share and manage presets"
			iconClass="i-ph-bookmarks-simple"
			position="bottom right"
			buttonBaseClasses="device-button-xs w-8 px-2"
			popoverClasses="min-w-80 !max-h-[calc(100%-0.5rem)] overflow-y-auto"
			bind:openState={saveOpen}
			items={[
				{ id: "presets-heading", kind: "heading", label: "Presets" },
				{ id: "presets-body", kind: "snippet", snippet: presetsMenuBlock },
			]}
		/>
	</div>
	{#if presetLine}
		<span class="text-12px text-dark/80 truncate"
			>{presetLine.name}{presetLine.edited ? " · edited" : ""}</span
		>
	{/if}
</div>
