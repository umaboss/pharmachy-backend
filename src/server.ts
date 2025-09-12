import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Import routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import branchRoutes from './routes/branch.routes';
import productRoutes from './routes/product.routes';
import customerRoutes from './routes/customer.routes';
import saleRoutes from './routes/sale.routes';
import reportRoutes from './routes/report.routes';
import dashboardRoutes from './routes/dashboard.routes';
import adminRoutes from './routes/admin.routes';
import categoryRoutes from './routes/category.routes';
import supplierRoutes from './routes/supplier.routes';
import employeeRoutes from './routes/employee.routes';
import attendanceRoutes from './routes/attendance.routes';
import shiftRoutes from './routes/shift.routes';
import commissionRoutes from './routes/commission.routes';
import roleRoutes from './routes/role.routes';

// Import middleware
import { errorHandler } from './middleware/error.middleware';
import { notFound } from './middleware/notFound.middleware';

// Load environment variables
dotenv.config();

const app = express();
const prisma = new PrismaClient();

// Database connection test function
async function testDatabaseConnection() {
  try {
    console.log('='.repeat(60));
    console.log('🔍 CHECKING DATABASE CONNECTION STATUS');
    console.log('='.repeat(60));
    console.log('📊 Database URL:', process.env.DATABASE_URL);
    console.log('⏳ Attempting to connect...');
    
    await prisma.$connect();
    
    // Test a simple query
    const result = await prisma.$queryRaw`SELECT NOW() as current_time, current_database() as db_name` as any[];
    
    console.log('='.repeat(60));
    console.log('✅ DATABASE CONNECTION: SUCCESSFUL');
    console.log('='.repeat(60));
    console.log('📋 Database Name:', result[0].db_name);
    console.log('🕐 Connection Time:', result[0].current_time);
    console.log('🔗 Status: CONNECTED');
    console.log('='.repeat(60));
    
    return true;
  } catch (error: any) {
    console.log('='.repeat(60));
    console.log('❌ DATABASE CONNECTION: FAILED');
    console.log('='.repeat(60));
    console.log('🚨 Error:', error.message);
    console.log('🔗 Status: NOT CONNECTED');
    console.log('='.repeat(60));
    
    return false;
  }
}

// Security middleware
app.use(helmet());
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'http://localhost:8080',
      'http://localhost:3000',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/roles', roleRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

const PORT = process.env.PORT || 5000;

// Start server with database connection check
async function startServer() {
  // Test database connection first
  const dbConnected = await testDatabaseConnection();
  
  if (!dbConnected) {
    console.log('⚠️  Server starting with database connection issues...');
    console.log('💡 Please check your database configuration');
  }
  
  app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🚀 MEDIBILL PULSE BACKEND SERVER STARTED');
    console.log('='.repeat(60));
    console.log(`🌐 Server running on port: ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`📋 API Base URL: http://localhost:${PORT}/api`);
    console.log('='.repeat(60));
  });
}

startServer();

export default app;
