import * as ManagedRuntime from "effect/ManagedRuntime";
import { LiveLayer } from "./services.js";

/** Built once per module instance, so a warm function reuses its layers. */
export const runtime = ManagedRuntime.make(LiveLayer);
