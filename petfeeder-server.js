const { InvalidRPCResourceException } = require('./error-types')
const DB = require('./database')
const Camera = require('./camera')
const TransportBase = require('./transport/transport-base') // for constants

/**
 * Server for DIY pet feeder
 */
class PetfeederServer {
  /**
   * @param {Object} device Instance of PetwantDevice or class with simillar functionality
   * @param {Array<Transport>} transports Array of provided transport objects of Transport class
   */
  constructor(device, transports) {
    console.info(`[${PetfeederServer.utcDate}][SERVER] Initializing server...`)

    this._controlBelongsTo = null // { userId: 'id', transportClass: transportClassName }
    this._currentFeedingInProcess = false
    this._currentFeedingWasScheduled = false
    this._currentFeedingPortions = 0
    this._device = device
    this._cachedSchedule = []
    this._hardwareButtonFeeding = false
    this._camera = null

    this._transportList = {} // { 'transportClassName': transportInstance }
    for (let transportInstance of transports)
      this._transportList[transportInstance.constructor.name] = transportInstance

    this._validRpcResources = {
      device: {
        objectToCall: this._device,
        methodsAllowed: ['feedManually', 'getSchedule', 'setScheduleEntry', 'clearSchedule'],
      },
      camera: {
        objectToCall: this,
        methodsAllowed: ['startVideoStream', 'stopVideoStream'],
      },
      database: {
        objectToCall: DB,
        methodsAllowed: ['getEvents'],
      },
      wifi: {
        objectToCall: null,
        methodsAllowed: ['scan', 'connect', 'disconnect', 'turnOn', 'turnOff'],
      },
      bluetooth: {
        objectToCall: null,
        methodsAllowed: ['scan', 'connect', 'disconnect', 'turnOn', 'turnOff'],
      },
    }

    // Subscribing to transports`s events
    for (const transportClass of Object.keys(this._transportList)) {
      console.info(`[${PetfeederServer.utcDate}][SERVER] Transport added:`, transportClass)
      this._transportList[transportClass].onAny((event, eventConfig) => this.onTransportEvent(event, eventConfig))
    }

    // Setup device
    this._device.on('buttondown', () => console.info(`[${PetfeederServer.utcDate}][DEVICE] Button down event`))
    this._device.on('buttonup', () => console.info(`[${PetfeederServer.utcDate}][DEVICE] Button up event`))

    this._device.on('buttonlongpress', pressedTime => {
      console.info(`[${PetfeederServer.utcDate}][DEVICE] Button long press event with pressed time (ms):`, pressedTime)
      this._device.linkLedBlinking = !this._device.linkLedBlinking
      // TODO: toggle bluetooth on/off
    })

    this._device.on('clocksynchronized', () => {
      console.info(`[${PetfeederServer.utcDate}][DEVICE] Clock synchronization event`)
      this.emitTransportEvent('event/device/clocksynchronized')

      DB.pushEvent('clocksync').catch(err => console.error(`[${PetfeederServer.utcDate}][ERROR] Database error:`, err))
    })

    this._device.on('scheduledfeedingstarted', entryData => {
      console.info(`[${PetfeederServer.utcDate}][DEVICE] Scheduled feeding started event:`, entryData)
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

      this.emitTransportEvent('event/device/feedingstarted', { data: entryData })
    })

    this._device.on('feedingcomplete', motorRevolutions => {
      this._currentFeedingInProcess = false
      console.info(
        `[${PetfeederServer.utcDate}][DEVICE] Feeding complete event with motor revolutions done:`,
        motorRevolutions
      )

      this.emitTransportEvent('event/device/feedingcomplete', { data: motorRevolutions })

      const eventData = {
        scheduled: this._currentFeedingWasScheduled,
        scheduledPortions: this._currentFeedingPortions,
        issuedPortions: motorRevolutions,
      }

      if (this._hardwareButtonFeeding) eventData.hardwareButtonPressed = true

      DB.pushEvent('feeding', eventData).catch(err =>
        console.error(`[${PetfeederServer.utcDate}][ERROR] Database error:`, err)
      )

      if (motorRevolutions < this._currentFeedingPortions) this.emitTransportEvent('event/device/warningmotorstuck')
    })

    this._device.on('unknownmessage', data => {
      console.warn(`[${PetfeederServer.utcDate}][DEVICE] Unknown Message received event:`, data)
    })

    this._device.on('warningnofood', () => {
      console.warn(`[${PetfeederServer.utcDate}][DEVICE] No food event!`)
      this.emitTransportEvent('event/device/warningnofood')
      DB.pushEvent('warning', {
        type: 'nofood',
      }).catch(err => console.error(`[${PetfeederServer.utcDate}][ERROR] Database error:`, err))
    })
  }

