const { InterfaceNotImplementedException } = require('../error-types')

class AuthProviderInterface {
  constructor() {}

  authenticate(credentials) {
    throw new InterfaceNotImplementedException(
      this.constructor.name +
        ' should override this method with return type of Promise'
    )
  }

  authorize(userId, requestedResource = '') {
    throw new InterfaceNotImplementedException(
      this.constructor.name +
        ' should override this method with return type of Promise'
    )
  }
}

module.exports = AuthProviderInterface
