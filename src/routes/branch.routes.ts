import { Router } from 'express';
import { 
  getBranches, 
  getBranch, 
  createBranch, 
  updateBranch, 
  deleteBranch 
} from '../controllers/branch.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Get branches (public for login form)
router.get('/', getBranches);
router.get('/:id', getBranch);

// All other routes require authentication
router.use(authenticate);

// Branch management (Admin, SuperAdmin only)
router.post('/', authorize('ADMIN', 'SUPERADMIN'), createBranch);
router.put('/:id', authorize('ADMIN', 'SUPERADMIN'), updateBranch);
router.delete('/:id', authorize('ADMIN', 'SUPERADMIN'), deleteBranch);

export default router;
