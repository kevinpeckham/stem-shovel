import { formatBytes } from "./formatBytes";
import { validSizeBytes } from "./validSizeBytes";

/**
 * Why a reserved upload's claimed size is refused, for the reserve routes:
 * 413 over the ceiling (`<subject> can be up to <max>`, the subject with
 * its article, "A PDF file"), 400 for an empty file or a size that is not
 * a whole number of bytes; null when the size is fine.
 */
export function sizeCeilingMessage(
	sizeBytes: number,
	max: number,
	subject: string,
): { status: 400 | 413; message: string } | null {
	if (validSizeBytes(sizeBytes, max)) return null;
	if (sizeBytes > max)
		return { status: 413, message: `${subject} can be up to ${formatBytes(max)}` };
	return {
		status: 400,
		message:
			sizeBytes <= 0 ? "The file is empty" : "sizeBytes must be the file's size in whole bytes",
	};
}
