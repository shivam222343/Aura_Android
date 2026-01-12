// Code Breaker Game Socket Handler

// Code generation utilities
const CODE_TYPES = {
    numbers: { options: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], label: 'Numbers' },
    colors: {
        options: ['🔴', '🔵', '🟢', '🟡', '🟣', '🟠', '🩷', '🩵'],
        label: 'Colors'
    },
    symbols: {
        options: ['★', '♠', '♥', '♦', '♣', '●', '■', '▲'],
        label: 'Symbols'
    }
};

const DIFFICULTY_SETTINGS = {
    easy: { codeLength: 4, maxAttempts: 10, timeLimit: 180 },
    medium: { codeLength: 4, maxAttempts: 8, timeLimit: 150 },
    hard: { codeLength: 5, maxAttempts: 6, timeLimit: 120 }
};

function generateRandomCode(codeType, length) {
    const options = CODE_TYPES[codeType].options;
    const code = [];
    for (let i = 0; i < length; i++) {
        code.push(options[Math.floor(Math.random() * options.length)]);
    }
    return code;
}

function calculateClue(secretCode, guess) {
    // Ensure both are arrays of strings for consistent comparison
    const secret = secretCode.map(s => String(s));
    const guessArray = guess.map(g => String(g));

    const workingSecret = [...secret];
    const workingGuess = [...guessArray];

    let correct = 0;
    let wrongPosition = 0;

    // First pass: find correct positions
    for (let i = 0; i < workingSecret.length; i++) {
        if (workingSecret[i] === workingGuess[i]) {
            correct++;
            workingSecret[i] = null;
            workingGuess[i] = null;
        }
    }

    // Second pass: find wrong positions
    for (let i = 0; i < workingGuess.length; i++) {
        if (workingGuess[i] !== null) {
            const index = workingSecret.indexOf(workingGuess[i]);
            if (index !== -1) {
                wrongPosition++;
                workingSecret[index] = null;
            }
        }
    }

    const wrong = secret.length - correct - wrongPosition;
    return { correct, wrongPosition, wrong };
}

