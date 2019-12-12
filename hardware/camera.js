const Splitter = require('stream-split')
const spawn = require('child_process').spawn
const stream = require('stream')
const EventEmitter = require('events')
const fs = require('fs')

/**
 * Based on ideas from:
 * https://github.com/servall/pi-camera-connect/blob/master/src/lib/stream-camera.ts
 */
class Camera extends EventEmitter {
  constructor(config) {
    super()
    // Video defaults. All parameters here: https://www.raspberrypi.org/documentation/raspbian/applications/camera.md
    const videoDefaults = {
      width: 640,
      height: 480,
      framerate: 30,
      bitrate: 640000, // 640kBit is enough for 640x480 video https://comm.gatech.edu/resources/video/encoding
      mode: 4,
    }

    // Assigning overridable video settings
    this._videoConfig = Object.assign(videoDefaults, config.video)

    // Not overridable video settings
    this._videoConfig = Object.assign(this._videoConfig, {
      profile: 'baseline', // important! Broadway player will not work with another profile
      nopreview: true, // no preview image
      timeout: 0, // important! work until explicitly been stopped
      output: '-', // important! output to stdout stream
    })

    // Photo defaults
    const photoDefaults = {
      width: 640,
      height: 480,
    }

    // Assigning overridable photo settings
    this._photoConfig = Object.assign(photoDefaults, config.photo)

    // Assigning not overridable settings
    this._photoConfig = Object.assign(this._photoConfig, {
      thumb: 'none', // we don`t need thumbnail for streaming photo
      encoding: 'jpg', // jpg is hardware accelerated
      timeout: 100, // 100 ms to warmup
      output: '-', // important! output to stdout stream
    })

    // private variables
    this._streaming = false
    this._recording = false
    this._takingPicture = false

    this._childProcess = null
    this._videoStreamSubscribers = []
    this._fileStream = null
    this._dataStream = null

    this._NAL_SEPARATOR = Buffer.from([0, 0, 0, 1]) //NAL h264 break
  }

  get MODE_VIDEO() {
    return 'raspivid'
  }

  get MODE_PHOTO() {
    return 'raspistill'
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
      if (typeof config[key] !== 'boolean') {
        args.push('--' + key)
        args.push(config[key])
      } else if (config[key] === true) args.push('--' + key)
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

  _startCapture(config, mode) {
    return new Promise((resolve, reject) => {
      const args = this._configToArgs(config)

      this._dataStream = new stream.Readable({
        read: () => {},
      })

      this._childProcess = spawn(mode, args)

      // Listen for error event to reject promise
      this._childProcess.once('error', err =>
        reject(
          new Error(`Could not start capture with Camera. Are you running on a Raspberry Pi with ${mode} installed?`)
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
    if (this.takingPicture) throw new Error('Can not stream video, camera is taking photo at the moment')
    if (!this.streaming) {
      this._streaming = true
      await this._startCapture(this._videoConfig, this.MODE_VIDEO)
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

  async startRecording(filePath = `video-${Date.now()}.h264`) {
    if (this.takingPicture) throw new Error('Can not record video, camera is taking photo at the moment')
    if (this.recording) throw new Error('Already recording')
    this._recording = true
    if (!this.streaming) {
      this._streaming = true
      await this._startCapture(this._videoConfig, this.MODE_VIDEO)
    }

    this._fileStream = fs.createWriteStream(filePath)
    this._dataStream.pipe(this._fileStream)
  }

  async stopRecording() {
    if (!this.recording) return Promise.resolve()
    this._dataStream.unpipe(this._fileStream)
    this._fileStream.end()
    this._fileStream = null
    this._recording = false
    if (this._videoStreamSubscribers.length === 0) await this._stopCapture()
  }

  async takePicture() {
    if (this.takingPicture) throw new Error('Already taking picture')
    if (this.streaming) throw new Error('Can not take a photo, camera is streaming video at the moment')
    if (this.recording) throw new Error('Can not take a photo, camera is recording video at the moment')

    this._takingPicture = true
    await this._startCapture(this._photoConfig, this.MODE_PHOTO)
    this.once('close', () => {
      this._takingPicture = false
    })

    return this._dataStream
  }
}

module.exports = Camera
