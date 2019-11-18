const TransportBase = require('./transport-base')

class WebsocketsWsTransport extends TransportBase {
  constructor() {
    super()
    throw new Error('Missing implementation')
  }
}

module.exports = WebsocketsWsTransport
