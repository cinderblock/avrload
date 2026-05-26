import { crc16modbus } from 'crc';

/** Header bytes that mark the start of a DanceBoot wire frame. */
export const DANCE_HEADER = 0xffff;

/** Maximum payload length the 1-byte length field can encode. */
export const MAX_PAYLOAD_LENGTH = 255;

/** Wire frame for the DanceBoot RS-485 bootloader protocol.
 *
 * Layout:
 *
 *   [0xFF, 0xFF, ID, length, ...payload, CRC_LO, CRC_HI]
 *
 * CRC is CRC16-modbus over (ID, length, ...payload).
 */
export class DanceMessage {
  private readonly buf: Buffer;
  private readonly payloadLength: number;

  constructor(payloadLength: number, id: number = 0) {
    if (
      !Number.isInteger(payloadLength) ||
      payloadLength < 0 ||
      payloadLength > MAX_PAYLOAD_LENGTH
    ) {
      throw new RangeError(`payloadLength must be an integer in [0, ${MAX_PAYLOAD_LENGTH}]`);
    }
    this.payloadLength = payloadLength;
    // header(2) + id(1) + length(1) + payload + crc(2)
    this.buf = Buffer.alloc(2 + 1 + 1 + payloadLength + 2);
    this.buf.writeUInt16LE(DANCE_HEADER, 0);
    this.buf.writeUInt8(payloadLength, 3);
    this.id = id;
  }

  /** Recipient ID. 0 is broadcast. */
  get id(): number {
    return this.buf.readUInt8(2);
  }
  set id(v: number) {
    if (!Number.isInteger(v) || v < 0 || v > 0xff) {
      throw new RangeError('id must be an integer in [0, 255]');
    }
    this.buf.writeUInt8(v, 2);
  }

  /** Mutable view of the payload region. Writes here are reflected in `bytes`. */
  get payload(): Buffer {
    return this.buf.subarray(4, 4 + this.payloadLength);
  }

  /** Fill in the trailing CRC over (ID, length, payload). Call after writing
   *  the payload but before sending. */
  fillCRC(): void {
    const crc = crc16modbus(this.buf.subarray(2, this.buf.length - 2));
    this.buf.writeUInt16LE(crc, this.buf.length - 2);
  }

  /** The full on-wire byte sequence: header + id + length + payload + CRC. */
  get bytes(): Buffer {
    return this.buf;
  }
}
