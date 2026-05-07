import { Router } from "express";
import { LogIn, LogOut, SignIn, UpdateProfile, GetMe, GetDetails, BecomeASeller, SaveGig, UnsaveGig, GetSavedGigs } from "../controllers/auth.controller";
import { GetSellerDashboard, SubmitFeedback, GetEarningsData } from "../controllers/dashboard.controller";
import { protectRoute } from "../middleware/auth.middelware";
import { upload } from '../controllers/upload.controller';
const router = Router();

router.post("/signin", upload.single("pfp"), SignIn);
router.post("/login", LogIn);
router.post("/logout", LogOut);
router.put("/update-profile", protectRoute, upload.single("pfp"), UpdateProfile)
// New endpoint
router.get("/me", protectRoute, GetMe);
// New endpoint
router.get("/get-details", protectRoute, GetDetails);
// Dashboard endpoint
router.get("/seller-dashboard", protectRoute, GetSellerDashboard);
// Feedback endpoint
router.post("/feedback", protectRoute, SubmitFeedback);
// Earnings endpoint
router.get("/earnings", protectRoute, GetEarningsData);
// Become a seller endpoint
router.post("/become-seller", protectRoute, BecomeASeller);

// Saved Gigs
router.post("/saved/:gigId", protectRoute, SaveGig);
router.delete("/saved/:gigId", protectRoute, UnsaveGig);
router.get("/saved", protectRoute, GetSavedGigs);

export default router;
