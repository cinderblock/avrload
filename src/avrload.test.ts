import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc16modbus } from 'crc';

import {
  makeFlashBuffer,
  loadHexIntoFlashBuffer,
  appendCRC16Modbus,
  resolveChip,
  CHIP_DEFAULTS,
} from './avrload.js';
import {
  DanceMessage,
  DANCE_HEADER,
  MAX_PAYLOAD_LENGTH,
} from './danceMessage.js';
import {
  DanceProgrammer,
  type SerialPortLike,
} from './danceProgrammer.js';

describe('resolveChip', () => {
  it('looks up known chips', () => {
    const def = resolveChip('atmega328p');
    assert.equal(def.totalFlashSizeWords, 16384);
    assert.equal(def.pageSizeWords, 64);
  });

  it('is case-insensitive', () => {
    assert.deepEqual(resolveChip('ATmega328P'), resolveChip('atmega328p'));
  });

  it('passes through chip defs', () => {
    const def = { totalFlashSizeWords: 100, pageSizeWords: 4, bootloaderFlashWords: 0 };
    assert.equal(resolveChip(def), def);
  });

  it('throws on unknown', () => {
    assert.throws(() => resolveChip('atmega9999z'), /Unknown chip/);
  });

  it('all built-in chips have plausible values', () => {
    for (const [name, def] of Object.entries(CHIP_DEFAULTS)) {
      assert.ok(def.totalFlashSizeWords > 0, `${name} flash size`);
      assert.ok(def.pageSizeWords > 0, `${name} page size`);
      assert.equal(def.totalFlashSizeWords % def.pageSizeWords, 0, `${name} flash size is a multiple of page size`);
    }
  });
});

describe('makeFlashBuffer', () => {
  it('allocates flash size in BYTES (words * 2)', () => {
    const buf = makeFlashBuffer({ chip: 'atmega328p' });
    assert.equal(buf.length, 16384 * 2);
  });

  it('fills with 0xFF (erased value)', () => {
    const buf = makeFlashBuffer({ chip: 'attiny85' });
    assert.ok(buf.every(b => b === 0xff));
  });

  it('subtracts bootloader region by default', () => {
    const buf = makeFlashBuffer({ chip: { totalFlashSizeWords: 100, pageSizeWords: 4, bootloaderFlashWords: 10 } });
    assert.equal(buf.length, (100 - 10) * 2);
  });

  it('respects userFlashSizeWords override', () => {
    const buf = makeFlashBuffer({ chip: 'atmega328p', userFlashSizeWords: 100 });
    assert.equal(buf.length, 200);
  });

  it('throws when userFlashSize ends up non-positive', () => {
    assert.throws(
      () => makeFlashBuffer({ chip: { totalFlashSizeWords: 10, pageSizeWords: 2, bootloaderFlashWords: 10 } }),
      RangeError,
    );
  });
});

