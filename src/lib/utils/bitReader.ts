/** Reads what a BitWriter packed; throws past the end. */
export class BitReader {
	#pos = 0;
	constructor(private readonly bytes: Uint8Array) {}

	read(bits: number): number {
		let value = 0;
		for (let i = 0; i < bits; i++) {
			const byte = this.bytes[this.#pos >> 3];
			if (byte === undefined) throw new RangeError("Read past the end");
			value = (value << 1) | ((byte >> (7 - (this.#pos & 7))) & 1);
			this.#pos++;
		}
		return value >>> 0;
	}
}
