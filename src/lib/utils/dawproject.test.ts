// @vitest-environment jsdom
import { STUDIO_FADER_MAX } from "#lib/constants/studio.js";
import type { StudioArrangement } from "#lib/val/StudioSchema.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { XmlDocument, XsdValidator } from "libxml2-wasm";
import { describe, expect, it } from "vite-plus/test";
import { dawproject } from "./dawproject";
import { readDawproject } from "./dawprojectRead";

/** Bitwig's schemas (tests/dawproject/README.md): a strict importer's view of the file. */
const xsd = (name: string) =>
	readFileSync(resolve(process.cwd(), "tests/dawproject", name), "utf8");
function validate(xml: string, schema: string) {
	const validator = XsdValidator.fromDoc(XmlDocument.fromString(xsd(schema)));
	const doc = XmlDocument.fromString(xml);
	try {
		validator.validate(doc);
	} finally {
		doc.dispose();
		validator.dispose();
	}
}

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
	it("validates against Bitwig's schemas: the elements in the sequence the format fixes", () => {
		expect(() => validate(project, "Project.xsd")).not.toThrow();
		expect(() => validate(metadata, "MetaData.xsd")).not.toThrow();
	});
	it("writes the markers in seconds and the tempo and meter changes as held points in beats, as the reader takes them back", () => {
		const rich: StudioArrangement = {
			...arrangement,
			bpm: 120,
			beatsPerBar: 4,
			markers: [
				{ id: "m2", t: 8, name: "Chorus" },
				{ id: "m1", t: 0, name: "Intro <1>" },
			],
			// Four bars of 4/4 at 120 are 8 s = 16 beats; the waltz from there at 90 bpm.
			tempoChanges: [{ start: 8, bpm: 90 }],
			meterChanges: [{ start: 8, beatsPerBar: 3 }],
		};
		const { project: xml } = dawproject({
			title: "Rich",
			arrangement: rich,
			audio: new Map(),
			application: { name: "Stem Shovel Dawn", version: "0.138.0" },
		});
		expect(() => validate(xml, "Project.xsd")).not.toThrow();
		expect(xml).toContain('<Markers timeUnit="seconds"');
		expect(xml).toContain('<Marker time="0.000000" name="Intro &lt;1&gt;"/>');
		expect(xml).toContain('<Marker time="8.000000" name="Chorus"/>');
		expect(xml).toContain('<RealPoint time="16.000000" value="90.000000" interpolation="hold"/>');
		expect(xml).toContain('<TimeSignaturePoint time="16.000000" numerator="3" denominator="4"/>');
		// The reader's view of it: the same seconds back.
		const back = readDawproject(xml, null, "Rich");
		expect(back.arrangement.markers?.map((m) => [m.t, m.name])).toEqual([
			[0, "Intro <1>"],
			[8, "Chorus"],
		]);
		expect(back.arrangement.tempoChanges).toEqual([{ start: 8, bpm: 90 }]);
		expect(back.arrangement.meterChanges).toEqual([{ start: 8, beatsPerBar: 3 }]);
	});
});
