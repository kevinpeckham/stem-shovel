<script lang="ts">
	import { chatPeople } from "#lib/remote/chat.remote.js";
	import { tick } from "svelte";

	/**
	 * The `@` picker of a chat's message box (docs/chat.md, "Mentions"):
	 * typing `@` lists the chat's people (fetched once, on the first `@`,
	 * through `chatPeople`), narrowed by what follows it; ArrowUp/ArrowDown
	 * move, Enter or Tab picks, Escape closes. Picking writes `@Name ` in
	 * place of what was typed and adds the person to `picked`. The box
	 * owns its keys: it calls `update()` on input and `keydown(e)` first in
	 * its own key handler, which says whether the picker took the key.
	 */
	interface Props {
		/** The chat's song, or its session: one of them. */
		songId?: string;
		sessionId?: string;
		/** The box the picker writes into, and its text (bound). */
		box: HTMLTextAreaElement | null;
		draft: string;
		/** The people picked so far (bound), from which the message's mentions are read. */
		picked: { id: string; name: string }[];
	}
	let {
		songId = "",
		sessionId = "",
		box,
		draft = $bindable(),
		picked = $bindable(),
	}: Props = $props();

	const uid = $props.id();
	let people = $state<{ id: string; name: string }[] | null>(null);
	let loading = false;
	/** What follows the `@` before the caret, and where the `@` is; null while no `@` is being typed. */
	let typed = $state<{ query: string; start: number } | null>(null);
	let active = $state(0);

	const MAX_SHOWN = 6;
	let matches = $derived.by(() => {
		if (!typed || !people) return [];
		const q = typed.query.toLowerCase();
		return people
			.filter((p) => {
				const name = p.name.toLowerCase();
				return name.startsWith(q) || name.split(/\s+/).some((w) => w.startsWith(q));
			})
			.slice(0, MAX_SHOWN);
	});
	let open = $derived(matches.length > 0);

	async function load() {
		if (people || loading) return;
		loading = true;
		try {
			people = await chatPeople({ songId, sessionId });
		} catch (e) {
			console.error("[chat] people", e);
			people = [];
		} finally {
			loading = false;
		}
	}

	/** Reads the `@` being typed at the caret, if any; the box calls it on every input. */
	export function update() {
		if (!box) return;
		const caret = box.selectionStart ?? draft.length;
		const m = draft.slice(0, caret).match(/(?:^|[\s(])@([^@\n]{0,40})$/);
		if (!m) {
			typed = null;
			return;
		}
		typed = { query: m[1], start: caret - m[1].length - 1 };
		active = 0;
		void load();
	}

	async function pick(p: { id: string; name: string }) {
		if (!typed || !box) return;
		const caret = box.selectionStart ?? draft.length;
		const text = `@${p.name} `;
		draft = draft.slice(0, typed.start) + text + draft.slice(caret);
		if (!picked.some((x) => x.id === p.id)) picked = [...picked, p];
		const at = typed.start + text.length;
		typed = null;
		await tick();
		box.focus();
		box.setSelectionRange(at, at);
	}

	/** The box's keys while the list is up: true when the picker took it. */
	export function keydown(e: KeyboardEvent): boolean {
		if (!open) return false;
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			const step = e.key === "ArrowDown" ? 1 : -1;
			active = (active + step + matches.length) % matches.length;
		} else if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
			void pick(matches[active]);
		} else if (e.key === "Escape") {
			typed = null;
		} else return false;
		e.preventDefault();
		return true;
	}

	/** What the box carries for assistive tech: the list it controls and the option in hand. */
	export function boxAria() {
		return {
			"aria-autocomplete": "list" as const,
			"aria-expanded": open,
			"aria-controls": `${uid}-people`,
			"aria-activedescendant": open ? `${uid}-person-${active}` : undefined,
		};
	}
</script>

{#if open}
	<ul
		id="{uid}-people"
		class="absolute bottom-full left-0 z-10 mb-1 grid min-w-48 rounded-md border border-current/20 bg-oxford py-1 text-14px shadow-lg"
		role="listbox"
		aria-label="People to mention"
	>
		{#each matches as p, i (p.id)}
			<li
				id="{uid}-person-{i}"
				role="option"
				aria-selected={i === active}
				class="cursor-pointer px-3 py-1 {i === active ? 'bg-white/10' : ''}"
				onmousedown={(e) => {
					// Keep the box's focus and caret: the pick writes at the caret.
					e.preventDefault();
					void pick(p);
				}}
			>
				{p.name}
			</li>
		{/each}
	</ul>
{/if}
