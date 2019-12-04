const low = require('lowdb')
const FileAsync = require('lowdb/adapters/FileAsync')
const path = require('path')
const fs = require('fs')
const { nf } = require('../utilities/helpers')

class DataBase {
  static get DATA_DIR_NAME() {
    return 'data'
  }

  static get DATA_FILE_NAME() {
    return 'db.json'
  }

  static get COLLECTION_EVENTS() {
    return 'events'
  }

  static get COLLECTION_GALLERY() {
    return 'gallery'
  }

  static get currentDbDir() {
    const dateUtc = new Date(Date.now())
    return path.resolve(
      __dirname,
      DataBase.DATA_DIR_NAME,
      dateUtc.getUTCFullYear().toString(),
      nf(dateUtc.getUTCMonth() + 1),
      nf(dateUtc.getUTCDate())
    )
  }

  static _getCurrentDbFilePath(dateUtc = new Date(Date.now())) {
    if (!(dateUtc instanceof Date) || isNaN(dateUtc.getTime())) throw new Error('Invalid date')
    return path.resolve(
      __dirname,
      DataBase.DATA_DIR_NAME,
      dateUtc.getUTCFullYear().toString(),
      nf(dateUtc.getUTCMonth() + 1),
      nf(dateUtc.getUTCDate()),
      DataBase.DATA_FILE_NAME
    )
  }

  static _createPathIfNotExist(filePath) {
    return new Promise((resolve, reject) => {
      // recursive option for mkdir was introduced in node v10.12
      // so we have to have workaround for other versions
      const dirPath = path.dirname(filePath)
      const mkdirp = dir =>
        path
          .resolve(dir)
          .split(path.sep)
          .reduce((acc, cur) => {
            const currentPath = path.normalize(acc + path.sep + cur)
            try {
              fs.statSync(currentPath)
            } catch (e) {
              if (e.code === 'ENOENT') {
                fs.mkdirSync(currentPath)
              } else return reject(e)
            }

            return currentPath
          }, '')

      fs.access(filePath, fs.constants.F_OK, err => {
        if (!err) return resolve() // file exists
        mkdirp(dirPath)
        resolve()
      })
    })
  }

  static async _getAdapterByDate(utcDate = new Date(Date.now())) {
    const filePath = DataBase._getCurrentDbFilePath(utcDate)
    await DataBase._createPathIfNotExist(filePath)
    const adapter = new FileAsync(filePath)
    const db = await low(adapter)
    await db.defaults({ events: [], gallery: [] }).write()
    return db
  }

  static async _getAdapterByPath(filePath) {
    await DataBase._createPathIfNotExist(filePath)
    const adapter = new FileAsync(filePath)
    const db = await low(adapter)
    await db.defaults({ events: [], gallery: [] }).write()
    return db
  }

  static async get(collection = 'events', utcDate = new Date(Date.now())) {
    const db = await DataBase._getAdapterByDate(utcDate)
    const result = await db.get(collection).value()
    return result
  }

  static async push(dbObject, collection = 'events') {
    const db = await DataBase._getAdapterByDate()
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

  static async pushGallery(fileName) {
    await DataBase.push(
      {
        timestamp: Date.now(), // timestamp UTC
        fileName,
      },
      DataBase.COLLECTION_GALLERY
    )
  }

  static async getEvents(year, month, date) {
    const utcDate = new Date(Date.UTC(year, month - 1, date))
    const events = await DataBase.get(DataBase.COLLECTION_EVENTS, utcDate)
    return events
  }

  // TODO: need some caching mechanism
  static async getAllDates() {
    // reading "./data" directory recursive and getting dates object from dir names
    const getDatePart = async (rootPath, level = 1) => {
      if (level > 3) return {} // should be less than 3 levels: year, month, date folders
      const files = fs.readdirSync(rootPath)
      let objToSet = {}
      for (const file of files) {
        const filePath = path.resolve(rootPath, file)
        const stats = fs.statSync(filePath)
        if (stats.isDirectory()) {
          const numberPart = parseInt(file) // year, month or date
          objToSet[numberPart] = await getDatePart(filePath, level + 1)

          if (level === 3) {
            const dbPath = path.resolve(filePath, DataBase.DATA_FILE_NAME)
            const db = await DataBase._getAdapterByPath(dbPath)
            const dbState = await db.getState()

            // counters
            objToSet[numberPart] = {
              events: dbState.events.length,
              gallery: dbState.gallery.length,
            }
          }
        }
      }

      return objToSet
    }

    const rootDataPath = path.resolve(__dirname, DataBase.DATA_DIR_NAME) // "./data" dir path
    const dates = await getDatePart(rootDataPath)
    return dates
  }
}

module.exports = DataBase
