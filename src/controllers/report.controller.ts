import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getSalesReport = async (req: Request, res: Response) => {
  try {
    const { 
      startDate = '', 
      endDate = '', 
      branchId = '',
      groupBy = 'day' 
    } = req.query;

    console.log('Sales report request:', { startDate, endDate, branchId, groupBy });

    const where: any = {};

    if (branchId) {
      where.branchId = branchId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        // Add 23:59:59 to end date to include the entire day
        const endDateWithTime = new Date(endDate as string);
        endDateWithTime.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDateWithTime;
      }
    } else {
      // If no date range provided, show all sales for debugging
      console.log('No date range provided, showing all sales');
    }

    console.log('Sales report where clause:', where);

    // Get sales summary
    const salesSummary = await prisma.sale.aggregate({
      where,
      _sum: {
        totalAmount: true,
        subtotal: true,
        taxAmount: true,
        discountAmount: true
      },
      _count: {
        id: true
      }
    });

    console.log('Sales summary result:', salesSummary);

    // Debug: Get all sales to see what exists
    const allSales = await prisma.sale.findMany({
      where: branchId ? { branchId: branchId as string } : {},
      select: {
        id: true,
        totalAmount: true,
        paymentMethod: true,
        createdAt: true,
        branchId: true
      },
      take: 5
    });
    console.log('Sample sales in database:', allSales);

    // Get sales by payment method
    const salesByPaymentMethod = await prisma.sale.groupBy({
      by: ['paymentMethod'],
      where,
      _sum: {
        totalAmount: true
      },
      _count: {
        id: true
      }
    });

    console.log('Sales by payment method result:', salesByPaymentMethod);

    // Get top selling products
    const topProducts = await prisma.saleItem.groupBy({
      by: ['productId'],
      where: {
        sale: where
      },
      _sum: {
        quantity: true,
        totalPrice: true
      },
      orderBy: {
        _sum: {
          quantity: 'desc'
        }
      },
      take: 10
    });

    console.log('Top products result:', topProducts);

    // Get product details for top products
    const topProductsWithDetails = await Promise.all(
      topProducts.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: {
            id: true,
            name: true,
            unitType: true,
            category: {
              select: {
                name: true
              }
            }
          }
        });
        return {
          ...item,
          product
        };
      })
    );

    // Get sales trend data
    let salesTrend;
    if (groupBy === 'day') {
      salesTrend = await prisma.sale.groupBy({
        by: ['createdAt'],
        where,
        _sum: {
          totalAmount: true
        },
        _count: {
          id: true
        },
        orderBy: {
          createdAt: 'asc'
        }
      });
    } else if (groupBy === 'month') {
      // Group by month
      const sales = await prisma.sale.findMany({
        where,
        select: {
          createdAt: true,
          totalAmount: true
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      const monthlyData: { [key: string]: { total: number; count: number } } = {};
      sales.forEach(sale => {
        const monthKey = `${sale.createdAt.getFullYear()}-${String(sale.createdAt.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { total: 0, count: 0 };
        }
        monthlyData[monthKey].total += sale.totalAmount;
        monthlyData[monthKey].count += 1;
      });

      salesTrend = Object.entries(monthlyData).map(([month, data]) => ({
        createdAt: new Date(month + '-01'),
        _sum: { totalAmount: data.total },
        _count: { id: data.count }
      }));
    }

    const responseData = {
      summary: {
        totalSales: salesSummary._count.id,
        totalRevenue: salesSummary._sum.totalAmount || 0,
        totalSubtotal: salesSummary._sum.subtotal || 0,
        totalTax: salesSummary._sum.taxAmount || 0,
        totalDiscount: salesSummary._sum.discountAmount || 0
      },
      salesByPaymentMethod,
      topProducts: topProductsWithDetails,
      salesTrend: salesTrend || []
    };

    console.log('Sales report response:', responseData);

    return res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Get sales report error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getInventoryReport = async (req: Request, res: Response) => {
  try {
    const { branchId = '', lowStock = false } = req.query;

    const where: any = {
      isActive: true
    };

    if (branchId) {
      where.branchId = branchId;
    }

    if (lowStock === 'true') {
      where.stock = {
        lte: prisma.product.fields.minStock
      };
    }

    // Get inventory summary
    const inventorySummary = await prisma.product.aggregate({
      where,
      _sum: {
        stock: true
      },
      _count: {
        id: true
      }
    });

    // Get products by category
    const productsByCategory = await prisma.product.groupBy({
      by: ['categoryId'],
      where,
      _sum: {
        stock: true
      },
      _count: {
        id: true
      }
    });

    // Get category details
    const categoriesWithDetails = await Promise.all(
      productsByCategory.map(async (item) => {
        const category = await prisma.category.findUnique({
          where: { id: item.categoryId },
          select: {
            id: true,
            name: true
          }
        });
        return {
          ...item,
          category
        };
      })
    );

    // Get low stock products
    const lowStockProducts = await prisma.product.findMany({
      where: {
        ...where,
        stock: {
          lte: prisma.product.fields.minStock
        }
      },
      include: {
        category: {
          select: {
            name: true
          }
        },
        supplier: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        stock: 'asc'
      }
    });

    return res.json({
      success: true,
      data: {
        summary: {
          totalProducts: inventorySummary._count.id,
          totalStock: inventorySummary._sum.stock || 0,
          lowStockCount: lowStockProducts.length
        },
        productsByCategory: categoriesWithDetails,
        lowStockProducts
      }
    });
  } catch (error) {
    console.error('Get inventory report error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getCustomerReport = async (req: Request, res: Response) => {
  try {
    const { 
      startDate = '', 
      endDate = '', 
      branchId = '',
      vip = false 
    } = req.query;

    const where: any = {
      isActive: true
    };

    if (branchId) {
      where.branchId = branchId;
    }

    if (vip === 'true') {
      where.isVIP = true;
    }

    // Get customer summary
    const customerSummary = await prisma.customer.aggregate({
      where,
      _sum: {
        totalPurchases: true,
        loyaltyPoints: true
      },
      _count: {
        id: true
      }
    });

    // Get customers by VIP status
    const customersByVIP = await prisma.customer.groupBy({
      by: ['isVIP'],
      where,
      _count: {
        id: true
      },
      _sum: {
        totalPurchases: true,
        loyaltyPoints: true
      }
    });

    // Get top customers by spending
    const topCustomers = await prisma.customer.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        totalPurchases: true,
        loyaltyPoints: true,
        lastVisit: true,
        isVIP: true,
        _count: {
          select: {
            sales: true
          }
        }
      },
      orderBy: {
        totalPurchases: 'desc'
      },
      take: 10
    });

    // Get recent customers
    const recentCustomers = await prisma.customer.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        createdAt: true,
        totalPurchases: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    return res.json({
      success: true,
      data: {
        summary: {
          totalCustomers: customerSummary._count.id,
          totalSpent: customerSummary._sum.totalPurchases || 0,
          totalLoyaltyPoints: customerSummary._sum.loyaltyPoints || 0,
          averageSpent: customerSummary._count.id > 0 ? (customerSummary._sum.totalPurchases || 0) / customerSummary._count.id : 0
        },
        customersByVIP,
        topCustomers,
        recentCustomers
      }
    });
  } catch (error) {
    console.error('Get customer report error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getProductPerformanceReport = async (req: Request, res: Response) => {
  try {
    const { 
      startDate = '', 
      endDate = '', 
      branchId = '',
      categoryId = ''
    } = req.query;

    const where: any = {};

    if (branchId) {
      where.branchId = branchId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate as string);
      }
    }

    // Get product performance
    const productPerformance = await prisma.saleItem.groupBy({
      by: ['productId'],
      where: {
        sale: where
      },
      _sum: {
        quantity: true,
        totalPrice: true
      },
      _count: {
        id: true
      },
      orderBy: {
        _sum: {
          quantity: 'desc'
        }
      },
      take: 20
    });

    // Get product details
    const productsWithDetails = await Promise.all(
      productPerformance.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: {
            id: true,
            name: true,
            unitType: true,
            sellingPrice: true,
            stock: true,
            category: {
              select: {
                name: true
              }
            },
            supplier: {
              select: {
                name: true
              }
            }
          }
        });
        return {
          ...item,
          product
        };
      })
    );

    // Get performance by category
    const performanceByCategory = await prisma.saleItem.groupBy({
      by: ['productId'],
      where: {
        sale: where,
        product: categoryId ? { categoryId: categoryId as string } : undefined
      },
      _sum: {
        quantity: true,
        totalPrice: true
      },
      _count: {
        id: true
      }
    });

    // Get category details for performance
    const categoryPerformance = await Promise.all(
      performanceByCategory.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: {
            category: {
              select: {
                name: true
              }
            }
          }
        });
        return {
          ...item,
          category: product?.category?.name || 'Unknown'
        };
      })
    );

    // Group by category
    const categoryStats: { [key: string]: { quantity: number; revenue: number; count: number } } = {};
    categoryPerformance.forEach(item => {
      const category = item.category;
      if (!categoryStats[category]) {
        categoryStats[category] = { quantity: 0, revenue: 0, count: 0 };
      }
      categoryStats[category].quantity += item._sum?.quantity || 0;
      categoryStats[category].revenue += item._sum?.totalPrice || 0;
      categoryStats[category].count += typeof item._count === 'object' && item._count?.id ? item._count.id : 0;
    });

    return res.json({
      success: true,
      data: {
        topProducts: productsWithDetails,
        categoryPerformance: Object.entries(categoryStats).map(([category, stats]) => ({
          category,
          ...stats
        }))
      }
    });
  } catch (error) {
    console.error('Get product performance report error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};