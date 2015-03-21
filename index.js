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
    this.playersAt = null;
    
    this.load = function (file) {
        var data = fs.readFileSync('maps/'+file+'.map');
        data = data.toString();
        data = data.split("\n");
        this.name = file;
        this.dimensions = data[0].split(',');
        this.dimensions[0] = parseInt(this.dimensions[0]);
        this.dimensions[1] = parseInt(this.dimensions[1]);
        this.data = [];
        this.playersAt = [];
        for (var i = 1; i <= this.dimensions[0]; i++) {
            this.data[i-1] = data[i];
            this.playersAt[i-1] = [];
            for (var j = 0; j < this.dimensions[1]; j++) {
                this.playersAt[i-1][j] = [];
            }
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

maps = {};
maps['world'] = new Map('world');

/* --- */

app.get('/', function(req, res){
    res.sendFile(__dirname + '/views/index.html');
});

/* --- */

io.on('connection', function(socket) {
    console.log('[+] A user connected.');
    io.emit('log', '['+getTimestamp()+'] * A new player joined the game.');
    socket.player = new Player();
    socket.player.map = 'world';
    socket.player.coords = maps['world'].spawn;
    maps[socket.player.map].playersAt[socket.player.coords[0]][socket.player.coords[1]].push(socket);
    sendCoords(socket);
    updateNearby(socket);
    socket.on('disconnect', function(){
        console.log('[-] User disconnected.');
        io.emit('log', '['+getTimestamp()+'] * '+socket.player.name+' has left the game.');
        var socketIndex = maps[socket.player.map].playersAt[socket.player.coords[0]][socket.player.coords[1]].indexOf(socket);
        maps[socket.player.map].playersAt[socket.player.coords[0]][socket.player.coords[1]].splice(socketIndex,1);
        updateNearby(socket);
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
        if (socket.player.coords[0]+y == maps[socket.player.map].dimensions[0]) newcoords[0] = 0;
        else if (socket.player.coords[0]+y < 0) newcoords[0] = maps[socket.player.map].dimensions[0] - 1;
        else newcoords[0] += y;

        if (socket.player.coords[1]+x == maps[socket.player.map].dimensions[1]) newcoords[1] = 0;
        else if (socket.player.coords[1]+x < 0) newcoords[1] = maps[socket.player.map].dimensions[1] - 1;
        else newcoords[1] += x;

        // collision
        switch (maps[socket.player.map].data[newcoords[0]][newcoords[1]]) {
            case '~':
                break;
            default:
                // removing actual player location on the map for other players
                var socketIndex = maps[socket.player.map].playersAt[socket.player.coords[0]][socket.player.coords[1]].indexOf(socket);
                maps[socket.player.map].playersAt[socket.player.coords[0]][socket.player.coords[1]].splice(socketIndex,1);
                // updating player's own location
                socket.player.coords = newcoords;
                // updating player location on the map for other players
                maps[socket.player.map].playersAt[socket.player.coords[0]][socket.player.coords[1]].push(socket);

                // updating map of nearby players and the client itself
                updateNearby(socket);

                // sending coords to the client
                sendCoords(socket);
                break;
        }
    });
    socket.on('chat', function(msg) {
        if (msg.substr(0,1) == '/') {
            var params = msg.substr(1).split(' ');
            switch (params[0]) {
                case 'help':
                    var message = "*** Help ***\n";
                    message += "*** /name <new_name> - Changes your player name.\n";
                    message += "*** /map - Shows the full map.\n";
                    message += "*** /players - Shows the players online.";
                    socket.emit('log', message);
                    break;
                case 'name':
                    io.emit('log', '['+getTimestamp()+'] * '+socket.player.name+' has changed name to '+params[1]);
                    socket.player.name = params[1];
                    break;
                case 'map':
                    drawFullMap(socket);
                    break;
                case 'players':
                    var message = "*** Players online: "+io.sockets.sockets.length+" ***\n";
                    for (var i = 0; i < io.sockets.sockets.length; i++)
                        message += "*** "+io.sockets.sockets[i].player.name+"\n";
                    socket.emit('log', message);
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
    for (var i = 0; i < maps[socket.player.map].dimensions[0]; i++) {
        buffer[i] = maps[socket.player.map].data[i];
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
        if (i >= maps[socket.player.map].dimensions[0]) map_y = i-maps[socket.player.map].dimensions[0];
        else if (i < 0) map_y = maps[socket.player.map].dimensions[0]+i;
        else map_y = i;
        for (var j = socket.player.coords[1]-limit[1]; j <= socket.player.coords[1]+limit[1]; j++) {
            if (j >= maps[socket.player.map].dimensions[1]) map_x = j-maps[socket.player.map].dimensions[1];
            else if (j < 0) map_x = maps[socket.player.map].dimensions[1]+j;
            else map_x = j;
            // buffers the map surrounding the client
            if ((socket.player.coords[0] == map_y) && (socket.player.coords[1] == map_x)) buffer[index] += '*'; // player
            else if (maps[socket.player.map].playersAt[map_y][map_x].length > 0) buffer[index] += '!'; // some other players
            else buffer[index] += maps[socket.player.map].data[map_y][map_x]; // the map stuff itself
        }
        index++;
    }
    socket.emit('map',buffer);
}

function whatIsHere(socket) {
    var total = maps[socket.player.map].playersAt[socket.player.coords[0]][socket.player.coords[1]].length;
    var items = [];
    for (var i = 0; i < total; i++) {
        if (maps[socket.player.map].playersAt[socket.player.coords[0]][socket.player.coords[1]][i] == socket) continue;
        items.push(maps[socket.player.map].playersAt[socket.player.coords[0]][socket.player.coords[1]][i].player.name);
    }
    socket.emit('what is here',items);
}

function updateNearby(socket) {
    var limit = [3,3];
    for (var i = socket.player.coords[0]-limit[0]; i <= socket.player.coords[0]+limit[0]; i++) {
        if (i >= maps[socket.player.map].dimensions[0]) map_y = i-maps[socket.player.map].dimensions[0];
        else if (i < 0) map_y = maps[socket.player.map].dimensions[0]+i;
        else map_y = i;
        for (var j = socket.player.coords[1]-limit[1]; j <= socket.player.coords[1]+limit[1]; j++) {
            if (j >= maps[socket.player.map].dimensions[1]) map_x = j-maps[socket.player.map].dimensions[1];
            else if (j < 0) map_x = maps[socket.player.map].dimensions[1]+j;
            else map_x = j;
            // broadcast to nearby players including the client itself
            for (var k = 0; k < maps[socket.player.map].playersAt[map_y][map_x].length; k++) {
                drawVisible(maps[socket.player.map].playersAt[map_y][map_x][k]);
                whatIsHere(maps[socket.player.map].playersAt[map_y][map_x][k]);
            }
        }
    }
}

function sendCoords(socket) {
    socket.emit('player coords',socket.player.coords);
}

function getTimestamp() {
    var date = new Date();
    return ('0'+date.getHours()).slice(-2)+':'+('0'+date.getMinutes()).slice(-2)+':'+('0'+date.getSeconds()).slice(-2);
}