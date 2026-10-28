import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** Asking for an account's calendar feed address (src/lib/remote/calendar.remote.ts). */
export const CalendarFeedSchema = v.object({ accountId: NanoIdSchema });
export type CalendarFeedInput = v.InferOutput<typeof CalendarFeedSchema>;
