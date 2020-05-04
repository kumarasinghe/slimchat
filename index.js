const express =  require('express')
const app = express()
const slimchat = require('./slimchat')

// slimchat.createUser('a', 'Mr. A')
// slimchat.createUser('b', 'Mr. B')
// slimchat.createUser('c', 'Mr. C')
// let roomid =  slimchat.createRoom()
// console.log(`ROOM ID: ${roomid}`)
// slimchat.addUserToRoom('a', roomid)
// slimchat.addUserToRoom('b', roomid)
// slimchat.addUserToRoom('c', roomid)

app.use(express.static(__dirname + '/public'))

app.listen(80)