const EventEmitter2 = require('eventemitter2')
const { MethodNotImplementedException } = require('../error-types')
class TransportBase extends EventEmitter2 {
  constructor() {
    super()
  }

  static get EVENT_TRANSPORT_CONNECT() {
    return 'event/transport/connection'
  }

  static get EVENT_TRANSPORT_DISCONNECT() {
    return 'event/transport/disconnect'
  }

  static get EVENT_DEVICE_CLOCKSYNCHRONIZED() {
    return 'event/device/clocksynchronized'
  }

  static get EVENT_DEVICE_FEEDINGSTARTED() {
    return 'event/device/feedingstarted'
  }

  static get EVENT_DEVICE_FEEDINGCOMPLETE() {
    return 'event/device/feedingcomplete'
  }

  static get EVENT_DEVICE_WARNINGMOTORSTUCK() {
    return 'event/device/warningmotorstuck'
  }

  static get EVENT_DEVICE_WARNINGNOFOOD() {
    return 'event/device/warningnofood'
  }

  static get EVENT_CAMERA_H264DATA() {
    return 'event/camera/h264data'
  }

  static get EVENT_RESPONSE_SUFFIX() {
    return '/response'
  }

  run() {
    throw new MethodNotImplementedException(
      this.constructor.name + ' should override this method with return type of Promise'
    )
  }

  disconnectUser(userId) {
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
