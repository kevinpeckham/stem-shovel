<script lang="ts">
	import type { RemoteFormField } from "$app/server";

	/**
	 * The fields of a comment form (the song's, a mix's, a session
	 * recording's): the title, the body and the position with its Playhead
	 * button, each with its issues. The values start at the draft's (the
	 * remote form keeps what was last typed, so the opener sets them too).
	 */
	interface Props {
		fields: {
			title: RemoteFormField<string>;
			body: RemoteFormField<string>;
			position: RemoteFormField<string>;
		};
		draft: { title: string; body: string; at: string };
		/** After "Position": how it is read, "optional" or "optional, as time". */
		hint: string;
		placeholder: string;
		/** The Playhead button: whether a position can be read now, why (its tooltip), and the position as text. */
		playhead: { disabled: boolean; title?: string; read: () => string };
	}
	let { fields, draft, hint, placeholder, playhead }: Props = $props();
</script>

{#snippet issues(field: RemoteFormField<string>)}
	{#each field.issues() ?? [] as issue (issue.message)}
		<p class="mt-1 text-sm text-red-400">{issue.message}</p>
	{/each}
{/snippet}

<label class="block">
	<span class="text-sm opacity-80">Title</span>
	<input class="mt-1 field" {...fields.title.as("text", draft.title)} required />
	{@render issues(fields.title)}
</label>
<label class="block">
	<span class="text-sm opacity-80">Comment</span>
	<textarea class="mt-1 field text-sm" rows="5" {...fields.body.as("text", draft.body)} required
	></textarea>
	{@render issues(fields.body)}
</label>
<label class="block">
	<span class="text-sm opacity-80">Position <span class="opacity-60">({hint})</span></span>
	<span class="mt-1 flex items-center gap-2">
		<input
			class="field font-mono text-sm"
			{placeholder}
			{...fields.position.as("text", draft.at)}
		/>
		<button
			class="button button-xs shrink-0"
			type="button"
			disabled={playhead.disabled}
			title={playhead.title}
			onclick={() => fields.position.set(playhead.read())}>Playhead</button
		>
	</span>
	{@render issues(fields.position)}
</label>
