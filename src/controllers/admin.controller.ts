import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Joi from 'joi';

const prisma = new PrismaClient();

// Validation schemas
const createAdminSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  phone: Joi.string().required(),
  company: Joi.string().required(),
  plan: Joi.string().valid('basic', 'premium', 'enterprise').default('basic'),
  branchId: Joi.string().required(),
  password: Joi.string().min(6).required()
});

const updateAdminSchema = Joi.object({
  name: Joi.string(),
  email: Joi.string().email(),
  phone: Joi.string(),
  company: Joi.string(),
  plan: Joi.string().valid('basic', 'premium', 'enterprise'),
  isActive: Joi.boolean()
});

// Get all admins (SuperAdmin only)
export const getAdmins = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = {
      role: 'ADMIN' as const,
      ...(search && {
        OR: [
          { name: { contains: search as string, mode: 'insensitive' as const } },
          { email: { contains: search as string, mode: 'insensitive' as const } },
          { branch: { name: { contains: search as string, mode: 'insensitive' as const } } }
        ]
      })
    };

    const [admins, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        include: {
          branch: {
            select: {
              id: true,
              name: true,
              address: true,
              phone: true,
              email: true
            }
          },
          _count: {
            select: {
              sales: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where })
    ]);

    // Calculate additional stats for each admin
    const adminsWithStats = await Promise.all(
      admins.map(async (admin) => {
        // Get total sales for this admin
        const salesStats = await prisma.sale.aggregate({
          where: { userId: admin.id },
          _sum: { totalAmount: true },
          _count: { id: true }
        });

        // Get user count for this admin's branch (excluding admins and superadmins)
        const userCount = await prisma.user.count({
          where: { 
            branchId: admin.branchId, 
            isActive: true,
            role: { notIn: ['ADMIN', 'SUPERADMIN'] }
          }
        });

        // Get manager count for this admin's branch
        const managerCount = await prisma.user.count({
          where: { 
            branchId: admin.branchId, 
            isActive: true,
            role: 'MANAGER'
          }
        });

        return {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          phone: (admin as any).branch?.phone || '',
          company: (admin as any).branch?.name || '',
          address: (admin as any).branch?.address || '',
          userCount,
          managerCount,
          totalSales: salesStats._sum.totalAmount || 0,
          lastActive: admin.updatedAt.toISOString().split('T')[0],
          status: admin.isActive ? 'active' : 'inactive',
          plan: 'premium', // Default plan, can be extended later
          createdAt: admin.createdAt.toISOString().split('T')[0],
          subscriptionEnd: '2024-12-31' // Default, can be extended later
        };
      })
    );

    res.json({
      success: true,
      data: {
        admins: adminsWithStats,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get admins error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get admin by ID
export const getAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const admin = await prisma.user.findFirst({
      where: {
        id,
        role: 'ADMIN'
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            email: true
          }
        }
      }
    });

    if (!admin) {
      res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
      return;
    }

    // Get stats for this admin
    const salesStats = await prisma.sale.aggregate({
      where: { userId: admin.id },
      _sum: { totalAmount: true },
      _count: { id: true }
    });

    const userCount = await prisma.user.count({
      where: { 
        branchId: admin.branchId, 
        isActive: true,
        role: { notIn: ['ADMIN', 'SUPERADMIN'] }
      }
    });

    const managerCount = await prisma.user.count({
      where: { 
        branchId: admin.branchId, 
        isActive: true,
        role: 'MANAGER'
      }
    });

    const adminWithStats = {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      phone: admin.branch?.phone || '',
      company: admin.branch?.name || '',
      address: admin.branch?.address || '',
      userCount,
      managerCount,
      totalSales: salesStats._sum.totalAmount || 0,
      lastActive: admin.updatedAt.toISOString().split('T')[0],
      status: admin.isActive ? 'active' : 'inactive',
      plan: 'premium',
      createdAt: admin.createdAt.toISOString().split('T')[0],
      subscriptionEnd: '2024-12-31'
    };

    res.json({
      success: true,
      data: adminWithStats
    });
  } catch (error) {
    console.error('Get admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Create admin
export const createAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error } = createAdminSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
      return;
    }

    const { name, email, phone, company, plan, branchId, password } = req.body;

    // Check if admin already exists
    const existingAdmin = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { branch: { name: company } }
        ]
      }
    });

    if (existingAdmin) {
      res.status(400).json({
        success: false,
        message: 'Admin with this email or company already exists'
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

    // Generate username and hash password
    const username = email.split('@')[0] + '_admin';
    const hashedPassword = await require('bcryptjs').hash(password, 12);

    // Create admin user
    const admin = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        name,
        role: 'ADMIN',
        branchId,
        isActive: true
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            email: true
          }
        }
      }
    });

    // Update branch details
    await prisma.branch.update({
      where: { id: branchId },
      data: {
        name: company,
        phone,
        email
      }
    });

    const adminWithStats = {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      phone: admin.branch?.phone || '',
      company: admin.branch?.name || '',
      address: admin.branch?.address || '',
      userCount: 0,
      managerCount: 0,
      totalSales: 0,
      lastActive: admin.updatedAt.toISOString().split('T')[0],
      status: admin.isActive ? 'active' : 'inactive',
      plan,
      createdAt: admin.createdAt.toISOString().split('T')[0],
      subscriptionEnd: '2024-12-31'
    };

    res.status(201).json({
      success: true,
      data: adminWithStats,
      message: 'Admin created successfully'
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update admin
export const updateAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { error } = updateAdminSchema.validate(req.body);
    
    if (error) {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
      return;
    }

    const updateData = req.body;

    // Check if admin exists
    const existingAdmin = await prisma.user.findFirst({
      where: { id, role: 'ADMIN' }
    });

    if (!existingAdmin) {
      res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
      return;
    }

    // Update admin
    const admin = await prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            email: true
          }
        }
      }
    });

    // Update branch if company name changed
    if (updateData.company) {
      await prisma.branch.update({
        where: { id: admin.branchId },
        data: {
          name: updateData.company,
          phone: updateData.phone || admin.branch.phone,
          email: updateData.email || admin.branch.email
        }
      });
    }

    res.json({
      success: true,
      data: admin,
      message: 'Admin updated successfully'
    });
  } catch (error) {
    console.error('Update admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete admin
export const deleteAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if admin exists
    const existingAdmin = await prisma.user.findFirst({
      where: { id, role: 'ADMIN' }
    });

    if (!existingAdmin) {
      res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
      return;
    }

    // Soft delete (deactivate)
    await prisma.user.update({
      where: { id },
      data: { isActive: false }
    });

    res.json({
      success: true,
      message: 'Admin deactivated successfully'
    });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get admin users
export const getAdminUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { adminId } = req.params;

    // Check if admin exists
    const admin = await prisma.user.findFirst({
      where: { id: adminId, role: 'ADMIN' }
    });

    if (!admin) {
      res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
      return;
    }

    // Get all users for this admin's branch
    const users = await prisma.user.findMany({
      where: {
        branchId: admin.branchId,
        role: { notIn: ['ADMIN', 'SUPERADMIN'] } // Exclude admins and superadmins
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        role: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const usersWithStats = users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      adminId: adminId,
      lastActive: user.updatedAt.toISOString().split('T')[0],
      status: user.isActive ? 'active' : 'inactive',
      role: user.role
    }));

    res.json({
      success: true,
      data: usersWithStats
    });
  } catch (error) {
    console.error('Get admin users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get superadmin dashboard stats
export const getSuperAdminStats = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get total admins
    const totalAdmins = await prisma.user.count({
      where: { role: 'ADMIN', isActive: true }
    });

    // Get total users
    const totalUsers = await prisma.user.count({
      where: { 
        role: { notIn: ['ADMIN', 'SUPERADMIN'] },
        isActive: true 
      }
    });

    // Get total sales
    const salesStats = await prisma.sale.aggregate({
      _sum: { totalAmount: true },
      _count: { id: true }
    });

    // Get active admins
    const activeAdmins = await prisma.user.count({
      where: { 
        role: 'ADMIN', 
        isActive: true 
      }
    });

    // Get recent admins
    const recentAdmins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      take: 3,
      include: {
        branch: {
          select: {
            name: true
          }
        },
        _count: {
          select: {
            sales: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const recentAdminsWithStats = await Promise.all(
      recentAdmins.map(async (admin) => {
        const salesStats = await prisma.sale.aggregate({
          where: { userId: admin.id },
          _sum: { totalAmount: true }
        });

        const userCount = await prisma.user.count({
          where: { branchId: admin.branchId, isActive: true }
        });

        return {
          id: admin.id,
          name: admin.name,
          company: admin.branch.name,
          userCount,
          totalSales: salesStats._sum.totalAmount || 0
        };
      })
    );

    res.json({
      success: true,
      data: {
        totalAdmins,
        totalUsers,
        totalSales: salesStats._sum.totalAmount || 0,
        activeAdmins,
        recentAdmins: recentAdminsWithStats
      }
    });
  } catch (error) {
    console.error('Get superadmin stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
