import express from "express"
import { Server } from "socket.io"
import path from "path"
import { fileURLToPath } from "url";

const PORT = process.env.PORT || 3500;
const app = express()

// To make static server we can do this,
// app.use(express.static(path.join(__dirname, "public"))); // we make static serve

// but there is a problem if using that code
// because we using import instead using require and our package.json type is module 
// the problem is __dirname is no available in module 

// The Solution :
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
app.use(express.static(path.join(__dirname, "public"))); // we make static server

const expressServer = app.listen(PORT, () => {
    console.log(`listening to port ${PORT}`)
    console.log(`You can access the app at http://localhost:${PORT}`)
})

const io = new Server(expressServer, {
    // WE Don't need cors because our frontend and backend is at the same server right now
    // we using cors only if we the frontend and the backend at different server
    // cors: {
    //     origin: process.env.NODE_ENVIRONMENT == 'production' 
    //     ? false 
    //     : ["http//localhost:5500", "http://127.0.0.1:5500"]
    // }
});

const usersState = {
    users: [],
    setUsers: function(newUsersArray) {
        this.users = newUsersArray
    }
}

io.on("connection", socket => {
    // send welcome message only to current user
    socket.emit('welcome-message', "Welcome To Chat App");

    // listen for join-room event from client
    // destruct parameter from object to only property we need
    socket.on('join-room', ({ name, room }) => {

        // leave previous room
        const prevRoom = getUser(socket.id)?.room
        if(prevRoom) {
            socket.leave(prevRoom)

            // send event message to all user in prevRoom
            io.to(prevRoom).emit('someone-left-room',`${name} has left the room`)
        }

        // activate user
        const user = activateUser(socket.id, name, room)

        // cannot update previous room users list until after the state update in activate user
        if(prevRoom) {
            // send updated users list in prev room
            io.to(prevRoom).emit('userList', {
                users: getUsersInRoom(prevRoom)
            })
        }

        // join room 
        socket.join(user.room)

        // send message with event joined-room to all in the room user.room except the current socket user
        socket.emit('joined-room',  `You have joined the ${user.room} chat room`)

        // send message with event someone-join-room to all in the room user.room except the current socket user
        socket.broadcast.to(user.room).emit('someone-join-room', `${user.name} has joined the room`)

        // update user list for user.room room
        io.to(user.room).emit('userList', {
            users: getUsersInRoom(user.room)
        })

        // update active rooms for everyone
        io.emit('roomList', {
            rooms: getAllActiveRooms()
        })
    })

    socket.on('message-client',  ({ name, message}) => {
        const room = getUser(socket.id)?.room
        
        if(room) {
            // send message to all user in room
            io.to(room).emit('message', buildMessage(name, message))
        }
    })

    socket.on('activity-client', (name) => {
        const room = getUser(socket.id)?.room
        
        if(room) {
            // send activity to all user in the room except current socket user
            socket.broadcast.to(room).emit('activity', name)
        }
    });

    socket.on("disconnect", () => {
        const user = getUser(socket.id)

        userLeavesApp(socket.id)
        if(user) {
            // send event someone-left-room to all user in the user.room room
            io.to(user.room).emit('someone-left-room', `${user.name} has left the room`)

            // update user list in the user.room room
            io.to(user.room).emit('userList', {
                users: getUsersInRoom(user.room)
            })

            // update active rooms for everyone
            io.emit('roomList', {
                rooms: getAllActiveRooms()
            })
            console.log(`${user.id} disconnected`)
        }
    })
});

function buildMessage(name, message) {
    return {
        name,
        message,
        time: new Intl.DateTimeFormat('default', {
            hour: 'numeric',
            minute: 'numeric',
            seconds: 'numeric'
        }).format(new Date())
    }
}

function activateUser(id, name,room)  {
    const user = { id, name, room}

    // set user to user state
    usersState.setUsers([
        // filter user is already at userstate or not so it's not duplicate
        ...usersState.users.filter(user => user.id !== id),
        user
    ])

    return user
}

function userLeavesApp(id) {
    usersState.setUsers(
        usersState.users.filter(user => user.id !== id)
    )
}

function getUser(id) {
    return usersState.users.find(user => user.id === id)
}

function getUsersInRoom(room) {
    return usersState.users.filter(user => user.room === room)
}

function getAllActiveRooms() {
    return Array.from(
        // use new set to prevent duplicate room
        new Set(usersState.users.map(user => user.room))
    )
}
