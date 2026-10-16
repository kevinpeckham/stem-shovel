/**
 * Where the mix's energy sits, left to right (the Stage's balance bar,
 * docs/visual-mixer.md): each track's live level through the pan law the
 * mixer uses (static/worklets/stem-mixer.js `panWeights`, and the engine's
 * `monoPan`): a stereo track pans as a balance, the far channel folding
 * into the near one on a sine; a mono track as a position, at unity in
 * both channels at center. `balance` is −1 (all left) to 1 (all right),
 * 0 when the sides are equal or there is no signal.
 */
export interface PanBalance {
	left: number;
	right: number;
	balance: number;
}

export function panWeightsOf(
	pan: number,
	mono: boolean,
): { ll: number; lr: number; rl: number; rr: number } {
	if (mono) {
		const wL = pan > 0 ? Math.cos((pan * Math.PI) / 2) : 1;
		const wR = pan < 0 ? Math.sin(((pan + 1) * Math.PI) / 2) : 1;
		return { ll: wL, lr: 0, rl: wR, rr: 0 };
	}
	if (pan <= 0) {
		const theta = ((pan + 1) * Math.PI) / 2;
		return { ll: 1, lr: Math.cos(theta), rl: 0, rr: Math.sin(theta) };
	}
	const theta = (pan * Math.PI) / 2;
	return { ll: Math.cos(theta), lr: 0, rl: Math.sin(theta), rr: 1 };
}

export function panBalance(
	tracks: readonly { level: number; pan: number; mono: boolean }[],
): PanBalance {
	let left = 0;
	let right = 0;
	for (const t of tracks) {
		if (t.level <= 0) continue;
		const w = panWeightsOf(t.pan, t.mono);
		left += t.level * (w.ll + w.lr);
		right += t.level * (w.rl + w.rr);
	}
	const total = left + right;
	return { left, right, balance: total > 0 ? (right - left) / total : 0 };
}
