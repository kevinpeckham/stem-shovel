import { signUpMode } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => ({ mode: await signUpMode() });
