import { Router } from 'express';
import { 
  getProducts, 
  getProduct, 
  createProduct, 
  updateProduct, 
  deleteProduct, 
  updateStock 
} from '../controllers/product.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get products (all roles can view)
router.get('/', getProducts);
router.get('/:id', getProduct);

// Product management (Manager, Admin, SuperAdmin only)
router.post('/', authorize('MANAGER', 'ADMIN', 'SUPERADMIN'), createProduct);
router.put('/:id', authorize('MANAGER', 'ADMIN', 'SUPERADMIN'), updateProduct);
router.delete('/:id', authorize('MANAGER', 'ADMIN', 'SUPERADMIN'), deleteProduct);

// Stock management (Manager, Admin, SuperAdmin only)
router.patch('/:id/stock', authorize('MANAGER', 'ADMIN', 'SUPERADMIN'), updateStock);

export default router;
