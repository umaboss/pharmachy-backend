import { Router } from 'express';
import { 
  getSalesReport, 
  getInventoryReport, 
  getCustomerReport, 
  getProductPerformanceReport 
} from '../controllers/report.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Reports (Manager, Admin, SuperAdmin only)
router.get('/sales', authorize('MANAGER', 'ADMIN', 'SUPERADMIN'), getSalesReport);
router.get('/inventory', authorize('MANAGER', 'ADMIN', 'SUPERADMIN'), getInventoryReport);
router.get('/customers', authorize('MANAGER', 'ADMIN', 'SUPERADMIN'), getCustomerReport);
router.get('/products', authorize('MANAGER', 'ADMIN', 'SUPERADMIN'), getProductPerformanceReport);

export default router;
