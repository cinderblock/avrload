export {
  makeFlashBuffer,
  loadHexIntoFlashBuffer,
  appendCRC16Modbus,
  resolveChip,
  CHIP_DEFAULTS,
} from './avrload.js';
export type { AVRChipDef, AVRFlashOptions } from './avrload.js';

export { DanceMessage, DANCE_HEADER, MAX_PAYLOAD_LENGTH } from './danceMessage.js';

export { DanceProgrammer } from './danceProgrammer.js';
export type { SerialPortLike, ProgramOptions } from './danceProgrammer.js';
