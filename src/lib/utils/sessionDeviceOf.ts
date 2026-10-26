import { SESSION_DEVICE_VALUES, type SessionDevice } from "../val/SessionRecordingSchema";

/** A session recording's input device from an untrusted value (an upload's JSON body): one of SESSION_DEVICE_VALUES, else "" (unset). */
export function sessionDeviceOf(value: unknown): SessionDevice {
	return (SESSION_DEVICE_VALUES as readonly unknown[]).includes(value)
		? (value as SessionDevice)
		: "";
}
