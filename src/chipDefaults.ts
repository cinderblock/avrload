/** Built-in AVR chip definitions. Flash size is given in 16-bit words.
 *  Page size is also in words. Bootloader size defaults to 0 — override
 *  if you've reserved a bootloader section. */
export interface AVRChipDef {
  /** Total flash size in 16-bit words. */
  totalFlashSizeWords: number;
  /** Programming page size in 16-bit words. */
  pageSizeWords: number;
  /** Flash reserved for a bootloader (16-bit words), measured from the top
   *  of flash. Default 0 (no reserved bootloader area). */
  bootloaderFlashWords: number;
}

export const CHIP_DEFAULTS: Record<string, AVRChipDef> = {
  atmega328p: { totalFlashSizeWords: 16384, pageSizeWords: 64, bootloaderFlashWords: 0 },
  atmega2560: { totalFlashSizeWords: 131072, pageSizeWords: 128, bootloaderFlashWords: 0 },
  atmega32u4: { totalFlashSizeWords: 16384, pageSizeWords: 64, bootloaderFlashWords: 0 },
  attiny85: { totalFlashSizeWords: 4096, pageSizeWords: 32, bootloaderFlashWords: 0 },
  attiny84: { totalFlashSizeWords: 4096, pageSizeWords: 32, bootloaderFlashWords: 0 },
};

/** Resolve a chip name or def into a concrete def. */
export function resolveChip(chip: AVRChipDef | string): AVRChipDef {
  if (typeof chip !== 'string') return chip;
  const key = chip.toLowerCase();
  const def = CHIP_DEFAULTS[key];
  if (!def) {
    throw new Error(
      `Unknown chip "${chip}". Known: ${Object.keys(CHIP_DEFAULTS).join(', ')}. ` +
        `Pass an AVRChipDef object directly to use a chip not in the built-in list.`,
    );
  }
  return def;
}
