const { MongoClient } = require('mongodb')
const path = require('path')
const { nf, readFile } = require('../utilities/helpers')
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
    const currentPath = DataBase.getPathByTimestamp(Date.now())
    await DataBase._createPathIfNotExist(currentPath)
    return currentPath
  }

  static getPathByTimestamp(timestamp) {
    const dateUtc = new Date(timestamp)
    const currentPath = path.resolve(
      __dirname,
      DataBase.DATA_DIR_NAME,
      dateUtc.getUTCFullYear().toString(),
      nf(dateUtc.getUTCMonth() + 1),
      nf(dateUtc.getUTCDate())
    )

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

  static pushGallery(fileTimestamp) {
    return new Promise((resolve, reject) => {
      db.collection(DataBase.COLLECTION_GALLERY).insertOne(
        {
          _id: fileTimestamp || Date.now(), // timestamp UTC
          _v: DataBase.schemaVersion,
          state: 0, // 0 - we just started recording file, 1 - converted, 2 - thumbnails done
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
      const utcTime = Date.UTC(year, month - 1, date)
      const fromTimestamp = utcTime
      const toTimestamp = utcTime + 24 * 3600000 // + 24hrs in milliseconds
      db.collection(DataBase.COLLECTION_EVENTS)
        .find({ _id: { $gte: fromTimestamp, $lt: toTimestamp } }) // (_id >= fromTimestamp && _id < toTimestamp)
        .toArray((err, docs) => {
          if (err) return reject(err)
          const events = docs.map(value => {
            return {
              id: value._id,
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
      const utcTime = Date.UTC(year, month - 1, date)
      const fromTimestamp = utcTime
      const toTimestamp = utcTime + 24 * 3600000 // + 24hrs in milliseconds
      db.collection(DataBase.COLLECTION_GALLERY)
        .find({ _id: { $gte: fromTimestamp, $lt: toTimestamp } }) // (_id >= fromTimestamp && _id < toTimestamp)
        .toArray((err, docs) => {
          if (err) return reject(err)
          const events = docs.map(value => {
            return {
              id: value._id,
              state: value.state,
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
            const year = docDate.getUTCFullYear()
            const month = docDate.getUTCMonth() + 1
            const date = docDate.getUTCDate()
            if (!eventDates[year]) {
              eventDates[year] = {}
              eventDates[year][month] = {}
            }

            if (!eventDates[year][month]) {
              eventDates[year][month] = {}
              eventDates[year][month][date] = {}
            }

            if (!eventDates[year][month][date]) eventDates[year][month][date] = 1
            else eventDates[year][month][date]++
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
            const year = docDate.getUTCFullYear()
            const month = docDate.getUTCMonth() + 1
            const date = docDate.getUTCDate()
            if (!galleryDates[year]) {
              galleryDates[year] = {}
              galleryDates[year][month] = {}
            }

            if (!galleryDates[year][month]) {
              galleryDates[year][month] = {}
              galleryDates[year][month][date] = {}
            }

            if (!galleryDates[year][month][date]) galleryDates[year][month][date] = 1
            else galleryDates[year][month][date]++
          }

          resolve(galleryDates)
        })
    })
  }

  static async getVideoThumbs(id) {
    return new Promise((resolve, reject) => {
      db.collection(DataBase.COLLECTION_GALLERY).findOne({ _id: id }, (err, video) => {
        if (err) return reject(err)
        if (!video) return reject(new Error('Video with provided ID does not exist'))
        if (video.state !== 2) return reject(new Error('Thumbnails not ready, please repeat request later'))

        const dirPath = DataBase.getPathByTimestamp(video._id)
        fs.readdir(dirPath, async (err, files) => {
          if (err) return reject(err)

          const regexp = new RegExp(`thumb-${video._id}-\\d+\\.png`)
          const thumbFileNames = files.filter(fileName => regexp.test(fileName))
          if (thumbFileNames.length === 0) return reject(new Error('No thumbnail files found'))

          // read files TODO: huge response size here
          // I don't care much about particular order of files here
          const fileContents = []
          for (const fileName of thumbFileNames) {
            const filePath = path.resolve(dirPath, fileName)
            const fileContent = await readFile(filePath)
            fileContents.push(fileContent)
          }

          resolve(fileContents)
        })
      })
    })
  }
}

module.exports = DataBase
