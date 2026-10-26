import { User } from "../models/User.js";

export async function getUser(userId) {
    return await User.findById(userId)
}   