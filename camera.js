const Splitter = require('stream-split')
const spawn = require('child_process').spawn
const stream = require('stream')
const EventEmitter = require('events')
const fs = require('fs')
const path = require('path')

/**
 * Based on: https://github.com/servall/pi-camera-connect/blob/master/src/lib/stream-camera.ts
 */
class Camera extends EventEmitter {
  constructor(config) {
    super()
    const defaults = {
      width: 640,
      height: 480,
      framerate: 30,
      bitrate: 640000, // kBit is enough for 640x480 video https://comm.gatech.edu/resources/video/encoding
      profile: 'baseline', // important! Broadway player will not work with another profile
      mode: 4,
      output: '-', // important! output to stdout stream
      nopreview: true, // no preview image
      timeout: 0, // important! work until explicitly been stopped
    }

    this._raspiArgs = Object.assign(defaults, config)
    this._childProcess = null
    this._fileStream = null
    this._stream = new stream.Readable({
      read: () => {},
    })

    this._NAL_SEPARATOR = Buffer.from([0, 0, 0, 1]) //NAL break
  }

  get streaming() {
    return this._childProcess !== null
  }

  getStream() {
    const splitterStream = new Splitter(this._NAL_SEPARATOR)
    this._stream.pipe(splitterStream)
    return splitterStream
  }

  async stopCapture() {
    if (this._childProcess) {
      this._childProcess.stdout.removeAllListeners('data')
      this._childProcess.kill()
      this._childProcess = null
    }

    // Push null to stream to indicate EOF
    // this._stream.push(null)
  }

  startCapture() {
    return new Promise((resolve, reject) => {
      const args = []
      Object.keys(this._raspiArgs).forEach(key => {
        args.push('--' + key)
        if (typeof this._raspiArgs[key] !== 'boolean') args.push(this._raspiArgs[key])
      })

      // Spawn child process
      this._childProcess = spawn('raspivid', args)

      // Listen for error event to reject promise
      this._childProcess.once('error', err =>
        reject(
          new Error(
            "Could not start capture with StreamCamera. Are you running on a Raspberry Pi with 'raspivid' installed?"
          )
        )
      )

      // Wait for first data event to resolve promise
      this._childProcess.stdout.once('data', () => resolve())

      // Listen for data event, delivering data to all streams
      this._childProcess.stdout.on('data', data => {
        if (!this._stream.push(data)) {
          this._childProcess.stdout.pause()
          this._stream.once('drain', () => {
            this._childProcess.stdout.resume()
          })
        }
      })

      // Listen for error events
      this._childProcess.stdout.on('error', err => this.emit('error', err))
      this._childProcess.stderr.on('data', data => this.emit('error', new Error(data)))
      this._childProcess.stderr.on('error', err => this.emit('error', err))

      // Listen for close events
      this._childProcess.stdout.on('close', () => this.emit('close'))
    })
  }

  startRecording() {
    return new Promise((resolve, reject) => {
      if (!this._stream) return reject('No video stream')
      if (this._fileStream) return reject('Already recording')

      this._fileStream = fs.createWriteStream(path.resolve(__dirname, `video-${Date.now()}.h264`))
      this._stream.pipe(this._fileStream)
      resolve()
    })
  }

  stopRecording() {
    return new Promise(resolve => {
      this._stream.unpipe(this._fileStream)
      this._fileStream.end(() => {
        this._fileStream = null
        resolve()
      })
    })
  }
}

module.exports = Camera
