export interface ShopifyImage {
  url: string;
  width: number;
  height: number;
}

export interface ShopifyMedia {
  id: string;
  alt: string;
  mediaContentType: string;
  image: ShopifyImage;
}

export interface ShopifyVariant {
  id: string;
  title: string;
  sku: string;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number;
  selectedOptions: Array<{ name: string; value: string }>;
}

export interface ShopifyOption {
  id: string;
  name: string;
  values: string[];
}

export interface ShopifyCollection {
  id: string;
  title: string;
  handle: string;
}

export interface ShopifySEO {
  title: string;
  description: string;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  productType: string;
  vendor: string;
  tags: string[];
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  seo: ShopifySEO;
  collections: ShopifyCollection[];
  options: ShopifyOption[];
  variants: ShopifyVariant[];
  media: ShopifyMedia[];
}

export type AuditIssueType =
  | 'SEO_TITLE_MISSING'
  | 'SEO_TITLE_TOO_LONG'
  | 'SEO_DESCRIPTION_MISSING'
  | 'SEO_DESCRIPTION_TOO_LONG'
  | 'DESCRIPTION_MISSING'
  | 'DESCRIPTION_TOO_SHORT'
  | 'TITLE_INCONSISTENT'
  | 'ALT_TEXT_MISSING'
  | 'COLOR_NAME_INCONSISTENT'
  | 'OUT_OF_STOCK_VISIBLE'
  | 'IMAGE_MISSING'
  | 'IMAGE_OVERSIZED'
  | 'DUPLICATE_PRODUCT';

export interface AuditIssue {
  type: AuditIssueType;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  field?: string;
  value?: string;
}

export interface AuditResult {
  product: ShopifyProduct;
  issues: AuditIssue[];
  score: number;
  auditedAt: string;
}

export interface ClaudeOptimization {
  title_suggested: string;
  description_html_suggested: string;
  seo_title: string;
  seo_description: string;
  tags_suggested: string[];
  alt_texts: string[];
  color_name_suggestions: string[];
  collection_notes: string;
  risk_notes: string;
}

export interface ImageProcessingResult {
  productId: string;
  mediaId: string;
  originalUrl: string;
  originalPath: string;
  originalSize: number;
  optimizedPath: string;
  optimizedSize: number;
  savingsPercentage: number;
  newFilename: string;
  width: number;
  height: number;
}

export interface PreviewRecord {
  product_id: string;
  handle: string;
  status: string;
  title_actual: string;
  title_suggested: string;
  seo_title_actual: string;
  seo_title_suggested: string;
  seo_description_actual: string;
  seo_description_suggested: string;
  description_actual: string;
  description_suggested: string;
  alt_actual: string;
  alt_suggested: string;
  image_original_size: string;
  image_optimized_size: string;
  image_savings_percentage: string;
  tags_actual: string;
  tags_suggested: string;
  color_suggestions: string;
  collection_notes: string;
  notes: string;
  risk_level: 'low' | 'medium' | 'high';
  audit_score: string;
  audit_issues: string;
}

export interface ProductBackup {
  timestamp: string;
  product: ShopifyProduct;
  auditResult?: AuditResult;
  optimization?: ClaudeOptimization;
  imageResults?: ImageProcessingResult[];
}

export interface ApplyResult {
  productId: string;
  handle: string;
  success: boolean;
  changes: string[];
  errors: string[];
  skipped: string[];
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; locations?: unknown; path?: unknown; extensions?: { code?: string } }>;
}

export interface ProductsQueryResponse {
  products: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string;
    };
    edges: Array<{
      node: RawShopifyProductNode;
    }>;
  };
}

export interface RawShopifyProductNode {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  productType: string;
  vendor: string;
  tags: string[];
  status: string;
  seo: ShopifySEO;
  collections: {
    edges: Array<{ node: ShopifyCollection }>;
  };
  options: ShopifyOption[];
  variants: {
    edges: Array<{ node: ShopifyVariant }>;
  };
  media: {
    edges: Array<{
      node: {
        id: string;
        alt: string;
        mediaContentType: string;
        image?: ShopifyImage;
      };
    }>;
  };
}
