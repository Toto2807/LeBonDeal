import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    email: { type: String, require: true, unique: true },
    passwordHash: { type: String, require: true }
},
    { timestamps: true }
)

export const User = mongoose.model('User', userSchema);