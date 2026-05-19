import { Request, Response, NextFunction } from "express";
import { getRecommendationsForBuyer } from "../services/recommendation.service";

/**
 * GET /api/recommendations
 * Returns personalized gig recommendations for the authenticated buyer.
 * Protected — requires valid JWT cookie.
 */
export const getRecommendations = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const buyerId = req.user?._id;
    if (!buyerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { gigs, source } = await getRecommendationsForBuyer(buyerId.toString());

    return res.status(200).json({
      gigs,
      source, // "personalized" | "interests" | "trending"
      count: gigs.length,
    });
  } catch (error) {
    next(error);
  }
};
