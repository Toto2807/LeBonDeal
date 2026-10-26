import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    adId: { type: String, required: true },
    buyerId: { type: String, required: true },
    sellerId: { type: String, required: true },
    participants: { type: [String], required: true },     // [buyerId, sellerId] : permet « mes conversations » en une requête
    adSnapshot: { title: String, priceCents: Number, coverUrl: String }, // copie figée : la liste s'affiche sans appeler PostgreSQL
    lastMessage: { text: String, senderId: String, at: Date },
    unread: { type: Map, of: Number, default: {} },        // { "<userId>": nombre de messages non lus }
  },
  { timestamps: true, collection: 'conversations', minimize: false }
);

export const Conversation = mongoose.model('Conversation', conversationSchema);
