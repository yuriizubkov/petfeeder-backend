const EventEmitter2 = require('eventemitter2')
const { MethodNotImplementedException } = require('../error-types')
class TransportBase extends EventEmitter2 {
  constructor() {
    super()
  }

  static get EVENT_CONNECT() {
    return 'event/transport/connect'
  }

  static get EVENT_DISCONNECT() {
    return 'event/transport/disconnect'
  }

  get connectedUsersCount() {
    throw new MethodNotImplementedException(
      this.constructor.name + ' should override this method with return type of Number'
    )
  }

  run() {
    throw new MethodNotImplementedException(
      this.constructor.name + ' should override this method with return type of Promise'
    )
  }

  /**
   * Emit an event for all connected users or one user with userId
   * @param {String} event string as 'event/server/authRequest' for example
   * @param {Object} data plain object in form of { userId, data }
   */
  emitEvent(event, data) {
    throw new MethodNotImplementedException(this.constructor.name + ' should override this method')
  }
}

module.exports = TransportBase