  static get EVENT_RESPONSE() {
    // TODO: to BaseTransport
    return 'response'
  }

  static get utcDate() {
    function pad(number) {
      return ('0' + number).slice(-2)
    }

    const now = new Date(Date.now())
    return (
      `${now.getUTCFullYear()}` +
      `.${pad(now.getUTCMonth() + 1)}` +
      `.${pad(now.getUTCDate())} ` +
      `${pad(now.getUTCHours())}` +
      `:${pad(now.getUTCMinutes())}` +
      `:${pad(now.getUTCSeconds())}` +
      `:${now.getUTCMilliseconds()} GMT`
    )
  }

  /**
   * Remote procedure call handler
   * @param {String} path Full path to the resource to execute, for example: "device/feedManually"
   * @param {Array} args Arguments of the desired resource
   */
  async onRpc(path, args) {
    if (!(args instanceof Array)) args = [args]
    const [resource, method] = path.split('/', 3).slice(1) // without 'rpc/' part
    if (
      Object.keys(this._validRpcResources).indexOf(resource) !== -1 &&
      this._validRpcResources[resource].methodsAllowed.indexOf(method) !== -1
    ) {
      // manual feeding hook for logging to the database
      if (resource === 'device' && method === 'feedManually') {
        if (this._currentFeedingInProcess) throw new Error('Feeding already in progress')
        else this._currentFeedingInProcess = true
        this._hardwareButtonFeeding = false
        this._currentFeedingWasScheduled = false
        this._currentFeedingPortions = args[0] // portions - 1st argument
      }

      const result = await this._validRpcResources[resource].objectToCall[method](...args)

      // check if schedule was changed, need to update cached schedule then
      if (resource === 'device' && (method === 'setScheduleEntry' || method === 'clearSchedule')) {
        this._device
          .getSchedule()
          .then(schedule => {
            this._cachedSchedule = schedule
            console.info(`[${PetfeederServer.utcDate}][SERVER] Schedule cache renewed:`)
            console.info(schedule)
          })
          .catch(err => console.error(`[${PetfeederServer.utcDate}][SERVER] Error reading schedule on renew:`, err))
      }

      return result
    } else throw new InvalidRPCResourceException(path)
  }

  onConnectionEvent(transportClass, userId, event, data) {
    switch (event) {
      case TransportBase.EVENT_CONNECT:
        if (!this._controlBelongsTo)
          this._controlBelongsTo = {
            userId,
            transportClass,
          }

        break
      case TransportBase.EVENT_DISCONNECT:
        if (this._controlBelongsTo && this._controlBelongsTo.userId === userId) {
          this._controlBelongsTo = null
          if (this._camera) this.stopVideoStream()
          //TODO: transfer control to next connected user
        }
        break
    }
  }

  onTransportEvent(event, eventConfig) {
    const resourceType = event.split('/', 1)[0]
    const { transportClass, userId, data } = eventConfig || {}
    switch (resourceType) {
      case 'rpc':
        console.info(`[${PetfeederServer.utcDate}][RPC] ${transportClass} ${userId} ${event} ${JSON.stringify(data)}`)
        this.onRpc(event, data)
          .then(result => {
            this.emitTransportEvent([event, PetfeederServer.EVENT_RESPONSE].join('/'), {
              transportClass,
              userId,
              data: result,
            })
          })
          .catch(err => {
            console.error(
              `[${PetfeederServer.utcDate}][ERROR] RPC error ${transportClass} ${userId} ${event} ${JSON.stringify(
                data
              )}`,
              err
            )
            this.emitTransportEvent([event, PetfeederServer.EVENT_RESPONSE].join('/'), {
              transportClass,
              userId,
              data: { error: err.message }, // error field with message for user
            })
          })
        break
      case 'event':
        console.info(`[${PetfeederServer.utcDate}][EVENT] ${transportClass} ${userId} ${event} ${JSON.stringify(data)}`)
        this.onConnectionEvent(transportClass, userId, event, data).catch(err => {
          console.error(
            `[${
              PetfeederServer.utcDate
            }][EVENT] Transport event error: ${transportClass} ${userId} ${event} ${JSON.stringify(data)}`,
            err
          )
        })
        break
      default:
        console.error(
          `[${PetfeederServer.utcDate}][ERROR] Invalid resource ${transportClass} ${userId} ${event} ${data}`
        )
        this.emitTransportEvent([event, PetfeederServer.EVENT_RESPONSE].join('/'), {
          transportClass,
          userId,
          data: { error: `You have requested invalid resource: ${event}` },
        })
        break
    }
  }

