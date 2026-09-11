/** Reads a text field from a form submission; files and missing keys become "". */
export function formString(data: FormData, key: string): string {
	const value = data.get(key);
	return typeof value === "string" ? value.trim() : "";
}
