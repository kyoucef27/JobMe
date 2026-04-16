import { Request, Response, NextFunction } from "express";
import { generateToken } from "../lib/utils";
import { User } from "../models/user.model";
import { verifyOTP } from "../lib/otp";
import { PendingUser } from "../models/sessiondata.model";
import { verifyFaceWithInsightService } from "../services/faceVerification.service";

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

    const pendingUserData = req.session.pendingUser;

    if (!pendingUserData || !pendingUserData.email) {
      return res.status(400).json({ message: "Registration session expired" });
    }

    const email = pendingUserData.email;

    try {
      await verifyOTP(email, otp);
    } catch (error) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    const newUser = new User(pendingUserData);
    await newUser.save();

    req.session.pendingUser = undefined;

    generateToken(newUser._id.toString(), res);

    return res.status(201).json({
      message: "User registered successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const verifyIdFace = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?._id?.toString();
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const files = req.files as
      | { [fieldname: string]: Express.Multer.File[] }
      | undefined;

    const idImage = files?.idImage?.[0];
    const selfie = files?.selfie?.[0];

    if (!idImage || !selfie) {
      return res.status(400).json({
        message: "Both idImage and selfie images are required",
      });
    }

    const result = await verifyFaceWithInsightService(idImage, selfie);
    const verificationThreshold = 0.59;
    const idVerified = result.similarity > verificationThreshold;

    if (idVerified) {
      await User.findByIdAndUpdate(userId, { idVerified: true });
    }

    return res.status(200).json({
      match: idVerified,         // consistent with local threshold
      similarity: result.similarity,
      idVerified,
    });
  } catch (error) {
    next(error);
  }
};