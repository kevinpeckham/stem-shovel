import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeAll, describe, expect, test } from "vite-plus/test";
import type { MixerGroup, MixerModel, MixerTrack } from "#lib/audio/mixerModel.js";
import { METER_ZERO } from "#lib/utils/meterLevel.js";
import { gainAtY, xOfPan, yOfGain } from "#lib/utils/stagePosition.js";
import MixerStage from "./MixerStage.svelte";

/**
 * The Stage over a fake model: pucks sit where pan and level say, a drag
 * writes both (Shift one), the keys nudge and toggle, the strip follows
 * the selection. The geometry is stubbed (jsdom has no layout): the field
 * is 400 by 300.
 */
beforeAll(() => {
	if (!("setPointerCapture" in Element.prototype))
		Object.assign(Element.prototype, {
			setPointerCapture() {},
			releasePointerCapture() {},
		});
	Element.prototype.getBoundingClientRect = () =>
		({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300 }) as DOMRect;
});

function fake(
	levels: MixerModel["levels"] = { a: { ...METER_ZERO, rms: 0.5 } },
	groups?: MixerGroup[],
	extraTracks: MixerTrack[] = [],
): MixerModel & {
	calls: Record<string, unknown[][]>;
} {
	const tracks: MixerTrack[] = [
		{
			id: "a",
			number: 1,
			label: "Guitar",
			tint: "sea",
			gain: 1,
			pan: 0,
			muted: false,
			soloed: false,
			mono: true,
			loudness: 0,
		},
		{
			id: "b",
			number: 2,
			label: "A very long bass synth name that truncates",
			tint: null,
			gain: 0.5,
			pan: -0.5,
			muted: false,
			soloed: false,
			mono: false,
			loudness: -6,
		},
		...extraTracks,
	];
	const calls: Record<string, unknown[][]> = {};
	const log = (name: string, ...args: unknown[]) => (calls[name] ??= []).push(args);
	return {
		calls,
		get tracks() {
			return tracks;
		},
		master: 1,
		anySolo: false,
		levels,
		masterLevel: METER_ZERO,
		setGain: (id, v) => {
			log("setGain", id, v);
			tracks.find((t) => t.id === id)!.gain = v;
		},
		setPan: (id, v) => {
			log("setPan", id, v);
			tracks.find((t) => t.id === id)!.pan = v;
		},
		toggleMute: (id) => log("toggleMute", id),
		toggleSolo: (id) => log("toggleSolo", id),
		setMaster: (v) => log("setMaster", v),
		resetClips: (id) => log("resetClips", id),
		...(groups
			? {
					get groups() {
						return groups;
					},
					setGroupGain: (id, v) => log("setGroupGain", id, v),
					setGroupPan: (id, v) => log("setGroupPan", id, v),
					toggleGroupMute: (id) => log("toggleGroupMute", id),
					toggleGroupCollapsed: (id) => {
						log("toggleGroupCollapsed", id);
						groups.find((g) => g.id === id)!.collapsed = !groups.find((g) => g.id === id)!
							.collapsed;
					},
				}
			: {}),
	};
}

