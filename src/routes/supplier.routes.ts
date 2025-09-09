import { Router } from 'express';
import { 
  getSuppliers, 
  getSupplier, 
  createSupplier, 
  updateSupplier, 
  deleteSupplier 
} from '../controllers/supplier.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get suppliers (all roles can view)
router.get('/', getSuppliers);
router.get('/:id', getSupplier);

// Supplier management (Manager, Admin, SuperAdmin only)
router.post('/', authorize('MANAGER', 'ADMIN', 'SUPERADMIN'), createSupplier);
router.put('/:id', authorize('MANAGER', 'ADMIN', 'SUPERADMIN'), updateSupplier);
router.delete('/:id', authorize('MANAGER', 'ADMIN', 'SUPERADMIN'), deleteSupplier);

export default router;
