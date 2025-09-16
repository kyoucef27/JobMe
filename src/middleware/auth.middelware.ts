import jwt from "jsonwebtoken";
import { IUser, User } from "../models/user.model";
import { Request, Response, NextFunction, response } from "express";
import { DecodedToken } from "../models/utils.model";


export const protectRoute = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.cookies.jwt;
    if (!token) {
      return res
        .status(401)
        .json({ message: "Unauthorized - No Token Provided" });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as DecodedToken;
    if (!decoded) {
      return res.status(401).json({ message: "Unauthorized - Invalid Token " });
    }
    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    req.user = user;
    next();

  } catch (error) {
    return res.status(401).json({ message: "Error in protectRoute- middelware " });
  }
};
