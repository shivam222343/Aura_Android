// Meme Match Game Socket Handler - Movie Dialogue Quiz

// Load movie dialogues database
const movieDialogues = require('../data/movieDialogues');

function getRandomDialogue() {
    return movieDialogues[Math.floor(Math.random() * movieDialogues.length)];
}

function generateQuizOptions(correctMovie, language) {
    // Get 3 random wrong options from different movies but within the SAME language
    const wrongOptions = [];
    const usedMovies = new Set([correctMovie]);

    // Filter dialogues by the same language
    const langMovies = movieDialogues.filter(d => d.language === language);

    // If we don't have enough movies in that language (unlikely but safe), 
    // fall back to all dialogues
    const sourcePool = langMovies.length >= 4 ? langMovies : movieDialogues;

    while (wrongOptions.length < 3) {
        const randomDialogue = sourcePool[Math.floor(Math.random() * sourcePool.length)];
        if (!usedMovies.has(randomDialogue.movie)) {
            wrongOptions.push(randomDialogue.movie);
            usedMovies.add(randomDialogue.movie);
        }
    }

    // Combine correct and wrong options, then shuffle
    const allOptions = [correctMovie, ...wrongOptions];
    return shuffleArray(allOptions);
}

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Exported functions
let _io;
let _gameRooms;
let _broadcastRoomList;

