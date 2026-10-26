import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    senderId: { type: String, required: true },
    type: { type: String, enum: ['text', 'offer', 'system'], default: 'text' },
    text: { type: String, maxlength: 2000 },
    offer: { amountCents: Number },                        // présent quand type = 'offer'
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'messages' }
);

export const Message = mongoose.model('Message', messageSchema);
