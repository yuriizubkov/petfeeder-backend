const packageConfig = require('./package.json')
console.log(packageConfig.name, packageConfig.version)

const ENV = process.env.NODE_ENV || 'production'
console.log('Environment set:', ENV)

// Device selection
let device = null
let feedingInProcess = false

if (ENV === 'production') {
  const PetwantDevice = require('petwant-device')
  device = new PetwantDevice()
} else {
  const MockDevice = require('./mock-data/mock-device')
  device = new MockDevice()
}

// socket.io configuration
let socketAdminId = null
const io = require('socket.io')(80, {
  path: '/api',
  serveClient: false,
})

io.on('connection', socket => {
  if (socketAdminId === null) {
    socketAdminId = socket.id
    socket.emit('control/allowed')
    console.info('[CONNECTION] User connected with control allowed:', socket.id)
  } else {
    socket.emit('control/disabled')
    console.info('[CONNECTION] User connected with control disabled', socket.id)
  }

  socket.on('disconnect', () => {
    console.info('[CONNECTION] User disconnected:', socket.id)
    if (Object.keys(io.sockets.connected).length > 0) {
      let nextSocketAdmin = Object.values(io.sockets.connected)[0]
      socketAdminId = nextSocketAdmin.id
      nextSocketAdmin.emit('control/allowed')
      console.info('[CONTROL] Control transferred to user:', nextSocketAdmin.id)
    } else socketAdminId = null
  })

  socket.on('control/feed', portions => {
    if (socketAdminId !== socket.id) {
      socket.emit('control/disabled')
      return
    }

    console.info('[CONTROL] Feed manually with portions', portions)
    if (!feedingInProcess) {
      device
        .feedManually(portions)
        .then(() => {
          feedingInProcess = true
          socket.emit('control/feed/accepted')
        })
        .catch(err => socket.emit('control/feed/failed', err.message))
    } else
      socket.emit(
        'control/feedManually/failed',
        'The feeding process is already running'
      )
  })

  socket.on('control/getSchedule', () => {
    console.info('[CONTROL] Get schedule')
    device
      .getSchedule()
      .then(schedule => {
        socket.emit('control/getSchedule/accepted', schedule)
      })
      .catch(err => socket.emit('control/getSchedule/failed', err.message))
  })

  device
    .getSchedule()
    .then(schedule => {
      socket.emit('control/getSchedule/accepted', schedule)
    })
    .catch(err => socket.emit('control/getSchedule/failed', err.message))

  socket.emit('control/getEvents/accepted', [
    /** TODO: list of events */
  ])
})

// Setup device
async function setup(device) {
  console.info('Initializing device:', device.constructor.name)

  try {
    console.info('GPIO...')
    await device.setupGPIO()
    console.info('OK')

    console.info('UART...')
    await device.connect()
    console.info('OK')

    console.info('LEDs...')
    await Promise.all([
      device.setPowerLedState(true),
      device.setLinkLedState(false),
    ])

    console.info('OK')

    device.on('buttondown', () => console.info('[DEVICE] Button down event'))

    device.on('buttonup', () => console.info('[DEVICE] Button up event'))

    device.on('buttonlongpress', pressedTime =>
      console.info(
        '[DEVICE] Button long press event with pressed time (ms):',
        pressedTime
      )
    )

    // device.on('datetimeutc', dateTimeUtc => {
    //   console.info('[DEVICE] DateTime UTC:', dateTimeUtc)
    //   io.emit('device/datetimeutc', dateTimeUtc)
    // })

    device.on('clocksynchronized', () => {
      console.info('[DEVICE] Clock synchronization event')
      io.emit('device/clocksynchronized')
    })

    device.on('scheduledfeedingstarted', entryData => {
      feedingInProcess = true
      console.info('[DEVICE] Scheduled feeding started event:', entryData)
      io.emit('device/scheduledfeedingstarted', entryData)
    })

    device.on('feedingcomplete', motorRevolutions => {
      feedingInProcess = false
      console.info(
        '[DEVICE] Feeding complete event with motor revolutions done:',
        motorRevolutions
      )

      io.emit('device/feedingcomplete', motorRevolutions)
    })

    device.on('unknownmessage', data => {
      console.warn('[DEVICE] Unknown Message received event:', data)
      io.emit('device/unknownmessage')
    })

    device.on('warningnofood', () => {
      console.warn('[DEVICE] No food event!')
      io.emit('device/warningnofood')
    })

    console.info('Setup is complete')
  } catch (err) {
    console.error(err)
  }
}

// Cleanup on exit
async function cleanup(sig) {
  if (sig) console.info('Cleanup on signal:', sig)
  else console.info('Cleanup.')

  try {
    await device.setLinkLedState(false)
    await device.setPowerLedState(false)
  } catch (err) {}

  device.destroy()
  console.info('Cleanup done.')
  process.exit(0)
}

;[
  'SIGHUP',
  'SIGINT',
  'SIGQUIT',
  'SIGILL',
  'SIGTRAP',
  'SIGABRT',
  'SIGBUS',
  'SIGFPE',
  'SIGUSR1',
  'SIGSEGV',
  'SIGUSR2',
  'SIGTERM',
  'unhandledRejection',
  'uncaughtException',
].forEach(sig => {
  process.on(sig, cleanup)
})

// Setup device
setup(device)

// long press emulation
// setTimeout(() => {
//   device.emulateLongPress && device.emulateLongPress() // only in mock device
// }, 3000)

// emulate feeding
// setTimeout(() => {
//   device.feedManually(3)
// }, 5000)

// setTimeout(() => {
//   device
//     .getSchedule()
//     .then(schedule => console.info(schedule))
//     .catch(err => console.error(err))
// }, 2000)

// setTimeout(() => {
//   device.clearSchedule().catch(err => console.error(err))
// }, 3000)

// setTimeout(() => {
//   device
//     .getSchedule()
//     .then(schedule => console.info(schedule))
//     .catch(err => console.error(err))
// }, 4000)
