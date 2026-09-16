import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** A system admin picks the song the home page demos, from the public ones. */
export const FeaturedSongSchema = v.object({ songId: NanoIdSchema });
