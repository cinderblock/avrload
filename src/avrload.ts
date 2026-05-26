import { crc16modbus } from 'crc';
import { loadFileIntoBuffer } from 'ihex';
import { resolveChip, type AVRChipDef } from './chipDefaults.js';

export interface AVRFlashOptions {
  /** Chip name (looked up in built-in defaults) or a chip def object. */
  chip: AVRChipDef | string;
  /** Override the size of the user-flash region (in 16-bit words).
   *  Defaults to `totalFlashSizeWords - bootloaderFlashWords`. */
  userFlashSizeWords?: number;
}

/** Allocate a Buffer sized to a chip's user-flash region, filled with 0xFF
 *  (the "erased" value of AVR flash). Buffer length is in BYTES (words * 2). */
export function makeFlashBuffer(opts: AVRFlashOptions): Buffer {
  const def = resolveChip(opts.chip);
  const userFlashWords =
    opts.userFlashSizeWords ?? def.totalFlashSizeWords - def.bootloaderFlashWords;
  if (userFlashWords <= 0) {
    throw new RangeError(
      `userFlashSizeWords must be > 0 (got ${userFlashWords}). ` +
        `Check totalFlashSizeWords (${def.totalFlashSizeWords}) and bootloaderFlashWords (${def.bootloaderFlashWords}).`,
    );
  }
  return Buffer.alloc(userFlashWords * 2, 0xff);
}

/** Allocate a flash buffer for the chip and load an Intel HEX file into it.
 *  Returns the populated buffer. Bytes not covered by the HEX file remain 0xFF. */
export async function loadHexIntoFlashBuffer(
  hexFilename: string,
  opts: AVRFlashOptions,
): Promise<Buffer> {
  const buf = makeFlashBuffer(opts);
  await loadFileIntoBuffer(hexFilename, buf);
  return buf;
}

/** Append a CRC16-modbus over the buffer's prefix to the last 2 bytes.
 *  This is the format DanceBoot expects: the last 2 bytes of flash are
 *  the CRC of everything before them, in little-endian. */
export function appendCRC16Modbus(buffer: Buffer): void {
  if (buffer.length < 3) {
    throw new RangeError('Buffer must be at least 3 bytes long to append a CRC16');
  }
  const crc = crc16modbus(buffer.subarray(0, buffer.length - 2));
  buffer.writeUInt16LE(crc, buffer.length - 2);
}

export { resolveChip, CHIP_DEFAULTS } from './chipDefaults.js';
export type { AVRChipDef } from './chipDefaults.js';
