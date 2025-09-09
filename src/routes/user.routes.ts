import { Router } from 'express';
import { 
  getUsers, 
  getUser, 
  createUser, 
  updateUser, 
  deleteUser 
} from '../controllers/user.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get users (Manager, Admin, SuperAdmin only)
router.get('/', authorize('MANAGER', 'ADMIN', 'SUPERADMIN'), getUsers);
router.get('/:id', authorize('MANAGER', 'ADMIN', 'SUPERADMIN'), getUser);

// User management (Admin, SuperAdmin only)
router.post('/', authorize('ADMIN', 'SUPERADMIN'), createUser);
router.put('/:id', authorize('ADMIN', 'SUPERADMIN'), updateUser);
router.delete('/:id', authorize('ADMIN', 'SUPERADMIN'), deleteUser);

export default router;
