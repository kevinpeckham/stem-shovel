/** The manage link every waitlist email carries: consent on/off, or leave the list. */
export function waitlistManageUrl(origin: string, token: string): string {
	return `${origin}/waitlist/manage/${token}`;
}
