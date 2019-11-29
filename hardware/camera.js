const Splitter = require('stream-split')
const spawn = require('child_process').spawn
const stream = require('stream')
const EventEmitter = require('events')
const fs = require('fs')
const path = require('path')

/**
 * Based on ideas from: https://github.com/servall/pi-camera-connect/blob/master/src/lib/stream-camera.ts
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
    this._streamSubscribers = []
    this._fileStream = null
    this._stream = new stream.Readable({
      read: () => {},
    })

    this._NAL_SEPARATOR = Buffer.from([0, 0, 0, 1]) //NAL h264 break
  }

  get streaming() {
    return this._childProcess !== null
  }
  get recording() {
    return this._fileStream !== null
  }

  _createSplittedStream() {
    const splittedStream = new Splitter(this._NAL_SEPARATOR)
    this._stream.pipe(splittedStream) // piping video stream to new stream
    this._streamSubscribers.push(splittedStream) // holding reference to keep it alive
    return splittedStream
  }

  _removeStream(stream) {
    const indexOfStream = this._streamSubscribers.indexOf(stream)
    if (indexOfStream !== -1) {
      this._stream.unpipe(stream) // unpiping stream from source video stream
      stream.end && stream.end()
      this._streamSubscribers.splice(indexOfStream, 1) // not holding reference to this stream anymore
    }
  }

  async stopCapture() {
    if (this._childProcess) {
      this._childProcess.stdout.removeAllListeners('data')
      this._childProcess.kill()
      this._childProcess = null
    }

    // Push null to stream to indicate EOF
    this._stream.push(null)
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

  async startStreaming() {
    if (!this.streaming) await this.startCapture()
    return this._createSplittedStream()
  }

  async stopStreaming(stream) {
    this._removeStream(stream)
    if (this._streamSubscribers.length === 0 && !this.recording) await this.stopCapture()
  }

  async startRecording(fileName = `video-${Date.now()}.h264`) {
    if (this.recording) return Promise.reject('Already recording')
    if (!this.streaming) await this.startCapture()

    this._fileStream = fs.createWriteStream(path.resolve(__dirname, fileName))
    this._stream.pipe(this._fileStream)
  }

  async stopRecording() {
    if (!this.recording) return Promise.resolve()
    this._stream.unpipe(this._fileStream)
    this._fileStream.end()
    this._fileStream = null
    if (this._streamSubscribers.length === 0) await this.stopCapture()
  }
}

module.exports = Camera
