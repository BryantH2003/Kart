// Request/response shapes for API routes

export interface SearchResultItem {
  gameId: string
  steamAppId: string
  name: string
  cheapestPrice: number
  imageUrl: string
  canonicalId?: string
}

export interface StorePrice {
  storeId: string
  storeName: string
  price: number
  dealUrl: string
}

export interface ProductPageData {
  id: string
  name: string
  imageUrl: string | null
  releaseDate: string | null
  metacriticScore: number | null
  ratingText: string | null
  rating: number | null
  reviewCount: number | null
  vendors: VendorPriceData[]
  priceHistory: PriceHistoryPoint[]
}

export interface VendorPriceData {
  vendorId: string
  vendorName: string
  price: number
  originalPrice: number | null
  productUrl: string | null
  storePrices: StorePrice[]
  lastSynced: string | null
}

export interface PriceHistoryPoint {
  date: string
  priceMin: number
  priceAvg: number
  priceMax: number
}

export interface WishlistItem {
  id: string
  canonicalId: string
  name: string
  imageUrl: string | null
  currentPrice: number | null
  targetPrice: number | null
  createdAt: string
}

export interface RecommendationResponse {
  signal: 'buy' | 'wait' | 'neutral'
  text: string
  currentPrice: number
  avgPrice90d: number
  minPrice90d: number
}

export interface ApiError {
  error: string
}
