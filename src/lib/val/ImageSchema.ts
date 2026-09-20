import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";
import { IMAGE_MAX_BYTES, IMAGE_TYPES } from "$lib/constants/images";

/** What can carry an image. */
export const IMAGE_KINDS = ["account", "artist", "song"] as const;
export const ImageKindSchema = v.picklist(IMAGE_KINDS);
export type ImageKind = v.InferOutput<typeof ImageKindSchema>;

/** Form boundary for setting an image: the browser resizes first (src/lib/utils/resizeImage.ts), so this is a few hundred KB. */
export const ImageSetSchema = v.object({
	kind: ImageKindSchema,
	id: NanoIdSchema,
	image: v.pipe(
		v.file("Choose an image."),
		v.mimeType([...IMAGE_TYPES], "Use a JPEG, PNG or WebP image."),
		v.maxSize(IMAGE_MAX_BYTES, "Keep the image under 3 MB."),
	),
});

export const ImageRemoveSchema = v.object({ kind: ImageKindSchema, id: NanoIdSchema });
