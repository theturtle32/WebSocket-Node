const WebSocketClient = require('../../lib/websocket').client;

const connectionAmount = process.argv[2];
let activeCount = 0;
const deviceList = [];

connectDevices();

function logActiveCount() {
    console.log(`---activecount---: ${activeCount}`);
}

setInterval(logActiveCount, 500);

function connectDevices() {
    for( let i=0; i < connectionAmount; i++ ){
        connect( i );
    }
}

function connect( i ){          
    // console.log( '--- Connecting: ' + i );
    const client = new WebSocketClient({
        tlsOptions: {
            rejectUnauthorized: false
        }
    }); 
    client._clientID = i;
    deviceList[i] = client;

    client.on('connectFailed', function(error) {
        console.log(`${i} - connect Error: ${error.toString()}`);
    });

    client.on('connect', function(connection) {
        console.log(`${i} - connect`);
        activeCount ++;
        client.connection = connection;
        flake( i );
        
        maybeScheduleSend(i);

        connection.on('error', function(error) {
            console.log(`${i} - ${error.toString()}`);
        });

        connection.on('close', function(reasonCode, closeDescription) {
            console.log(`${i} - close (${reasonCode}) ${closeDescription}`);
            activeCount --;
            if (client._flakeTimeout) {
                clearTimeout(client._flakeTimeout);
                client._flakeTimeout = null;
            }
            connect(i);
        });

        connection.on('message', function(message) {
            if ( message.type === 'utf8' ) {
                console.log(`${i} received: '${message.utf8Data}'`);
            }
        });     

    });
    client.connect('wss://localhost:8080');
}

function disconnect( i ){
    const client = deviceList[i];
    if (client._flakeTimeout) {
        client._flakeTimeout = null;
    }
    client.connection.close();
}

function maybeScheduleSend(i) {
    const client = deviceList[i];
    const random = Math.round(Math.random() * 100);
    console.log(`${i} - scheduling send.  Random: ${random}`);
    if (random < 50) {
        setTimeout(function() {
            console.log(`${i} - send timeout.  Connected? ${client.connection.connected}`);
            if (client && client.connection.connected) {
                console.log(`${i} - Sending test data! random: ${random}`);
                client.connection.send( (new Array(random)).join('TestData') );
            }
        }, random);
    }
}

function flake(i) {
    const client = deviceList[i];
    const timeBeforeDisconnect = Math.round(Math.random() * 2000);
    client._flakeTimeout = setTimeout( function() {
        disconnect(i);
    }, timeBeforeDisconnect);
}
