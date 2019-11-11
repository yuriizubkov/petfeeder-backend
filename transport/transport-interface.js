const EventEmitter = require('events')
const { InterfaceNotImplementedException } = require('../error-types')
class TransportInterface extends EventEmitter {
  constructor(/*authProvider*/) {
    super()
  }

  get connectedUsersCount() {
    throw new InterfaceNotImplementedException(
      this.constructor.name +
        ' should override this method with return type of Number'
    )
  }

  rpcResponse() {
    throw new InterfaceNotImplementedException(
      this.constructor.name +
        ' should override this method with return type of Promise'
    )
  }

  event() {
    throw new InterfaceNotImplementedException(
      this.constructor.name + ' should override this method'
    )
  }

  run() {
    throw new InterfaceNotImplementedException(
      this.constructor.name +
        ' should override this method with return type of Promise'
    )
  }
}

module.exports = TransportInterface
