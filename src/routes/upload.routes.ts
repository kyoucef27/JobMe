// In your router file (e.g., routes/upload.routes.ts)
import { Router } from 'express';
import { upload, uploadImage } from '../controllers/upload.controller';

const router = Router();

router.post('/', upload.single('image'), uploadImage);

export default router;