function calculateScore(attempts, timeRemaining, difficulty) {
    let baseScore = 1000;
    const attemptPenalty = attempts * 100;
    const timeBonus = timeRemaining * 10;
    const difficultyBonus = difficulty === 'easy' ? 0 : difficulty === 'medium' ? 500 : 1000;

    return Math.max(0, baseScore - attemptPenalty + timeBonus + difficultyBonus);
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
    startCodeBreakerGame: (io, roomId, gameRooms) => {
        const room = gameRooms[roomId];
        if (!room) return;

        room.state = {
            currentRound: 1,
            currentTurnIndex: 0,
            phase: 'picking',
            players: room.players.map(p => ({ ...p, score: 0, turnScore: 0 }))
        };

        const codeMaker = room.players[0];
        room.state.currentCodeMaker = codeMaker.userId;

        io.to(roomId).emit('codebreaker:new_turn', {
            round: 1,
            turn: 1,
            totalTurns: room.players.length,
            codeMaker: codeMaker.userName,
            codeMakerId: codeMaker.userId
        });

        io.to(codeMaker.socketId).emit('codebreaker:select_settings', {
            codeTypes: Object.keys(CODE_TYPES),
            difficulties: Object.keys(DIFFICULTY_SETTINGS)
        });
    },

    init: (io, socket, gameRooms) => {
        // Helper functions inside closure to access gameRooms
        function startCodeBreakerTimer(roomId) {
            const room = gameRooms[roomId];
            if (!room) return;

            if (room.state.timer) {
                clearInterval(room.state.timer);
            }

            room.state.timer = setInterval(() => {
                const currentRoom = gameRooms[roomId];
                if (!currentRoom || currentRoom.state.phase !== 'guessing') {
                    clearInterval(currentRoom?.state?.timer);
                    return;
                }

                currentRoom.state.timeRemaining--;
                io.to(roomId).emit('codebreaker:time_update', currentRoom.state.timeRemaining);

                if (currentRoom.state.timeRemaining <= 0) {
                    clearInterval(currentRoom.state.timer);
                    endCodeBreakerTurn(roomId, 'timeout');
                }
            }, 1000);
        }

        function endCodeBreakerTurn(roomId, reason) {
            const room = gameRooms[roomId];
            if (!room) return;

            if (room.state.timer) {
                clearInterval(room.state.timer);
                room.state.timer = null;
            }

            room.state.phase = 'ended';

            io.to(roomId).emit('codebreaker:turn_end', {
                reason, // 'solved', 'failed', 'timeout'
                secretCode: room.state.secretCode,
                solvedBy: room.state.solvedBy,
                attempts: room.state.attempts,
                scores: room.players.map(p => ({
                    userId: p.userId,
                    userName: p.userName,
                    score: p.score,
                    turnScore: p.turnScore || 0
                })).sort((a, b) => b.score - a.score)
            });

            // Prepare for next turn
            setTimeout(() => {
                const stillExists = gameRooms[roomId];
                if (stillExists && stillExists.status === 'playing') {
                    startNextCodeBreakerTurn(roomId);
                }
            }, 5000);
        }

        function startNextCodeBreakerTurn(roomId) {
            const room = gameRooms[roomId];
            if (!room) return;

            room.state.currentTurnIndex++;

            // Check if round is complete
            if (room.state.currentTurnIndex >= room.players.length) {
                room.state.currentRound++;

                // Check if game is over
                if (room.state.currentRound > room.config.totalRounds) {
                    endCodeBreakerGame(roomId);
                    return;
                }

                room.state.currentTurnIndex = 0;
            }

            // Reset turn scores
            room.players.forEach(p => { p.turnScore = 0; });

            // Set new code maker
            const codeMaker = room.players[room.state.currentTurnIndex];
            room.state.currentCodeMaker = codeMaker.userId;

            io.to(roomId).emit('codebreaker:new_turn', {
                round: room.state.currentRound,
                turn: room.state.currentTurnIndex + 1,
                totalTurns: room.players.length,
                codeMaker: codeMaker.userName,
                codeMakerId: codeMaker.userId
            });

            // Send code type options to code maker
            io.to(codeMaker.socketId).emit('codebreaker:select_settings', {
                codeTypes: Object.keys(CODE_TYPES),
                difficulties: Object.keys(DIFFICULTY_SETTINGS)
            });
        }

        function endCodeBreakerGame(roomId) {
            const room = gameRooms[roomId];
            if (!room) return;

            room.status = 'finished';
            const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);

            io.to(roomId).emit('codebreaker:game_over', {
                winner: sortedPlayers[0],
                leaderboard: sortedPlayers
            });

            setTimeout(() => {
                delete gameRooms[roomId];
            }, 60000);
        }

        // Listeners
        socket.on('codebreaker:join', (data) => {
            const { roomId } = data;
            const room = gameRooms[roomId];
            if (room) {
                socket.join(roomId);
                socket.emit('game:update', room);

                // If game already started, send current state to the joining player
                if (room.state && (room.state.phase === 'picking' || room.state.phase === 'guessing')) {
                    socket.emit('codebreaker:game_started', {
                        codeType: room.state.codeType,
                        difficulty: room.state.difficulty,
                        codeLength: room.state.codeLength,
                        maxAttempts: room.state.maxAttempts,
                        timeLimit: room.state.timeLimit,
                        codeMaker: room.state.currentCodeMaker,
                        phase: room.state.phase // Pass phase so UI knows if picking/guessing
                    });

                    // Also catch up on attempts
                    if (room.state.attempts && room.state.attempts.length > 0) {
                        room.state.attempts.forEach(attempt => {
                            socket.emit('codebreaker:attempt_made', {
                                attempt,
                                attemptsRemaining: room.state.attemptsRemaining
                            });
                        });
                    }
                }
            }
        });

        socket.on('codebreaker:start_turn', (data) => {
            const { roomId, codeType, difficulty } = data;
            const room = gameRooms[roomId];

            if (!room) return;

            const settings = DIFFICULTY_SETTINGS[difficulty];

            room.state = {
                ...room.state,
                codeType,
                difficulty,
                codeLength: settings.codeLength,
                maxAttempts: settings.maxAttempts,
                timeLimit: settings.timeLimit,
                phase: 'picking'
            };

            // Ask code maker to set the code
            const maker = room.players.find(p => p.userId === room.state.currentCodeMaker);
            if (maker && maker.socketId) {
                io.to(maker.socketId).emit('codebreaker:pick_code', {
                    codeLength: settings.codeLength,
                    codeType,
                    options: CODE_TYPES[codeType].options
                });
            }
        });

        socket.on('codebreaker:set_code', (data) => {
            const { roomId, secretCode } = data;
            const room = gameRooms[roomId];

            if (!room || room.state.phase !== 'picking') return;
            if (socket.id !== room.players.find(p => p.userId === room.state.currentCodeMaker)?.socketId) return;

            room.state.secretCode = secretCode;
            room.state.attempts = [];
            room.state.attemptsRemaining = room.state.maxAttempts;
            room.state.timeRemaining = room.state.timeLimit;
            room.state.solvedBy = null;
            room.state.phase = 'guessing';
            room.status = 'playing';

            io.to(roomId).emit('codebreaker:game_started', {
                codeType: room.state.codeType,
                difficulty: room.state.difficulty,
                codeLength: room.state.codeLength,
                maxAttempts: room.state.maxAttempts,
                timeLimit: room.state.timeLimit,
                codeMaker: room.state.currentCodeMaker
            });

            // Re-send to maker with secret code
            socket.emit('codebreaker:game_started', {
                codeType: room.state.codeType,
                difficulty: room.state.difficulty,
                codeLength: room.state.codeLength,
                maxAttempts: room.state.maxAttempts,
                timeLimit: room.state.timeLimit,
                codeMaker: room.state.currentCodeMaker,
                secretCode: room.state.secretCode
            });

            startCodeBreakerTimer(roomId);
        });

        socket.on('codebreaker:guess', (data) => {
            const { roomId, userId, userName, guess } = data;
            const room = gameRooms[roomId];

            if (!room || room.state.phase !== 'guessing') return;
            if (userId === room.state.currentCodeMaker) return;

            const clue = calculateClue(room.state.secretCode, guess);
            const attempt = {
                userId,
                userName,
                guess,
                clue,
                timestamp: Date.now()
            };

            room.state.attempts.push(attempt);
            room.state.attemptsRemaining--;

            io.to(roomId).emit('codebreaker:attempt_made', {
                attempt,
                attemptsRemaining: room.state.attemptsRemaining
            });

            if (clue.correct === room.state.codeLength) {
                const player = room.players.find(p => p.userId === userId);
                if (player) {
                    const points = calculateScore(
                        room.state.attempts.length,
                        room.state.timeRemaining,
                        room.state.difficulty
                    );
                    player.score += points;
                    player.turnScore = points;
                }
                room.state.solvedBy = userId;
                endCodeBreakerTurn(roomId, 'solved');
            } else if (room.state.attemptsRemaining <= 0) {
                endCodeBreakerTurn(roomId, 'failed');
            }
        });

        socket.on('codebreaker:leave', (roomId) => {
            const room = gameRooms[roomId];
            if (room) {
                room.players = room.players.filter(p => p.socketId !== socket.id);
                socket.leave(roomId);

                if (room.players.length === 0) {
                    if (room.state.timer) clearInterval(room.state.timer);
                    delete gameRooms[roomId];
                } else {
                    io.to(roomId).emit('codebreaker:player_left', {
                        players: room.players
                    });
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
