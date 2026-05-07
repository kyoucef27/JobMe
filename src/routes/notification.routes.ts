import { Router } from 'express';
import { getMyNotifications, markAllRead, markOneRead, createAnnouncement } from '../controllers/notification.controller';
import { protectRoute } from '../middleware/auth.middelware';
import { protectAdminRoute } from '../middleware/admin.middleware';

const router = Router();

// User routes
router.get('/', protectRoute, getMyNotifications);
router.post('/read-all', protectRoute, markAllRead);
router.post('/:id/read', protectRoute, markOneRead);

// Admin routes
router.post('/announce', protectAdminRoute, createAnnouncement);

export default router;