describe("MixerStage", () => {
	test("places each puck by its pan and heard level, numbered and named", () => {
		const model = fake();
		render(MixerStage, { props: { model } });
		const a = screen.getByRole("button", { name: "1, Guitar: 0 dB, C, mono" });
		const b = screen.getByRole("button", { name: /^2, A very long bass synth name/ });
		expect(a.style.left).toBe("50%");
		expect(b.style.left).toBe(`${xOfPan(-0.5) * 100}%`);
		// The quieter track sits lower: a larger CSS top.
		expect(parseFloat(b.style.top)).toBeGreaterThan(parseFloat(a.style.top));
		expect(a.textContent).toContain("1");
		expect(b.textContent).toContain("A very long bass synth name");
	});

	test("a drag writes pan and level; with Shift only the axis it started along", async () => {
		const model = fake();
		render(MixerStage, { props: { model } });
		const a = screen.getByRole("button", { name: /^1, Guitar/ });
		await fireEvent.pointerDown(a, { pointerId: 1, button: 0, clientX: 200, clientY: 100 });
		await fireEvent.pointerMove(a, { pointerId: 1, clientX: 300, clientY: 130 });
		await fireEvent.pointerUp(a, { pointerId: 1 });
		// 100 px right of 400 is a quarter of the width: pan 0 → 0.5.
		expect(model.calls.setPan?.at(-1)).toEqual(["a", 0.5]);
		// 30 px down of 300 is a tenth of the height off the puck's level.
		const y0 = yOfGain(1, 0);
		expect(model.calls.setGain?.at(-1)?.[1]).toBeCloseTo(gainAtY(y0 - 0.1, 0), 6);
		const pans = model.calls.setPan.length;
		// Shift from the start, moving mostly sideways: the level stays where it was.
		await fireEvent.pointerDown(a, { pointerId: 2, button: 0, clientX: 200, clientY: 100 });
		await fireEvent.pointerMove(a, { pointerId: 2, clientX: 240, clientY: 110, shiftKey: true });
		await fireEvent.pointerUp(a, { pointerId: 2 });
		expect(model.calls.setPan.length).toBeGreaterThan(pans);
		expect(model.calls.setGain.at(-1)?.[1]).toBeCloseTo(
			model.calls.setGain.at(-2)?.[1] as number,
			6,
		);
	});

	test("keys nudge pan and level, M and S toggle, and the strip follows the selection", async () => {
		const model = fake();
		render(MixerStage, { props: { model } });
		const b = screen.getByRole("button", { name: /^2, A very long bass synth name/ });
		b.focus();
		await fireEvent.focus(b);
		await tick();
		const strip = document.querySelector("[data-stage-strip]")!;
		expect(strip.textContent).toContain("2 -");
		expect(strip.textContent).toContain("-6 dB · L 50");
		await fireEvent.keyDown(b, { key: "ArrowRight" });
		expect(model.calls.setPan.at(-1)).toEqual(["b", -0.45]);
		await fireEvent.keyDown(b, { key: "ArrowLeft", shiftKey: true });
		expect(model.calls.setPan.at(-1)).toEqual(["b", -0.65]);
		await fireEvent.keyDown(b, { key: "ArrowUp" });
		expect(model.calls.setGain.at(-1)?.[1]).toBeCloseTo(0.5 * 10 ** (1 / 20), 9);
		await fireEvent.keyDown(b, { key: "m" });
		await fireEvent.keyDown(b, { key: "s" });
		expect(model.calls.toggleMute).toEqual([["b"]]);
		expect(model.calls.toggleSolo).toEqual([["b"]]);
		// The strip's own buttons work the same model.
		await fireEvent.click(screen.getByRole("button", { name: /^Mute A very long/ }));
		expect(model.calls.toggleMute.length).toBe(2);
	});

	test("a double-click centers the pan, and with Alt returns the level to unity", async () => {
		const model = fake();
		render(MixerStage, { props: { model } });
		const b = screen.getByRole("button", { name: /^2, A very long bass synth name/ });
		await fireEvent.dblClick(b);
		expect(model.calls.setPan.at(-1)).toEqual(["b", 0]);
		await fireEvent.dblClick(b, { altKey: true });
		expect(model.calls.setGain.at(-1)).toEqual(["b", 1]);
	});

	test("the balance meter leans toward the louder side", () => {
		const model = fake({ a: { ...METER_ZERO, rms: 0.5 }, b: { ...METER_ZERO, rms: 0.5 } });
		render(MixerStage, { props: { model } });
		// a at center, b half left: the mix leans left.
		const meter = screen.getByRole("meter", { name: "Mix balance" });
		expect(Number(meter.getAttribute("aria-valuenow"))).toBeLessThan(0);
		expect(screen.getByRole("meter", { name: "Master level" })).toBeTruthy();
	});

	test("pucks on one spot spread into a ring, the first naming the ring and counting the rest", () => {
		const twin: MixerTrack = {
			id: "c",
			number: 3,
			label: "Guitar 2",
			tint: null,
			gain: 1,
			pan: 0,
			muted: false,
			soloed: false,
			mono: true,
			loudness: 0,
		};
		const model = fake(undefined, undefined, [twin]);
		render(MixerStage, { props: { model } });
		const a = screen.getByRole("button", { name: "1, Guitar: 0 dB, C, mono" });
		const c = screen.getByRole("button", { name: "3, Guitar 2: 0 dB, C, mono" });
		expect(a.dataset.stageCluster).toBe("2");
		expect(a.style.marginTop).toBe("-30px");
		expect(c.style.marginTop).toBe("30px");
		expect(a.textContent).toContain("Guitar +1");
		expect(c.textContent).not.toContain("Guitar 2");
		// The lone bass sits where it was.
		const b = screen.getByRole("button", { name: /^2, A very long bass synth name/ });
		expect(b.dataset.stageCluster).toBeUndefined();
		expect(b.style.marginLeft).toBe("");
	});

	test("a group is a puck of its own: dragged it writes the bus, folded it hides its tracks", async () => {
		const groups: MixerGroup[] = [
			{
				id: "g",
				label: "Band",
				tint: "sea",
				gain: 1,
				pan: 0.5,
				muted: false,
				collapsed: false,
				trackIds: ["a"],
			},
		];
		const model = fake(undefined, groups);
		render(MixerStage, { props: { model } });
		const g = screen.getByRole("button", { name: "Group Band: 0 dB, R 50" });
		expect(g.dataset.stageKind).toBe("group");
		expect(g.style.left).toBe(`${xOfPan(0.5) * 100}%`);
		await fireEvent.pointerDown(g, { pointerId: 1, button: 0, clientX: 300, clientY: 100 });
		await fireEvent.pointerMove(g, { pointerId: 1, clientX: 200, clientY: 100 });
		await fireEvent.pointerUp(g, { pointerId: 1 });
		expect(model.calls.setGroupPan?.at(-1)).toEqual(["g", 0]);
		expect(model.calls.setPan).toBeUndefined();
		// The strip: mute and fold, no solo and no menu; F folds too.
		await fireEvent.click(screen.getByRole("button", { name: "Mute Band" }));
		expect(model.calls.toggleGroupMute?.at(-1)).toEqual(["g"]);
		expect(screen.queryByRole("button", { name: "Solo Band" })).toBeNull();
		await fireEvent.click(screen.getByRole("button", { name: "Fold Band" }));
		expect(model.calls.toggleGroupCollapsed?.at(-1)).toEqual(["g"]);
	});

	test("a folded group hides the tracks under it behind its puck", async () => {
		const model = fake(undefined, [
			{
				id: "g",
				label: "Band",
				tint: "sea",
				gain: 1,
				pan: 0.5,
				muted: false,
				collapsed: true,
				trackIds: ["a"],
			},
		]);
		render(MixerStage, { props: { model } });
		expect(screen.queryByRole("button", { name: "1, Guitar: 0 dB, C, mono" })).toBeNull();
		expect(
			screen.getByRole("button", { name: /^2, A very long bass synth name/ }),
		).toBeInTheDocument();
		const g = screen.getByRole("button", { name: "Group Band: 0 dB, R 50, folded" });
		g.focus();
		await tick();
		expect(screen.getByRole("button", { name: "Unfold Band" })).toBeInTheDocument();
	});
});
