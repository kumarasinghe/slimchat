const fs = require('fs');
const http = require('http');
const url = require('url');
const crypto = require('crypto');

const DATA_DIR = require('path').dirname(require.main.filename) + '/slimchat';
const USER_DIR = `${DATA_DIR}/users`
const ROOM_DIR = `${DATA_DIR}/rooms`
const CHAT_LOG_DIR = `${DATA_DIR}/chatlogs`
const PORT = 8080;

class SlimChat {

    constructor() {

        // create directory structure
        fs.existsSync(DATA_DIR) || fs.mkdirSync(DATA_DIR)
        fs.existsSync(USER_DIR) || fs.mkdirSync(USER_DIR)
        fs.existsSync(ROOM_DIR) || fs.mkdirSync(ROOM_DIR)
        fs.existsSync(CHAT_LOG_DIR) || fs.mkdirSync(CHAT_LOG_DIR)

        this.onlineUsers = {}

        // start chat server
        this.httpServer = http.createServer(this.requestHandler.bind(this))
        this.httpServer.listen(PORT, '0.0.0.0')

    }


    requestHandler(req, res) {

        // allow CORS origin
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Request-Method', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET')
        res.setHeader('Access-Control-Allow-Headers', '*')

        // parse url params
        let query = url.parse(req.url, true).query

