import * as v from "valibot";

/**
 * Whether anyone can create an account ("open") or a newcomer needs an
 * invitation or an invite code ("invite"). An app setting a system admin
 * flips on /admin/sign-up; the pages read it to show or hide the waitlist.
 */
export const SIGN_UP_MODES = ["open", "invite"] as const;

export const SignUpModeSchema = v.picklist(SIGN_UP_MODES);

export type SignUpMode = v.InferOutput<typeof SignUpModeSchema>;

/** The admin form. */
export const SignUpModeFormSchema = v.object({ mode: SignUpModeSchema });
