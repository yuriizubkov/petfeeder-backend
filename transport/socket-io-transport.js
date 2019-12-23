const TransportBase = require('./transport-base')
const config = require('./socket-io-transport.json') // loading configuration file for this particular "transport" TODO: maybe it is better to add section to the common server configuration file
const IO = require('socket.io')

/**
 * JSON-RPC 2.0 - like protocol over Web Sockets implementation, with slight differences
 * https://www.jsonrpc.org/specification#conventions
 */
class SocketIoTransport extends TransportBase {
  constructor() {
    super()
    this._io = null
  }

  /**
   * Response on RPC request
   * @param {String} userId ID of the user who made RPC request
   * @param {Number} requestId ID of RPC request (provided by client on RPC request)
   * @param {Object} data Plain data object
   * @param {String} error Error message string. If specified, data argument will be ignored
   */
  response(userId, requestId, data, error) {
    return new Promise((resolve, reject) => {
      if (userId === null || userId === undefined || requestId === null || requestId === undefined)
        return reject(new Error('Arguments "userId" and "requestId" should be specified'))

      const userSocket = this._io.sockets.connected[userId]
      if (!userSocket) return resolve() // We don`t care if user is not connected already

      const message = {
        id: requestId,
      }

      if (error) message.error = error
      else message.data = data

      if (userSocket.emit('response', message)) resolve()
      else reject(new Error(`Error transmitting RPC response ${userId} ${requestId} ${data} ${error}`))
    })
  }

  /**
   * Sends notification for all users or for user with userId only
   * Notifications has no request or response IDs
   * @param {String} event Event string ID from TransportBase constants, for example TransportBase.EVENT_DEVICE_WARNINGNOFOOD
   * @param {Object} data Plain data object
   * @param {String} userId ID of the user to whom the message is addressed. If not specified - for all users
   */
  notify(event, data, userId) {
    return new Promise((resolve, reject) => {
      // userId not set, so this is broadcast message for all users
      if (userId === null || userId === undefined) {
        this._io.emit(TransportBase.EVENT_NOTIFICATION, {
          e: event,
          d: data,
        })
      } else {
        const userSocket = this._io.sockets.connected[userId]
        if (!userSocket) return resolve() // We don`t care if user is not connected already

        if (
          userSocket.emit(TransportBase.EVENT_NOTIFICATION, {
            e: event,
            d: data,
          })
        )
          resolve()
        else reject(new Error(`Error transmitting notification ${event} ${data} ${userId}`))
      }
    })
  }

  run() {
    return new Promise(resolve => {
      this._io = IO(config.port, config.options)
      // This is socket.io - specific event name hardcoded here
      this._io.on('connection', socket => {
        // Notify server about new connection
        this.emit(TransportBase.EVENT_USER_CONNECTION, {
          transportClass: this.constructor.name,
          userId: socket.id,
          data: null, // TODO: maybe credentials here, or on special event?
        })

        // This is socket.io - specific event name hardcoded here
        socket.on('disconnect', reason => {
          this.emit(TransportBase.EVENT_USER_DISCONNECT, {
            transportClass: this.constructor.name,
            userId: socket.id,
            data: reason,
          })
        })

        socket.on(TransportBase.EVENT_RPC_REQUEST, request => {
          if (!request) request = {}
          request.userId = socket.id
          request.transportClass = this.constructor.name
          this.emit(TransportBase.EVENT_RPC_REQUEST, request)
        })
      })

      resolve()
    })
  }

  disconnectUser(userId) {
    this._io.clients[userId].disconnect()
  }

  // getNextConnectedUserId() {
  //   if (Object.keys(this.sockets.connected).length > 0) {
  //     return Object.values(this.sockets.connected)[0]
  //   } else return null
  // }
}

module.exports = SocketIoTransport