        // send message request
        if (
            query.type == 'send' &&
            query.sender != undefined &&
            query.room != undefined &&
            query.data != undefined
        ) {
            this._sendMessage(query.sender, query.room, query.data, res)
        }
        // receive message request
        else if (
            query.type == 'receive' &&
            query.receiver != undefined &&
            query.room != undefined
        ) {
            this._receiveMessage(query.receiver, query.room, res)
        }
        // history request
        else if (
            query.type == 'history' &&
            query.receiver != undefined &&
            query.room != undefined
        ) {
            this._getChatHistory(query.receiver, query.room, res)
        }
        // room stat request
        else if (
            query.type == 'stats' &&
            query.receiver != undefined &&
            query.room != undefined
        ) {
            this._getRoomStats(query.receiver, query.room, res)
        }
        // lock or unlock a room with 2 users
        else if (
            query.type == 'roomlock' &&
            query.userID != undefined &&
            query.room != undefined &&
            query.lock != undefined
        ) {
            this._setRoomLock(query.receiver, query.room, query.lock, res)
        }
        // invalid request
        else {
            res.statusCode = 406
            res.end('invalid request')
        }

    }


    _sendMessage(senderID, roomID, data, res) {

        let roomData

        // check if room exists and user has joined tan unblocked room.
        if (
            (roomData = this.isUserInRoom(senderID, roomID)) == false ||
            roomData.locked
        ) {
            console.error('ERROR: Refusing send message!')
            res.statusCode = 406
            res.end('unauthorized')
            return
        }

        // write message to chat room log
        let logRecord = {
            datetime: Date.now(),
            sender: senderID,
            message: data
        }

        fs.appendFile(
            `${CHAT_LOG_DIR}/${roomID}`,
            JSON.stringify(logRecord) + '\n',
            (err) => {
                if (err) {
                    console.error(`Failed writing to chat room ${roomID}:\n${err.message}`)
                    res.statusCode = 500
                    res.end('Unknown error occured.')
                    return
                }
            }
        )

        // send message to all online room users

        let message = {
            type: 'message',
            room: roomID,
            data: logRecord
        }

        for (let userID in roomData.users) {

            let onlineUser = this.onlineUsers[userID]

            // if user is online and user is not the sender
            if (onlineUser && userID != senderID) {

                // if user is waiting for a new message
                if (onlineUser.send) {
                    console.log(`${senderID} => ${userID} : ${message.data.message}`)
                    // reply via send handler
                    onlineUser.send(JSON.stringify(message))
                }
                // if user is busy and not waiting for a message
                else {
                    console.log(`${senderID} => ${userID}[busy] : ${message.data.message}`)
                    // queue the message
                    onlineUser.messageQueue.push(message)
                }

            }

        }

        res.end()

    }


    _receiveMessage(receiverID, roomID, res) {

        let roomData

        // check if room exists and user has joined the unblocked room.
        if (
            (roomData = this.isUserInRoom(receiverID, roomID)) == false ||
            roomData.locked
        ) {
            console.error('ERROR: Refusing to receive messages!')
            res.statusCode = 406
            res.end('Unauthorized request.')
            return
        }

        let user = this.onlineUsers[receiverID]

        // add user to online pool if not exists
        if (!user) {
            user = this.onlineUsers[receiverID] = {
                send: undefined,
                messageQueue: []
            }
            console.log(`${receiverID} came online`)
        }

        // handle disconnections
        res.on('close', () => {

            // unexpected connction termination
            if (!res.success) {
                delete this.onlineUsers[receiverID]
                console.log(`${receiverID} went offline`)

                // store last seen
                let userDataFile = `${USER_DIR}/${receiverID}`
                let userData = this.readJSON(userDataFile)
                userData.lastSeen = Date.now()
                this.writeJSON(userDataFile, userData)

            }

        })

        // queued messages exists
        if (user.messageQueue.length) {

            res.success = true
            res.end(JSON.stringify({
                type: 'queue',
                data: user.messageQueue
            }))
            user.messageQueue = []

        }
        // no queued messages
        else {

            // attach a handler to respond the request when eligible
            user.send = (data) => {
                res.success = true
                res.end(data)
                // remove current send handler to prevent reuse of res object
                user.send = undefined
            }

        }

    }


    _getChatHistory(receiverID, roomID, res) {

        let roomData

        // check if  room exists and user has joined the room.
        if ((roomData = this.isUserInRoom(userID, roomID)) == false) {
            console.log(`Refusing to get history! User ${receiverID} or room ${roomID} does not exist or they are not joined.`)
            res.statusCode = 406
            res.end('Unauthorized request.')
            return
        }

        // send chat room log
        let roomLog = this.readJSON(`${CHAT_LOG_DIR}/${roomID}`)

        if (roomLog) {
            res.end(roomLog)
        }
        else {
            res.end()
        }

    }


    _getRoomStats(receiverID, roomID, res) {

        let roomData

        // check if  room exists and user has joined the room.
        if (
            (roomData = this.isUserInRoom(userID, roomID)) == false ||
            roomData.locked
        ) {
            console.error('ERROR: Refusing to get room stats!')
            res.statusCode = 406
            res.end('unauthorized')
            return
        }

        // prepare stats
        let lastSeen = {}

        // prepare user data
        for (let userID in roomData.users) {

            // skip self stats
            if (userID == receiverID) { break }

            // if user is online
            if (this.onlineUsers[userID]) {
                lastSeen[userID] = 'now'
            }
            // if user is offline
            else {

                let userDataFile = `${USER_DIR}/${userID}`
                if (fs.existsSync(userDataFile)) {
                    let userData = this.readJSON(userDataFile)
                    lastSeen[userID] = userData.lastSeen
                }

            }
        }

        res.end(JSON.parse(lastSeen))

    }


    _setRoomLock(userID, roomID, lock, res) {

        // check if room exists and user has joined the room.
        if ((roomData = this.isUserInRoom(userID, roomID)) == false) {
            console.log('Refusing to lock room!')
            res.statusCode = 406
            res.end('Unauthorized request.')
            return
        }

        // reject locking/unlocking group chats
        if (Object.keys(roomData.users).length > 2) {
            res.statusCode = 406
            res.end('cannot block a group chatroom')
            return
        }

        // requesting to lock room
        if (lock) {
            roomData.locked = userID
            this.writeJSON(`${ROOM_DIR}/${roomID}`, roomData)
            res.end()
        }
        // requesting to unlock room by the user who locked it
        else if (roomData.locked == userID) {
            roomData.locked = undefined
            this.writeJSON(`${ROOM_DIR}/${roomID}`, roomData)
            res.end()
        }
        // unlock request by the other member
        else {
            res.statusCode = 406
            res.end('unauthorized')
        }


    }


    createUser(userID) {

        let userDataFile = `${USER_DIR}/${userID}`

        if (fs.existsSync(userDataFile)) {
            throw new Error(`User already exists`)
        }

        let userData = {
            rooms: {},
            lastSeen: Date.now()
        }

        fs.writeFileSync(
            userDataFile,
            JSON.stringify(userData)
        )

    }


    createRoom() {

        let roomID

        do {
            roomID = crypto.randomBytes(24).toString('base64').replace(/\W/g, '')
        } while (fs.existsSync(`${ROOM_DIR}/${roomID}`))

        // validate room id
        if (fs.existsSync(`${ROOM_DIR}/${roomID}`)) {
            throw new Error('Room already exists')
        }

        // create room metadata file
        let roomData = {
            users: {}
        }

        fs.writeFileSync(
            `${ROOM_DIR}/${roomID}`, JSON.stringify(roomData)
        )

        return roomID

    }


    addUserToRoom(userID, roomID) {

        // if user has already joined the room
        if (this.isUserInRoom(userID, roomID)) {
            throw new Error('User already in room')
        }

        let roomData = this.readJSON(`${ROOM_DIR}/${roomID}`)

        if (roomData.blocked) {
            throw new Error('Room is blocked')
        }
        else {
            // add user to room
            roomData.users[userID] = true
            this.writeJSON(`${ROOM_DIR}/${roomID}`, roomData)

            // add room to user
            let userDataFile = `${USER_DIR}/${userID}`
            let userData = this.readJSON(userDataFile)
            userData.rooms[roomID] = true
            this.writeJSON(userDataFile, userData)
        }

    }


    removeUserFromRoom(userID, roomID) {

        let roomData

        // if user has not joined the room
        if ((roomData = isUserInRoom(userID, roomID)) == false) {
            throw new Error(`Couldn't remove user ${userID} from room ${roomID}. Either they don't exist or haven't joined.`)
        }

        // remove room from user
        let userDataFile = `${USER_DIR}/${userID}`
        let userData = this.readJSON(userDataFile)
        delete userData.rooms[roomID]
        this.writeJSON(userDataFile, userData)

        // remove user from room
        delete roomData.users[userID]
        this.writeJSON(`${ROOM_DIR}/${roomID}`, roomData)

        // delete room if orphan
        if (Object.keys(roomData.users).length == 0) {
            fs.rmdirSync(`${ROOM_DIR}/${roomID}`, { recursive: true })
            let roomLog = `${CHAT_LOG_DIR}/${roomID}`
            fs.existsSync(roomLog) && fs.rmdirSync(roomLog, { recursive: true })
        }

    }

    /*************************** UTILITY FUNCTIONS ****************************/

    isUserInRoom(userID, roomID) {

        let roomData = this.readJSON(`${ROOM_DIR}/${roomID}`)

        if (roomData == undefined || roomData.users[userID] != true) {
            return false
        }
        else {
            return roomData
        }

    }


    readJSON(filename) {
        if (fs.existsSync(filename) == false) {
            return undefined
        }
        else {
            return JSON.parse(fs.readFileSync(filename), { encoding: 'utf8' })
        }
    }


    writeJSON(filename, object) {
        fs.writeFileSync(filename, JSON.stringify(object))
    }


}


module.exports = new SlimChat()