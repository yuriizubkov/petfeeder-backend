const { resolve } = require('path')
const history = require('connect-history-api-fallback')
const express = require('express')
const PetfeederServer = require('./petfeeder-server')
const serverConfig = require('./petfeeder-server.json')
const mdns = require('mdns')
const Transport = require('./transport')
const Auth = require('./auth')
const { utcDateString } = require('./utilities/helpers')

const { PORT = 80, NODE_ENV = 'production' } = process.env // Port - for express app
let app = null // Express app for UI starts after main server start

// MDNS (Bonjour)
let mdnsAd = null

// Printing server name and version
const packageConfig = require('./package.json')
console.info(packageConfig.name, packageConfig.version)

// Printing active environment
console.info('Environment set:', NODE_ENV)

// Device selection
let device = null

if (NODE_ENV === 'production') {
  const PetwantDevice = require('petwant-device')
  const cfg = serverConfig.device
  device = new PetwantDevice(
    cfg.uartPortName,
    cfg.powerLedGPIOPin,
    cfg.linkLedGPIOPin,
    cfg.buttonGPIOPin,
    cfg.maxTimeDriftSeconds
  )
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
  } catch (err) {} // We don`t care about errors here, we just need to exit this app ASAP :)

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
const server = new PetfeederServer(device, auth, [new Transport.SocketIoTransport()])

// Run server
server.run().then(() => {
  const socketIoConfig = require('./transport/socket-io-transport.json')
  // Setup Bonjour
  mdnsAd = mdns.createAdvertisement(mdns.tcp('socket-io'), socketIoConfig.port, {
    name: 'iot-smart-petfeeder',
    txtRecord: {
      ver: packageConfig.version,
      path: socketIoConfig.options.path,
    },
  })

  mdnsAd.start()
  console.info(`[${utcDateString()}][SERVER] Bonjour service has started`)

  // Express app for UI
  app = express()

  // UI dir
  const publicPath = resolve(__dirname, './web')
  const staticConf = { maxAge: '1y', etag: false }

  const staticMiddleware = express.static(publicPath, staticConf)
  app.use(staticMiddleware)
  app.use('/', history()) // Middleware for browser`s history mode
  app.use(staticMiddleware)

  // Starting Express server for UI
  app.listen(PORT, () => console.info(`[${utcDateString()}][SERVER] UI app is running on port ${PORT}`))
})

// Let it crash here with error messages if something has not started properly
