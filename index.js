const { resolve } = require('path')
const history = require('connect-history-api-fallback')
const express = require('express')
const PetfeederServer = require('./petfeeder-server')
const mdns = require('mdns')
const Transport = require('./transport')
const Auth = require('./auth')

const { PORT = 80, NODE_ENV = 'production' } = process.env // port - for express app
let app = null // express app for UI starts after main server

// MDNS (Bonjour)
let mdnsAd = null

// Printing server name and version
const packageConfig = require('./package.json')
console.log(packageConfig.name, packageConfig.version)

// Printing active environment
console.log('Environment set:', NODE_ENV)

// Device selection
let device = null

if (NODE_ENV === 'production') {
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
const server = new PetfeederServer(device, auth, [new Transport.SocketIoTransport()])

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

  // express app for UI
  app = express()

  // UI dir
  const publicPath = resolve(__dirname, './web')
  const staticConf = { maxAge: '1y', etag: false }

  const staticMiddleware = express.static(publicPath, staticConf)
  app.use(staticMiddleware)
  app.use('/', history()) // middleware for browser`s history mode
  app.use(staticMiddleware)

  // Starting express server for UI
  app.listen(PORT, () => console.info(`[${PetfeederServer.utcDate}][SERVER] UI app is running on port ${PORT}`))
})

// let it crash here with error messages if something has not started properly
