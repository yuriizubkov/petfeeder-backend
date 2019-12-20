const { InvalidRPCResourceException } = require('./utilities/error-types')
const config = require('./petfeeder-server.json')
const DB = require('./database')
const Camera = require('./hardware/camera')
const TransportBase = require('./transport/transport-base') // for event names constants
const { nf, simpleSpawn } = require('./utilities/helpers')
const path = require('path')
const ffmpeg = require('fluent-ffmpeg')

/**
 * Server for DIY pet feeder
 */
class PetfeederServer {
  /**
   * @param {Object} device Instance of PetwantDevice class or class with simillar functionality
   * @param {Object} authProvider Instance of AuthProviderBase class
   * @param {Array<Transport>} transports Array of provided transport objects, instances of TransportBase class
   */
  constructor(device, authProvider, transports) {
    console.info(`[${PetfeederServer.utcDateString}][SERVER] Initializing server...`)

    this._connectedUsers = [] // [{ userId: 'id', transportClass: 'transportClassName' }]
    this._controlBelongsTo = null // { userId: 'id', transportClass: 'transportClassName' }
    this._currentFeedingInProcess = false
    this._currentFeedingWasScheduled = false
    this._currentFeedingPortions = 0
    this._device = device
    this._cachedSchedule = []
    this._hardwareButtonFeeding = false
    this._camera = null
    this._cameraStreamSubscribers = [] // { userId: 'id', transportClass: 'transportClassName', stream: cameraStreamInstance }
    this._transportList = {} // { 'transportClassName': transportInstance }

    for (let transportInstance of transports)
      this._transportList[transportInstance.constructor.name] = transportInstance

    // Simple rule set what we can call with RPC
    this._validRpcResources = {
      device: {
        objectToCall: this._device,
        methodsAllowed: ['feedManually', 'getSchedule', 'setScheduleEntry', 'clearSchedule'],
      },
      camera: {
        objectToCall: this,
        methodsAllowed: ['startVideoStream', 'stopVideoStream', 'takePicture'],
      },
      database: {
        objectToCall: DB,
        methodsAllowed: ['getEvents', 'getGallery', 'getGalleryDates', 'getEventDates'],
      },
      wifi: {
        objectToCall: null, // not implemented
        methodsAllowed: ['scan', 'connect', 'disconnect', 'turnOn', 'turnOff'],
      },
      bluetooth: {
        objectToCall: null, // not implemented
        methodsAllowed: ['scan', 'connect', 'disconnect', 'turnOn', 'turnOff'],
      },
    }

    // Subscribing to transport`s events
    for (const transportClass of Object.keys(this._transportList)) {
      console.info(`[${PetfeederServer.utcDateString}][SERVER] Transport added:`, transportClass)
      this._transportList[transportClass].onAny((event, eventConfig) => this.onTransportEvent(event, eventConfig))
    }

    // Setup device
    this._device.on('buttondown', () => console.info(`[${PetfeederServer.utcDateString}][DEVICE] Button down event`))
    this._device.on('buttonup', () => console.info(`[${PetfeederServer.utcDateString}][DEVICE] Button up event`))

    this._device.on('buttonlongpress', pressedTime => {
      console.info(
        `[${PetfeederServer.utcDateString}][DEVICE] Button long press event with pressed time (ms):`,
        pressedTime
      )
      this._device.linkLedBlinking = !this._device.linkLedBlinking
      // TODO: toggle bluetooth on/off
    })

    this._device.on('clocksynchronized', () => {
      console.info(`[${PetfeederServer.utcDateString}][DEVICE] Clock synchronization event`)
      this.emitTransportEvent(TransportBase.EVENT_DEVICE_CLOCKSYNCHRONIZED)

      DB.pushEvent('clocksync').catch(err =>
        console.error(`[${PetfeederServer.utcDateString}][ERROR] Database error:`, err)
      )
    })

    this._device.on('scheduledfeedingstarted', entryData => {
      console.info(`[${PetfeederServer.utcDateString}][DEVICE] Scheduled feeding started event:`, entryData)
      this._currentFeedingInProcess = true
      // if hardware button was pressed entryData = { entryIndex: 0, soundIndex: 6}
      if (entryData.entryIndex === 0) {
        this._currentFeedingWasScheduled = false
        this._currentFeedingPortions = 1
        this._hardwareButtonFeeding = true
      } else {
        this._currentFeedingWasScheduled = true
        this._hardwareButtonFeeding = false

        if (this._cachedSchedule && this._cachedSchedule instanceof Array) {
          const scheduleEntry = this._cachedSchedule.filter(value => value.entryIndex === entryData.entryIndex)[0]
          this._currentFeedingPortions = scheduleEntry.portions
        } else this._currentFeedingPortions = -1 // in case if we had no cached schedule at this point
      }

      this.emitTransportEvent(TransportBase.EVENT_DEVICE_FEEDINGSTARTED, { data: entryData })

      // Starting recording video only on auto feeding
      if (!this._hardwareButtonFeeding)
        this.startRecording()
          .then(startRecInfo => {
            DB.pushGallery(startRecInfo.fileTimestamp).catch(err => {
              console.error(`[${PetfeederServer.utcDateString}][ERROR] Database error:`, err)
            })

            // Stop recording video on timer
            setTimeout(async () => {
              try {
                await this.stopRecording()
              } catch (err) {
                console.error(`[${PetfeederServer.utcDateString}][ERROR] Video recording stop error:`, err)
                return
              }

              // adding h264 to mp4 container
              const mp4FilePath =
                startRecInfo.fullPath
                  .split('.')
                  .slice(0, -1)
                  .join('.') + '.mp4'

              try {
                await simpleSpawn('MP4Box', [
                  '-fps',
                  config.camera.video.fps || 30,
                  '-add',
                  startRecInfo.fullPath,
                  mp4FilePath,
                ]) // default fps from camera class, or fps from config
                console.info(`[${PetfeederServer.utcDateString}][SERVER] Video has been converted to MP4`)
              } catch (err) {
                console.error(`[${PetfeederServer.utcDateString}][ERROR] Video converting error:`, err)
                return
              }

              // updating state of gallery entry
              DB.updateGallery({ _id: startRecInfo.fileTimestamp }, { state: 1 }).catch(err => {
                console.error(`[${PetfeederServer.utcDateString}][ERROR] Database error:`, err)
              }) // 1 - converted, 0 - recording

              // taking thumbnails from video file
              const makeThumbnails = () => {
                return new Promise((resolve, reject) => {
                  ffmpeg(mp4FilePath)
                    .on('error', reject)
                    .on('end', resolve)
                    .screenshots({
                      count: 4,
                      filename: 'thumb-' + startRecInfo.fileTimestamp + '-%i.png',
                      folder: startRecInfo.fullPath.split(startRecInfo.fileName)[0],
                      size: '160x120', // TODO: move to configuration
                    })
                })
              }

              try {
                await makeThumbnails()
                console.info(`[${PetfeederServer.utcDateString}][SERVER] Video thumbnails done`)
              } catch (err) {
                console.error(`[${PetfeederServer.utcDateString}][ERROR] Making thumbnails error:`, err)
                return
              }

              // updating state of gallery entry
              DB.updateGallery({ _id: startRecInfo.fileTimestamp }, { state: 2 }).catch(err => {
                console.error(`[${PetfeederServer.utcDateString}][ERROR] Database error:`, err)
              }) // 2 - thumbnails done, 1 - converted, 0 - recording
            }, 30000) // 30 seconds - TODO: move to configuration
          })
          .catch(err => {
            console.error(`[${PetfeederServer.utcDateString}][ERROR] Video recording start error:`, err)
          })
    })

    this._device.on('feedingcomplete', motorRevolutions => {
      this._currentFeedingInProcess = false
      console.info(
        `[${PetfeederServer.utcDateString}][DEVICE] Feeding complete event with motor revolutions done:`,
        motorRevolutions
      )

      this.emitTransportEvent(TransportBase.EVENT_DEVICE_FEEDINGCOMPLETE, { data: motorRevolutions })

      const eventData = {
        scheduled: this._currentFeedingWasScheduled,
        scheduledPortions: this._currentFeedingPortions,
        issuedPortions: motorRevolutions,
      }

      if (this._hardwareButtonFeeding) eventData.hardwareButtonPressed = true

      DB.pushEvent('feeding', eventData).catch(err =>
        console.error(`[${PetfeederServer.utcDateString}][ERROR] Database error:`, err)
      )

      if (motorRevolutions < this._currentFeedingPortions)
        this.emitTransportEvent(TransportBase.EVENT_DEVICE_WARNINGMOTORSTUCK)
    })

    this._device.on('unknownmessage', data => {
      console.warn(`[${PetfeederServer.utcDateString}][DEVICE] Unknown Message received event:`, data)
    })

    this._device.on('warningnofood', () => {
      console.warn(`[${PetfeederServer.utcDateString}][DEVICE] No food event!`)
      this.emitTransportEvent(TransportBase.EVENT_DEVICE_WARNINGNOFOOD)
      DB.pushEvent('warning', {
        type: 'nofood',
      }).catch(err => console.error(`[${PetfeederServer.utcDateString}][ERROR] Database error:`, err))
    })
  }

