import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { LoginData, CreateUserData } from '../models/user.model';
import { validate } from '../middleware/validation.middleware';
import Joi from 'joi';

const prisma = new PrismaClient();

// Validation schemas
const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
  branch: Joi.string().required()
});

const registerSchema = Joi.object({
  username: Joi.string().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().required(),
  role: Joi.string().valid('PRODUCT_OWNER', 'SUPER_ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER').required(),
  branchId: Joi.string().required()
});

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🔍 Login attempt - Request body:', req.body);
    
    const { error } = loginSchema.validate(req.body);
    if (error) {
      console.log('❌ Validation error:', error.details);
      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
      return;
    }

    const { username, password, branch }: LoginData = req.body;
    console.log('🔍 Login attempt - Username:', username, 'Branch:', branch);

    // Find user with branch
    const user = await prisma.user.findFirst({
      where: {
        username,
        isActive: true,
        branch: {
          name: branch,
          isActive: true
        }
      },
      include: {
        branch: true
      }
    });

    if (!user) {
      console.log('❌ User not found for username:', username, 'branch:', branch);
      res.status(401).json({
        success: false,
        message: 'Invalid credentials or branch selection'
      });
      return;
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log('🔐 Password check - Valid:', isPasswordValid);
    if (!isPasswordValid) {
      console.log('❌ Invalid password for user:', username);
      res.status(401).json({
        success: false,
        message: 'Invalid credentials or branch selection'
      });
      return;
    }

    // Generate JWT token
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined');
    }
    
    const token = (jwt.sign as any)(
      { 
        userId: user.id,
        username: user.username,
        role: user.role,
        branchId: user.branchId
      },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          branch: {
            id: user.branch.id,
            name: user.branch.name
          }
        },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error } = registerSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
      return;
    }

    const { username, email, password, name, role, branchId }: CreateUserData = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          { email }
        ]
      }
    });

    if (existingUser) {
      res.status(400).json({
        success: false,
        message: 'User with this username or email already exists'
      });
      return;
    }

    // Check if branch exists
    const branch = await prisma.branch.findUnique({
      where: { id: branchId }
    });

    if (!branch) {
      res.status(400).json({
        success: false,
        message: 'Branch not found'
      });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        name,
        role,
        branchId
      },
      include: {
        branch: true
      }
    });

    // Generate JWT token
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined');
    }
    
    const token = (jwt.sign as any)(
      { 
        userId: user.id,
        username: user.username,
        role: user.role,
        branchId: user.branchId
      },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          branch: {
            id: user.branch.id,
            name: user.branch.name
          }
        },
        token
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            address: true
          }
        }
      }
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};