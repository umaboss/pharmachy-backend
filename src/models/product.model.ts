


export interface CreateProductData {
    name: string;
    description?: string;
    categoryId: string;
    supplierId: string;
    branchId: string;
    costPrice: number;
    sellingPrice: number;
    stock: number;
    minStock: number;
    maxStock?: number;
    unitType: string;
    unitsPerPack: number;
    barcode?: string;
    requiresPrescription: boolean;
  }
  
  export interface UpdateProductData {
    name?: string;
    description?: string;
    categoryId?: string;
    supplierId?: string;
    costPrice?: number;
    sellingPrice?: number;
    stock?: number;
    minStock?: number;
    maxStock?: number;
    unitType?: string;
    unitsPerPack?: number;
    barcode?: string;
    requiresPrescription?: boolean;
    isActive?: boolean;
  }
  
  export interface StockMovementData {
    productId: string;
    type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'RETURN';
    quantity: number;
    reason?: string;
    reference?: string;
    createdBy?: string;
  }