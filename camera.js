const Splitter = require('stream-split')
const spawn = require('child_process').spawn
const fs = require('fs')
const stream = require('stream')
const EventEmitter = require('events')

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
    this._streams = []
    this._NAL_SEPARATOR = new Buffer.from([0, 0, 0, 1]) //NAL break
  }

  get NAL_SEPARATOR() {
    return this._NAL_SEPARATOR
  }

  get raspiArgs() {
    return this._raspiArgs
  }

  createStream() {
    const newStream = new stream.Readable({
      read: () => {},
    })

    this._streams.push(newStream)

    return newStream
  }

  _destroyStream(stream) {
    return new Promise(resolve => {
      if (stream.end) {
        stream.end()
        stream.once('drain', () => {
          stream.destroy()
          resolve()
        })
      } else {
        stream.destroy()
        resolve()
      }
    })
  }

  stopCapture() {
    return new Promise(async resolve => {
      if (this._childProcess) {
        this._childProcess.stdout.removeAllListeners('data')
        this._childProcess.kill()
      }

      const allStreamsDestroyed = []
      // Push null to each stream to indicate EOF and destroy
      this._streams.forEach(stream => {
        stream.push(null)
        allStreamsDestroyed.push(this._destroyStream(stream))
      })

      Promise.all(allStreamsDestroyed).then(() => {
        this._streams = []
        resolve()
      })
    })
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
        this._streams.forEach(stream => !stream.destroyed && stream.push(data))
      })

      // Listen for error events
      this._childProcess.stdout.on('error', err => this.emit('error', err))
      this._childProcess.stderr.on('data', data => this.emit('error', new Error(data)))
      this._childProcess.stderr.on('error', err => this.emit('error', err))

      // Listen for close events
      this._childProcess.stdout.on('close', () => this.emit('close'))
    })
  }

  async startVideoStream() {
    //this._fileStream = fs.createWriteStream(`video-stream-${Date.now()}.h264`)
    const stream = this.createStream().pipe(new Splitter(this._NAL_SEPARATOR))
    if (!this._childProcess) await this.startCapture()
    return stream
  }

  async stopVideoStream() {
    await this.stopCapture()
  }
}

module.exports = Camera