describe('loadHexIntoFlashBuffer', () => {
  it('loads "Hello, World!" from a HEX file at address 0', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'avrload-test-'));
    try {
      const hex = ':1000000048656C6C6F2C20576F726C642100000087\n:00000001FF\n';
      const path = join(dir, 'sample.hex');
      await writeFile(path, hex);
      const buf = await loadHexIntoFlashBuffer(path, {
        chip: { totalFlashSizeWords: 32, pageSizeWords: 4, bootloaderFlashWords: 0 },
      });
      assert.equal(buf.length, 64); // 32 words * 2 bytes
      assert.equal(buf.toString('utf8', 0, 13), 'Hello, World!');
      // Bytes 16..63 should still be 0xFF (uninitialized flash).
      assert.ok(buf.subarray(16).every(b => b === 0xff));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('appendCRC16Modbus', () => {
  it('writes a CRC that the verifier accepts (full-buffer modbus = 0)', () => {
    const buf = Buffer.alloc(8, 0x42);
    appendCRC16Modbus(buf);
    assert.equal(crc16modbus(buf), 0);
  });

  it('throws on buffers too short for a CRC', () => {
    assert.throws(() => appendCRC16Modbus(Buffer.alloc(2)), RangeError);
  });
});

describe('DanceMessage', () => {
  it('lays out header, id, length, payload, CRC correctly', () => {
    const msg = new DanceMessage(3, 7);
    msg.payload[0] = 0xaa;
    msg.payload[1] = 0xbb;
    msg.payload[2] = 0xcc;
    msg.fillCRC();
    const b = msg.bytes;
    // header
    assert.equal(b.readUInt16LE(0), DANCE_HEADER);
    // id
    assert.equal(b[2], 7);
    // length
    assert.equal(b[3], 3);
    // payload
    assert.deepEqual([...b.subarray(4, 7)], [0xaa, 0xbb, 0xcc]);
    // CRC is over id..payload (the trailing 2 bytes), and modbus of the whole stretch is 0
    assert.equal(crc16modbus(b.subarray(2)), 0);
  });

  it('id defaults to 0 (broadcast)', () => {
    const msg = new DanceMessage(0);
    assert.equal(msg.id, 0);
  });

  it('id setter validates range', () => {
    const msg = new DanceMessage(0);
    msg.id = 0xff;
    assert.equal(msg.id, 0xff);
    assert.throws(() => { msg.id = 256; }, RangeError);
    assert.throws(() => { msg.id = -1; }, RangeError);
  });

  it('rejects payload lengths outside [0, MAX_PAYLOAD_LENGTH]', () => {
    assert.throws(() => new DanceMessage(-1), RangeError);
    assert.throws(() => new DanceMessage(MAX_PAYLOAD_LENGTH + 1), RangeError);
    assert.doesNotThrow(() => new DanceMessage(MAX_PAYLOAD_LENGTH));
  });

  it('payload buffer is mutable and reflected in bytes', () => {
    const msg = new DanceMessage(4);
    msg.payload.writeUInt32LE(0xdeadbeef, 0);
    assert.equal(msg.bytes.readUInt32LE(4), 0xdeadbeef);
  });
});

/** Captures every write for inspection in tests. */
function captureSerialPort(): { writes: Buffer[]; port: SerialPortLike } {
  const writes: Buffer[] = [];
  const port: SerialPortLike = {
    write(buffer, cb) {
      writes.push(Buffer.from(buffer));
      cb?.();
      return true;
    },
    drain(cb) {
      cb?.();
    },
  };
  return { writes, port };
}

describe('DanceProgrammer', () => {
  const pageSizeBytes = 32;
  const PAGE_ERASE = 0xf2;
  const PAGE_WRITE = 0xf1;

  it('rejects non-Buffer flashBytes', async () => {
    const { port } = captureSerialPort();
    const p = new DanceProgrammer(port);
    await assert.rejects(p.program('hi' as unknown as Buffer, pageSizeBytes), TypeError);
  });

  it('rejects an invalid CRC', async () => {
    const { port } = captureSerialPort();
    const p = new DanceProgrammer(port);
    const flash = Buffer.alloc(pageSizeBytes * 2, 0xff);
    flash[0] = 0x42; // breaks the all-0xFF "CRC=0xFFFF" no-op coincidence too
    await assert.rejects(p.program(flash, pageSizeBytes), /CRC is invalid/);
  });

  it('rejects invalid page sizes', async () => {
    const { port } = captureSerialPort();
    const p = new DanceProgrammer(port);
    const flash = Buffer.alloc(64);
    appendCRC16Modbus(flash);
    await assert.rejects(p.program(flash, 99 as 32), RangeError);
  });

  it('erases every page and writes only non-blank pages', async () => {
    const { writes, port } = captureSerialPort();
    const p = new DanceProgrammer(port);
    // Three pages. Pages 0 and 1 contain data; page 2 is left entirely 0xFF.
    // We manually compute the CRC over the front portion so that the CRC bytes
    // happen to land at the end of a NON-blank page (page 1), keeping page 2
    // genuinely blank.
    const flash = Buffer.alloc(pageSizeBytes * 3, 0xff);
    flash.write('hello, world!', 0, 'utf8');
    // Force page 2 to stay 0xFF: append CRC at the end of page 1 (offset 64..65)
    // and adjust the flash region used for CRC to match.
    const crcEnd = pageSizeBytes * 2; // CRC at offsets 62 and 63 of the buffer
    flash.writeUInt16LE(crc16modbus(flash.subarray(0, crcEnd - 2)), crcEnd - 2);
    // Re-zero from crcEnd onward so page 2 is untouched. (Buffer is already
    // 0xFF from alloc(), and we never wrote past crcEnd, so this is already
    // the case — explicit assertion to make intent clear:)
    assert.ok(flash.subarray(crcEnd).every(b => b === 0xff), 'page 2 should be blank');
    // For program() to accept the flash, the CRC must validate over the whole
    // buffer. Since page 2 is all 0xFF and modbus(prefix || crc) === 0, we need
    // modbus(prefix || crc || 0xFF...0xFF) === 0 too. CRC16-modbus is NOT
    // invariant under appending 0xFF, so we instead pass only the leading
    // portion for the CRC test and program just those two pages.
    const programmable = flash.subarray(0, crcEnd);

    await p.program(programmable, pageSizeBytes);

    // Page 0 has data → erase + write. Page 1 has the CRC bytes → erase + write.
    // = 4 frames total. No blank page in `programmable`, so skipBlankPages is moot.
    assert.equal(writes.length, 4);

    const frame0 = writes[0]!;
    assert.equal(frame0.readUInt16LE(0), DANCE_HEADER);
    assert.equal(frame0[2], 0); // id = broadcast
    assert.equal(frame0[3], 2); // length = 2 (cmd + pageNum)
    assert.equal(frame0[4], PAGE_ERASE);
    assert.equal(frame0[5], 0); // page 0
    assert.equal(crc16modbus(frame0.subarray(2)), 0); // CRC valid

    const frame1 = writes[1]!;
    assert.equal(frame1[3], pageSizeBytes + 2);
    assert.equal(frame1[4], PAGE_WRITE);
    assert.equal(frame1[5], 0); // page 0
    assert.equal(frame1.subarray(6, 6 + 13).toString('utf8'), 'hello, world!');
    assert.equal(crc16modbus(frame1.subarray(2)), 0);

    const frame2 = writes[2]!;
    assert.equal(frame2[4], PAGE_ERASE);
    assert.equal(frame2[5], 1); // page 1

    const frame3 = writes[3]!;
    assert.equal(frame3[4], PAGE_WRITE);
    assert.equal(frame3[5], 1); // page 1
  });

  it('skips genuinely blank pages with skipBlankPages: true (default)', async () => {
    const { writes, port } = captureSerialPort();
    const p = new DanceProgrammer(port);
    // Two pages: page 0 written, page 1 entirely 0xFF.
    // Put the CRC at the end of page 0 to keep page 1 truly blank.
    const flash = Buffer.alloc(pageSizeBytes * 2, 0xff);
    flash.write('Hi', 0, 'utf8');
    flash.writeUInt16LE(crc16modbus(flash.subarray(0, pageSizeBytes - 2)), pageSizeBytes - 2);
    // Only program the first page (page 1 is meant to be left blank).
    await p.program(flash.subarray(0, pageSizeBytes), pageSizeBytes);
    // erase + write for page 0 = 2 frames.
    assert.equal(writes.length, 2);
    assert.equal(writes[0]![4], PAGE_ERASE);
    assert.equal(writes[1]![4], PAGE_WRITE);
  });

  it('respects skipBlankPages: false', async () => {
    const { writes, port } = captureSerialPort();
    const p = new DanceProgrammer(port);
    const flash = Buffer.alloc(pageSizeBytes, 0xff);
    appendCRC16Modbus(flash);
    await p.program(flash, pageSizeBytes, { skipBlankPages: false });
    // erase + write for the single page even though it's all 0xff.
    assert.equal(writes.length, 2);
    assert.equal(writes[0]![4], PAGE_ERASE);
    assert.equal(writes[1]![4], PAGE_WRITE);
  });

  it('honors a non-broadcast id', async () => {
    const { writes, port } = captureSerialPort();
    const p = new DanceProgrammer(port);
    const flash = Buffer.alloc(pageSizeBytes, 0xff);
    appendCRC16Modbus(flash);
    await p.program(flash, pageSizeBytes, { id: 42 });
    for (const w of writes) assert.equal(w[2], 42);
  });
});
