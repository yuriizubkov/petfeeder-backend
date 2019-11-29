const { MethodNotImplementedException } = require('../utilities/error-types')

class AuthProviderBase {
  constructor() {}

  authenticate(credentials) {
    throw new MethodNotImplementedException(
      this.constructor.name + ' should override this method with return type of Promise'
    )
  }

  authorize(userId, requestedResource = '') {
    throw new MethodNotImplementedException(
      this.constructor.name + ' should override this method with return type of Promise'
    )
  }
}

module.exports = AuthProviderBase
