const TransportInterface = require('./transport-interface')
const config = require('./socket-io-transport.json') // loading configuration file for this particular "transport"
const IO = require('socket.io')

class SocketIoTransport extends TransportInterface {
  constructor() {
    super()

    this._io = IO(config.port, config.options)
    // This is socket.io - specific event name hardcoded here
    this._io.on('connection', socket => {
      // Notify server about new connection
      this.emit(TransportInterface.EVENT_CONNECTION, {
        transportClass: this.constructor.name,
        userId: socket.id,
        args: null,
      })

      // Passing all "user level" events out from socket.io
      socket.use((packet, next) => {
        const [event, data] = packet
        this.emit(event, {
          transportClass: this.constructor.name,
          userId: socket.id,
          args: data instanceof Array ? data : [data], // should be an array for arguments
        })

        next()
      })

      // This is socket.io - specific event name hardcoded here
      socket.on('disconnect', () => {
        this.emit(TransportInterface.EVENT_DISCONNECTED, {
          transportClass: this.constructor.name,
          userId: socket.id,
          args: null,
        })
      })
    })
  }

  emitEvent(event, data) {
    const { userId, data } = data

    // userId not set, so this is broadcast message for all users
    if (userId === null || userID === undefined) this._io.emit(event, data)
    else {
      const userSocket = this._io.connected[userId]
      if (userSocket) userSocket.emit(event, data)
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

  // rpcResponse(resource, userId, result) {
  //   this._io.sockets.connected[userId].emit([PATH_RPC_STR, resource, PATH_RESPONSE_STR].join('/'), result)
  // }
}

module.exports = SocketIoTransport
