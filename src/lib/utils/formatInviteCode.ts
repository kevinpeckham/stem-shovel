/** `ABCDEFGHJKLM` → `ABCD-EFGH-JKLM`, easier to read out and to type. */
export function formatInviteCode(code: string): string {
	return code.match(/.{1,4}/g)?.join("-") ?? code;
}
