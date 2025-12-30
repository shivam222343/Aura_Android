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
        // Build context from chat history
        const messages = [
            {
                role: 'system',
                content: `You are Eta, a helpful AI assistant in a club management chat app called Mavericks. 
                Keep responses SHORT and CONCISE (1-3 sentences max). 
                Be friendly, helpful, and remember the conversation context.
                Focus on being practical and to-the-point.
                If asked about club activities, meetings, or tasks, provide brief, actionable advice.`
            }
        ];

        // Add recent chat history for context (last 10 messages)
        const recentHistory = chatHistory.slice(-10);
        recentHistory.forEach(msg => {
            if (msg.content && !msg.deleted) {
                const role = msg.mentionAI ? 'assistant' : 'user';
                messages.push({
                    role: role,
                    content: msg.content.replace('@Eta', '').trim()
                });
            }
        });

        // Add current message
        messages.push({
            role: 'user',
            content: userMessage.replace('@Eta', '').trim()
        });

        // Call Groq API
        const completion = await groq.chat.completions.create({
            messages: messages,
            model: 'llama-3.3-70b-versatile',
            temperature: 0.7,
            max_tokens: 150, // Keep responses short
            top_p: 1,
        });

        return completion.choices[0]?.message?.content || "I'm here to help! Could you rephrase that?";
    } catch (error) {
        console.error('Groq AI Error:', error);
        return "Sorry, I'm having trouble responding right now. Please try again!";
    }
};

/**
 * @desc    Handle AI mention in message
 * @route   Called internally when @Eta is mentioned
 */
exports.handleAIMention = async (senderId, receiverId, conversationMessages, mentionedMessage) => {
    try {
        // Get AI response
        const conversationId = [senderId, receiverId].sort().join('-');
        const aiResponse = await this.getAIResponse(
            conversationId,
            mentionedMessage.content,
            conversationMessages
        );

        // Create AI message
        const aiMessage = await Message.create({
            senderId: 'AI', // Special sender ID for AI
            receiverId: senderId,
            content: aiResponse,
            type: 'text',
            isAI: true,
            replyTo: mentionedMessage._id
        });

        const populatedMessage = await Message.findById(aiMessage._id)
            .populate('replyTo');

        return populatedMessage;
    } catch (error) {
        console.error('Error handling AI mention:', error);
        return null;
    }
};
