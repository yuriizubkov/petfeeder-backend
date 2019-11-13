const EventEmitter2 = require('eventemitter2')
const { InvalidRPCResourceException } = require('./error-types')

class PetfeederServer extends EventEmitter2 {
  /**
   * Object constructor
   * @param {Object} device Instance of PetwantDevice or class with simillar functionality
   * @param {Array<Transport>} transports Array of provided transport objects of Transport class
   */
  constructor(device, transports) {
    super()

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
    for (const transport of this._transports) {
      console.info('[SERVER] Transport added:', transport.constructor.name)
      transport.onAny(this.onTransportEvent)
    }

    // Setup device
    this._device.on('buttondown', () => console.info('[DEVICE] Button down event'))

    this._device.on('buttonup', () => console.info('[DEVICE] Button up event'))

    this._device.on('buttonlongpress', pressedTime =>
      console.info('[DEVICE] Button long press event with pressed time (ms):', pressedTime)
    )

    this._device.on('clocksynchronized', () => {
      console.info('[DEVICE] Clock synchronization event')
      this.emit('event/device/clocksynchronized')
    })

    this._device.on('scheduledfeedingstarted', entryData => {
      this._feedingInProcess = true
      console.info('[DEVICE] Scheduled feeding started event:', entryData)
      this.emit('event/device/scheduledfeedingstarted', entryData)
    })

    this._device.on('feedingcomplete', motorRevolutions => {
      this._feedingInProcess = false
      console.info('[DEVICE] Feeding complete event with motor revolutions done:', motorRevolutions)

      this.emit('event/device/feedingcomplete', motorRevolutions)
    })

    this._device.on('unknownmessage', data => {
      console.warn('[DEVICE] Unknown Message received event:', data)
    })

    this._device.on('warningnofood', () => {
      console.warn('[DEVICE] No food event!')
      this.emit('event/device/warningnofood')
    })
  }

  static get EVENT_RESPONSE() {
    return 'response'
  }

  getRegisteredTransportInstance(className) {
    return this._transportList[className]
  }

  /**
   * Remote procedure call handler
   * @param {String} path Full path to the resource to execute, for example: "device/feedManually"
   * @param {Array} args Arguments of the desired resource
   */
  async onRpc(path, args) {
    const [resource, method] = path.split('/', 2)
    if (
      Object.keys(this._validRpcResources).indexOf(resource) !== -1 &&
      this._validRpcResources[resource].methodsAllowed.indexOf(method) !== -1
    ) {
      return await this._validRpcResources[resource].objectToCall[method](...args)
    } else throw new InvalidRPCResourceException(path)
  }

  onTransportEvent(event, data) {
    const resourceType = event.split('/', 1)
    const { transportClass, userId, args } = data
    switch (resourceType) {
      case 'rpc':
        this.onRpc(event, args)
          .then(result => {
            this.emitTransportEvent([event, PetfeederServer.EVENT_RESPONSE].join('/'), {
              transportClass,
              userId,
              args: result,
            })
          })
          .catch(err => console.error(err))
        break
      default:
        this.emitTransportEvent([event, PetfeederServer.EVENT_RESPONSE].join('/'))
        break
    }
  }

  emitTransportEvent(event, data) {
    const { transportClass, userId, args } = data
    const transportInstance = this.getRegisteredTransportInstance(transportClass)
    if (transportInstance)
      transportInstance.emitEvent([event, this.PATH_RESPONSE_STR].join('/'), {
        userId,
        data: args,
      })
  }

  // Setup and run
  async run() {
    console.info('Initializing device:', this._device.constructor.name)
    console.info('GPIO...')
    await this._device.setupGPIO()
    console.info('OK')

    // Here we can check if button pressed after start
    this._device
      .getButtonState()
      .then(buttonState => console.info('Button "SET"  is pressed on startup:', buttonState))
      .catch(err => console.error(err))

    console.info('UART...')
    await this._device.connect()
    console.info('OK')

    console.info('LEDs...')
    await Promise.all([this._device.setPowerLedState(true), this._device.setLinkLedState(false)])

    console.info('OK')

    const allTransportsStarted = []
    for (const transport of this._transports) allTransportsStarted.push(transport.run())

    await Promise.all(allTransportsStarted)

    console.info('Setup is complete')
  }
}

module.exports = PetfeederServer
