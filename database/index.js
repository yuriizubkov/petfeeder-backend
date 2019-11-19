const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const path = require('path')

class DataBase {
  static get _currentDbFilePath() {
    function pad(number) {
      return ('0' + number).slice(-2)
    }

    const dateUtcNow = new Date(Date.now())
    return path.join([
      __dirname,
      pad(dateUtcNow.getUTCFullYear()),
      pad(dateUtcNow.getUTCMonth()),
      pad(dateUtcNow.getUTCDay()),
      'db.json',
    ])
  }

  static get(collection = 'events') {
    return new Promise(resolve => {
      const adapter = new FileSync(DataBase._currentDbFilePath)
      const db = low(adapter)
      db.defaults({ events: [] }).write()

      const events = db.get(collection)
      resolve(events)
    })
  }

  static push(dbObject, collection = 'events') {
    return new Promise(resolve => {
      const adapter = new FileSync(DataBase._currentDbFilePath)
      const db = low(adapter)
      db.defaults({ events: [] }).write()

      db.get(collection)
        .push(dbObject)
        .write()

      resolve()
    })
  }

  static update() {
    // const adapter = new FileSync(DataBase._currentDbFilePath)
    // const db = low(adapter)
    // db.defaults({ events: [] }).write()
  }
}

module.exports = DataBase
