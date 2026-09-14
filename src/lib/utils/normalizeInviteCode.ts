/**
 * Invite codes are shown in groups (`ABCD-EFGH-JKLM`) and typed however
 * people type them: this drops everything but letters and digits and
 * upper-cases, so a lookup compares like with like.
 */
export function normalizeInviteCode(input: string): string {
	return input.replace(/[^a-z0-9]/gi, "").toUpperCase();
}
