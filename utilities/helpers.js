const { spawn } = require('child_process')

module.exports = {
  /**
   * Format number for propper string representation of time, hours or minutes, for example 0 -> '00'
   */
  nf: number => {
    return ('0' + number).slice(-2)
  },

  /**
   * Spawning process and waiting until exit, resolve then. Reject on error.
   * @param {String} cmd Executable name to spawn
   * @param {Array} options Parameters
   */
  simpleSpawn: (cmd, options) => {
    return new Promise((resolve, reject) => {
      const process = spawn(cmd, options)

      process.on('error', err => reject(err))
      process.on('exit', code => resolve(code))
    })
  },
}
