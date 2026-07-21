import { defineMatrix } from '../_utils/defineMatrix'
import { AdapterProviders, Providers } from '../_utils/providers'

// Only the dedicated PostGIS flavor: the default js_pg databases run plain
// PostgreSQL images without the PostGIS extension libraries, so CREATE
// EXTENSION postgis cannot succeed there.
export default defineMatrix(() => [[{ provider: Providers.POSTGRESQL, driverAdapter: AdapterProviders.JS_PG_POSTGIS }]])
