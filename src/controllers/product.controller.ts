


import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { CreateProductData, UpdateProductData, StockMovementData } from '../models/product.model';
import { validate } from '../middleware/validation.middleware';
import Joi from 'joi';

const prisma = new PrismaClient();

// Validation schemas
const createProductSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow(''),
  categoryId: Joi.string().required(),
  supplierId: Joi.string().required(),
  branchId: Joi.string().required(),
  costPrice: Joi.number().positive().required(),
  sellingPrice: Joi.number().positive().required(),
  stock: Joi.number().min(0).required(),
  minStock: Joi.number().min(0).required(),
  maxStock: Joi.number().min(0).allow(null),
  unitType: Joi.string().required(),
  unitsPerPack: Joi.number().min(1).required(),
  barcode: Joi.string().allow(''),
  requiresPrescription: Joi.boolean().default(false)
});

const updateProductSchema = Joi.object({
  name: Joi.string(),
  description: Joi.string().allow(''),
  categoryId: Joi.string(),
  supplierId: Joi.string(),
  costPrice: Joi.number().positive(),
  sellingPrice: Joi.number().positive(),
  stock: Joi.number().min(0),
  minStock: Joi.number().min(0),
  maxStock: Joi.number().min(0).allow(null),
  unitType: Joi.string(),
  unitsPerPack: Joi.number().min(1),
  barcode: Joi.string().allow(''),
  requiresPrescription: Joi.boolean(),
  isActive: Joi.boolean()
});

export const getProducts = async (req: Request, res: Response) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      category = '', 
      branchId = '',
      lowStock = false 
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Build where clause
    const where: any = {
      isActive: true
    };

    if (branchId) {
      where.branchId = branchId;
    }

    if (category) {
      where.categoryId = category;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (lowStock === 'true') {
      where.stock = { lte: prisma.product.fields.minStock };
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take,
        include: {
          category: true,
          supplier: true,
          branch: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.product.count({ where })
    ]);

    return res.json({
      success: true,
      data: {
        products,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        supplier: true,
        branch: {
          select: {
            id: true,
            name: true
          }
        },
        stockMovements: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    return res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Get product error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const { error } = createProductSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const productData: CreateProductData = req.body;

    // Check if barcode already exists
    if (productData.barcode) {
      const existingProduct = await prisma.product.findUnique({
        where: { barcode: productData.barcode }
      });

      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: 'Product with this barcode already exists'
        });
      }
    }

    const product = await prisma.product.create({
      data: productData,
      include: {
        category: true,
        supplier: true,
        branch: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // Create initial stock movement
    await prisma.stockMovement.create({
      data: {
        productId: product.id,
        type: 'IN',
        quantity: productData.stock,
        reason: 'Initial stock',
        createdBy: (req as any).user?.id
      }
    });

    return res.status(201).json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Create product error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = updateProductSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const updateData: UpdateProductData = req.body;

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id }
    });

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if barcode already exists (if being updated)
    if (updateData.barcode && updateData.barcode !== existingProduct.barcode) {
      const barcodeExists = await prisma.product.findUnique({
        where: { barcode: updateData.barcode }
      });

      if (barcodeExists) {
        return res.status(400).json({
          success: false,
          message: 'Product with this barcode already exists'
        });
      }
    }

    const product = await prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
        supplier: true,
        branch: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Update product error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Soft delete
    await prisma.product.update({
      where: { id },
      data: { isActive: false }
    });

    return res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const updateStock = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type, quantity, reason, reference }: StockMovementData = req.body;

    if (!type || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Type and quantity are required'
      });
    }

    const product = await prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Calculate new stock
    let newStock = product.stock;
    if (type === 'IN') {
      newStock += quantity;
    } else if (type === 'OUT') {
      newStock -= quantity;
      if (newStock < 0) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient stock'
        });
      }
    } else if (type === 'ADJUSTMENT') {
      newStock = quantity;
    }

    // Update product stock
    const updatedProduct = await prisma.product.update({
      where: { id },
      data: { stock: newStock },
      include: {
        category: true,
        supplier: true,
        branch: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // Create stock movement record
    await prisma.stockMovement.create({
      data: {
        productId: id,
        type,
        quantity,
        reason,
        reference,
        createdBy: (req as any).user?.id
      }
    });

    return res.json({
      success: true,
      data: updatedProduct
    });
  } catch (error) {
    console.error('Update stock error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};