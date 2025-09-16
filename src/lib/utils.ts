import jwt from "jsonwebtoken";
import { Response } from "express";
export const generateToken = (userId: string, res: Response)=>{

const token = jwt.sign({userId}, process.env.JWT_SECRET!, {
    expiresIn:"7d"
})
res.cookie("jwt",token , {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000 
})

return token ;
}

