/** Packs small unsigned integers into bytes, most significant bit first. */
export class BitWriter {
	#bytes: number[] = [];
	#bit = 0;

	write(value: number, bits: number): void {
		for (let i = bits - 1; i >= 0; i--) {
			if (this.#bit === 0) this.#bytes.push(0);
			const on = (value >>> i) & 1;
			this.#bytes[this.#bytes.length - 1]! |= on << (7 - this.#bit);
			this.#bit = (this.#bit + 1) % 8;
		}
	}

	bytes(): Uint8Array {
		return Uint8Array.from(this.#bytes);
	}
}
