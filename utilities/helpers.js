const { spawn } = require('child_process')
const fs = require('fs')

/**
 * Format number for propper string representation of time, hours or minutes, for example 0 -> '00'
 * @param {Number} number number to convert to string with 0 padding
 * @returns {String}
 */
function nf(number) {
  return ('0' + number).slice(-2)
}

/**
 * Date and time string in UTC for logs
 * @returns {String}
 */
function utcDateString() {
  const now = new Date(Date.now())
  return (
    `${now.getUTCFullYear()}` +
    `.${nf(now.getUTCMonth() + 1)}` +
    `.${nf(now.getUTCDate())} ` +
    `${nf(now.getUTCHours())}` +
    `:${nf(now.getUTCMinutes())}` +
    `:${nf(now.getUTCSeconds())}` +
    `:${now.getUTCMilliseconds()} GMT`
  )
}

/**
 * Spawn process and wait until exit, resolve then. Reject on error.
 * @param {String} cmd Executable name to spawn
 * @param {Array} options Parameters
 * @returns {Promise}
 */
function simpleSpawn(cmd, options) {
  return new Promise((resolve, reject) => {
    const process = spawn(cmd, options)

    process.on('error', reject)
    process.on('exit', resolve)
  })
}

/**
 * Read whole file asynchronously and return its content
 * @param {String} filePath Valid path to the file
 * @returns {Promise}
 */
function readFile(filePath) {
  return new Promise((resolve, reject) => {
    let chunks = []
    let stream = fs.createReadStream(filePath)
    stream.on('error', err => reject(err))
    stream.on('data', chunk => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

module.exports = {
  nf,
  utcDateString,
  simpleSpawn,
  readFile,
}
