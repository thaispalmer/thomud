# thomud
A browser-based MUD game server using NodeJS

## Changelog
### v0.1
- First release.
- Basic engine finished (Movement, chat and warps).
- Really Basic UI with map, chat, coords and a list of who is near.

## Installing and running the server
To install the thomud server, you must have NodeJS in your machine and then, on the root folder run:

    npm install
    
To install the dependencies (Socket.IO and Express modules).

After that, to run the server just run:

    node index.js
    
The server will listen to port 3000 by default. And the clients can access the game by http.

## To do
- Improve the UI
- Login and persistant data
- Battles and mobs
- NPCs and shops

## License
Read the LICENSE file included.