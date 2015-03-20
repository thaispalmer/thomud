/* --- */
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var fs = require('fs');

/* --- */

function Player() {
    this.name = 'Guest';
    this.map = null;
    this.coords = null;
}

function Map(file) {
    this.dimensions = null;
    this.data = null;
    this.spawn = null;
    this.warp = null;
    this.name = null;
    
    this.load = function (file) {
        var data = fs.readFileSync('maps/'+file+'.map');
        data = data.toString();
        data = data.split("\n");
        this.name = file;
        this.dimensions = data[0].split(',');
        this.dimensions[0] = parseInt(this.dimensions[0]);
        this.dimensions[1] = parseInt(this.dimensions[1]);
        this.data = [];
        for (var i = 1; i <= this.dimensions[0]; i++) {
            this.data[i-1] = data[i];
        }
        this.warp = [];
        for (var i = this.dimensions[0]+1; i < data.length; i++) {
            var area = data[i].split(',');
            if (area.length == 3) {
                if (area[0] == '_spawn') this.spawn = [parseInt(area[1]),parseInt(area[2])];
                else {
                    this.warp.push({
                        name: area[0],
                        coords: [parseInt(area[1]),parseInt(area[2])]
                    });
                }
            }
        }
    };
    
    this.load(file);
}

/* --- */

worldmap = new Map('world');

/* --- */

app.get('/', function(req, res){
    res.sendFile(__dirname + '/views/index.html');
});

/* --- */

io.on('connection', function(socket) {
    console.log('[+] A user connected.');
    io.emit('log', '* A new player joined the game.');
    socket.player = new Player();
    socket.player.map = worldmap.name;
    socket.player.coords = worldmap.spawn;
    sendCoords(socket);
    drawVisible(socket);
    socket.on('disconnect', function(){
        console.log('[-] User disconnected.');
        io.emit('log', '* A player has left the game.');
    });
    socket.on('move', function(direction) {
        var x = 0;
        var y = 0;
        switch (direction) {
            case 'n':
                y = -1;
                break;

            case 's':
                y = 1;
                break;

            case 'e':
                x = 1;
                break;

            case 'w':
                x = -1;
                break;

            default:
                break;
        }

        // calculating new coords
        var newcoords = [socket.player.coords[0], socket.player.coords[1]];
        if (socket.player.coords[0]+y == worldmap.dimensions[0]) newcoords[0] = 0;
        else if (socket.player.coords[0]+y < 0) newcoords[0] = worldmap.dimensions[0] - 1;
        else newcoords[0] += y;

        if (socket.player.coords[1]+x == worldmap.dimensions[1]) newcoords[1] = 0;
        else if (socket.player.coords[1]+x < 0) newcoords[1] = worldmap.dimensions[1] - 1;
        else newcoords[1] += x;

        // collision
        switch (worldmap.data[newcoords[0]][newcoords[1]]) {
            case '~':
                break;
            default:
                socket.player.coords = newcoords;
                break;
        }
        
        // sending map to the client
        sendCoords(socket);
        drawVisible(socket);
    });
    socket.on('chat', function(msg) {
        if (msg.substr(0,1) == '/') {
            var params = msg.substr(1).split(' ');
            switch (params[0]) {
                case 'help':
                    var message = "*** Help ***\n";
                    message += "*** /name <new_name> - Changes your player name.";
                    socket.emit('log', message);
                    break;
                case 'name':
                    io.emit('log', '* '+socket.player.name+' has changed name to '+params[1]);
                    socket.player.name = params[1];
                    break;
                default:
                    socket.emit('log', '*** Unknown command.');
                    break;
            }
        }
        else io.sockets.emit('chat', '['+getTimestamp()+'] <'+socket.player.name+'> '+msg);
    });
});

/* --- */

http.listen(3000, function(){
    console.log('[*] Listening on *:3000');
});

/* --- */

function drawFullMap(socket) {
    var buffer = [];
    for (var i = 0; i < worldmap.dimensions[0]; i++) {
        buffer[i] = worldmap.data[i];
        if (i == socket.player.coords[0])
            buffer[i] = buffer[i].substr(0,socket.player.coords[1]) + '*' + buffer[i].substr(socket.player.coords[1]+1);
    }
    socket.emit('map',buffer);
}

function drawVisible(socket) {
    var buffer = [];
    var limit = [3,3];
    var map_x;
    var map_y;
    var index = 0;
    for (var i = socket.player.coords[0]-limit[0]; i <= socket.player.coords[0]+limit[0]; i++) {
        buffer[index] = '';
        if (i >= worldmap.dimensions[0]) map_y = i-worldmap.dimensions[0];
        else if (i < 0) map_y = worldmap.dimensions[0]+i;
        else map_y = i;
        for (var j = socket.player.coords[1]-limit[1]; j <= socket.player.coords[1]+limit[1]; j++) {
            if (j >= worldmap.dimensions[1]) map_x = j-worldmap.dimensions[1];
            else if (j < 0) map_x = worldmap.dimensions[1]+j;
            else map_x = j;
            
            if ((socket.player.coords[0] == map_y) && (socket.player.coords[1] == map_x)) buffer[index] += '*';
            else buffer[index] += worldmap.data[map_y][map_x];
        }
        index++;
    }
    socket.emit('map',buffer);
}

function sendCoords(socket) {
    socket.emit('player coords',socket.player.coords);
}

function getTimestamp() {
    var date = new Date();
    return ('0'+date.getHours()).slice(-2)+':'+('0'+date.getMinutes()).slice(-2)+':'+('0'+date.getSeconds()).slice(-2);
}