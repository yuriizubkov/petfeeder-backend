const { MongoClient } = require('mongodb')
const path = require('path')
const { nf } = require('../utilities/helpers')
const fs = require('fs')

// Connection URL TODO: move to configuration
const url = 'mongodb://localhost:27017/petfeeder'
let db = null

MongoClient.connect(url, async function(err, database) {
  if (err) {
    console.error(err)
    return
  }

  db = database
})

class DataBase {
  /** If I need to change something later in DB schema,
   * I can write converters for migrating from old schema to new one
   */
  static get schemaVersion() {
    return 1
  }

  static get DATA_DIR_NAME() {
    return 'data'
  }

  static get COLLECTION_EVENTS() {
    return 'events'
  }

  static get COLLECTION_GALLERY() {
    return 'gallery'
  }

  static async getOrCreateCurrentPath() {
    const dateUtc = new Date(Date.now())
    const currentPath = path.resolve(
      __dirname,
      DataBase.DATA_DIR_NAME,
      dateUtc.getUTCFullYear().toString(),
      nf(dateUtc.getUTCMonth() + 1),
      nf(dateUtc.getUTCDate())
    )

    await DataBase._createPathIfNotExist(currentPath)
    return currentPath
  }

  static _createPathIfNotExist(dirPath) {
    return new Promise((resolve, reject) => {
      // recursive option for mkdir was introduced in node v10.12
      // so we have to have workaround for other versions
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

      fs.access(dirPath, fs.constants.F_OK, err => {
        if (!err) return resolve() // path exists
        mkdirp(dirPath)
        resolve()
      })
    })
  }

  static pushEvent(type, data) {
    return new Promise((resolve, reject) => {
      db.collection(DataBase.COLLECTION_EVENTS).insertOne(
        {
          _id: Date.now(), // timestamp UTC
          _v: DataBase.schemaVersion,
          type,
          data,
        },
        (err, r) => {
          if (err) return reject(err)
          if (r.insertedCount === 1) return resolve()
          reject(`Error inserting to ${DataBase.COLLECTION_EVENTS}. Inserted count not equal 1`)
        }
      )
    })
  }

  static pushGallery(fileName) {
    return new Promise((resolve, reject) => {
      db.collection(DataBase.COLLECTION_GALLERY).insertOne(
        {
          _id: Date.now(), // timestamp UTC
          _v: DataBase.schemaVersion,
          state: 0, // 0 - just started recording file, 1 - converted
          fileName,
        },
        (err, r) => {
          if (err) return reject(err)
          if (r.insertedCount === 1) return resolve()
          reject(`Error inserting to ${DataBase.COLLECTION_GALLERY}. Inserted count not equal 1`)
        }
      )
    })
  }

  static updateGallery(filter, set) {
    return new Promise((resolve, reject) => {
      db.collection(DataBase.COLLECTION_GALLERY).findOneAndUpdate(filter, { $set: set }, (err, r) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }

  static getEvents(year, month, date) {
    return new Promise((resolve, reject) => {
      const utcDate = new Date(Date.UTC(year, month - 1, date))
      const fromTimestamp = utcDate.getTime()
      const toTimestamp = utcDate.getTime() + 24 * 3600000 // + 24hrs in milliseconds
      db.collection(DataBase.COLLECTION_EVENTS)
        .find({ _id: { $gte: fromTimestamp, $lt: toTimestamp } }) // (_id >= fromTimestamp && _id < toTimestamp)
        .toArray((err, docs) => {
          if (err) return reject(err)
          const events = docs.map(value => {
            return {
              timestamp: value._id,
              type: value.type,
              data: value.data,
            }
          })

          resolve(events)
        })
    })
  }

  static getGallery(year, month, date) {
    return new Promise((resolve, reject) => {
      const utcDate = new Date(Date.UTC(year, month - 1, date))
      const fromTimestamp = utcDate.getTime()
      const toTimestamp = utcDate.getTime() + 24 * 3600000 // + 24hrs in milliseconds
      db.collection(DataBase.COLLECTION_GALLERY)
        .find({ _id: { $gte: fromTimestamp, $lt: toTimestamp } }) // (_id >= fromTimestamp && _id < toTimestamp)
        .toArray((err, docs) => {
          if (err) return reject(err)
          const events = docs.map(value => {
            return {
              timestamp: value._id,
              fileName: value.fileName,
            }
          })

          resolve(events)
        })
    })
  }

  static getEventDates() {
    return new Promise((resolve, reject) => {
      const eventDates = {}
      db.collection(DataBase.COLLECTION_EVENTS)
        .find({}, ['_id'])
        .toArray((err, docs) => {
          if (err) return reject(err)
          for (const doc of docs) {
            const docDate = new Date(doc._id) // UTC date from timestamp
            const year = docDate.getFullYear()
            const month = docDate.getMonth() + 1
            const date = docDate.getDate()
            if (!eventDates[year]) {
              eventDates[year] = {}
              eventDates[year][month] = {}
            }

            if (!eventDates[year][month]) {
              eventDates[year][month] = {}
              eventDates[year][month][date] = {}
            }

            if (!eventDates[year][month][date] || Object.keys(eventDates[year][month][date]).length === 0)
              eventDates[year][month][date] = { events: 1 }
            else eventDates[year][month][date].events++
          }

          resolve(eventDates)
        })
    })
  }

  static getGalleryDates() {
    return new Promise((resolve, reject) => {
      const galleryDates = {}
      db.collection(DataBase.COLLECTION_GALLERY)
        .find({}, ['_id'])
        .toArray((err, docs) => {
          if (err) return reject(err)
          for (const doc of docs) {
            const docDate = new Date(doc._id) // UTC date from timestamp
            const year = docDate.getFullYear()
            const month = docDate.getMonth() + 1
            const date = docDate.getDate()
            if (!galleryDates[year]) {
              galleryDates[year] = {}
              galleryDates[year][month] = {}
            }

            if (!galleryDates[year][month]) {
              galleryDates[year][month] = {}
              galleryDates[year][month][date] = {}
            }

            if (!galleryDates[year][month][date] || Object.keys(galleryDates[year][month][date]).length === 0)
              galleryDates[year][month][date] = { gallery: 1 }
            else galleryDates[year][month][date].gallery++
          }

          resolve(galleryDates)
        })
    })
  }
}

module.exports = DataBase
