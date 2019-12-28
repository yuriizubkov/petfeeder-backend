# petfeeder-backend

This is server part of alternative software for DIY pet feeder, based on modified smart pet feeder _Petwant PF-103_.
Please check this links for more information:

https://github.com/yuriizubkov/petwant-device - npm module for communication with _Petwant PF-103_ microcontroller board. <br/>
https://github.com/yuriizubkov/petwant-device/wiki - useful information about modifying your _Petwant PF-103_.<br/>
https://github.com/yuriizubkov/petfeeder-web-vue - Web UI app.

## Disclaimer

Here is no security measures whatsoever (no traffic encryption, authentication and authorization), use it on your own risk.
_Consider this version 1.0.0 as proof-of-concept or as a beta version._

## Main features

- Ability to have different types of "transports" (web sockets, bluetooth, etc) for communication with client apps. Just one implemented right now over [socket.io](https://socket.io/) and [JSON-RPC 2.0](https://www.jsonrpc.org/specification)
- Service announcement over Bonjour. For later use in mobile app.
- Can run reliable with PM2 process manager.
- Automatically synchronizes the _Petwant PF-103_ clock.
- Records videos to the gallery when automatic feeding has started.
- Has user-friendly events for the client apps and more detailed logs on the server.
- Ability to send realtime notifications to all users over all transports or to one particular user.
- Videos and events database.
- Stream live video h264 feed from the camera without re-encoding.
- Can get and edit schedule from the _Petwant PF-103_. All device-relevant events will apear in database as well.

## How to install

We assume that you have already installed [Raspbian Lite OS](https://www.raspberrypi.org/downloads/raspbian/) on your Raspberry Pi. And you have WiFi and internet connection on it with node js installed.

#### 1. Clone this repository on your Raspberry Pi, that connected to your Petwant PF-103 board (Please check this link how to get it working: [Wiki](https://github.com/yuriizubkov/petwant-device/wiki))

```
git clone https://github.com/yuriizubkov/petfeeder-backend.git
```

#### 2. Install dependencies

```
cd petfeeder-backend
npm install
```

#### 3. Allow node js to open 80 port for Web UI app

```
sudo apt-get install libcap2-bin
sudo setcap cap_net_bind_service=+ep `readlink -f \`which node\``
```

[Source of this solution](https://stackoverflow.com/questions/16573668/best-practices-when-running-node-js-with-port-80-ubuntu-linode)

#### 4. Install ffmpeg (for video thumbnails generation)

```
sudo apt-get install ffmpeg
```

#### 5. Instal PM2 process manager

```
npm install pm2 -g
```

#### 6. Install Mongo DB

```
sudo apt-get install mongodb
sudo service mongodb start
```

#### 7. Setup PM2 to run server app

```
cd petfeeder-backend
pm2 start index.js

# Freeze your process list across server restart
pm2 save

# Generate Startup Script
pm2 startup

# Logs
pm2 logs 0 --lines 150
```

[PM2 documentation](https://www.npmjs.com/package/pm2)

Server should be up and running at this point. It should light up the power indicator "Power LED" on your pet feeder.

## Server configuration

Can be found on _petfeeder-server.json_

## Some words about server logic

- Server lights up the power indicator "Power LED" on startup and switching it off on process exit or crash.
- When camera is in use - power indicator will blink to indicate camera activity.
- Server will record 30 sec videos on scheduled feeding. It will convert raw h264 file to mp4 file in background then (for later downloads) and generate 4 thumbnail png files for displaying them as animated preview on client apps. File has 4 states in database: -1 marked for deletion, 0 - recording has started, 1 - converted, 2 - thumbnails ready. Server will delete all this files (h264, mp4, 4 x pngs) on gallery entry deletion from the database.
- Server can stream (to multiple users simultaneously) and record at the same time (that is why we need raw stream without re-encoding, to get good performance on Raspberry Pi)
- "Link LED" on the front panel of the Petwant PF-103 is reserved for indication of link with some internet service. Not in use now, not implemented yet.

## Known issues

- Different users has ability to edit schedule at the same time. So keep that in mind. That will be fixed in next version.
- Video streaming has a bug, second connected user can't get video stream. How to reproduce this bug:</br>
  Open 2 browser windows</br>
  Start video on 1st window - got video stream</br>
  Start video on 2nd window - no video stream</br>
  Stop video on 2nd window</br>
  Stop video on 1st window</br>
  Start video on 2nd window - got video stream</br>
  Start video on 1st window - got video stream</br>
- If server starts recording when user watching stream from the camera - recorded video file is corrupted, without NAL headers (same issue with piped streams as issue above)
- _rpio_ module sometimes throwing an error on startup. Just restart server again (PM2 will do it for you).

So yes, still have plenty of work here. I will fix that in next versions. Feel free to open issue if you find something else.

Have fun hacking and happy hollydays! (2019.12.28)
