
var maxMessageLength = 255;


var DanceMessage = function(len, ID) {
 // Sanitize input
 if (len > maxMessageLength || len < 0 || len !== 0 && !len)
  len = maxMessageLength;

 // So that we can use len later
 var buffLen = len;

 // Header + ID + length + CRC
 buffLen += 2 + 1 + 1 + 2;

 this._buff = new Buffer(buffLen);

 // Header
 this._buff.writeUInt16LE(0xffff, 0);

 // Length
 this._buff.writeUInt8(len, 3);

 if (ID !== undefined)
  this.setID(ID);
}

DanceMessage.prototype.fillCRC = function() {
 // CRC includes ID, length, and data, and goes at the end
 this._buff.writeUInt16LE(crc.crc16modbus(this._buff.slice(2, -2)), this._buff.length - 2);
};

DanceMessage.prototype.setID = function (ID) {
 // Sanitize input
 if (ID > 0xff || ID < 0 || ID !== 0 && !ID)
  throw new Error('Bad ID');

 this._buff.writeUInt8(ID, 2);
};

DanceMessage.prototype.getMessageBuffer = function () {
 // Cut out leading header, ID, length, and trailing CRC
 return this._buff.slice(4, -2);
};

module.exports = DanceMessage;
