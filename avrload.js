var ihex = require('ihex');
var crc = require('crc');

function loadDefaults(options) {
 if (!options) throw new Error('Need object to work on');
 if (!options.chip) throw new Error('Need a chip to load defaults');

 var defs = require('./chipDefaults/' + options.chip + '.json');

 options.totalFlashSizeWords = options.totalFlashSizeWords || defs.totalFlashSizeWords;
 options.pageSizeWords = options.pageSizeWords || defs.pageSizeWords;
 options.bootloaderFlashWords = options.bootloaderFlashWords || defs.bootloaderFlashWords;

 options.userFlashSizeWords = options.userFlashSizeWords ||
  (options.totalFlashSizeWords - options.bootloaderFlashWords);


}

var avrload = function(options) {

 if (typeof options == 'string')
  options = {chip: options};

 if (!options || !options.chip) {
  console.log('need to pass chip type or options object with type');
 }

 loadDefaults(options);

 this.flashBuffer = new Buffer(options.userFlashSizeWords);
 this.flashBuffer.fill(0xff);

 this.loadFlashFromIHex = function(iHexFilename, cb) {
  return ihex(iHexFilename, this.flashBuffer, cb);
 }.bind(this);

 this.crcFunction = crc.crc16modbus;

 this.crcLength = 2;

 this.crcLocation = this.flashBuffer.length - this.crcLength;

 this.calculateAndFillCRC = function() {
  this.flashBuffer.writeUInt16LE(
   this.crcFunction(this.flashBuffer.slice(0, this.crcLocation)),
   this.crcLocation
  );
 }

 return this;
}

module.exports = avrload;
