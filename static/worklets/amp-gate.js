/**
 * The Practice Amp's noise gate (docs/practice-amp.md, "The gate"): the
 * signal's envelope (the louder channel, a 1 ms attack and a 10 ms release
 * on the follower) against a threshold with 3 dB of hysteresis; above it
 * the gate opens over `attack`, below it the gate waits `hold` then
 * closes over `release`. Parameters are k-rate: threshold in dBFS,
 * attack, hold and release in seconds, and `on` (0 passes the signal
 * untouched). Stereo in, stereo out.
 */
class AmpGate extends AudioWorkletProcessor {
	static get parameterDescriptors() {
		return [
			{
				name: "threshold",
				defaultValue: -50,
				minValue: -90,
				maxValue: 0,
				automationRate: "k-rate",
			},
			{
				name: "attack",
				defaultValue: 0.005,
				minValue: 0.0005,
				maxValue: 0.2,
				automationRate: "k-rate",
			},
			{ name: "hold", defaultValue: 0.05, minValue: 0, maxValue: 1, automationRate: "k-rate" },
			{
				name: "release",
				defaultValue: 0.1,
				minValue: 0.005,
				maxValue: 2,
				automationRate: "k-rate",
			},
			{ name: "on", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
		];
	}
	constructor() {
		super();
		this.env = 0;
		this.gain = 0;
		this.open = false;
		this.holdLeft = 0;
		this.followAttack = 1 - Math.exp(-1 / (0.001 * sampleRate));
		this.followRelease = 1 - Math.exp(-1 / (0.01 * sampleRate));
	}
	process(inputs, outputs, params) {
		const input = inputs[0];
		const output = outputs[0];
		if (!input || input.length === 0) return true;
		const frames = input[0].length;
		const on = params.on[0] >= 0.5;
		if (!on) {
			for (let c = 0; c < output.length; c++) output[c].set(input[Math.min(c, input.length - 1)]);
			// The gate is ready to open at once when it is switched on mid-note.
			this.gain = 1;
			this.open = true;
			return true;
		}
		const openAt = Math.pow(10, params.threshold[0] / 20);
		const closeAt = openAt * 0.7;
		const attack = 1 - Math.exp(-1 / (Math.max(0.0005, params.attack[0]) * sampleRate));
		const release = 1 - Math.exp(-1 / (Math.max(0.005, params.release[0]) * sampleRate));
		const hold = params.hold[0];
		const left = input[0];
		const right = input[1] ?? input[0];
		for (let i = 0; i < frames; i++) {
			const level = Math.max(Math.abs(left[i]), Math.abs(right[i]));
			this.env += (level - this.env) * (level > this.env ? this.followAttack : this.followRelease);
			if (this.env > openAt) {
				this.open = true;
				this.holdLeft = hold;
			} else if (this.open && this.env < closeAt) {
				this.holdLeft -= 1 / sampleRate;
				if (this.holdLeft <= 0) this.open = false;
			}
			const target = this.open ? 1 : 0;
			this.gain += (target - this.gain) * (target > this.gain ? attack : release);
			for (let c = 0; c < output.length; c++)
				output[c][i] = input[Math.min(c, input.length - 1)][i] * this.gain;
		}
		return true;
	}
}
registerProcessor("amp-gate", AmpGate);
