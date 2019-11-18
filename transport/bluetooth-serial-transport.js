const TransportBase = require('./transport-base')

class BluetoothSerialTransport extends TransportBase {
  constructor() {
    super()
    throw new Error('Missing implementation')
  }
}

module.exports = BluetoothSerialTransport
