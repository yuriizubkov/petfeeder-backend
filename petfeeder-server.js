const { InvalidRPCResourceException } = require('./error-types')

class PetfeederServer {
  /**
   * Object constructor
   * @param {Object} device Instance of PetwantDevice or class with simillar functionality
   * @param {Array<Transport>} transports Array of provided transport objects of Transport class
   */
  constructor(device, transports) {
    this._controlBelongsTo = null // { userId: 'id', transport: transportObject }
    this._feedingInProcess = false
    this._device = device
    this._transports = transports
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

    // Transport objects configuration
    for (const transport of this._transports) {
      console.info('Transport added:', transport.constructor.name)
      transport.on('rpc', ({ res, userId, args }) => {
        console.info(
          `[RPC] Transport: "${transport.constructor.name}" User: "${userId}" Resource: "${res}" Arguments: "${args}"`
        )
        this._rpc(res, args)
          .then(result => {
            return transport.rpcResponse(res, userId, { result })
          })
          .catch(err => {
            console.error(err)
            return transport.rpcResponse(res, userId, { error: err.message })
          })
          .catch(err => console.error(err))
      })
    }

    // Setup device
    this._device.on('buttondown', () =>
      console.info('[DEVICE] Button down event')
    )

    this._device.on('buttonup', () => console.info('[DEVICE] Button up event'))

    this._device.on('buttonlongpress', pressedTime =>
      console.info(
        '[DEVICE] Button long press event with pressed time (ms):',
        pressedTime
      )
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
      console.info(
        '[DEVICE] Feeding complete event with motor revolutions done:',
        motorRevolutions
      )

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

  emit(event, data) {
    for (const transport of this._transports) transport.event(event, data)
  }

  /**
   * Remote procedure call
   * @param {String} path Resource to execute, for example: device/feedManually
   * @param {Array} args Arguments
   */
  async _rpc(path, args) {
    const [resource, method] = path.split('/', 2)
    if (
      Object.keys(this._validRpcResources).indexOf(resource) !== -1 &&
      this._validRpcResources[resource].methodsAllowed.indexOf(method) !== -1
    ) {
      const result = await this._validRpcResources[resource].objectToCall[
        method
      ](...args)
      return result
    } else throw new InvalidRPCResourceException(path)
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
      .then(buttonState =>
        console.info('Button "SET" pressed on startup:', buttonState)
      )
      .catch(err => console.error(err))

    console.info('UART...')
    await this._device.connect()
    console.info('OK')

    console.info('LEDs...')
    await Promise.all([
      this._device.setPowerLedState(true),
      this._device.setLinkLedState(false),
    ])

    console.info('OK')

    const allTransportsStarted = []
    for (const transport of this._transports)
      allTransportsStarted.push(transport.run())

    await Promise.all(allTransportsStarted)

    console.info('Setup is complete')
  }
}

module.exports = PetfeederServer
