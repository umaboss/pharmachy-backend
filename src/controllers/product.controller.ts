


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
  requiresPrescription: Joi.boolean().default(false),
  isActive: Joi.boolean().default(true)
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

    console.log('=== GET PRODUCTS DEBUG ===');
    console.log('Query parameters:', { page, limit, search, category, branchId, lowStock });
    console.log('BranchId from query:', branchId);
    console.log('BranchId type:', typeof branchId);

    if (branchId) {
      where.branchId = branchId;
      console.log('Filtering by branchId:', branchId);
    } else {
      console.log('No branchId filter applied');
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

    console.log('Final where clause:', JSON.stringify(where, null, 2));

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

    console.log('Query results:', {
      productsFound: products.length,
      totalCount: total,
      productNames: products.map(p => p.name)
    });

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
    console.log('=== CREATE PRODUCT REQUEST ===');
    console.log('Request body:', req.body);
    console.log('Request headers:', req.headers);
    
    const { error } = createProductSchema.validate(req.body);
    if (error) {
      console.log('Validation errors:', error.details.map(detail => detail.message));
      console.log('Validation error details:', error.details);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const productData: CreateProductData = req.body;

    // Handle default supplier case
    if (productData.supplierId === 'default-supplier') {
      // Check if default supplier exists, if not create it
      let defaultSupplier = await prisma.supplier.findFirst({
        where: { name: 'Default Supplier' }
      });

      if (!defaultSupplier) {
        defaultSupplier = await prisma.supplier.create({
          data: {
            name: 'Default Supplier',
            contactPerson: 'System Generated',
            phone: '+92 300 0000000',
            email: 'system@default.com',
            address: 'Auto-created for imports',
            isActive: true
          }
        });
      }
      productData.supplierId = defaultSupplier.id;
    }

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

    // Check if product has related records
    const [saleItems, stockMovements] = await Promise.all([
      prisma.saleItem.count({ where: { productId: id } }),
      prisma.stockMovement.count({ where: { productId: id } })
    ]);

    console.log(`Product ${product.name} has ${saleItems} sale items and ${stockMovements} stock movements`);

    // If product has related records, use soft delete
    if (saleItems > 0 || stockMovements > 0) {
      console.log(`Product ${product.name} has related records, using soft delete`);
      
      await prisma.product.update({
        where: { id },
        data: { isActive: false }
      });

      return res.json({
        success: true,
        message: 'Product deactivated successfully (has related records)'
      });
    }

    // If no related records, delete related data first, then the product
    await prisma.$transaction(async (tx) => {
      // Delete stock movements
      await tx.stockMovement.deleteMany({
        where: { productId: id }
      });

      // Delete sale items
      await tx.saleItem.deleteMany({
        where: { productId: id }
      });

      // Delete the product
      await tx.product.delete({
        where: { id }
      });
    });

    console.log(`Product ${product.name} completely deleted from database`);

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

// Bulk import products - Fixed TypeScript errors
export const bulkImportProducts = async (req: Request, res: Response) => {
  try {
    console.log('=== BULK IMPORT REQUEST RECEIVED ===');
    console.log('Request body:', req.body);
    console.log('Request headers:', req.headers);
    console.log('User from request:', (req as any).user);
    
    const { products } = req.body;
    const userId = (req as any).user?.id;

    console.log('Bulk import request received:', { 
      productCount: products?.length || 0, 
      userId: userId 
    });

    if (!products || !Array.isArray(products) || products.length === 0) {
      console.log('No products provided for bulk import');
      return res.status(400).json({
        success: false,
        message: 'Products array is required and must not be empty'
      });
    }

    const results = {
      successful: [] as any[],
      failed: [] as Array<{ product: any; error: string }>,
      total: products.length
    };

    // Process each product
    for (const productData of products) {
      try {
        console.log('Processing product:', productData.name);
        
        // Validate required fields
        if (!productData.name || !productData.categoryId || !productData.sellingPrice || !productData.stock) {
          const error = `Missing required fields: name=${!!productData.name}, categoryId=${!!productData.categoryId}, sellingPrice=${!!productData.sellingPrice}, stock=${!!productData.stock}`;
          console.log(`Validation failed for ${productData.name}:`, error);
          results.failed.push({
            product: productData,
            error: error
          });
          continue;
        }

        // Validate categoryId
        const category = await prisma.category.findUnique({
          where: { id: productData.categoryId }
        });

        if (!category) {
          const error = `Category with ID ${productData.categoryId} does not exist`;
          console.log(`Validation failed for ${productData.name}:`, error);
          results.failed.push({
            product: productData,
            error: error
          });
          continue;
        }

        // Handle default supplier case
        if (productData.supplierId === 'default-supplier') {
          // Check if default supplier exists, if not create it
          let defaultSupplier = await prisma.supplier.findFirst({
            where: { name: 'Default Supplier' }
          });

          if (!defaultSupplier) {
            defaultSupplier = await prisma.supplier.create({
              data: {
                name: 'Default Supplier',
                contactPerson: 'System Generated',
                phone: '+92 300 0000000',
                email: 'system@default.com',
                address: 'Auto-created for imports',
                isActive: true
              }
            });
          }
          productData.supplierId = defaultSupplier.id;
        }

        // Validate branchId
        if (!productData.branchId) {
          const error = `Missing required field: branchId`;
          console.log(`Validation failed for ${productData.name}:`, error);
          results.failed.push({
            product: productData,
            error: error
          });
          continue;
        }

        // Check if branch exists
        const branch = await prisma.branch.findUnique({
          where: { id: productData.branchId }
        });

        if (!branch) {
          const error = `Branch with ID ${productData.branchId} does not exist`;
          console.log(`Validation failed for ${productData.name}:`, error);
          results.failed.push({
            product: productData,
            error: error
          });
          continue;
        }

        // Check if product with same name already exists
        const existingProduct = await prisma.product.findFirst({
          where: {
            name: productData.name,
            branchId: productData.branchId
          }
        });

        if (existingProduct) {
          console.log(`Product ${productData.name} already exists, updating stock instead of skipping...`);
          
          // Instead of skipping, update the existing product's stock
          try {
            const updatedProduct = await prisma.product.update({
              where: { id: existingProduct.id },
              data: {
                stock: existingProduct.stock + productData.stock, // Add to existing stock
                costPrice: productData.costPrice, // Update cost price
                sellingPrice: productData.sellingPrice, // Update selling price
                description: productData.description || existingProduct.description,
                unitType: productData.unitType || existingProduct.unitType,
                unitsPerPack: productData.unitsPerPack || existingProduct.unitsPerPack,
                barcode: productData.barcode || existingProduct.barcode,
                requiresPrescription: productData.requiresPrescription !== undefined ? productData.requiresPrescription : existingProduct.requiresPrescription
              },
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

            // Create stock movement record for the addition
            await prisma.stockMovement.create({
              data: {
                productId: existingProduct.id,
                type: 'IN',
                quantity: productData.stock,
                reason: 'Bulk Import - Stock Update',
                reference: 'BULK_IMPORT_UPDATE'
              }
            });

            results.successful.push(updatedProduct);
            console.log(`Updated existing product: ${productData.name}`);
            continue;
          } catch (updateError) {
            console.error(`Error updating existing product ${productData.name}:`, updateError);
            results.failed.push({
              product: productData,
              error: `Failed to update existing product: ${updateError instanceof Error ? updateError.message : 'Unknown error'}`
            });
            continue;
          }
        }

        // Check barcode uniqueness if provided
        if (productData.barcode && productData.barcode.trim()) {
          const existingBarcode = await prisma.product.findFirst({
            where: {
              barcode: productData.barcode
            }
          });

          if (existingBarcode) {
            // Skip barcode if it exists
            delete productData.barcode;
          }
        }

        // Create product
        console.log(`Creating product ${productData.name} with data:`, {
          name: productData.name,
          categoryId: productData.categoryId,
          supplierId: productData.supplierId,
          branchId: productData.branchId,
          sellingPrice: productData.sellingPrice,
          stock: productData.stock
        });
        console.log(`BranchId for product ${productData.name}:`, productData.branchId);
        console.log(`BranchId type:`, typeof productData.branchId);
        
        const product = await prisma.product.create({
          data: {
            name: productData.name,
            description: productData.description || '',
            categoryId: productData.categoryId,
            supplierId: productData.supplierId,
            branchId: productData.branchId,
            costPrice: productData.costPrice || 0,
            sellingPrice: productData.sellingPrice,
            stock: productData.stock,
            minStock: productData.minStock || 10,
            maxStock: productData.maxStock || null,
            unitType: productData.unitType || 'tablets',
            unitsPerPack: productData.unitsPerPack || 10,
            barcode: productData.barcode || null,
            requiresPrescription: productData.requiresPrescription || false,
            isActive: true
          },
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

        results.successful.push(product);

        // Create stock movement record
        await prisma.stockMovement.create({
          data: {
            productId: product.id,
            type: 'IN',
            quantity: productData.stock,
            reason: 'Bulk Import',
            reference: 'BULK_IMPORT'
          }
        });

      } catch (error: any) {
        console.error(`Error processing product ${productData.name}:`, error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          meta: error.meta
        });
        
        let errorMessage = error.message || 'Unknown error';
        
        // Handle specific Prisma constraint errors
        if (error.code === 'P2002') {
          if (error.meta?.target?.includes('barcode')) {
            errorMessage = `Barcode '${productData.barcode}' already exists for another product`;
          } else if (error.meta?.target?.includes('name')) {
            errorMessage = `Product name '${productData.name}' already exists in this branch`;
          } else {
            errorMessage = `Duplicate entry: ${error.meta?.target?.join(', ')} already exists`;
          }
        } else if (error.code === 'P2003') {
          errorMessage = `Invalid reference: ${error.meta?.field_name} does not exist`;
        } else if (error.code === 'P2025') {
          errorMessage = `Record not found: ${error.meta?.cause}`;
        }
        
        results.failed.push({
          product: productData,
          error: errorMessage
        });
      }
    }

    const skippedCount = results.failed.filter(f => f.error.includes('already exists')).length;
    const actualFailedCount = results.failed.length - skippedCount;

    console.log('Bulk import completed:', {
      total: results.total,
      successful: results.successful.length,
      skipped: skippedCount,
      failed: actualFailedCount
    });

    const responseData = {
      success: true,
      data: {
        successful: results.successful,
        failed: results.failed,
        total: results.total,
        successCount: results.successful.length,
        skippedCount: skippedCount,
        failureCount: actualFailedCount
      }
    };

    console.log('=== SENDING RESPONSE ===');
    console.log('Response data:', responseData);

    return res.json(responseData);

  } catch (error) {
    console.error('Bulk import error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get all products including inactive ones - for debugging
export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
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
    });

    return res.json({
      success: true,
      data: {
        products,
        total: products.length
      }
    });
  } catch (error) {
    console.error('Get all products error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Activate all products - temporary fix
export const activateAllProducts = async (req: Request, res: Response) => {
  try {
    const result = await prisma.product.updateMany({
      where: {},
      data: {
        isActive: true
      }
    });

    console.log(`Activated ${result.count} products`);

    return res.json({
      success: true,
      message: `Activated ${result.count} products`,
      data: { count: result.count }
    });
  } catch (error) {
    console.error('Activate products error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};