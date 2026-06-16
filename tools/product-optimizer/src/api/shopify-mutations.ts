import { shopifyGraphQL } from './shopify-client.js';

// ─── Product metadata update ───────────────────────────────────────────────

interface ProductUpdateInput {
  id: string;
  title?: string;
  descriptionHtml?: string;
  seo?: { title?: string; description?: string };
  tags?: string[];
}

interface ProductUpdateResult {
  productUpdate: {
    product: { id: string; title: string; handle: string } | null;
    userErrors: Array<{ field: string[]; message: string }>;
  };
}

const PRODUCT_UPDATE_MUTATION = `
  mutation ProductUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        title
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function updateProduct(input: ProductUpdateInput): Promise<void> {
  const data = await shopifyGraphQL<ProductUpdateResult>({
    query: PRODUCT_UPDATE_MUTATION,
    variables: { input },
    estimatedCost: 30,
  });

  const { userErrors, product } = data.productUpdate;
  if (userErrors.length > 0) {
    throw new Error(
      `productUpdate errors: ${userErrors.map(e => `${e.field.join('.')}: ${e.message}`).join(' | ')}`
    );
  }
  if (!product) throw new Error('productUpdate returned null product');
}

// ─── Media alt text update ─────────────────────────────────────────────────

interface UpdateMediaInput {
  id: string;
  alt: string;
}

interface ProductUpdateMediaResult {
  productUpdateMedia: {
    media: Array<{ id?: string; alt?: string }>;
    mediaUserErrors: Array<{ field: string[]; message: string }>;
  };
}

const PRODUCT_UPDATE_MEDIA_MUTATION = `
  mutation ProductUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
    productUpdateMedia(productId: $productId, media: $media) {
      media {
        ... on MediaImage {
          id
          alt
        }
      }
      mediaUserErrors {
        field
        message
      }
    }
  }
`;

export async function updateProductMediaAlt(
  productId: string,
  mediaUpdates: UpdateMediaInput[]
): Promise<void> {
  const data = await shopifyGraphQL<ProductUpdateMediaResult>({
    query: PRODUCT_UPDATE_MEDIA_MUTATION,
    variables: { productId, media: mediaUpdates },
    estimatedCost: 20,
  });

  const { mediaUserErrors } = data.productUpdateMedia;
  if (mediaUserErrors.length > 0) {
    throw new Error(
      `productUpdateMedia errors: ${mediaUserErrors.map(e => e.message).join(' | ')}`
    );
  }
}

// ─── Staged uploads (for image replacement) ───────────────────────────────

interface StagedTarget {
  url: string;
  resourceUrl: string;
  parameters: Array<{ name: string; value: string }>;
}

interface StagedUploadsCreateResult {
  stagedUploadsCreate: {
    stagedTargets: StagedTarget[];
    userErrors: Array<{ field: string[]; message: string }>;
  };
}

const STAGED_UPLOADS_CREATE_MUTATION = `
  mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function createStagedUpload(
  filename: string,
  mimeType: string,
  fileSize: number
): Promise<StagedTarget> {
  const data = await shopifyGraphQL<StagedUploadsCreateResult>({
    query: STAGED_UPLOADS_CREATE_MUTATION,
    variables: {
      input: [
        {
          filename,
          mimeType,
          fileSize: String(fileSize),
          resource: 'IMAGE',
          httpMethod: 'POST',
        },
      ],
    },
    estimatedCost: 20,
  });

  const { stagedTargets, userErrors } = data.stagedUploadsCreate;
  if (userErrors.length > 0) {
    throw new Error(`stagedUploadsCreate errors: ${userErrors.map(e => e.message).join(' | ')}`);
  }
  if (stagedTargets.length === 0) throw new Error('No staged target returned');

  return stagedTargets[0];
}

// ─── Add optimized image to product ───────────────────────────────────────

interface ProductCreateMediaResult {
  productCreateMedia: {
    media: Array<{ id?: string }>;
    mediaUserErrors: Array<{ field: string[]; message: string }>;
  };
}

const PRODUCT_CREATE_MEDIA_MUTATION = `
  mutation ProductCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        ... on MediaImage {
          id
        }
      }
      mediaUserErrors {
        field
        message
      }
    }
  }
`;

export async function addProductMedia(
  productId: string,
  resourceUrl: string,
  alt: string
): Promise<void> {
  const data = await shopifyGraphQL<ProductCreateMediaResult>({
    query: PRODUCT_CREATE_MEDIA_MUTATION,
    variables: {
      productId,
      media: [{ originalSource: resourceUrl, alt, mediaContentType: 'IMAGE' }],
    },
    estimatedCost: 30,
  });

  const { mediaUserErrors } = data.productCreateMedia;
  if (mediaUserErrors.length > 0) {
    throw new Error(`productCreateMedia errors: ${mediaUserErrors.map(e => e.message).join(' | ')}`);
  }
}
