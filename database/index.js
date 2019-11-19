const low = require('lowdb')
const FileAsync = require('lowdb/adapters/FileAsync')
const path = require('path')
const fs = require('fs')

class DataBase {
  static get _currentDbFilePath() {
    function pad(number) {
      return ('0' + number).slice(-2)
    }

    const dateUtcNow = new Date(Date.now())

    return path.resolve(
      __dirname,
      dateUtcNow.getUTCFullYear().toString(),
      pad(dateUtcNow.getUTCMonth()),
      pad(dateUtcNow.getUTCDay()),
      'db.json'
    )
  }

  static async _createPathIfNotExist(filePath) {
    return new Promise((resolve, reject) => {
      fs.access(filePath, fs.constants.F_OK, err => {
        if (!err) return resolve() // exists

        const dirName = path.dirname(filePath)
        fs.mkdir(dirName, { recursive: true }, err => {
          err ? reject(err) : resolve()
        })
      })
    })
  }

  static async _getAdapter() {
    const filePath = DataBase._currentDbFilePath
    await DataBase._createPathIfNotExist(filePath)
    const adapter = new FileAsync(filePath)
    const db = await low(adapter)
    return await db.defaults({ events: [], gallery: [] }).write()
  }

  static async get(collection = 'events') {
    const db = DataBase._getAdapter()
    return await db.get(collection)
  }

  static async push(dbObject, collection = 'events') {
    const db = await DataBase._getAdapter()
    await db
      .get(collection)
      .push(dbObject)
      .write()
  }

  static update() {
    // const adapter = new FileSync(DataBase._currentDbFilePath)
    // const db = low(adapter)
    // db.defaults({ events: [], gallery: [] }).write()
  }
}

module.exports = DataBase
