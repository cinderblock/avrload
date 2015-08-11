var crc = require('crc');
var DanceMessage = require('./DanceMessage.js');
var Promise = require('es6-promise').Promise;

var PageWriteCommand = 0xf1;
var PageEraseCommand = 0xf2;

var DanceProgrammer = function(serialPort) {
 this.serialPort = serialPort;
}

DanceProgrammer.prototype = {
 readdress: function() {
  return new Promise(function(resolve, reject) {

  });
 },

 program: function(flashBytes, pageSizeBytes) {
  return new Promise(function(resolve, reject) {
   if (typeof flashBytes != 'Buffer') {
    reject (new Error('Buffer argument required'));
    return;
   }

   // Use this: flashBytes.writeUInt16LE(crc.crc16modbus(flashBytes.slice(0, -2)), flashBytes.length - 2);
   if (crc.crc16modbus(flashBytes) != 0) {
    reject(new Error('Program CRC is invalid'));
    return;
   }

   if (pageSizeBytes != 32 && pageSizeBytes != 64 && pageSizeBytes != 128) {
    reject(new Error('invalid pageSizeBytes. Valid values: 32, 64, 128'));
    return;
   }

   if (flashBytes.length % pageSizeBytes) {
    reject(new Error('invalid flashBytes buffer length'));
    return;
   }

   // We require enouch space to send the command and a page number, 2 bytes.
   // Broadcast message
   var pageWriteMessage = new DanceMessage(pageSizeBytes + 2, 0);
   var pageEraseMessage = new DanceMessage(2, 0);

   pageWriteMessage.getMessageBuffer[0] = PageWriteCommand;
   pageEraseMessage.getMessageBuffer[0] = PageEraseCommand;

   var page;

   var buff;

   var ret = Promise.resolve();

   for (var pageNum = 0; pageNum < flashBytes.length / pageSizeBytes; pageNum++) {
     ret = ret.then(new Promise(function (resolve, reject) {

      buff = pageEraseMessage.getMessageBuffer;

      // Page Number
      buff[1] = pageNum;

      pageEraseMessage.fillCRC();

      // Send pageEraseMessage
      resolve(this._sendMessage(pageEraseMessage));

      // TODO: Check & wait for result via CTS/RTS

    }));

    page = flashBytes.slice(pageNum * pageSizeBytes, (pageNum + 1) * pageSizeBytes);

    var i;
    for (i = 0; i < pageSizeBytes, page[i] == 0xff; i++);

    // Page is empty, only need to erase
    if (i == pageSizeBytes) continue;

    ret = ret.then(new Promise(function (resolve, reject) {
      buff = pageWriteMessage.getMessageBuffer;

      buff[1] = pageNum;

      // Copy page to message
      page.copy(buff, 2);

      pageWriteMessage.fillCRC();

      resolve(this._sendMessage(pageWriteMessage));

      // TODO: Check & wait for result via CTS/RTS
    }));

   }

   resolve(ret);

  });
 },


 _sendMessage: function(messageBuffer) {
  return new Promise(function (resolve, reject) {

  });
 }
};

module.exports = DanceProgrammer;
