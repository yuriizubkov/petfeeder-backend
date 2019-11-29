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
    // All parameters: https://www.raspberrypi.org/documentation/raspbian/applications/camera.md
    const defaults = {
      width: 640,
      height: 480,
      framerate: 30,
      bitrate: 640000, // kBit is enough for 640x480 video https://comm.gatech.edu/resources/video/encoding
      mode: 4,
    }

    // Assigning overridable settings
    this._config = Object.assign(defaults, config)

    // Not overridable settings
    this._config = Object.assign(this._config, {
      profile: 'baseline', // important! Broadway player will not work with another profile
      output: '-', // important! output to stdout stream
      nopreview: true, // no preview image
      timeout: 0, // important! work until explicitly been stopped
    })

    this._streaming = false
    this._recording = false
    this._takingPicture = false

    this._childProcess = null
    this._videoStreamSubscribers = []
    this._fileStream = null
    this._dataStream = null

    this._NAL_SEPARATOR = Buffer.from([0, 0, 0, 1]) //NAL h264 break
  }

  get streaming() {
    return this._streaming
  }

  get recording() {
    return this._recording
  }

  get takingPicture() {
    return this._takingPicture
  }

  _createSplittedStream() {
    const splittedStream = new Splitter(this._NAL_SEPARATOR)
    this._dataStream.pipe(splittedStream) // piping video stream to new stream
    this._videoStreamSubscribers.push(splittedStream) // holding reference to keep it alive
    return splittedStream
  }

  _removeStream(stream) {
    const indexOfStream = this._videoStreamSubscribers.indexOf(stream)
    if (indexOfStream !== -1) {
      this._dataStream.unpipe(stream) // unpiping stream from source video stream
      stream.end && stream.end()
      this._videoStreamSubscribers.splice(indexOfStream, 1) // not holding reference to this stream anymore
    }
  }

  _configToArgs(config) {
    const args = []
    Object.keys(config).forEach(key => {
      args.push('--' + key)
      if (typeof config[key] !== 'boolean') args.push(config[key])
    })

    return args
  }

  async _stopCapture() {
    if (this._childProcess) {
      this._childProcess.stdout.removeAllListeners('data')
      this._childProcess.kill()
      this._childProcess = null
    }

    // Push null to stream to indicate EOF
    this._dataStream.push(null)
  }

  _startCapture(config, mode = 'video') {
    return new Promise((resolve, reject) => {
      const args = this._configToArgs(config)

      this._dataStream = new stream.Readable({
        read: () => {},
      })

      this._childProcess = spawn(mode === 'video' ? 'raspivid' : 'raspistill', args)

      // Listen for error event to reject promise
      this._childProcess.once('error', err =>
        reject(
          new Error(
            "Could not start capture with Camera. Are you running on a Raspberry Pi with 'raspivid' and 'raspistill' installed?"
          )
        )
      )

      // Wait for first data event to resolve promise
      this._childProcess.stdout.once('data', () => resolve())

      // Listen for data event, delivering data to all streams
      this._childProcess.stdout.on('data', data => {
        if (!this._dataStream.push(data)) {
          this._childProcess.stdout.pause()
          this._dataStream.once('drain', () => {
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
    if (!this.takePicture) throw new Error('Camera taking picture')
    if (!this.streaming) {
      await this._startCapture(this._config)
      this._streaming = true
    }

    return this._createSplittedStream()
  }

  async stopStreaming(stream) {
    this._removeStream(stream)
    if (this._videoStreamSubscribers.length === 0 && !this.recording) {
      await this._stopCapture()
      this._streaming = false
    }
  }

  async startRecording(fileName = `video-${Date.now()}.h264`) {
    if (!this.takePicture) throw new Error('Camera taking picture')
    if (this.recording) throw new Error('Already recording')
    if (!this.streaming) {
      await this._startCapture(this._config)
      this._recording = true
    }

    this._fileStream = fs.createWriteStream(path.resolve(__dirname, fileName))
    this._dataStream.pipe(this._fileStream)
  }

  async stopRecording() {
    if (!this.recording) return Promise.resolve()
    this._dataStream.unpipe(this._fileStream)
    this._fileStream.end()
    this._fileStream = null
    if (this._videoStreamSubscribers.length === 0) {
      await this._stopCapture()
      this._recording = false
    }
  }

  async takePicture() {
    if (this.takingPicture) throw new Error('Already taking picture')
    if (this.recording) throw new Error('Camera in video recording mode')

    // Assigning not overridable settings
    const config = Object.assign(this._config, {
      thumb: 'none',
      timeout: 100, // 100 ms to warmup
      encoding: 'jpg', // jpg is harware accelerated
    })

    // deleting video mode specific parameters
    delete config.profile
    delete config.framerate
    delete config.bitrate
    delete config.mode

    await this._startCapture(config, 'picture')
    this._takingPicture = true
    this.once('close', () => {
      this._takingPicture = false
    })

    return this._dataStream
  }
}

module.exports = Camera
