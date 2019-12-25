const { MethodNotImplementedException } = require('../utilities/error-types')
const EventEmitter = require('events')

/**
 * Abstract message transport, implementation could be Web Sockets, Bluetooth, Serial, Telegram Bot etc...
 * Should emit EVENT_RPC_REQUEST event on client request
 * And since we don't have Interfaces in JavaScript, you should extend this class and override all methods, otherwise it will throw errors
 */
class TransportBase extends EventEmitter {
  constructor() {
    super()
  }

  static get EVENT_RPC_REQUEST() {
    return 'request'
  }

  static get EVENT_RPC_RESPONSE() {
    return 'response'
  }

  static get EVENT_NOTIFICATION() {
    return 'notification'
  }

  static get EVENT_USER_CONNECTION() {
    return 'connection'
  }

  static get EVENT_USER_DISCONNECT() {
    return 'disconnect'
  }

  static get NOTIFICATION_DEVICE_CLOCKSYNCHRONIZED() {
    return 'device/clocksynchronized'
  }

  static get NOTIFICATION_DEVICE_FEEDINGSTARTED() {
    return 'device/feedingstarted'
  }

  static get NOTIFICATION_DEVICE_FEEDINGCOMPLETE() {
    return 'device/feedingcomplete'
  }

  static get NOTIFICATION_DEVICE_WARNINGMOTORSTUCK() {
    return 'device/warningmotorstuck'
  }

  static get NOTIFICATION_DEVICE_WARNINGNOFOOD() {
    return 'device/warningnofood'
  }

  static get NOTIFICATION_CAMERA_H264DATA() {
    return 'camera/h264data'
  }

  static get NOTIFICATION_CAMERA_PICTUREDATA() {
    return 'camera/picturedata'
  }

  static get NOTIFICATION_FILES_FILEDATA() {
    return 'files/filedata'
  }

  run() {
    throw new MethodNotImplementedException(
      this.constructor.name + ' should override this method with return type of Promise'
    )
  }

  /**
   * Disconnect user with userId
   * @param userId
   */
  disconnectUser(userId) {
    throw new MethodNotImplementedException(
      this.constructor.name + ' should override this method with return type of Promise'
    )
  }

  /**
   * Sends notification for all users or for user with userId only
   * Notifications has no request or response IDs
   * @param {String} event Event string ID from TransportBase constants, for example TransportBase.EVENT_DEVICE_WARNINGNOFOOD
   * @param {Object} data Plain data object
   * @param {*} userId ID of the user to whom the message is addressed. If not specified - for all users
   */
  notify(event, data, userId) {
    throw new MethodNotImplementedException(
      this.constructor.name + ' should override this method with return type of Promise'
    )
  }

  /**
   * Response on RPC request
   * @param {*} userId ID of the user who made RPC request
   * @param {Number} requestId ID of RPC request (provided by client on RPC request)
   * @param {Object} data Plain data object
   * @param {String} error Error message string. If specified, data argument will be ignored
   */
  response(userId, requestId, data, error) {
    throw new MethodNotImplementedException(
      this.constructor.name + ' should override this method with return type of Promise'
    )
  }
}

module.exports = TransportBase
