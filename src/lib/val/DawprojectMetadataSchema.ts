import * as v from "valibot";

/**
 * What a DAWproject's `metadata.xml` carries besides the title (Bitwig's
 * MetaData.xsd, in its order; docs/multitrack-recorder.md "Song metadata
 * in the files"): the people, the record, the year and genre, the rights,
 * a web address and a free comment. Every field optional, each a line.
 */
export const DAWPROJECT_METADATA_FIELDS = [
	"artist",
	"album",
	"originalArtist",
	"composer",
	"songwriter",
	"producer",
	"arranger",
	"year",
	"genre",
	"copyright",
	"website",
	"comment",
] as const;
const line = v.optional(v.pipe(v.string(), v.trim(), v.maxLength(2000)));
export const DawprojectMetadataSchema = v.object({
	artist: line,
	album: line,
	originalArtist: line,
	composer: line,
	songwriter: line,
	producer: line,
	arranger: line,
	year: line,
	genre: line,
	copyright: line,
	website: line,
	comment: line,
});
export type DawprojectMetadata = v.InferOutput<typeof DawprojectMetadataSchema>;
