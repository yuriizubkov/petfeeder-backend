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
      'data',
      dateUtcNow.getUTCFullYear().toString(),
      pad(dateUtcNow.getUTCMonth() + 1),
      pad(dateUtcNow.getUTCDate()),
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
    await db.defaults({ events: [], gallery: [] }).write()
    return db
  }

  static async get(collection = 'events') {
    const db = await DataBase._getAdapter()
    const result = await db.get(collection).value()
    return result
  }

  static async push(dbObject, collection = 'events') {
    const db = await DataBase._getAdapter()
    await db
      .get(collection)
      .push(dbObject)
      .write()
  }

  static async pushEvent(type, data) {
    await DataBase.push({
      timestamp: Date.now(), // timestamp UTC
      type,
      data,
    })
  }
}

module.exports = DataBase
