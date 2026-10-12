// @ts-nocheck -- the worklet scope (AudioWorkletProcessor, sampleRate, registerProcessor) is not in the app's types; the Mixer is tested from Node (stemMixer.test.ts)
/**
 * The streamed stem player's mixer (docs/stem-streaming.md): one processor
 * owns a sample counter and sums every stem's decoded chunks against it,
 * so the stems stay sample-locked by construction. Chunks arrive from the
 * decode worker over a MessagePort the main thread hands over (`port`),
 * each with its absolute start sample and a generation number (a seek
 * bumps it; chunks of an old generation are dropped). The counter runs
 * only while playing and primed: every stem has `PRIME` seconds queued
 * from the counter, or has ended. A stem whose queue runs dry mid-play
 * stops the counter for all (a mix with a stem missing is wrong in a way
 * nobody notices) and reports `buffering`. Gains ramp exponentially, as
 * `setTargetAtTime` does on the buffered path.
 *
 * Control messages (from the main thread): port, stems, gain, play,
 * pause, seek, remove, keep. Reports (to the main thread): position,
 * state, ended. Feed messages (from the worker): chunk, end; the worklet
 * posts position back over the feed so the worker decodes ahead.
 */

/** Seconds of audio every stem must hold past the counter before it runs. */
const PRIME = 1;
/** Seconds of audio kept behind the counter (a short seek back needs no decode). */
const KEEP_BEHIND = 1;
/** The gain ramp's time constant, seconds (engine.svelte.ts, RAMP). */
const RAMP = 0.015;
/** How often the position is reported, in samples. */
const REPORT_EVERY = 2048;

/**
 * The mixing state apart from the AudioWorkletProcessor shell, so it can be
 * tested in Node (stemMixer.test.ts): the queues, the counter, the ramps.
 */
export class Mixer {
	constructor(sampleRate, channels = 2) {
		this.sampleRate = sampleRate;
		this.channels = channels;
		/** id → { queue: [{start, data: Float32Array[]}], gain, target, ended: number | null } */
		this.stems = new Map();
		this.counter = 0;
		this.generation = 0;
		this.playing = false;
		this.primed = false;
		this.buffering = false;
		this.rampK = 1 - Math.exp(-128 / (RAMP * sampleRate));
		this.sinceReport = 0;
	}

	setStems(ids) {
		for (const id of ids)
			if (!this.stems.has(id)) this.stems.set(id, { queue: [], gain: 0, target: 1, ended: null });
		for (const id of this.stems.keys()) if (!ids.includes(id)) this.stems.delete(id);
	}

	setGain(id, value, immediate) {
		const stem = this.stems.get(id);
		if (!stem) return;
		stem.target = value;
		if (immediate) stem.gain = value;
	}

	remove(id) {
		this.stems.delete(id);
	}

	seek(sample, generation) {
		this.generation = generation;
		this.counter = sample;
		this.primed = false;
		this.buffering = false;
		for (const stem of this.stems.values()) {
			stem.queue = [];
			stem.ended = null;
		}
	}

	/** A decoded chunk: `data` is one Float32Array per channel, all the same length. */
	push(id, generation, start, data) {
		if (generation !== this.generation) return;
		const stem = this.stems.get(id);
		if (!stem || data.length === 0 || data[0].length === 0) return;
		const chunk = { start, data };
		const q = stem.queue;
		// Chunks arrive in order from one decoder; a late one slots in by start.
		if (q.length === 0 || q[q.length - 1].start <= start) q.push(chunk);
		else {
			let i = q.length - 1;
			while (i > 0 && q[i - 1].start > start) i--;
			q.splice(i, 0, chunk);
		}
	}

	/** The stem's stream ends at `sample`: silence from there is not an underrun. */
	end(id, generation, sample) {
		if (generation !== this.generation) return;
		const stem = this.stems.get(id);
		if (stem) stem.ended = sample;
	}

	/** Samples queued contiguously from `from` (0 when the queue has a gap there). */
	coverage(stem, from) {
		let at = from;
		for (const c of stem.queue) {
			const end = c.start + c.data[0].length;
			if (end <= at) continue;
			if (c.start > at) break;
			at = end;
		}
		return at - from;
	}

	ready(stem) {
		if (stem.ended !== null && stem.ended <= this.counter) return true;
		const need =
			stem.ended === null
				? PRIME * this.sampleRate
				: Math.min(PRIME * this.sampleRate, stem.ended - this.counter);
		return this.coverage(stem, this.counter) >= need;
	}

