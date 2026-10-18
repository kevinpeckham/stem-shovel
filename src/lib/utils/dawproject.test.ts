import { STUDIO_FADER_MAX } from "#lib/constants/studio.js";
import type { StudioArrangement } from "#lib/val/StudioSchema.js";
import { describe, expect, it } from "vite-plus/test";
import { dawproject } from "./dawproject";

const arrangement: StudioArrangement = {
	version: 1,
	bpm: 124,
	beatsPerBar: 3,
	gridOn: true,
	countIn: false,
	click: false,
	loop: null,
	master: 0.9,
	buses: [{ id: "b1", name: "Drums & FX", gain: 0.8, pan: 0.2, muted: false, colour: "sea" }],
	tracks: [
		{
			id: "t1",
			name: 'Guitar "lead" <solo>',
			gain: 0.7,
			pan: -0.5,
			muted: false,
			solo: true,
			armed: false,
			input: null,
			colour: "rose",
			sends: [
				{ bus: "b1", level: 0.4 },
				{ bus: "gone", level: 1 },
			],
			automation: {
				volume: [
					{ t: 0, v: 0.2 },
					{ t: 4, v: 1 },
				],
				pan: [{ t: 1, v: -1 }],
			},
		},
		{
			id: "t2",
			name: "Keys",
			kind: "midi",
			gain: 1,
			pan: 0,
			muted: true,
			solo: false,
			armed: false,
			input: { source: "piano", channel: "stereo" },
			output: "b1",
		},
	],
	clips: [
		{
			id: "c1",
			trackId: "t1",
			sourceId: "s1",
			start: 2,
			offset: 0.5,
			duration: 10,
			gain: 1,
			fadeIn: 0.1,
			fadeOut: 0.25,
			name: "Take 1",
		},
		{
			id: "c2",
			trackId: "t1",
			sourceId: "missing",
			start: 20,
			offset: 0,
			duration: 1,
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: "Lost",
		},
		{
			id: "c3",
			trackId: "t2",
			notes: [
				{ t: 0, d: 0.5, p: 60, v: 0.8 },
				{ t: 1, d: 0.5, p: 64, v: 1 },
			],
			start: 4,
			offset: 0,
			duration: 2,
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: "Chords",
		},
	],
};

describe("dawproject", () => {
	const { project, metadata } = dawproject({
		title: "Exiles & Endtimes",
		arrangement,
		audio: new Map([
			["s1", { path: "audio/guitar.wav", durationSeconds: 30.5, sampleRate: 48000, channels: 2 }],
		]),
		application: { name: "Stem Shovel Dawn", version: "0.138.0" },
	});
	it("writes the transport and the application", () => {
		expect(project).toContain('<Project version="1.0">');
		expect(project).toContain('<Application name="Stem Shovel Dawn" version="0.138.0"/>');
		expect(project).toContain('<Tempo unit="bpm" value="124.000000"');
		expect(project).toContain('<TimeSignature numerator="3" denominator="4"');
	});
	it("writes a track per track and bus and the master, with channels, routing and sends", () => {
		expect(project).toMatch(
			/<Track contentType="audio" loaded="true" id="track\d+" name="Guitar &quot;lead&quot; &lt;solo&gt;" color="#C98A9C">/,
		);
		expect(project).toMatch(/<Track contentType="notes" loaded="true" id="track\d+" name="Keys">/);
		expect(project).toMatch(
			/<Track contentType="audio" loaded="true" id="track\d+" name="Drums &amp; FX" color="#7FB2C2">/,
		);
		expect(project).toMatch(
			/<Track contentType="audio notes" loaded="true" id="track\d+" name="Master">/,
		);
		// The guitar goes to the master, the keys to the bus, the bus to the master.
		const master = /<Channel audioChannels="2" role="master" solo="false" id="(ch\d+)">/.exec(
			project,
		)![1];
		const bus =
			/<Channel audioChannels="2" role="effect" solo="false" destination="(ch\d+)" id="(ch\d+)">/.exec(
				project,
			)!;
		expect(bus[1]).toBe(master);
		expect(project).toContain(
			`<Channel audioChannels="2" role="regular" solo="true" destination="${master}" id="`,
		);
		expect(project).toContain(
			`<Channel audioChannels="2" role="regular" solo="false" destination="${bus[2]}" id="`,
		);
		expect(project).toContain(
			`<Volume max="${STUDIO_FADER_MAX.toFixed(6)}" min="0.000000" unit="linear" value="0.700000"`,
		);
		// Pan −0.5 is 0.25 normalized.
		expect(project).toContain('unit="normalized" value="0.250000"');
		expect(project).toContain('<Mute value="true"');
		// The send to the bus; the one to a bus that is gone is dropped.
		expect(project).toContain(`<Send destination="${bus[2]}" type="post"`);
		expect((project.match(/<Send /g) ?? []).length).toBe(1);
		expect(project).toMatch(/value="0.400000" id="sendvol\d+" name="Send"/);
	});
	it("writes the clips in seconds: audio over its file with offset and fades, notes as notes, a lost source skipped", () => {
		expect(project).toContain(
			'<Clip time="2.000000" duration="10.000000" contentTimeUnit="seconds" playStart="0.500000" fadeTimeUnit="seconds" fadeInTime="0.100000" fadeOutTime="0.250000" name="Take 1">',
		);
		expect(project).toContain(
			'<Audio algorithm="raw" channels="2" duration="30.500000" sampleRate="48000"',
		);
		expect(project).toContain('<File path="audio/guitar.wav"/>');
		expect(project).not.toContain('name="Lost"');
		expect(project).toContain(
			'<Clip time="4.000000" duration="2.000000" contentTimeUnit="seconds" playStart="0.000000" name="Chords">',
		);
		expect(project).toContain(
			'<Note time="0.000000" duration="0.500000" channel="0" key="60" vel="0.800000" rel="0.800000"/>',
		);
		expect(project).toContain('<Note time="1.000000" duration="0.500000" channel="0" key="64"');
	});
	it("writes the volume and pan lanes as points on the channel's own parameters", () => {
		const guitarVolume = /value="0.700000" id="(vol\d+)"/.exec(project)![1];
		expect(project).toMatch(/<Points unit="linear" id="pts\d+">/);
		expect(project).toContain(`<Target parameter="${guitarVolume}"/>`);
		expect(project).toContain(
			'<RealPoint time="0.000000" value="0.200000" interpolation="linear"/>',
		);
		expect(project).toContain(
			'<RealPoint time="4.000000" value="1.000000" interpolation="linear"/>',
		);
		expect(project).toMatch(/<Points unit="normalized" id="pts\d+">/);
		expect(project).toContain(
			'<RealPoint time="1.000000" value="0.000000" interpolation="linear"/>',
		);
	});
	it("writes the title in the metadata", () => {
		expect(metadata).toContain("<Title>Exiles &amp; Endtimes</Title>");
	});
	it("is well-formed: every opened element closes", () => {
		const opens = (project.match(/<([A-Za-z]+)[\s>]/g) ?? []).filter((m) => !m.endsWith("/"));
		const stack: string[] = [];
		for (const tag of project.match(/<\/?[A-Za-z]+[^>]*>/g) ?? []) {
			if (tag.startsWith("<?")) continue;
			if (tag.endsWith("/>")) continue;
			const name = /^<\/?([A-Za-z]+)/.exec(tag)![1]!;
			if (tag.startsWith("</")) expect(stack.pop()).toBe(name);
			else stack.push(name);
		}
		expect(stack).toEqual([]);
		expect(opens.length).toBeGreaterThan(10);
	});
});
