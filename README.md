# avrload

Prepare AVR flash images from Intel HEX files, and program them over serial using the [DanceBoot](https://github.com/cinderblock/DanceBoot) RS-485 bootloader protocol.

- TypeScript, ESM, full type declarations.
- Two pieces, used together or independently:
  - **Flash buffer prep** — allocate a buffer sized to a chip's user-flash region, load a `.hex` file into it, append a CRC.
  - **Wire protocol + programmer** — encode page-erase / page-write frames and send them over any object that implements a minimal `write` + `drain` interface (e.g. a `serialport`'s `SerialPort`, or a mock for testing).
- Built-in chip definitions for common AVRs (ATmega328P, ATmega2560, ATmega32U4, ATtiny85, ATtiny84). Pass your own def for anything else.

## Install

```sh
npm install avrload
```

## Prepare a flash image

```ts
import {
  loadHexIntoFlashBuffer,
  appendCRC16Modbus,
} from 'avrload';

const flash = await loadHexIntoFlashBuffer('firmware.hex', {
  chip: 'atmega328p',
  // or: chip: { totalFlashSizeWords: 16384, pageSizeWords: 64, bootloaderFlashWords: 1024 }
});
appendCRC16Modbus(flash); // last 2 bytes get a CRC16-modbus over the rest
```

The buffer length is `userFlashSizeWords * 2` bytes, filled with `0xFF` (the erased value) and patched with the HEX file's data records. By default `userFlashSizeWords = totalFlashSizeWords - bootloaderFlashWords`; override `userFlashSizeWords` directly to bypass that.

## Send it to a DanceBoot bootloader

```ts
import { SerialPort } from 'serialport';
import { DanceProgrammer } from 'avrload';

const port = new SerialPort({ path: '/dev/ttyUSB0', baudRate: 115200 });
await new Promise(r => port.on('open', r));

const prog = new DanceProgrammer(port);
await prog.program(flash, /* pageSizeBytes */ 128);
// Or target a specific node on the bus:
// await prog.program(flash, 128, { id: 7 });
```

`pageSizeBytes` must be one of 32, 64, 128, 256 (AVR page sizes) and must divide `flash.length` evenly. Pages that are entirely `0xFF` are erased but not written, which is a meaningful speedup on partially-used chips. Pass `{ skipBlankPages: false }` if you want to write every page unconditionally.

`DanceProgrammer` accepts any object implementing `{ write(buf, cb), drain(cb) }` — a real `SerialPort`, a stream, or a mock for unit tests.

## DanceMessage wire format

For reference, every frame on the bus is:

```
[0xFF, 0xFF, ID, length, ...payload, CRC_LO, CRC_HI]
```

- `0xFFFF` — fixed header (also matches the AVR-flash erased pattern, which is convenient).
- `ID` — recipient (0 = broadcast).
- `length` — payload length in bytes (max 255).
- `CRC` — CRC16-modbus over `[ID, length, ...payload]`, little-endian.

The page commands are:

- `[0xF2, pageNum]` — erase page.
- `[0xF1, pageNum, ...pageBytes]` — write page.

## API

| Export | What it does |
| --- | --- |
| `makeFlashBuffer(opts)` | Allocate a 0xFF-filled `Buffer` sized to the chip's user-flash region. |
| `loadHexIntoFlashBuffer(file, opts)` | `makeFlashBuffer` then `ihex.loadFileIntoBuffer`. |
| `appendCRC16Modbus(buffer)` | Write a CRC16-modbus into the last 2 bytes of `buffer`. |
| `resolveChip(name \| def)` | Look up a chip def by name, or pass through an object. |
| `CHIP_DEFAULTS` | The built-in `Record<string, AVRChipDef>`. |
| `DanceMessage` | Construct, mutate, and serialize a DanceBoot wire frame. |
| `DanceProgrammer` | Page-by-page programmer over a `SerialPortLike`. |

Types: `AVRChipDef`, `AVRFlashOptions`, `SerialPortLike`, `ProgramOptions`.

## Requirements

- Node.js >= 22.

## License

ISC.
