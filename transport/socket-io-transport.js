const TransportInterface = require('./transport-interface')
const IO = require('socket.io')

class SocketIoTransport extends TransportInterface {
  constructor(
    authProvider,
    port = 80,
    config = {
      // TODO: load from config file
      path: '/api',
      serveClient: false,
    }
  ) {
    super()

    // socket.io configuration
    //let socketAdminId = null
    const io = new IO(port, config)
    this._io = io

    io.on('connection', socket => {
      // middleware TODO: auth, all actions

      // Resource path parser
      socket.use((packet, next) => {
        const [path, data] = packet
        const pathFragments = path.split('/')

        switch (pathFragments[0]) {
          case 'rpc':
            this.emit('rpc', {
              res: pathFragments.slice(1).join('/'), // removing rpc/ part
              userId: socket.id,
              args: data instanceof Array ? data : [data], // should be an array for arguments
            })
            break
        }

        next()
      })

      // if (socketAdminId === null) {
      //   socketAdminId = socket.id
      //   socket.emit('control/allowed')
      //   console.info(
      //     '[CONNECTION] User connected with control allowed:',
      //     socket.id
      //   )
      // } else {
      //   socket.emit('control/disabled')
      //   console.info(
      //     '[CONNECTION] User connected with control disabled',
      //     socket.id
      //   )
      // }

      // socket.on('disconnect', () => {
      //   console.info('[CONNECTION] User disconnected:', socket.id)
      //   if (Object.keys(io.sockets.connected).length > 0) {
      //     let nextSocketAdmin = Object.values(io.sockets.connected)[0]
      //     socketAdminId = nextSocketAdmin.id
      //     nextSocketAdmin.emit('control/allowed')
      //     console.info(
      //       '[CONTROL] Control transferred to user:',
      //       nextSocketAdmin.id
      //     )
      //   } else socketAdminId = null
      // })

      // socket.on('control/feed', portions => {
      //   if (socketAdminId !== socket.id) {
      //     socket.emit('control/disabled')
      //     return
      //   }

      //   console.info('[CONTROL] Feed manually with portions', portions)
      //   if (!feedingInProcess) {
      //     device
      //       .feedManually(portions)
      //       .then(() => {
      //         feedingInProcess = true
      //         socket.emit('control/feed/accepted')
      //       })
      //       .catch(err => socket.emit('control/feed/failed', err.message))
      //   } else
      //     socket.emit(
      //       'control/feedManually/failed',
      //       'The feeding process is already running'
      //     )
      // })

      // socket.on('control/getSchedule', () => {
      //   console.info('[CONTROL] Get schedule')
      //   device
      //     .getSchedule()
      //     .then(schedule => {
      //       socket.emit('control/getSchedule/accepted', schedule)
      //     })
      //     .catch(err => socket.emit('control/getSchedule/failed', err.message))
      // })

      // device
      //   .getSchedule()
      //   .then(schedule => {
      //     socket.emit('control/getSchedule/accepted', schedule)
      //   })
      //   .catch(err => socket.emit('control/getSchedule/failed', err.message))

      // socket.emit('control/getEvents/accepted', [
      //   /** TODO: list of events */
      // ])
    })
  }

  run() {
    return Promise.resolve()
  }

  event(event, data) {
    this._io.emit(event, data)
  }

  rpcResponse(resource, userId, result) {
    this._io.sockets.connected[userId].emit(
      'rpc/' + resource + '/response',
      result
    )
  }
}

module.exports = SocketIoTransport
