import { Request, Response, NextFunction, response } from "express";
import { generateToken} from "../lib/utils";
import {  User } from "../models/user.model";
import { verifyOTP } from "../lib/otp";
export const verifyOTPAndCreateAccount = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const { otp } = req.body;
    
    if (!otp) {
      return res.status(400).json({ message: "OTP is required" });
    }
    
    const pendingUserData = JSON.parse(req.cookies.pendingRegistration || '{}');
    
    if (!pendingUserData.email) {
      return res.status(400).json({ message: "Registration session expired" });
    }
    
    const email = pendingUserData.email;
    
    try {
      await verifyOTP(email, otp);
    } catch (error) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }
    
    const newuser = new User(pendingUserData);
    await newuser.save();
    
    res.clearCookie('pendingRegistration');
    
    generateToken(newuser._id.toString(), res);
    
    res.status(201).json({
      message: "User registered successfully",
      user: {
        _id: newuser._id,
        name: newuser.name,
        email: newuser.email,
        phone: newuser.phone,
        address: newuser.address,
        pfp: newuser.pfp
      }
    });
    
  } catch (error) {
    next(error);
  }
};
