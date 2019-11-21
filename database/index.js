const low = require('lowdb')
const FileAsync = require('lowdb/adapters/FileAsync')
const path = require('path')
const fs = require('fs')

class DataBase {
  static _getCurrentDbFilePath(dateUtc = new Date(Date.now())) {
    function pad(number) {
      return ('0' + number).slice(-2)
    }

    return path.resolve(
      __dirname,
      'data',
      dateUtc.getUTCFullYear().toString(),
      pad(dateUtc.getUTCMonth() + 1),
      pad(dateUtc.getUTCDate()),
      'db.json'
    )
  }

  static async _createPathIfNotExist(filePath) {
    return new Promise((resolve, reject) => {
      // recursive option for mkdir was introduced in node v10.12
      // so we have to have workaround for later versions
      // https://stackoverflow.com/questions/28498296/enoent-no-such-file-or-directory-on-fs-mkdirsync
      // https://stackoverflow.com/questions/6656324/check-for-current-node-version
      // https://gist.github.com/bpedro/742162

      const splittedVersion = process.versions.node.split('.')
      const NODE_MAJOR_VERSION = splittedVersion[0]
      const NODE_MINOR_VERSION = splittedVersion[1]

      const dirPath = path.dirname(filePath)

      if (NODE_MAJOR_VERSION >= 10 && NODE_MINOR_VERSION >= 12) {
        fs.access(filePath, fs.constants.F_OK, err => {
          if (!err) return resolve() // file exists
          fs.mkdir(dirPath, { recursive: true }, err => {
            err ? reject(err) : resolve()
          })
        })
      } else {
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
                } else {
                  throw e
                }
              }
              return currentPath
            }, '')

        fs.access(filePath, fs.constants.F_OK, err => {
          if (!err) return resolve() // file exists
          mkdirp(dirPath)
          resolve()
        })
      }
    })
  }

  static async _getAdapter(utcDate = new Date(Date.now())) {
    const filePath = DataBase._getCurrentDbFilePath(utcDate)
    await DataBase._createPathIfNotExist(filePath)
    const adapter = new FileAsync(filePath)
    const db = await low(adapter)
    await db.defaults({ events: [], gallery: [] }).write()
    return db
  }

  static async get(collection = 'events', utcDate = new Date(Date.now())) {
    const db = await DataBase._getAdapter(utcDate)
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

  static async getEvents(year, month, date) {
    const utcDate = new Date(Date.UTC(year, month - 1, date))
    const events = await DataBase.get('events', utcDate)
    return events
  }
}

module.exports = DataBase
