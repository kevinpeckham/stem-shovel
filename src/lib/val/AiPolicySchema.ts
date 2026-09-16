import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** Any member switches AI off (or on) for a project or a song; "true" = no AI. */
export const AiPolicySchema = v.object({ id: NanoIdSchema, noAi: v.picklist(["true", "false"]) });
