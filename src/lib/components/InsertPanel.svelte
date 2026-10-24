<script lang="ts">
	import {
		DELAY_SYNCS,
		INSERT_DEFAULTS,
		INSERT_KINDS,
		INSERT_LABELS,
		INSERT_PARAMS,
		MAX_INSERTS,
		type InsertKind,
	} from "#lib/constants/studioInserts.js";
	import type { StudioInsert } from "#lib/val/StudioSchema.js";
	import { nanoid } from "nanoid";

	/**
	 * A strip's inserts (docs/dawn-daw-plan.md, D2), reusable for a track,
	 * a bus or the master: each insert a card with a slider per parameter
	 * (constants/studioInserts.ts says which, with its range and readout),
	 * a bypass, move up and down, remove; an Add menu of the kinds at the
	 * end. Every change hands the caller the whole list (`onchange`), so
	 * the engine keeps one undo step per gesture. A parameter driven by a
	 * lane (`automated`) shows its slider dimmed with a note.
	 */
	interface Props {
		inserts: StudioInsert[];
		onchange: (inserts: StudioInsert[]) => void;
		/** Lane keys that drive a parameter now (`insert:<id>:<param>`). */
		automated?: Set<string>;
		label: string;
	}
	let { inserts, onchange, automated = new Set(), label }: Props = $props();

	const num = (i: StudioInsert, key: string) => {
		const v = i.settings[key];
		return typeof v === "number" ? v : 0;
	};
	function set(index: number, key: string, value: number | boolean) {
		const next = inserts.map((i, k) =>
			k === index ? { ...i, settings: { ...i.settings, [key]: value } } : i,
		);
		onchange(next);
	}
	function add(kind: InsertKind) {
		if (inserts.length >= MAX_INSERTS) return;
		onchange([...inserts, { id: nanoid(), kind, settings: { ...INSERT_DEFAULTS[kind] } }]);
	}
	function remove(index: number) {
		onchange(inserts.filter((_, k) => k !== index));
	}
	function move(index: number, by: number) {
		const to = index + by;
		if (to < 0 || to >= inserts.length) return;
		const next = [...inserts];
		const [item] = next.splice(index, 1);
		next.splice(to, 0, item!);
		onchange(next);
	}
	function bypass(index: number, on: boolean) {
		onchange(inserts.map((i, k) => (k === index ? { ...i, bypass: on || undefined } : i)));
	}
</script>

<div class="grid gap-3 text-13px" data-insert-panel role="group" aria-label="{label} inserts">
	{#if inserts.length === 0}
		<p class="text-dim">No inserts yet: the signal passes as it is.</p>
	{/if}
	{#each inserts as insert, index (insert.id)}
		{@const synced = insert.kind === "delay" && num(insert, "sync") > 0}
		<section
			class="rounded border border-white/10 px-3 py-2 grid gap-2 {insert.bypass
				? 'opacity-60'
				: ''}"
			aria-label="{INSERT_LABELS[insert.kind]} insert"
			data-insert={insert.id}
		>
			<div class="flex items-center gap-1">
				<span class="device-button-label grow">{INSERT_LABELS[insert.kind]}</span>
				<button
					type="button"
					class="device-fader-button-sm"
					aria-pressed={!!insert.bypass}
					aria-label="Bypass {INSERT_LABELS[insert.kind]}"
					title="Bypass: the signal goes round this insert"
					onclick={() => bypass(index, !insert.bypass)}>B</button
				>
				<button
					type="button"
					class="device-fader-button-sm"
					aria-label="Move {INSERT_LABELS[insert.kind]} up"
					disabled={index === 0}
					onclick={() => move(index, -1)}
				>
					<span class="i-ph-arrow-up text-12px" aria-hidden="true"></span>
				</button>
				<button
					type="button"
					class="device-fader-button-sm"
					aria-label="Move {INSERT_LABELS[insert.kind]} down"
					disabled={index === inserts.length - 1}
					onclick={() => move(index, 1)}
				>
					<span class="i-ph-arrow-down text-12px" aria-hidden="true"></span>
				</button>
				<button
					type="button"
					class="device-fader-button-sm"
					aria-label="Remove {INSERT_LABELS[insert.kind]}"
					onclick={() => remove(index)}
				>
					<span class="i-ph-x text-12px" aria-hidden="true"></span>
				</button>
			</div>
			<div class="grid gap-1.5">
				{#each INSERT_PARAMS[insert.kind] as p (p.key)}
					{@const driven = automated.has(`insert:${insert.id}:${p.key}`)}
					{@const held = synced && p.key === "time"}
					<label class="block">
						<span class="text-11px opacity-70">
							{p.label} · {held
								? `${DELAY_SYNCS.find((o) => o.value === num(insert, "sync"))?.label ?? "synced"} at the song's tempo`
								: p.format(num(insert, p.key))}{#if driven}
								<span class="ml-1 text-accent">(automated)</span>{/if}
						</span>
						<input
							type="range"
							class="w-full accent-maximumYellow {driven || held ? 'opacity-50' : ''}"
							min={p.min}
							max={p.max}
							step={p.step}
							value={num(insert, p.key)}
							disabled={held}
							aria-label="{INSERT_LABELS[insert.kind]} {p.label}"
							oninput={(e) => set(index, p.key, e.currentTarget.valueAsNumber)}
						/>
					</label>
				{/each}
				{#if insert.kind === "delay"}
					<!-- The time as a note value of the song (docs/multitrack-recorder.md "Pre-fader sends and a tempo-synced delay"): the engine sets the seconds from the tempo, through its changes. -->
					<label class="flex items-center gap-2 text-11px opacity-80">
						Sync
						<select
							class="device-field grow text-11px py-0"
							aria-label="Delay sync"
							value={String(num(insert, "sync"))}
							onchange={(e) => set(index, "sync", Number(e.currentTarget.value))}
						>
							{#each DELAY_SYNCS as o (o.value)}
								<option value={String(o.value)}>{o.label}</option>
							{/each}
						</select>
					</label>
					<label class="flex items-center gap-2 text-11px opacity-80">
						<input
							type="checkbox"
							class="accent-maximumYellow"
							checked={insert.settings.analog === true}
							onchange={(e) => set(index, "analog", e.currentTarget.checked)}
						/>
						Analog repeats
					</label>
				{/if}
			</div>
		</section>
	{/each}
	{#if inserts.length < MAX_INSERTS}
		<div class="flex flex-wrap items-center gap-1">
			<span class="text-11px opacity-70 mr-1">Add</span>
			{#each INSERT_KINDS as kind (kind)}
				<button
					type="button"
					class="button button-xs"
					aria-label="Add {INSERT_LABELS[kind]}"
					onclick={() => add(kind)}>{INSERT_LABELS[kind]}</button
				>
			{/each}
		</div>
	{/if}
</div>