  emitTransportEvent(event, eventConfig) {
    const { transportClass, userId, data } = eventConfig || {}
    return new Promise(resolve => {
      if (event !== 'event/camera/h264data')
        console.info(
          `[${PetfeederServer.utcDate}][SERVER] Emitting event for ${transportClass || 'all'}${' ' + userId ||
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

  async startVideoStream() {
    if (this._camera) throw new Error('Camera already started')
    // https://www.raspberrypi.org/documentation/raspbian/applications/camera.md
    // additional parameters can be passed like { colfx: '128:128' } use -- prefixed parameter names (black and white video for noir cameras in this case)
    //TODO: in settings
    this._camera = new Camera({
      colfx: '128:128', // b&w video for moir cameras
      vflip: true,
    })

    this._camera.on('error', err => console.error(`[${PetfeederServer.utcDate}][ERROR] Camera stream error:`, err))
    this._camera.on('close', () => console.info(`[${PetfeederServer.utcDate}][SERVER] Camera stream closed`))

    const stream = await this._camera.startVideoStream()
    this._device.powerLedBlinking = true
    console.info(`[${PetfeederServer.utcDate}][SERVER] Camera has been started`)
    //TODO: not for all but for subscribed only
    stream.on('data', data =>
      this.emitTransportEvent('event/camera/h264data', {
        transportClass: 'SocketIoTransport',
        data,
      })
    )
  }

  async stopVideoStream() {
    if (!this._camera) return Promise.resolve()
    await this._camera.stopVideoStream()
    this._camera = null
    console.info(`[${PetfeederServer.utcDate}][SERVER] Camera has been stopped`)
    this._device.powerLedBlinking = false
    await this._device.setPowerLedState(true)
  }

  // Setup and run
  async run() {
    console.info(`[${PetfeederServer.utcDate}][SERVER] Initializing device:`, this._device.constructor.name)
    console.info(`[${PetfeederServer.utcDate}][SERVER] GPIO...`)
    await this._device.setupGPIO()
    console.info(`[${PetfeederServer.utcDate}][SERVER] GPIO OK`)

    // Here we can check if button was pressed after start
    this._device
      .getButtonState()
      .then(buttonState =>
        console.info(`[${PetfeederServer.utcDate}][SERVER] Button "SET" state on startup:`, buttonState)
      )
      .catch(err => console.error(`[${PetfeederServer.utcDate}][SERVER] Button "SET" read state error:`, err))

    console.info(`[${PetfeederServer.utcDate}][SERVER] UART...`)
    await this._device.connect()
    console.info(`[${PetfeederServer.utcDate}][SERVER] UART OK`)

    console.info(`[${PetfeederServer.utcDate}][SERVER] LEDs...`)
    await Promise.all([this._device.setPowerLedState(true), this._device.setLinkLedState(false)])
    console.info(`[${PetfeederServer.utcDate}][SERVER] LEDs OK`)

    this._device
      .getSchedule()
      .then(schedule => {
        this._cachedSchedule = schedule
        console.info(`[${PetfeederServer.utcDate}][SERVER] Schedule cached:`)
        console.info(schedule)
      })
      .catch(err => console.error(`[${PetfeederServer.utcDate}][SERVER] Error reading schedule on startup:`, err))

    const allTransportsStarted = []
    for (let transport of Object.values(this._transportList)) allTransportsStarted.push(transport.run())

    await Promise.all(allTransportsStarted)
    console.info(`[${PetfeederServer.utcDate}][SERVER] All transports has started`)
    console.info(`[${PetfeederServer.utcDate}][SERVER] Initialization complete`)
  }
}

module.exports = PetfeederServer
