const PetfeederServer = require('./petfeeder-server')
const mdns = require('mdns')
const Transport = require('./transport')
const Auth = require('./auth')

let mdnsAd = null

// Printing server name and version
const packageConfig = require('./package.json')
console.log(packageConfig.name, packageConfig.version)

// Detecting active environment
const ENV = process.env.NODE_ENV || 'production'
console.log('Environment set:', ENV)

// Device selection
let device = null

if (ENV === 'production') {
  const PetwantDevice = require('petwant-device')
  device = new PetwantDevice()
} else {
  const MockDevice = require('./mock-device')
  device = new MockDevice()
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
  mdnsAd && mdnsAd.stop()

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

// Setup server
const auth = new Auth.MockAuthProvider()
const server = new PetfeederServer(device, [new Transport.SocketIoTransport(auth)])

// Run server
server.run().then(() => {
  const socketIoConfig = require('./transport/socket-io-transport.json')
  // Setup Bonjour
  mdnsAd = mdns.createAdvertisement(mdns.tcp('socket-io'), socketIoConfig.port, {
    name: 'iot-smart-petfeeder',
    txtRecord: {
      ver: '0.0.1',
      path: socketIoConfig.options.path,
    },
  })

  mdnsAd.start()
  console.info(`[${PetfeederServer.utcDate}][SERVER] Bonjour service has started`)
})
