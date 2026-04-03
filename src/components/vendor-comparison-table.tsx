import Link from 'next/link'
import { ExternalLink, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { VendorPriceData } from '@/types/api.types'

interface VendorComparisonTableProps {
  vendors: VendorPriceData[]
}

export function VendorComparisonTable({ vendors }: VendorComparisonTableProps) {
  if (vendors.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No vendor price data available.</p>
    )
  }

  const allPrices = vendors.flatMap((v) => [
    v.price,
    ...v.storePrices.map((s) => s.price),
  ])
  const bestPrice = Math.min(...allPrices)

  return (
    <div className="overflow-hidden rounded-xl border border-border/60">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-muted/40">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Store</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Price</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Original</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {vendors.map((vendor) => {
            // Render per-store rows from storePrices if available, otherwise one row per vendor
            const rows =
              vendor.storePrices.length > 0
                ? vendor.storePrices.map((sp) => ({
                    key: `${vendor.vendorId}-${sp.storeId}`,
                    name: sp.storeName,
                    price: sp.price,
                    originalPrice: null,
                    url: sp.dealUrl,
                  }))
                : [
                    {
                      key: vendor.vendorId,
                      name: vendor.vendorName,
                      price: vendor.price,
                      originalPrice: vendor.originalPrice,
                      url: vendor.productUrl,
                    },
                  ]

            return rows.map((row) => {
              const isBest = row.price === bestPrice
              const discount =
                row.originalPrice && row.originalPrice > row.price
                  ? Math.round((1 - row.price / row.originalPrice) * 100)
                  : null

              return (
                <tr
                  key={row.key}
                  className={isBest ? 'bg-accent/5' : 'bg-card hover:bg-muted/30 transition-colors'}
                >
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      {isBest && (
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-accent" />
                      )}
                      {row.name}
                      {isBest && (
                        <Badge variant="secondary" className="text-xs text-accent">
                          Best price
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold ${isBest ? 'text-accent' : 'text-foreground'}`}>
                      {row.price === 0 ? 'Free' : `$${row.price.toFixed(2)}`}
                    </span>
                    {discount !== null && (
                      <span className="ml-2 text-xs text-accent">-{discount}%</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {row.originalPrice ? `$${row.originalPrice.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.url && (
                      <Button size="sm" variant="outline" asChild>
                        <Link href={row.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                          Buy
                        </Link>
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })
          })}
        </tbody>
      </table>
    </div>
  )
}