	/** True when every stem has run out for good. */
	allEnded() {
		if (this.stems.size === 0) return false;
		for (const stem of this.stems.values())
			if (stem.ended === null || stem.ended > this.counter) return false;
		return true;
	}

	/**
	 * Mix `frames` samples into `out` (one Float32Array per output channel,
	 * zeroed by the caller). Returns what happened: "silent" (not playing),
	 * "buffering" (the counter did not move), "mixed", or "ended".
	 */
	mix(out, frames) {
		if (!this.playing) return "silent";
		if (!this.primed) {
			for (const stem of this.stems.values()) if (!this.ready(stem)) return "buffering";
			this.primed = true;
		}
		if (this.allEnded()) return "ended";
		const from = this.counter;
		const to = from + frames;
		// Every stem must cover the quantum (or have ended within it) before any of it sounds.
		for (const stem of this.stems.values()) {
			const until = stem.ended === null ? to : Math.min(to, stem.ended);
			if (until > from && this.coverage(stem, from) < until - from) return "buffering";
		}
		for (const stem of this.stems.values()) {
			// The ramp: one step per quantum toward the target, applied evenly across it.
			const g0 = stem.gain;
			stem.gain += (stem.target - stem.gain) * this.rampK;
			const g1 = stem.gain;
			if (g0 === 0 && g1 === 0) continue;
			for (const c of stem.queue) {
				const cEnd = c.start + c.data[0].length;
				if (cEnd <= from) continue;
				if (c.start >= to) break;
				const a = Math.max(from, c.start);
				const b = Math.min(to, cEnd);
				const mono = c.data.length === 1;
				for (let ch = 0; ch < out.length; ch++) {
					const src = mono ? c.data[0] : c.data[Math.min(ch, c.data.length - 1)];
					const dst = out[ch];
					for (let s = a; s < b; s++) {
						const t = (s - from) / frames;
						dst[s - from] += src[s - c.start] * (g0 + (g1 - g0) * t);
					}
				}
			}
		}
		this.counter = to;
		this.trim();
		return "mixed";
	}

	/** Chunks wholly behind the counter by more than KEEP_BEHIND go. */
	trim() {
		const keepFrom = this.counter - KEEP_BEHIND * this.sampleRate;
		for (const stem of this.stems.values()) {
			let drop = 0;
			while (
				drop < stem.queue.length &&
				stem.queue[drop].start + stem.queue[drop].data[0].length <= keepFrom
			)
				drop++;
			if (drop) stem.queue.splice(0, drop);
		}
	}
}

if (typeof AudioWorkletProcessor !== "undefined") {
	class StemMixerProcessor extends AudioWorkletProcessor {
		constructor() {
			super();
			this.mixer = new Mixer(sampleRate, 2);
			this.feed = null;
			this.wasBuffering = false;
			this.port.onmessage = (e) => this.control(e.data);
		}

		control(m) {
			const x = this.mixer;
			switch (m.type) {
				case "port":
					this.feed = m.port;
					this.feed.onmessage = (e) => this.fed(e.data);
					break;
				case "stems":
					x.setStems(m.ids);
					break;
				case "gain":
					x.setGain(m.id, m.value, !!m.immediate);
					break;
				case "play":
					x.playing = true;
					break;
				case "pause":
					x.playing = false;
					this.report(true);
					break;
				case "seek":
					x.seek(m.sample, m.generation);
					this.report(true);
					break;
				case "remove":
					x.remove(m.id);
					break;
			}
		}

		fed(m) {
			if (m.type === "chunk") this.mixer.push(m.id, m.generation, m.start, m.data);
			else if (m.type === "end") this.mixer.end(m.id, m.generation, m.sample);
		}

		report(force) {
			const x = this.mixer;
			x.sinceReport += 128;
			if (!force && x.sinceReport < REPORT_EVERY) return;
			x.sinceReport = 0;
			const msg = { type: "position", sample: x.counter, generation: x.generation };
			this.port.postMessage(msg);
			if (this.feed) this.feed.postMessage(msg);
		}

		process(_inputs, outputs) {
			const out = outputs[0];
			if (!out || out.length === 0) return true;
			const frames = out[0].length;
			for (const ch of out) ch.fill(0);
			const x = this.mixer;
			const result = x.mix(out, frames);
			const buffering = result === "buffering";
			if (buffering !== this.wasBuffering) {
				this.wasBuffering = buffering;
				this.port.postMessage({ type: "state", buffering });
			}
			if (result === "ended") {
				x.playing = false;
				this.port.postMessage({ type: "ended", sample: x.counter });
			} else if (result === "mixed") this.report(false);
			return true;
		}
	}
	registerProcessor("stem-mixer", StemMixerProcessor);
}
