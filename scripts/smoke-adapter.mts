// Smoke test for the CheapShark adapter against the live API.
// Run with: npm run smoke
import { getAdapter } from '../src/vendors/registry.ts'

const adapter = getAdapter('cheapshark')
if (!adapter) throw new Error('cheapshark adapter not found in registry')

console.log('\n--- search("hades") ---')
const results = await adapter.search('hades')
if (results.length === 0) {
  console.log('No results returned.')
} else {
  console.log(`${results.length} result(s). First:`)
  console.log(JSON.stringify(results[0], null, 2))
}

console.log('\n--- getProduct("1145360") ---')  // Hades Steam App ID
const product = await adapter.getProduct('1145360')
if (!product) {
  console.log('No product found (game may not be on sale anywhere right now).')
} else {
  console.log(`Found: ${product.name}`)
  console.log(`Cheapest: $${product.price} at ${product.storePrices?.[0]?.storeName}`)
  console.log(`Stores with deals: ${product.storePrices?.length ?? 0}`)
}
