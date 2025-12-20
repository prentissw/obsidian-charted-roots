# Maps System

The maps module (`src/maps/`) provides interactive geographic visualization using Leaflet, supporting both real-world maps and custom fictional/historical image maps.

## Architecture

```
src/maps/
├── map-controller.ts          # Core Leaflet map management
├── map-view.ts                # ItemView UI for map rendering
├── map-data-service.ts        # Data preparation from notes
├── image-map-manager.ts       # Custom image map handling
├── types/
│   ├── map-types.ts          # Type definitions
│   └── leaflet-plugins.d.ts   # Plugin type declarations
├── services/
│   └── geocoding-service.ts   # OpenStreetMap Nominatim integration
└── ui/
    └── bulk-geocode-modal.ts  # Batch geocoding UI
```

## Coordinate Systems

The system supports two coordinate modes:

**Geographic mode** (default): Standard lat/lng coordinates for real-world maps
```yaml
coordinate_system: geographic
bounds_north: 50
bounds_south: -50
bounds_west: -100
bounds_east: 100
```

**Pixel mode**: Direct pixel coordinates with `L.CRS.Simple` for custom image maps
```yaml
coordinate_system: pixel
image_width: 2048
image_height: 3072
center_x: 1024
center_y: 1536
```

**CRS switching**: When changing between OpenStreetMap and pixel-based custom maps, the entire Leaflet map is destroyed and recreated (Leaflet doesn't support dynamic CRS changes).

## Data Flow

```
Place Notes (with coordinates)
         ↓
    Place Cache (by cr_id and name)
         ↓
Person Notes (with place references)
         ↓
    MapDataService.prepareMapData()
         ↓
    ┌────────────────┬─────────────────┐
    ↓                ↓                 ↓
 Markers      MigrationPaths     JourneyPaths
    ↓                ↓                 ↓
    └────────────────┴─────────────────┘
                     ↓
              MapController
                     ↓
           Leaflet Rendering
```

**Marker types:**
- Core life events: birth, death, marriage, burial
- Additional events: residence, occupation, education, military, immigration, religious events

**Path types:**
- **MigrationPath**: Birth → death location for a person
- **JourneyPath**: All life events chronologically ordered
- **AggregatedPath**: Grouped paths for visualization weight (shows travel flow intensity)

**Place resolution** (`MapDataService`):
1. Try cr_id lookup first (fastest)
2. Fall back to case-insensitive name lookup
3. Support partial matching ("Paris" finds "Paris, France")
4. Handle wikilink extraction from references

## Layer Management

`MapController` organizes markers into separate cluster groups:

```typescript
// Separate cluster groups by event type
birthMarkers: MarkerClusterGroup
deathMarkers: MarkerClusterGroup
marriageMarkers: MarkerClusterGroup
burialMarkers: MarkerClusterGroup
additionalMarkers: MarkerClusterGroup  // All other event types

// Path layers
pathLayer: LayerGroup      // Migration paths
journeyLayer: LayerGroup   // Full journey paths
heatLayer: HeatLayer       // Location density visualization
```

**Leaflet plugins used:**
- `leaflet.markercluster` - Clusters markers at various zoom levels
- `leaflet.heat` - Density heat maps
- `leaflet-polylinedecorator` - Arrow decorations on paths
- `leaflet-textpath` - Labels along paths
- `leaflet-fullscreen` - Fullscreen mode
- `leaflet-minimap` - Overview map
- `leaflet-search` - Place name search

## Custom Image Maps

`ImageMapManager` handles fictional worlds and historical maps.

**Map note frontmatter:**
```yaml
type: map
map_id: middle-earth
name: Middle-earth
universe: tolkien
image: path/to/image.jpg
coordinate_system: pixel  # or geographic
image_width: 2048
image_height: 3072
```

**Edit mode features:**
- Distortable image overlay (leaflet-distortableimage)
- Corner manipulation for alignment
- Corners saved to frontmatter (flat format for Obsidian Properties)
- Restore/reset functionality

**Property format support:**
- Flat format (preferred): `bounds_north`, `corner_nw_lat`
- Nested format (legacy): `bounds: {north: 50}`
- Automatic fallback between formats

## Geocoding

`GeocodingService` integrates with OpenStreetMap's Nominatim API.

**Features:**
- Single place lookup
- Bulk geocoding with rate limiting (1 request/second per Nominatim policy)
- Progress reporting and cancellation support
- Skips places that already have coordinates

**Implementation:**
```typescript
// User-Agent required by Nominatim
headers: { 'User-Agent': 'Canvas Roots Obsidian Plugin' }

// Updates place notes with flat property format
coordinates_lat: 48.8566
coordinates_long: 2.3522
```

## Time Slider

The map view includes a time slider for temporal filtering:

**Modes:**
- "Alive in year" (snapshot) - Shows people alive during selected year
- "Born by year" (cumulative) - Shows people born up to selected year

**Implementation:**
- Maintains original full dataset (`currentMapData`)
- Filters for display without changing source
- Animation loops through years with configurable speed
- Live count updates during filtering
