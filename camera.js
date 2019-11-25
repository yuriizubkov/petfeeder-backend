const { StreamCamera, Codec, Flip, SensorMode } = require('pi-camera-connect')
const Splitter = require('stream-split')

class Camera extends StreamCamera {
  constructor() {
    super({
      width: 640,
      height: 480,
      fps: 15,
      codec: Codec.H264,
      flip: Flip.Vertical,
      sensorMode: SensorMode.Mode4,
    })

    this._NAL_SEPARATOR = new Buffer.from([0, 0, 0, 1]) //NAL break
  }

  get NAL_SEPARATOR() {
    return this._NAL_SEPARATOR
  }

  async startVideo() {
    this._videoStream = this.createStream()
    this._videoStream.pipe(splitter) //.pipe(writeStream)

    await this.startCapture()
    return this._videoStream
  }

  async stopVideo() {
    await this.stopCapture()
    this._videoStream = null
  }
}

module.exports = Camera
