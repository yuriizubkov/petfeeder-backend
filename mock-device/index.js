const EventEmitter = require('events')
const fs = require('fs')
const path = require('path')
const {
  GPIOSetupNotCompletedException,
  UARTNotConnectedException,
  InvalidParameterException,
} = require('../error-types')

class MockDevice extends EventEmitter {
  constructor(
    uartPortName = '/dev/serial0',
    powerLedGPIOPin = 16,
    linkLedGPIOPin = 18,
    buttonGPIOPin = 22,
    maxTimeDriftSeconds = 10
  ) {
    super()

    this._powerLedBlinking = false
    this._linkLedBlinking = false
    this._uartConnected = false
    this._gpioSetupCompleted = false
    this._powerLedState = false
    this._linkLedState = false
    this._buttonState = false

    // clock emulation
    setInterval(() => {
      this.emulateClockReceived()
    }, 6000)

    // clock sync emulation
    setInterval(() => {
      this.emulateClockSync()
    }, 60000)
  }

  get powerLedBlinking() {
    return this._powerLedBlinking
  }

  set powerLedBlinking(value) {
    if (typeof value !== 'boolean')
      throw new InvalidParameterException(
        "Parameter 'value' is incorrect, it must be type of a Boolean"
      )

    this._powerLedBlinking = value
  }

  get linkLedBlinking() {
    return this._linkLedBlinking
  }

  set linkLedBlinking(value) {
    if (typeof value !== 'boolean')
      throw new InvalidParameterException(
        "Parameter 'value' is incorrect, it must be type of a Boolean"
      )

    this._linkLedBlinking = value
  }

  setupGPIO() {
    this._gpioSetupCompleted = true
    return Promise.resolve()
  }

  connect() {
    this._uartConnected = true
    return Promise.resolve()
  }

  feedManually(portions = 1) {
    if (!this._uartConnected)
      return Promise.reject(new UARTNotConnectedException())

    setTimeout(() => {
      this.emit('feedingcomplete', portions)
    }, 2000)

    return Promise.resolve()
  }

  getSchedule() {
    if (!this._uartConnected)
      return Promise.reject(new UARTNotConnectedException())

    return new Promise((resolve, reject) => {
      fs.readFile(
        path.resolve(__dirname, 'schedule.json'),
        'UTF-8',
        (err, data) => {
          if (err) return reject(err)
          let schedule = JSON.parse(data)
          resolve(schedule)
        }
      )
    })
  }

  setScheduleEntry(
    hours,
    minutes,
    portions,
    entryIndex,
    soundIndex = 10, // no sound
    enabled = true
  ) {
    if (!this._uartConnected)
      return Promise.reject(new UARTNotConnectedException())

    return new Promise((resolve, reject) => {
      const scheduleFilePath = path.resolve(__dirname, 'schedule.json')
      fs.readFile(scheduleFilePath, 'UTF-8', (err, data) => {
        if (err) return reject(err)
        let schedule = JSON.parse(data)
        const entry = schedule[entryIndex - 1]
        entry.hours = hours
        entry.minutes = minutes
        entry.portions = portions
        entry.soundIndex = soundIndex
        entry.enabled = enabled

        fs.writeFile(
          scheduleFilePath,
          JSON.stringify(schedule),
          (err, data) => {
            if (err) return reject(err)
            resolve()
          }
        )
      })
    })
  }

  clearSchedule() {
    // To "clear" entry you need to save it with time 00:00, portions 0, disabled flag, propper entry index and audio index 10
    return new Promise((resolve, reject) => {
      const scheduleFilePath = path.resolve(__dirname, 'schedule.json')
      const disabledSchedule = [
        {
          hours: 0,
          minutes: 0,
          portions: 0,
          entryIndex: 1,
          soundIndex: 10,
          enabled: false,
        },
        {
          hours: 0,
          minutes: 0,
          portions: 0,
          entryIndex: 2,
          soundIndex: 10,
          enabled: false,
        },
        {
          hours: 0,
          minutes: 0,
          portions: 0,
          entryIndex: 3,
          soundIndex: 10,
          enabled: false,
        },
        {
          hours: 0,
          minutes: 0,
          portions: 0,
          entryIndex: 4,
          soundIndex: 10,
          enabled: false,
        },
      ]

      fs.writeFile(
        scheduleFilePath,
        JSON.stringify(disabledSchedule),
        (err, data) => {
          if (err) return reject(err)
          resolve()
        }
      )
    })
  }

  getPowerLedState() {
    if (!this._gpioSetupCompleted)
      return Promise.reject(new GPIOSetupNotCompletedException())

    return Promise.resolve(this._powerLedState)
  }

  setPowerLedState(state) {
    if (typeof state !== 'boolean')
      return Promise.reject(
        new InvalidParameterException(
          "Parameter 'state' is incorrect, it must be type of a Boolean"
        )
      )

    if (!this._gpioSetupCompleted)
      return Promise.reject(new GPIOSetupNotCompletedException())

    this._powerLedState = state
    return Promise.resolve()
  }

  getLinkLedState() {
    if (!this._gpioSetupCompleted)
      return Promise.reject(new GPIOSetupNotCompletedException())

    return Promise.resolve(this._linkLedState)
  }

  setLinkLedState(state) {
    if (typeof state !== 'boolean')
      return Promise.reject(
        new InvalidParameterException(
          "Parameter 'state' is incorrect, it must be type of a Boolean"
        )
      )

    if (!this._gpioSetupCompleted)
      return Promise.reject(new GPIOSetupNotCompletedException())

    this._linkLedState = state
    return Promise.resolve()
  }

  getButtonState() {
    if (!this._gpioSetupCompleted)
      return Promise.reject(new GPIOSetupNotCompletedException())

    return Promise.resolve(this._buttonState)
  }

  destroy() {
    return
  }

  // **********************************************
  // methods for behaviour emulation of real device
  // **********************************************

  emulateLongPress(timeMs = 3500) {
    this.emit('buttonlongpress', timeMs)
  }

  emulateButtonDown() {
    this.emit('buttondown')
  }

  emulateButtonUp() {
    this.emit('buttonup')
  }

  emulateWarningNoFood() {
    this.emit('warningnofood')
  }

  emulateScheduledFeeding(scheduleEntry) {
    this.emit('scheduledfeedingstarted', {
      entryIndex: scheduleEntry.entryIndex, // entry index
      soundIndex: scheduleEntrysoundIndex, // sound file index to play
    })

    setTimeout(() => {
      this.emit('feedingcomplete', scheduleEntry.portions)
    }, 2000)
  }

  emulateClockReceived() {
    const localDateTimeUtc = new Date().toUTCString()
    this.emit('datetimeutc', localDateTimeUtc)
  }

  emulateClockSync() {
    this.emit('clocksynchronized')
  }
}

module.exports = MockDevice
