import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export function requireAuth(req, res, next) {
    const token = req.header('Authorization');
    console.log(token);

    if (!token) {
        return res.status(401).json({ message: "Token absent" })
    }
    const tokenClean = token.split(" ")[1];
    console.log(tokenClean)
    try {
        const verified = jwt.verify(tokenClean, config.jwtSecret);
        console.log(verified);
        req.userId = verified;
        next();
    } catch {
        throw Error("Token Invalide");
    }
}