import { crc16modbus } from 'crc';
import { DanceMessage } from './danceMessage.js';

/** Minimal subset of `serialport`'s SerialPort that we use. Any object
 *  implementing this shape works — pass a real SerialPort, or a mock. */
export interface SerialPortLike {
  write(
    buffer: Buffer | Uint8Array,
    callback?: (err?: Error | null) => void,
  ): boolean;
  drain(callback?: (err?: Error | null) => void): void;
}

const PAGE_WRITE_COMMAND = 0xf1;
const PAGE_ERASE_COMMAND = 0xf2;

const VALID_PAGE_SIZES_BYTES = [32, 64, 128, 256] as const;

export interface ProgramOptions {
  /** Recipient ID. 0 broadcasts to all bootloaders on the bus (default). */
  id?: number;
  /** Skip pages that are entirely 0xFF (only send the erase command for them). Default true. */
  skipBlankPages?: boolean;
}

/** Drive an AVR's DanceBoot bootloader over serial. The flash bytes are
 *  expected to already have a trailing CRC16-modbus (see `appendCRC16Modbus`). */
export class DanceProgrammer {
  constructor(private readonly serialPort: SerialPortLike) {}

  /** Send the entire flash image to the bootloader, one page at a time.
   *  Pages that are entirely 0xFF are erased but not written (unless
   *  `skipBlankPages: false`). */
  async program(
    flashBytes: Buffer,
    pageSizeBytes: number,
    opts: ProgramOptions = {},
  ): Promise<void> {
    if (!Buffer.isBuffer(flashBytes)) {
      throw new TypeError('flashBytes must be a Buffer');
    }
    if (crc16modbus(flashBytes) !== 0) {
      throw new Error(
        'Flash CRC is invalid. Call appendCRC16Modbus(flashBytes) before program().',
      );
    }
    if (!VALID_PAGE_SIZES_BYTES.includes(pageSizeBytes as never)) {
      throw new RangeError(
        `Invalid pageSizeBytes ${pageSizeBytes}. Valid: ${VALID_PAGE_SIZES_BYTES.join(', ')}`,
      );
    }
    if (flashBytes.length % pageSizeBytes !== 0) {
      throw new RangeError(
        `flashBytes length ${flashBytes.length} is not a multiple of pageSizeBytes ${pageSizeBytes}`,
      );
    }

    const { id = 0, skipBlankPages = true } = opts;
    const numPages = flashBytes.length / pageSizeBytes;

    for (let pageNum = 0; pageNum < numPages; pageNum++) {
      const page = flashBytes.subarray(pageNum * pageSizeBytes, (pageNum + 1) * pageSizeBytes);

      // Always erase first.
      await this.#sendPageErase(pageNum, id);

      if (skipBlankPages && page.every(b => b === 0xff)) continue;

      await this.#sendPageWrite(pageNum, page, id);
    }
  }

  /** Send a single PageErase command for the given page number. */
  async #sendPageErase(pageNum: number, id: number): Promise<void> {
    const msg = new DanceMessage(2, id);
    msg.payload[0] = PAGE_ERASE_COMMAND;
    msg.payload[1] = pageNum & 0xff;
    msg.fillCRC();
    await this.#sendMessage(msg);
  }

  /** Send a single PageWrite command carrying one page of flash. */
  async #sendPageWrite(pageNum: number, page: Buffer, id: number): Promise<void> {
    const msg = new DanceMessage(page.length + 2, id);
    msg.payload[0] = PAGE_WRITE_COMMAND;
    msg.payload[1] = pageNum & 0xff;
    page.copy(msg.payload, 2);
    msg.fillCRC();
    await this.#sendMessage(msg);
  }

  /** Write the message bytes to the serial port and wait for the OS-level
   *  send buffer to drain. */
  #sendMessage(msg: DanceMessage): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.serialPort.write(msg.bytes, writeErr => {
        if (writeErr) {
          reject(writeErr);
          return;
        }
        this.serialPort.drain(drainErr => {
          if (drainErr) reject(drainErr);
          else resolve();
        });
      });
    });
  }
}
