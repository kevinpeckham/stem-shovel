<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import { DEMO_ACCEPT } from "#lib/constants/demoFormats.js";
	import {
		SESSION_KIND_LABELS,
		SESSION_KINDS,
		SESSION_MAX_BYTES,
		type SessionKind,
	} from "#lib/constants/sessionRecordings.js";
	import { deleteSession, updateSession } from "#lib/remote/sessions.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { postJson, saveAs, uploadSessionFile, type SessionReservation } from "#lib/upload.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";
	import { formatDate } from "#lib/utils/formatDate.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";

	let { data } = $props();

	type Session = (typeof data.sessions)[number];

	/** Today as the browser sees it, `YYYY-MM-DD` (no time zone to shift it). */
	const today = () => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	};
	/** A `YYYY-MM-DD` day as "Oct 18, 2026", read as a local date. */
	const dayText = (day: string) => {
		const [y, m, d] = day.split("-").map(Number);
		return y && m && d ? formatDate(new Date(y, m - 1, d)) : day;
	};

	// ── Upload ──
	let kind = $state<SessionKind>("practice");
	let recordedOn = $state("");
	let place = $state("");
	let jobs = $state<{ name: string; percent: number; error?: string }[]>([]);
	let busy = $state(false);
	async function uploadPicked(input: HTMLInputElement) {
		const picked = [...(input.files ?? [])];
		input.value = "";
		if (picked.length === 0) return;
		busy = true;
		jobs = picked.map((f) => ({ name: f.name, percent: 0 }));
		const day = recordedOn || today();
		for (const [i, file] of picked.entries()) {
			if (file.size > SESSION_MAX_BYTES) {
				jobs[i].error = `Over ${formatBytes(SESSION_MAX_BYTES)}`;
				continue;
			}
			try {
				await uploadSessionFile(
					file,
					() =>
						postJson<SessionReservation>("/api/sessions", {
							accountId: data.account.id,
							kind,
							recordedOn: day,
							place,
							filename: file.name,
							sizeBytes: file.size,
						}),
					(percent) => (jobs[i].percent = percent),
				);
			} catch (e) {
				jobs[i].error = errorMessage(e);
			}
		}
		await invalidateAll();
		busy = false;
		const failed = jobs.filter((j) => j.error).length;
		if (failed === 0) {
			notify(picked.length === 1 ? "Session uploaded" : `${picked.length} sessions uploaded`);
			jobs = [];
		}
	}

	// ── Browse ──
	let filter = $state<"all" | SessionKind>("all");
	const shown = $derived(
		filter === "all" ? data.sessions : data.sessions.filter((s) => s.kind === filter),
	);
	/** The list by day, newest first (the server already orders it so). */
	const days = $derived.by(() => {
		const out: { day: string; sessions: Session[] }[] = [];
		for (const s of shown) {
			const last = out.at(-1);
			if (last && last.day === s.recordedOn) last.sessions.push(s);
			else out.push({ day: s.recordedOn, sessions: [s] });
		}
		return out;
	});
	const nameOf = (s: Session) => s.title || s.filename;

	// ── Edit ──
	let editing = $state<string | null>(null);
	let draft = $state({
		kind: "practice" as SessionKind,
		title: "",
		recordedOn: "",
		place: "",
		notes: "",
	});
	function startEdit(s: Session) {
		editing = s.id;
		draft = {
			kind: s.kind,
			title: s.title,
			recordedOn: s.recordedOn,
			place: s.place,
			notes: s.notes,
		};
	}
	let saving = $state(false);
	async function saveEdit(id: string) {
		saving = true;
		try {
			await updateSession({ id, ...draft });
			editing = null;
			await invalidateAll();
			notify("Session saved");
		} catch (e) {
			notify(`Could not save: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			saving = false;
		}
	}
	async function remove(s: Session) {
		if (!confirm(`Delete "${nameOf(s)}"? The file goes with it.`)) return;
		try {
			await deleteSession({ id: s.id });
			await invalidateAll();
			notify(`${nameOf(s)} deleted`);
		} catch (e) {
			notify(`Could not delete it: ${errorMessage(e)}`, { kind: "error" });
		}
	}
</script>

<svelte:head>
	<title>{pageTitle(`Sessions · ${data.account.name}`)}</title>
</svelte:head>

<main class="page">
	<header class="max-w-article mb-6">
		<h1 class="heading-2">Sessions</h1>
		<p class="opacity-90 text-balance">
			The band's tapes: recordings of practices and shows, for every member of {data.account.name}
			to hear and download. Upload what the phone or the recorder caught; title it, date it, and it is
			here for everyone.
		</p>
	</header>

	{#if data.canEdit}
		<section class="max-w-article surface mb-8 px-5 py-4" aria-label="Upload a session">
			<h2 class="font-600 mb-3">Add a session</h2>
			<div class="flex flex-wrap items-end gap-x-4 gap-y-3">
				<fieldset class="flex items-center gap-1" aria-label="Kind">
					{#each SESSION_KINDS as k (k)}
						<button
							type="button"
							class="rounded border px-3 py-1 text-14px {kind === k
								? 'border-blue-300 bg-blue-300 text-dark'
								: 'border-current/40 opacity-80 hover-opacity-100'} {k === 'practice'
								? 'rounded-r-none'
								: 'rounded-l-none border-l-0'}"
							aria-pressed={kind === k}
							onclick={() => (kind = k)}>{SESSION_KIND_LABELS[k]}</button
						>
					{/each}
				</fieldset>
				<label class="grid gap-1 text-13px text-dim">
					Day
					<input
						class="field"
						type="date"
						value={recordedOn || today()}
						oninput={(e) => (recordedOn = e.currentTarget.value)}
					/>
				</label>
				<label class="grid gap-1 text-13px text-dim">
					Place
					<input
						class="field"
						type="text"
						placeholder="The rehearsal room, the venue"
						maxlength="120"
						bind:value={place}
					/>
				</label>
				<label class="button-accent cursor-pointer {busy ? 'opacity-60 pointer-events-none' : ''}">
					<span class="i-ph-upload-simple" aria-hidden="true"></span>
					{busy ? "Uploading…" : "Choose files"}
					<input
						class="sr-only"
						type="file"
						accept={DEMO_ACCEPT}
						multiple
						disabled={busy}
						onchange={(e) => uploadPicked(e.currentTarget)}
					/>
				</label>
			</div>
			<p class="mt-2 text-12px text-dim">
				Audio in any format a demo takes, up to {formatBytes(SESSION_MAX_BYTES)} a file; each file becomes
				a session of its own.
			</p>
			{#if jobs.length > 0}
				<ul class="mt-3 grid gap-1 text-13px" aria-label="Uploads">
					{#each jobs as job (job.name)}
						<li class="flex flex-wrap items-center gap-3">
							<span class="min-w-0 truncate">{job.name}</span>
							{#if job.error}
								<span class="text-red-400">{job.error}</span>
							{:else}
								<progress class="h-2 w-32" max="100" value={job.percent}></progress>
								<span class="tabular-nums text-dim">{Math.round(job.percent)}%</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	{#if data.sessions.length === 0}
		<p class="opacity-80">No sessions yet.</p>
	{:else}
		<div class="mb-3 flex items-center gap-1 text-13px" role="group" aria-label="Show">
			{#each [["all", "All"], ["practice", "Practice"], ["show", "Show"]] as [k, label] (k)}
				<button
					type="button"
					class="rounded px-2.5 py-1 {filter === k
						? 'bg-white/15 text-neutral-100'
						: 'opacity-70 hover-opacity-100'}"
					aria-pressed={filter === k}
					onclick={() => (filter = k as typeof filter)}>{label}</button
				>
			{/each}
			<span class="ml-2 text-dim">{shown.length} {shown.length === 1 ? "session" : "sessions"}</span
			>
		</div>
		{#each days as group (group.day)}
			<section class="max-w-article mb-6" aria-label={dayText(group.day)}>
				<h2 class="mb-2 text-13px uppercase tracking-wider opacity-60">{dayText(group.day)}</h2>
				<ul class="surface divide-y divide-white/10 text-15px">
					{#each group.sessions as s (s.id)}
						<li class="grid gap-2 px-5 py-3" data-session={s.id}>
							{#if editing === s.id}
								<form
									class="grid gap-2 text-14px"
									onsubmit={(e) => {
										e.preventDefault();
										void saveEdit(s.id);
									}}
								>
									<div class="flex flex-wrap items-end gap-3">
										<label class="grid gap-1 text-12px text-dim">
											Kind
											<select class="field" bind:value={draft.kind}>
												{#each SESSION_KINDS as k (k)}
													<option value={k}>{SESSION_KIND_LABELS[k]}</option>
												{/each}
											</select>
										</label>
										<label class="grid min-w-48 flex-1 gap-1 text-12px text-dim">
											Title
											<input class="field" type="text" maxlength="120" bind:value={draft.title} />
										</label>
										<label class="grid gap-1 text-12px text-dim">
											Day
											<input class="field" type="date" bind:value={draft.recordedOn} />
										</label>
										<label class="grid min-w-40 gap-1 text-12px text-dim">
											Place
											<input class="field" type="text" maxlength="120" bind:value={draft.place} />
										</label>
									</div>
									<label class="grid gap-1 text-12px text-dim">
										Notes
										<textarea class="field" rows="3" maxlength="2000" bind:value={draft.notes}
										></textarea>
									</label>
									<div class="flex gap-2">
										<button class="button-accent button-sm" type="submit" disabled={saving}>
											{saving ? "Saving…" : "Save"}
										</button>
										<button class="button button-sm" type="button" onclick={() => (editing = null)}
											>Cancel</button
										>
									</div>
								</form>
							{:else}
								<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
									<span
										class="rounded border px-1.5 py-0.5 text-10px uppercase tracking-wider {s.kind ===
										'show'
											? 'border-amber-300/60 text-amber-200'
											: 'border-white/25 opacity-80'}">{SESSION_KIND_LABELS[s.kind]}</span
									>
									<span class="min-w-0 truncate font-600" title={s.filename}>{nameOf(s)}</span>
									<span class="text-13px text-dim">
										{#if s.place}{s.place} ·
										{/if}{s.uploader?.name ?? "someone"} · {formatBytes(s.sizeBytes)}
									</span>
									<span class="ml-auto flex items-center gap-1">
										<button
											class="button button-xs"
											type="button"
											title="Download {s.filename}"
											onclick={() => saveAs(s.url, s.filename)}
										>
											<span class="i-ph-download-simple" aria-hidden="true"></span> Download
										</button>
										{#if data.canEdit}
											<button class="button button-xs" type="button" onclick={() => startEdit(s)}>
												<span class="i-ph-pencil-simple" aria-hidden="true"></span> Edit
											</button>
											<button
												class="button button-xs text-red-300"
												type="button"
												onclick={() => remove(s)}
											>
												<span class="i-ph-trash" aria-hidden="true"></span> Delete
											</button>
										{/if}
									</span>
								</div>
								{#if s.notes}
									<p class="whitespace-pre-wrap text-13px opacity-85">{s.notes}</p>
								{/if}
								<!-- svelte-ignore a11y_media_has_caption -->
								<audio class="w-full" controls preload="none" src={s.url}></audio>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{/if}
</main>
