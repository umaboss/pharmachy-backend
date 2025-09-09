import { Router } from 'express';
import { 
  getCategories, 
  getCategory, 
  createCategory, 
  updateCategory, 
  deleteCategory 
} from '../controllers/category.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get categories (all roles can view)
router.get('/', getCategories);
router.get('/:id', getCategory);

// Category management (Manager, Admin, SuperAdmin only)
router.post('/', authorize('MANAGER', 'ADMIN', 'SUPERADMIN'), createCategory);
router.put('/:id', authorize('MANAGER', 'ADMIN', 'SUPERADMIN'), updateCategory);
router.delete('/:id', authorize('MANAGER', 'ADMIN', 'SUPERADMIN'), deleteCategory);

export default router;
