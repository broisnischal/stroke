/**
 * Loads and caches the world GeoJSON for choropleth maps.
 * Served from /public/world.geo.json — no external network requests.
 */

/** @type {any|null} */
let worldGeoJson = null

/** @returns {Promise<any>} GeoJSON FeatureCollection of world countries */
export async function getWorldGeoJson() {
  if (worldGeoJson) return worldGeoJson
  const res = await fetch('/world.geo.json')
  if (!res.ok) throw new Error(`Failed to load world map (${res.status})`)
  worldGeoJson = await res.json()
  return worldGeoJson
}
