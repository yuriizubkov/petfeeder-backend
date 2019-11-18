const TransportBase = require('./transport-base')
const config = require('./socket-io-transport.json') // loading configuration file for this particular "transport"
const IO = require('socket.io')

class SocketIoTransport extends TransportBase {
  constructor() {
    super()

    this._io = IO(config.port, config.options)
    // This is socket.io - specific event name hardcoded here
    this._io.on('connection', socket => {
      // Notify server about new connection
      this.emit(TransportBase.EVENT_CONNECTION, {
        transportClass: this.constructor.name,
        userId: socket.id,
        data: null,
      })

      // Passing all "user level" events out from socket.io
      socket.use((packet, next) => {
        const packetEvent = packet.slice(0, 1)[0]
        const packetData = packet.slice(1).filter(value => typeof value !== 'function')
        this.emit(packetEvent, {
          transportClass: this.constructor.name,
          userId: socket.id,
          data: packetData,
        })

        next()
      })

      // This is socket.io - specific event name hardcoded here
      socket.on('disconnect', reason => {
        this.emit(TransportBase.EVENT_DISCONNECTED, {
          transportClass: this.constructor.name,
          userId: socket.id,
          data: reason,
        })
      })
    })
  }

  emitEvent(event, eventConfig) {
    const { userId, data } = eventConfig || {}

    // userId not set, so this is broadcast message for all users
    if (userId === null || userId === undefined) this._io.emit(event, data)
    else {
      const userSocket = this._io.sockets.connected[userId]
      if (userSocket) {
        if (data !== null && data !== undefined) userSocket.emit(event, data)
        else userSocket.emit(event)
      }
    }
  }

  run() {
    return Promise.resolve()
  }

  // disconnect(userId) {
  //   this._io.clients[userId].disconnect()
  // }

  getNextConnectedUserId() {
    if (Object.keys(this.sockets.connected).length > 0) {
      return Object.values(this.sockets.connected)[0]
    } else return null
  }
}

module.exports = SocketIoTransport