  /**
   * Current Date in UTC
   */
  static get utcDateString() {
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

  _getConnectedUser(transportClass, userId) {
    return this._connectedUsers.filter(user => user.userId === userId && user.transportClass == transportClass)[0]
  }

  _addConnectedUser(transportClass, userId) {
    this._connectedUsers.push({
      userId,
      transportClass,
    })
  }

  _removeConnectedUser(transportClass, userId) {
    for (const userIndex in this._connectedUsers) {
      const user = this._connectedUsers[userIndex]
      if (user.userId === userId && user.transportClass === transportClass) {
        this._connectedUsers.splice(userIndex, 1) // removing
        break
      }
    }
  }

  _getCameraStreamSubscriber(transportClass, userId) {
    return this._cameraStreamSubscribers.filter(
      user => user.userId === userId && user.transportClass == transportClass
    )[0]
  }

  _addCameraStreamSubscriber(transportClass, userId, stream) {
    this._cameraStreamSubscribers.push({
      userId,
      transportClass,
      stream,
    })
  }

  _removeCameraStreamSubscriber(transportClass, userId) {
    for (const userIndex in this._cameraStreamSubscribers) {
      const user = this._cameraStreamSubscribers[userIndex]
      if (user.userId === userId && user.transportClass === transportClass) {
        this._cameraStreamSubscribers.splice(userIndex, 1) // removing
        break
      }
    }
  }

  /**
   * Remote procedure call handler
   * @param {String} path Full path to the resource to execute, for example: "device/feedManually"
   * @param {Array} args Arguments of the desired resource
   */
  async onRpc(path, args, transportClass, userId) {
    if (!(args instanceof Array)) args = [args]
    const [resource, method] = path.split('/', 3).slice(1) // without 'rpc/' part
    if (
      Object.keys(this._validRpcResources).indexOf(resource) === -1 ||
      this._validRpcResources[resource].methodsAllowed.indexOf(method) === -1
    )
      throw new InvalidRPCResourceException(path)

    // hook for manual feeding - logging to the database
    if (resource === 'device' && method === 'feedManually') {
      if (this._currentFeedingInProcess) throw new Error('Feeding already in progress')
      else this._currentFeedingInProcess = true
      this._hardwareButtonFeeding = false
      this._currentFeedingWasScheduled = false
      this._currentFeedingPortions = args[0] // portions - 1st argument TODO: check can be null here
    }

    let result = null
    if (resource === 'camera') {
      // passing caller info for camera methods
      result = await this._validRpcResources[resource].objectToCall[method](transportClass, userId)
    } else {
      // all other requests
      result = await this._validRpcResources[resource].objectToCall[method](...args)
    }

    // check if schedule was changed, need to update cached schedule then
    if (resource === 'device' && (method === 'setScheduleEntry' || method === 'clearSchedule')) {
      this._device
        .getSchedule()
        .then(schedule => {
          this._cachedSchedule = schedule
          console.info(`[${PetfeederServer.utcDateString}][SERVER] Schedule cache renewed:`)
          console.info(schedule)
        })
        .catch(err => console.error(`[${PetfeederServer.utcDateString}][SERVER] Error reading schedule on renew:`, err))
    }

    return result
  }

  async onConnectionEvent(event, data, transportClass, userId) {
    switch (event) {
      case TransportBase.EVENT_TRANSPORT_CONNECT:
        if (!this._controlBelongsTo)
          this._controlBelongsTo = {
            userId,
            transportClass,
          }

        this._addConnectedUser(transportClass, userId)
        break
      case TransportBase.EVENT_TRANSPORT_DISCONNECT:
        this._removeConnectedUser(transportClass, userId) // TODO: maybe one list of users
        if (this._getCameraStreamSubscriber(transportClass, userId)) await this.stopVideoStream(transportClass, userId)

        // TODO: transfer control rights to next connected user
        break
    }
  }

  /**
   * Transport event handler
   * @param {String} event Event string identificator. Please use constants from TransportBase class. For example TransportBase.EVENT_DEVICE_WARNINGMOTORSTUCK
   * @param {Object} eventConfig Event configuration object { transportClass, userId, data }
   */
  onTransportEvent(event, eventConfig) {
    const resourceType = event.split('/', 1)[0]
    const { transportClass, userId, data } = eventConfig || {}
    switch (resourceType) {
      case 'rpc':
        console.info(
          `[${PetfeederServer.utcDateString}][RPC] ${transportClass} ${userId} ${event} ${JSON.stringify(data)}`
        )
        this.onRpc(event, data, transportClass, userId)
          .then(result => {
            this.emitTransportEvent(event + TransportBase.EVENT_RESPONSE_SUFFIX, {
              transportClass,
              userId,
              data: result,
            })
          })
          .catch(err => {
            console.error(
              `[${
                PetfeederServer.utcDateString
              }][ERROR] RPC error ${transportClass} ${userId} ${event} ${JSON.stringify(data)}`,
              err
            )
            this.emitTransportEvent(event + TransportBase.EVENT_RESPONSE_SUFFIX, {
              transportClass,
              userId,
              data: { error: err.message }, // error field with message for user
            })
          })
        break
      case 'event':
        console.info(
          `[${PetfeederServer.utcDateString}][EVENT] ${transportClass} ${userId} ${event} ${JSON.stringify(data)}`
        )
        this.onConnectionEvent(event, data, transportClass, userId).catch(err => {
          console.error(
            `[${
              PetfeederServer.utcDateString
            }][EVENT] Transport event error: ${transportClass} ${userId} ${event} ${JSON.stringify(data)}`,
            err
          )
        })
        break
      default:
        console.error(
          `[${PetfeederServer.utcDateString}][ERROR] Invalid resource ${transportClass} ${userId} ${event} ${data}`
        )
        this.emitTransportEvent(event + TransportBase.EVENT_RESPONSE_SUFFIX, {
          transportClass,
          userId,
          data: { error: `You have requested invalid resource: ${event}` },
        })
        break
    }
  }

  /**
   * Emitting event for all registered transport classes
   * @param {String} event Event string identificator. Please use constants from TransportBase class. For example TransportBase.EVENT_DEVICE_WARNINGMOTORSTUCK
   * @param {Object} eventConfig Event configuration object { transportClass, userId, data }. If userId is empty - transport should emit event for all connected users.
   */
  emitTransportEvent(event, eventConfig) {
    const { transportClass, userId, data } = eventConfig || {}
    return new Promise(resolve => {
      // Do not need output to console when transmitting camera data
      if (event !== TransportBase.EVENT_CAMERA_H264DATA && event !== TransportBase.EVENT_CAMERA_PICTUREDATA)
        console.info(
          `[${PetfeederServer.utcDateString}][SERVER] Emitting event for ${transportClass || 'all'}${' ' + userId ||
            ''} ${event} ${JSON.stringify(data)}`
        )

      if (transportClass) {
        const transportInstance = this._transportList[transportClass]
        if (transportInstance)
          transportInstance.emitEvent(event, {
            userId,
            data,
          })

        resolve()
      } else {
        for (let transportInstance of Object.values(this._transportList))
          transportInstance.emitEvent(event, {
            userId,
            data,
          })

        resolve()
      }
    })
  }

  /**
   * Getting instance of existing camera or creating new instance with some predefined event handlers
   */
  _getCamera() {
    if (this._camera) return this._camera

    // https://www.raspberrypi.org/documentation/raspbian/applications/camera.md
    // additional parameters can be passed like { colfx: '128:128' } use -- prefixed parameter names from the documentation page above (black and white video for noir cameras in this case)
    this._camera = new Camera(config.camera)
    this._camera.on('error', async err => {
      this._camera = null
      console.error(`[${PetfeederServer.utcDateString}][ERROR] Camera error:`, err)
      this._device.powerLedBlinking = false
      await new Promise(resolve => setTimeout(() => resolve(), 100)) // let this._device.powerLedBlinking setter to destroy blink timer
      await this._device.setPowerLedState(true)
      throw err
    })

    this._camera.on('close', async () => {
      this._camera = null
      console.info(`[${PetfeederServer.utcDateString}][SERVER] Camera instance has been destroyed`)
      this._device.powerLedBlinking = false
      await new Promise(resolve => setTimeout(() => resolve(), 100)) // let this._device.powerLedBlinking setter to destroy blink timer
      await this._device.setPowerLedState(true)
    })

    console.info(`[${PetfeederServer.utcDateString}][SERVER] Camera instance has been created`)
    return this._camera
  }

  /**
   * Starting video stream for userId
   * TODO: bug somewhere when your connection is not first you will not receive stream data, need to check how i am piping streams
   */
  async startVideoStream(transportClass, userId) {
    const camera = this._getCamera()
    const stream = await camera.startStreaming()
    stream.on('data', data =>
      this.emitTransportEvent(TransportBase.EVENT_CAMERA_H264DATA, {
        transportClass,
        userId,
        data,
      })
    )

    this._addCameraStreamSubscriber(transportClass, userId, stream)
    this._device.powerLedBlinking = true // start blinking with Power LED
    console.info(
      `[${PetfeederServer.utcDateString}][SERVER] Camera stream has been started for:`,
      transportClass,
      userId
    )
  }

  /**
   * Stopping video stream for userId and removing from video stream subscribers
   */
  async stopVideoStream(transportClass, userId) {
    const streamSubscriber = this._getCameraStreamSubscriber(transportClass, userId)
    if (!streamSubscriber) throw new Error('You are not subscribed to video stream')

    this._removeCameraStreamSubscriber(transportClass, userId)
    if (this._camera) await this._camera.stopStreaming(streamSubscriber.stream)
    console.info(
      `[${PetfeederServer.utcDateString}][SERVER] Camera stream has been stopped for:`,
      transportClass,
      userId
    )
  }

  /**
   * Taking picture for userId
   */
  async takePicture(transportClass, userId) {
    if (this._camera && (this._camera.recording || this._camera.streaming))
      throw new Error('Can not take picture, camera in video mode at the moment')

    if (this._camera && this._camera.takingPicture)
      throw new Error('Can not take picture, camera already taking picture')

    await this._device.setPowerLedState(false) // turning off Power LED to indicate camera activity
    const camera = this._getCamera()

    // sending response event before 'on close' handler that we declared in '_getCamera' method
    camera.prependListener('close', async () => {
      this.emitTransportEvent(TransportBase.EVENT_CAMERA_PICTUREDATA, {
        transportClass,
        userId,
        data: null, // to indicate end of transmission
      })
    })

    const stream = await camera.takePicture()
    stream.on('data', data => {
      this.emitTransportEvent(TransportBase.EVENT_CAMERA_PICTUREDATA, {
        transportClass,
        userId,
        data,
      })
    })

    console.info(
      `[${PetfeederServer.utcDateString}][SERVER] Camera picture stream has been started for:`,
      transportClass,
      userId
    )
  }

  async startRecording() {
    const fileTimestamp = Date.now()
    const fileName = `video-${fileTimestamp}.h264`
    const currentPath = await DB.getOrCreateCurrentPath()
    const fullPath = path.resolve(currentPath, fileName)
    const camera = this._getCamera()

    await camera.startRecording(fullPath)
    console.info(`[${PetfeederServer.utcDateString}][SERVER] Camera recording has been started:`, fullPath)
    this._device.powerLedBlinking = true
    return {
      fileTimestamp,
      fileName,
      fullPath,
    }
  }

  async stopRecording() {
    if (!this._camera) return Promise.resolve()
    await this._camera.stopRecording()
    console.info(`[${PetfeederServer.utcDateString}][SERVER] Camera recording has been stopped`)
  }

  /**
   * Setting up and run
   */
  async run() {
    console.info(`[${PetfeederServer.utcDateString}][SERVER] Initializing device:`, this._device.constructor.name)
    console.info(`[${PetfeederServer.utcDateString}][SERVER] GPIO...`)
    await this._device.setupGPIO()
    console.info(`[${PetfeederServer.utcDateString}][SERVER] GPIO OK`)

    // Here we can check if button was pressed after start
    this._device
      .getButtonState()
      .then(buttonState =>
        console.info(`[${PetfeederServer.utcDateString}][SERVER] Button "SET" state on startup:`, buttonState)
      )
      .catch(err => console.error(`[${PetfeederServer.utcDateString}][SERVER] Button "SET" read state error:`, err))

    console.info(`[${PetfeederServer.utcDateString}][SERVER] UART...`)
    await this._device.connect()
    console.info(`[${PetfeederServer.utcDateString}][SERVER] UART OK`)

    console.info(`[${PetfeederServer.utcDateString}][SERVER] LEDs...`)
    await Promise.all([this._device.setPowerLedState(true), this._device.setLinkLedState(false)])
    console.info(`[${PetfeederServer.utcDateString}][SERVER] LEDs OK`)

    this._device
      .getSchedule()
      .then(schedule => {
        this._cachedSchedule = schedule
        console.info(`[${PetfeederServer.utcDateString}][SERVER] Schedule cached:`)
        console.info(schedule)
      })
      .catch(err => console.error(`[${PetfeederServer.utcDateString}][SERVER] Error reading schedule on startup:`, err))

    const allTransportsStarted = []
    for (let transport of Object.values(this._transportList)) allTransportsStarted.push(transport.run())

    await Promise.all(allTransportsStarted)
    console.info(`[${PetfeederServer.utcDateString}][SERVER] All transports has started`)
    console.info(`[${PetfeederServer.utcDateString}][SERVER] Initialization complete`)
  }
}

module.exports = PetfeederServer
