const { InvalidRPCResourceException } = require('./error-types')

class PetfeederServer {
  /**
   * Object constructor
   * @param {Object} device Instance of PetwantDevice or class with simillar functionality
   * @param {Array<Transport>} transports Array of provided transport objects of Transport class
   */
  constructor(device, transports) {
    console.info(`[${PetfeederServer.utcDate}][SERVER] Initializing server...`)

    this._controlBelongsTo = null // { userId: 'id', transport: transportInstance }
    this._feedingInProcess = false
    this._device = device

    this._transportList = {} // { 'transportClassName': transportInstance }
    for (let transportInstance of transports)
      this._transportList[transportInstance.constructor.name] = transportInstance

    this._validRpcResources = {
      device: {
        objectToCall: this._device,
        methodsAllowed: ['feedManually', 'getSchedule', 'setScheduleEntry'],
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

    this._device.on('buttonlongpress', pressedTime =>
      console.info(`[${PetfeederServer.utcDate}][DEVICE] Button long press event with pressed time (ms):`, pressedTime)
    )

    this._device.on('clocksynchronized', () => {
      console.info(`[${PetfeederServer.utcDate}][DEVICE] Clock synchronization event`)
      this.emitTransportEvent('event/device/clocksynchronized')
    })

    this._device.on('scheduledfeedingstarted', entryData => {
      this._feedingInProcess = true
      console.info(`[${PetfeederServer.utcDate}][DEVICE] Scheduled feeding started event:`, entryData)
      this.emitTransportEvent('event/device/scheduledfeedingstarted', { data: entryData })
    })

    this._device.on('feedingcomplete', motorRevolutions => {
      this._feedingInProcess = false
      console.info(
        `[${PetfeederServer.utcDate}][DEVICE] Feeding complete event with motor revolutions done:`,
        motorRevolutions
      )

      this.emitTransportEvent('event/device/feedingcomplete', { data: motorRevolutions })
    })

    this._device.on('unknownmessage', data => {
      console.warn(`[${PetfeederServer.utcDate}][DEVICE] Unknown Message received event:`, data)
    })

    this._device.on('warningnofood', () => {
      console.warn(`[${PetfeederServer.utcDate}][DEVICE] No food event!`)
      this.emitTransportEvent('event/device/warningnofood')
    })
  }

  static get EVENT_RESPONSE() {
    return 'response'
  }

  static get utcDate() {
    function pad(number) {
      return ('0' + number).slice(-2)
    }

    const now = new Date(Date.now())
    return (
      `${now.getUTCFullYear()}` +
      `.${pad(now.getUTCMonth())}` +
      `.${pad(now.getUTCDay())} ` +
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
      const result = await this._validRpcResources[resource].objectToCall[method](...args)
      return result
    } else throw new InvalidRPCResourceException(path)
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
        console.info(
          `[${PetfeederServer.utcDate}][EVENT] New connection ${transportClass} ${userId} ${event} ${JSON.stringify(
            data
          )}`
        )
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
    console.info(
      `[${PetfeederServer.utcDate}][SERVER] Emitting event for ${transportClass || 'all'} ${userId ||
        ''} ${event} ${JSON.stringify(data)}`
    )

    if (transportClass) {
      const transportInstance = this._transportList[transportClass]
      if (transportInstance)
        transportInstance.emitEvent(event, {
          userId,
          data,
        })
    } else {
      for (let transportInstance of Object.values(this._transportList))
        transportInstance.emitEvent(event, {
          userId,
          data,
        })
    }
  }

  // Setup and run
  async run() {
    console.info(`[${PetfeederServer.utcDate}][SERVER] Initializing device:`, this._device.constructor.name)
    console.info(`[${PetfeederServer.utcDate}][SERVER] GPIO...`)
    await this._device.setupGPIO()
    console.info(`[${PetfeederServer.utcDate}][SERVER] GPIO OK`)

    // Here we can check if button pressed after start
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

    const allTransportsStarted = []
    for (let transport of Object.values(this._transportList)) allTransportsStarted.push(transport.run())

    await Promise.all(allTransportsStarted)

    console.info(`[${PetfeederServer.utcDate}][SERVER] Initialization complete`)
  }
}

module.exports = PetfeederServer