const handlers = {
    initDeps: (io, gameRooms, broadcastRoomList) => {
        _io = io;
        _gameRooms = gameRooms;
        _broadcastRoomList = broadcastRoomList;
    },
    startMemeMatchGame: (io, roomId, gameRooms) => {
        const room = gameRooms[roomId];
        if (!room) return;

        // Update room status
        room.status = 'active';

        // Initialize game state for quiz
        room.state = {
            currentRound: 0,
            players: room.players.map(p => ({ ...p, score: 0, roundScore: 0 })),
            answers: {},
            phase: 'waiting'
        };

        // Notify all players that game is starting to transition UI
        io.to(roomId).emit('game:update', room);

        // Start first round with a short delay to allow UI transition
        setTimeout(() => {
            handlers.startNextMemeMatchRound(io, roomId, gameRooms);
        }, 2000);
    },

    startNextMemeMatchRound: (io, roomId, gameRooms) => {
        const room = gameRooms[roomId];
        if (!room) return;

        // Get random dialogue and generate options
        const quizData = getRandomDialogue();
        const options = generateQuizOptions(quizData.movie, quizData.language);

        room.state.currentRound = (room.state.currentRound || 0) + 1;
        room.state.currentDialogue = quizData.dialogue;
        room.state.correctMovie = quizData.movie;
        room.state.language = quizData.language;
        room.state.options = options;
        room.state.answers = {};
        room.state.phase = 'answering';
        room.state.timeRemaining = 30; // 30 seconds to answer
        room.state.roundStartTime = Date.now();

        // Broadcast initial answer count
        io.to(roomId).emit('memematch:answer_count', {
            answered: 0,
            total: room.players.length
        });

        // Send quiz question to all players
        io.to(roomId).emit('memematch:question', {
            round: room.state.currentRound,
            totalRounds: room.config.totalRounds,
            dialogue: quizData.dialogue,
            language: quizData.language,
            options: options,
            timeLimit: 30,
            totalPlayers: room.players.length
        });

        // Also broadcast the full state update for perfect sync
        io.to(roomId).emit('game:update', room);

        // Start timer
        handlers.startMemeMatchTimer(io, roomId, gameRooms, 'answering');
    },

    startMemeMatchTimer: (io, roomId, gameRooms, phase) => {
        const room = gameRooms[roomId];
        if (!room) return;

        if (room.state.timer) {
            clearInterval(room.state.timer);
        }

        const timeLimit = 30; // 30 seconds for answering
        room.state.timeRemaining = timeLimit;

        room.state.timer = setInterval(() => {
            const currentRoom = gameRooms[roomId];
            if (!currentRoom) {
                clearInterval(room.state.timer);
                return;
            }

            currentRoom.state.timeRemaining--;
            io.to(roomId).emit('memematch:time_update', currentRoom.state.timeRemaining);

            if (currentRoom.state.timeRemaining <= 0) {
                clearInterval(currentRoom.state.timer);
                // Time's up - end the round
                handlers.endMemeMatchRound(io, roomId, gameRooms);
            }
        }, 1000);
    },

    checkMemePhaseCompletion: (io, roomId, gameRooms) => {
        const room = gameRooms[roomId];
        if (!room || room.state.phase !== 'answering') return;

        const answeredCount = Object.keys(room.state.answers).length;
        const totalPlayers = room.players.length;

        // Update everyone on the new count
        io.to(roomId).emit('memematch:answer_count', {
            answered: answeredCount,
            total: totalPlayers
        });

        // If everyone remaining has answered, end the round
        if (answeredCount >= totalPlayers && totalPlayers > 0) {
            handlers.endMemeMatchRound(io, roomId, gameRooms);
        }
    },


    endMemeMatchRound: (io, roomId, gameRooms) => {
        const room = gameRooms[roomId];
        if (!room) return;

        if (room.state.timer) {
            clearInterval(room.state.timer);
            room.state.timer = null;
        }

        room.state.phase = 'results';

        // Calculate scores based on correctness and speed
        const roundDuration = 30000; // 30 seconds in milliseconds
        Object.entries(room.state.answers).forEach(([userId, answerData]) => {
            const player = room.players.find(p => p.userId === userId);
            if (player) {
                if (answerData.isCorrect) {
                    // Base points for correct answer
                    let points = 1000;

                    // Bonus points for speed (max 500 bonus points)
                    const timeElapsed = answerData.timestamp - room.state.roundStartTime;
                    const speedBonus = Math.floor(500 * (1 - (timeElapsed / roundDuration)));
                    points += Math.max(0, speedBonus);

                    player.score += points;
                    player.roundScore = points;
                } else {
                    player.roundScore = 0;
                }
            }
        });

        // Prepare results with correct answer revealed
        const results = {
            correctMovie: room.state.correctMovie,
            dialogue: room.state.currentDialogue,
            language: room.state.language,
            playerAnswers: Object.entries(room.state.answers).map(([userId, data]) => ({
                userId,
                userName: room.players.find(p => p.userId === userId)?.userName,
                answer: data.answer,
                isCorrect: data.isCorrect,
                points: room.players.find(p => p.userId === userId)?.roundScore || 0
            })),
            scores: room.players.map(p => ({
                userId: p.userId,
                userName: p.userName,
                score: p.score,
                roundScore: p.roundScore || 0
            })).sort((a, b) => b.score - a.score)
        };

        io.to(roomId).emit('memematch:round_end', results);

        // Sync state to all
        io.to(roomId).emit('game:update', room);

        // Move to next round or end game
        setTimeout(() => {
            const stillExists = gameRooms[roomId];
            if (stillExists) {
                if (stillExists.state.currentRound >= stillExists.config.totalRounds) {
                    handlers.endMemeMatchGame(io, roomId, gameRooms);
                } else {
                    stillExists.players.forEach(p => { p.roundScore = 0; });
                    handlers.startNextMemeMatchRound(io, roomId, gameRooms);
                }
            }
        }, 8000);
    },

    endMemeMatchGame: (io, roomId, gameRooms) => {
        const room = gameRooms[roomId];
        if (!room) return;

        room.status = 'finished';
        const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);

        io.to(roomId).emit('memematch:game_over', {
            winner: sortedPlayers[0],
            leaderboard: sortedPlayers
        });

        setTimeout(() => {
            delete gameRooms[roomId];
        }, 60000);
    },

    init: (io, socket, gameRooms) => {
        // Listeners
        socket.on('memematch:join', (data) => {
            const { roomId } = data;
            const room = gameRooms[roomId];
            if (room) {
                socket.join(roomId);
                socket.emit('game:update', room);
                console.log(`Player joined Meme Match room: ${roomId}`);
            }
        });

        // Keep start_round listener for legacy or manual triggers, but it uses the handler
        socket.on('memematch:start_round', (data) => {
            const { roomId } = data;
            handlers.startNextMemeMatchRound(io, roomId, gameRooms);
        });

        socket.on('memematch:answer', (data) => {
            const { roomId, userId, userName, answer } = data;
            const room = gameRooms[roomId];

            if (!room || room.state.phase !== 'answering') return;

            // Check if player already answered
            if (room.state.answers[userId]) return;

            // Record answer with timestamp
            const isCorrect = answer === room.state.correctMovie;
            room.state.answers[userId] = {
                answer,
                timestamp: Date.now(),
                isCorrect
            };

            // Notify all players of answer count
            io.to(roomId).emit('memematch:answer_count', {
                answered: Object.keys(room.state.answers).length,
                total: room.players.length
            });

            // If everyone answered, end round immediately
            if (Object.keys(room.state.answers).length === room.players.length) {
                handlers.endMemeMatchRound(io, roomId, gameRooms);
            }
        });

        socket.on('memematch:leave', (roomId) => {
            const room = gameRooms[roomId];
            if (room) {
                room.players = room.players.filter(p => p.socketId !== socket.id);
                socket.leave(roomId);
                if (room.players.length === 0) {
                    if (room.state.timer) clearInterval(room.state.timer);
                    delete gameRooms[roomId];
                } else {
                    io.to(roomId).emit('memematch:player_left', {
                        players: room.players
                    });
                    // Check if phase should complete now that total count decreased
                    handlers.checkMemePhaseCompletion(io, roomId, gameRooms);
                }

                // Broadcast updated room list
                if (_broadcastRoomList) {
                    _broadcastRoomList(io, room.clubId, room.gameType);
                }
            }
        });
    }
};

module.exports = handlers;
