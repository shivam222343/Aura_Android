// Code Breaker Game Socket Handler
// Code generation utilities
const CODE_TYPES = {
    numbers: { options: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], label: 'Numbers' },
    colors: {
        options: ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'],
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
    const secret = [...secretCode];
    const guessArray = [...guess];
    let correct = 0;
    let wrongPosition = 0;

    // First pass: find correct positions
    for (let i = 0; i < secret.length; i++) {
        if (secret[i] === guessArray[i]) {
            correct++;
            secret[i] = null;
            guessArray[i] = null;
        }
    }

    // Second pass: find wrong positions
    for (let i = 0; i < guessArray.length; i++) {
        if (guessArray[i] !== null) {
            const index = secret.indexOf(guessArray[i]);
            if (index !== -1) {
                wrongPosition++;
                secret[index] = null;
            }
        }
    }

    const wrong = secretCode.length - correct - wrongPosition;
    return { correct, wrongPosition, wrong };
}

function calculateScore(attempts, timeRemaining, difficulty) {
    let baseScore = 1000;
    const attemptPenalty = attempts * 100;
    const timeBonus = timeRemaining * 10;
    const difficultyBonus = difficulty === 'easy' ? 0 : difficulty === 'medium' ? 500 : 1000;

    return Math.max(0, baseScore - attemptPenalty + timeBonus + difficultyBonus);
}

module.exports = (io, socket, gameRooms) => {
    // Join Code Breaker room
    socket.on('codebreaker:join', (data) => {
        const { roomId } = data;
        const room = gameRooms[roomId];

        if (room) {
            socket.join(roomId);
            console.log(`Player joined Code Breaker room: ${roomId}`);
        }
    });

    // Start turn - code maker selects settings
    socket.on('codebreaker:start_turn', (data) => {
        const { roomId, codeType, difficulty } = data;
        const room = gameRooms[roomId];

        if (!room) return;

        const settings = DIFFICULTY_SETTINGS[difficulty];
        const secretCode = generateRandomCode(codeType, settings.codeLength);

        room.state = {
            ...room.state,
            codeType,
            difficulty,
            secretCode,
            codeLength: settings.codeLength,
            maxAttempts: settings.maxAttempts,
            attempts: [],
            attemptsRemaining: settings.maxAttempts,
            timeRemaining: settings.timeLimit,
            solvedBy: null,
            phase: 'guessing'
        };

        // Send game started event (without revealing code)
        io.to(roomId).emit('codebreaker:game_started', {
            codeType,
            difficulty,
            codeLength: settings.codeLength,
            maxAttempts: settings.maxAttempts,
            timeLimit: settings.timeLimit,
            codeMaker: room.state.currentCodeMaker
        });

        // Start timer
        startCodeBreakerTimer(io, roomId);
    });

    // Submit guess
    socket.on('codebreaker:guess', (data) => {
        const { roomId, userId, userName, guess } = data;
        const room = gameRooms[roomId];

        if (!room || room.state.phase !== 'guessing') return;

        // Don't allow code maker to guess
        if (userId === room.state.currentCodeMaker) return;

        // Calculate clue
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

        // Broadcast attempt to all players
        io.to(roomId).emit('codebreaker:attempt_made', {
            attempt,
            attemptsRemaining: room.state.attemptsRemaining
        });

        // Check if code is cracked
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
            endCodeBreakerTurn(io, roomId, 'solved');
        }
        // Check if out of attempts
        else if (room.state.attemptsRemaining <= 0) {
            endCodeBreakerTurn(io, roomId, 'failed');
        }
    });

    // Leave room
    socket.on('codebreaker:leave', (roomId) => {
        const room = gameRooms[roomId];
        if (room) {
            room.players = room.players.filter(p => p.socketId !== socket.id);
            socket.leave(roomId);

            if (room.players.length === 0) {
                delete gameRooms[roomId];
                console.log(`Empty Code Breaker room ${roomId} deleted`);
            } else {
                io.to(roomId).emit('codebreaker:player_left', {
                    players: room.players
                });
            }
        }
    });
};

function startCodeBreakerTimer(io, roomId) {
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
            endCodeBreakerTurn(io, roomId, 'timeout');
        }
    }, 1000);
}

function endCodeBreakerTurn(io, roomId, reason) {
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
            startNextCodeBreakerTurn(io, roomId);
        }
    }, 5000);
}

function startNextCodeBreakerTurn(io, roomId) {
    const room = gameRooms[roomId];
    if (!room) return;

    room.state.currentTurnIndex++;

    // Check if round is complete
    if (room.state.currentTurnIndex >= room.players.length) {
        room.state.currentRound++;

        // Check if game is over
        if (room.state.currentRound > room.config.totalRounds) {
            endCodeBreakerGame(io, roomId);
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

function endCodeBreakerGame(io, roomId) {
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
