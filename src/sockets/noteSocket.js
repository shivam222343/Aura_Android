const Note = require('../models/Note');

module.exports = (io, socket) => {
    // Join a specific note room
    socket.on('note:join', async (noteId) => {
        socket.join(`note:${noteId}`);
        console.log(`📝 User ${socket.userId} joined note room: ${noteId}`);

        // Optionally update collaborators in DB
        try {
            await Note.findByIdAndUpdate(noteId, {
                $addToSet: { collaborators: { userId: socket.userId } }
            });

            // Notify others
            socket.to(`note:${noteId}`).emit('note:user_joined', {
                userId: socket.userId
            });
        } catch (error) {
            console.error('Socket note:join error:', error);
        }
    });

    // Leave note room
    socket.on('note:leave', async (noteId) => {
        socket.leave(`note:${noteId}`);
        console.log(`📝 User ${socket.userId} left note room: ${noteId}`);

        try {
            await Note.findByIdAndUpdate(noteId, {
                $pull: { collaborators: { userId: socket.userId } }
            });

            socket.to(`note:${noteId}`).emit('note:user_left', {
                userId: socket.userId
            });
        } catch (error) {
            console.error('Socket note:leave error:', error);
        }
    });

    // Live update of content/styles
    socket.on('note:update', (data) => {
        const { noteId, content, styles, title } = data;

        // Broadcast to everyone else in the room
        socket.to(`note:${noteId}`).emit('note:change', {
            content,
            styles,
            title,
            updatedBy: socket.userId
        });
    });

    // Cursor movement (Optional but cool for live notes)
    socket.on('note:cursor', (data) => {
        const { noteId, cursor } = data;
        socket.to(`note:${noteId}`).emit('note:cursor_move', {
            userId: socket.userId,
            cursor
        });
    });
};
