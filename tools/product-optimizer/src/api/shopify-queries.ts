import { shopifyGraphQL } from './shopify-client.js';
import { logger } from '../utils/logger.js';
import type {
  ShopifyProduct,
  ProductsQueryResponse,
  RawShopifyProductNode,
} from '../types/index.js';

const PRODUCT_FRAGMENT = `
  fragment ProductFields on Product {
    id
    title
    handle
    descriptionHtml
    productType
    vendor
    tags
    status
    seo {
      title
      description
    }
    collections(first: 10) {
      edges {
        node {
          id
          title
          handle
        }
      }
    }
    options {
      id
      name
      values
    }
    variants(first: 100) {
      edges {
        node {
          id
          title
          sku
          price
          compareAtPrice
          inventoryQuantity
          selectedOptions {
            name
            value
          }
        }
      }
    }
    media(first: 20) {
      edges {
        node {
          mediaContentType
          ... on MediaImage {
            id
            alt
            image {
              url
              width
              height
            }
          }
        }
      }
    }
  }
`;

const PRODUCTS_QUERY = `
  ${PRODUCT_FRAGMENT}
  query GetProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          ...ProductFields
        }
      }
    }
  }
`;

function normalizeProduct(node: RawShopifyProductNode): ShopifyProduct {
  return {
    id: node.id,
    title: node.title,
    handle: node.handle,
    descriptionHtml: node.descriptionHtml ?? '',
    productType: node.productType ?? '',
    vendor: node.vendor ?? '',
    tags: node.tags ?? [],
    status: node.status as ShopifyProduct['status'],
    seo: {
      title: node.seo?.title ?? '',
      description: node.seo?.description ?? '',
    },
    collections: (node.collections?.edges ?? []).map(e => e.node),
    options: node.options ?? [],
    variants: (node.variants?.edges ?? []).map(e => e.node),
    media: (node.media?.edges ?? [])
      .filter(e => e.node.mediaContentType === 'IMAGE' && e.node.image)
      .map(e => ({
        id: e.node.id,
        alt: e.node.alt ?? '',
        mediaContentType: e.node.mediaContentType,
        image: e.node.image!,
      })),
  };
}

export async function fetchAllProducts(
  statusFilter = 'status:active OR status:draft'
): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];
  let cursor: string | null = null;
  let page = 0;

  logger.info(`Obteniendo productos de Shopify (filtro: "${statusFilter}")`);

  do {
    page++;
    const response = await shopifyGraphQL<ProductsQueryResponse>({
      query: PRODUCTS_QUERY,
      variables: {
        first: 50,
        after: cursor,
        query: statusFilter,
      },
      estimatedCost: 100,
    });

    const edges: ProductsQueryResponse['products']['edges'] = response.products.edges;
    const pageInfo: ProductsQueryResponse['products']['pageInfo'] = response.products.pageInfo;
    const batch = edges.map((e: ProductsQueryResponse['products']['edges'][number]) =>
      normalizeProduct(e.node as unknown as RawShopifyProductNode)
    );
    products.push(...batch);

    logger.info(`Página ${page}: ${batch.length} productos (total: ${products.length})`);

    cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (cursor);

  logger.success(`Total productos obtenidos: ${products.length}`);
  return products;
}

export async function fetchProductByHandle(handle: string): Promise<ShopifyProduct | null> {
  const HANDLE_QUERY = `
    ${PRODUCT_FRAGMENT}
    query GetProductByHandle($handle: String!) {
      productByHandle(handle: $handle) {
        ...ProductFields
      }
    }
  `;

  const data = await shopifyGraphQL<{ productByHandle: RawShopifyProductNode | null }>({
    query: HANDLE_QUERY,
    variables: { handle },
    estimatedCost: 50,
  });

  return data.productByHandle ? normalizeProduct(data.productByHandle) : null;
}

export async function fetchProductById(id: string): Promise<ShopifyProduct | null> {
  const ID_QUERY = `
    ${PRODUCT_FRAGMENT}
    query GetProductById($id: ID!) {
      product(id: $id) {
        ...ProductFields
      }
    }
  `;

  const data = await shopifyGraphQL<{ product: RawShopifyProductNode | null }>({
    query: ID_QUERY,
    variables: { id },
    estimatedCost: 50,
  });

  return data.product ? normalizeProduct(data.product) : null;
}
