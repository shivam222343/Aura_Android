const Groq = require('groq-sdk');
const Message = require('../models/Message');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

/**
 * @desc    Process AI message with context
 * @param   {String} conversationId - Unique conversation ID
 * @param   {String} userMessage - User's message
 * @param   {Array} chatHistory - Previous messages for context
 * @returns {String} AI response
 */
exports.getAIResponse = async (conversationId, userMessage, chatHistory = []) => {
    try {
        const apiKey = process.env.GROQ_API_KEY;

        if (!apiKey) {
            console.error('[AI] GROQ_API_KEY missing');
            return "I'm currently offline (Missing API Key).";
        }

        console.log(`[AI] Generating response for: "${userMessage?.substring(0, 50)}..."`);

        const messages = [
            {
                role: 'system',
                content: `You are Eta, the official AI assistant for the Mavericks club management platform.
                
                YOUR GUIDELINES:
                1. Context: You are in a chat with club members (students/alumni).
                2. Style: Friendly, professional, and helpful.
                3. Length: CRITICAL! Keep responses extremely SHORT (1-2 sentences). Never exceed 50 words.
                4. Content: Assist with club coordination, tasks, meetings, or general queries.
                5. Identity: You are Eta, not an LLM. Don't mention you are an AI unless asked.`
            }
        ];

        // Add recent chat history for context (last 10 messages)
        const recentHistory = chatHistory.slice(-10);
        recentHistory.forEach(msg => {
            if (msg.content && !msg.deleted) {
                // Check if message is from AI (either isAI flag or special senderId)
                const isAI = msg.isAI || msg.senderId?.toString() === '000000000000000000000000';
                messages.push({
                    role: isAI ? 'assistant' : 'user',
                    content: msg.content.replace(/@Eta/i, '').trim()
                });
            }
        });

        // Add current message
        messages.push({
            role: 'user',
            content: userMessage.replace(/@Eta/i, '').trim()
        });

        const completion = await groq.chat.completions.create({
            messages: messages,
            model: 'llama-3.3-70b-versatile',
            temperature: 0.6,
            max_tokens: 100,
            top_p: 0.9,
        });

        let responseText = completion.choices[0]?.message?.content?.trim();

        // Final length safety check
        if (responseText && responseText.length > 300) {
            responseText = responseText.substring(0, 297) + "...";
        }

        return responseText || "I'm here to help! What's on your mind?";
    } catch (error) {
        console.error('[AI] Groq Error:', error.message);
        return "I'm having a bit of trouble connecting to my brain. Try again in a second!";
    }
};

/**
 * @desc    Handle AI mention in Private Message
 */
exports.handleAIMention = async (senderId, receiverId, conversationMessages, mentionedMessage) => {
    try {
        console.log(`[AI] Private Mention: ${senderId} -> AI`);

        const conversationId = [senderId.toString(), receiverId.toString()].sort().join('-');
        const aiResponse = await exports.getAIResponse(
            conversationId,
            mentionedMessage.content,
            conversationMessages
        );

        if (!aiResponse) return null;

        const aiMessage = await Message.create({
            senderId: '000000000000000000000000',
            receiverId: senderId,
            conversationId: conversationId,
            content: aiResponse,
            type: 'text',
            isAI: true,
            replyTo: mentionedMessage._id
        });

        return await Message.findById(aiMessage._id).populate('replyTo');
    } catch (error) {
        console.error('[AI] Private Hint Error:', error);
        return null;
    }
};

/**
 * @desc    Handle AI mention in Group Chat
 */
exports.handleGroupAIMention = async (clubId, groupChat, mentionedMessage) => {
    try {
        console.log(`[AI] Group Mention in Club: ${clubId}`);

        // Get recent messages for context
        const lastMessages = groupChat.messages.slice(-15);

        const aiResponse = await exports.getAIResponse(
            `group-${clubId}`,
            mentionedMessage.content,
            lastMessages
        );

        if (!aiResponse) return null;

        // In GroupChat, messages are subdocuments
        const aiMessage = {
            senderId: '000000000000000000000000',
            content: aiResponse,
            type: 'text',
            isAI: true,
            replyTo: mentionedMessage._id,
            createdAt: new Date()
        };

        groupChat.messages.push(aiMessage);
        groupChat.lastMessage = {
            senderId: '000000000000000000000000',
            content: aiResponse,
            createdAt: new Date()
        };

        await groupChat.save();

        const savedMsg = groupChat.messages[groupChat.messages.length - 1];

        return {
            ...savedMsg.toObject(),
            senderId: {
                _id: '000000000000000000000000',
                displayName: 'Eta (AI)',
                profilePicture: null
            }
        };
    } catch (error) {
        console.error('[AI] Group Hint Error:', error);
        return null;
    }
};
