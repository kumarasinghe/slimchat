const RETRY_DELAY = 1000
const ROOM = 'reslyp5H5sWtEy6dLWYzlsP7oc89xKA3'
const SERVER = 'localhost'
const PORT = '8080'

buttonSend.onclick = () => {

    let sender = selectBoxUser.value

    let url = encodeURI('http://' + SERVER + ':' + PORT + '/?type=send&sender=' + sender + '&room=' + ROOM + '&data=' + textBoxMessage.value)

    get(url, (err) => {
        if (err) {
            console.error('Failed to send the message')
        }
        else {
            textAreaChatLog.innerHTML += selectBoxUser.value + '> ' + textBoxMessage.value + '\n'
            textBoxMessage.value = ''
        }
    })

}

btnStartListen.onclick = () => {
    receiveMessage()
}

function receiveMessage() {

    let receiver = selectBoxUser.value

    let url = encodeURI('http://' + SERVER + ':' + PORT + '?type=receive&receiver=' + receiver + '&room=' + ROOM)

    console.log('requesting messages..')

    get(url, (err, res) => {

        if (err) {
            console.error(err)
            setTimeout(receiveMessage, RETRY_DELAY)
        }
        else {
            let message = JSON.parse(res)

            if (message.type == 'message') {
                textAreaChatLog.innerHTML += message.data.sender + '> ' + message.data.message + '\n'
            }
            else if (message.type == 'queue') {
                console.log(message)
            }

            receiveMessage()
        }

    })

}

function get(url, callback) {

    var xhttp = new XMLHttpRequest()

    xhttp.onreadystatechange = () => {
        if (xhttp.readyState == 4) {
            if (xhttp.status == 200) {
                if (callback) callback(undefined, xhttp.responseText)
            }
            else {
                if (xhttp.status == 0) {
                    callback(408)
                }
                else {
                    callback(xhttp.status)
                }
            }
        }
    }

    xhttp.open("GET", url, true)
    xhttp.send()

}


