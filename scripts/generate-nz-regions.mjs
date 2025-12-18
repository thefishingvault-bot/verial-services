import fs from "node:fs";
import path from "node:path";
import proj4 from "proj4";

const WORKSPACE_ROOT = process.cwd();

const DATA_IMPORT_DIR = path.join(WORKSPACE_ROOT, "data-import");
const LINZ_CSV = path.join(DATA_IMPORT_DIR, "lds-nz-suburbs-and-localities-CSV", "nz-suburbs-and-localities.csv");
const STATNZ_CSV = path.join(DATA_IMPORT_DIR, "statsnz-regional-council-2025-clipped-CSV", "regional-council-2025-clipped.csv");

const OUTPUT_JSON = path.join(WORKSPACE_ROOT, "src", "lib", "data", "nz-regions.generated.json");

// LINZ suburbs/localities export is WGS84 (lon/lat). StatsNZ regional council export is NZTM2000 (meters).
// Convert lon/lat -> NZTM2000 for point-in-polygon checks.
proj4.defs(
  "EPSG:2193",
  "+proj=tmerc +lat_0=0 +lon_0=173 +k=0.9996 +x_0=1600000 +y_0=10000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
);

const WGS84 = "EPSG:4326";
const NZTM2000 = "EPSG:2193";

function lonLatToNzTm([lon, lat]) {
  // proj4 returns [x,y] in meters.
  return proj4(WGS84, NZTM2000, [lon, lat]);
}

const REGION_NAME_TO_KEY = new Map([
  ["Auckland", "Auckland"],
  ["Auckland Region", "Auckland"],
  ["Waikato", "Waikato"],
  ["Waikato Region", "Waikato"],
  ["Bay of Plenty", "Bay of Plenty"],
  ["Bay of Plenty Region", "Bay of Plenty"],
  ["Wellington", "Wellington"],
  ["Wellington Region", "Wellington"],
  ["Canterbury", "Canterbury"],
  ["Canterbury Region", "Canterbury"],
  ["Otago", "Otago"],
  ["Otago Region", "Otago"],
  ["Northland", "Northland"],
  ["Northland Region", "Northland"],
  ["Hawke's Bay", "Hawke's Bay"],
  ["Hawke's Bay Region", "Hawke's Bay"],
  ["Hawke’s Bay Region", "Hawke's Bay"],
  ["Hawke’s Bay", "Hawke's Bay"],
  ["Taranaki", "Taranaki"],
  ["Taranaki Region", "Taranaki"],
  ["Manawatū-Whanganui", "Manawatu"],
  ["Manawatu-Whanganui", "Manawatu"],
  ["Manawatū-Whanganui Region", "Manawatu"],
  ["Manawatu-Whanganui Region", "Manawatu"],
  ["Nelson", "Nelson"],
  ["Nelson Region", "Nelson"],
  ["Marlborough", "Marlborough"],
  ["Marlborough Region", "Marlborough"],
  ["Tasman", "Tasman"],
  ["Tasman Region", "Tasman"],
  ["Southland", "Southland"],
  ["Southland Region", "Southland"],
  ["West Coast", "Westland"],
  ["West Coast Region", "Westland"],
  ["Gisborne", "Gisborne"],
  ["Gisborne Region", "Gisborne"],
]);

const REGION_ORDER = [
  "Auckland",
  "Waikato",
  "Bay of Plenty",
  "Wellington",
  "Canterbury",
  "Otago",
  "Northland",
  "Hawke's Bay",
  "Taranaki",
  "Manawatu",
  "Nelson",
  "Marlborough",
  "Tasman",
  "Southland",
  "Westland",
  "Gisborne",
];

const REGION_KEYS = new Set(REGION_ORDER);

const INCLUDED_TYPES = new Set(["Suburb", "Locality"]);

// Last-resort overrides when a small number of features fall outside the regional
// polygons due to clipping/generalization differences between datasets.
// (Keep this tiny and review periodically.)
const FORCED_ASSIGNMENTS = new Map([
  ["Panguru", "Northland"],
]);

async function* parseCsvRecords(filePath) {
  // Streaming CSV parser that supports quoted fields spanning multiple lines.
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });

  let record = [];
  let field = "";
  let inQuotes = false;
  let pendingCR = false;

  for await (const chunk of stream) {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];

      if (pendingCR) {
        pendingCR = false;
        if (ch === "\n") continue;
      }

      if (inQuotes) {
        if (ch === '"') {
          const next = i + 1 < chunk.length ? chunk[i + 1] : null;
          if (next === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
        continue;
      }

      if (ch === ",") {
        record.push(field);
        field = "";
        continue;
      }

      if (ch === "\r") {
        record.push(field);
        field = "";
        yield record;
        record = [];
        pendingCR = true;
        continue;
      }

      if (ch === "\n") {
        record.push(field);
        field = "";
        yield record;
        record = [];
        continue;
      }

      field += ch;
    }
  }

  if (inQuotes) {
    throw new Error(`Unterminated CSV quote in ${filePath}`);
  }

  if (field.length > 0 || record.length > 0) {
    record.push(field);
    yield record;
  }
}

function normalizeText(s) {
  return (s ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRegionName(regionName) {
  const name = normalizeText(regionName);
  if (!name) return null;

  const mapped = REGION_NAME_TO_KEY.get(name);
  if (mapped) return mapped;
  if (REGION_KEYS.has(name)) return name;

  const noRegionSuffix = name.replace(/\s+Region$/i, "").trim();
  if (noRegionSuffix && noRegionSuffix !== name) {
    const mappedNoSuffix = REGION_NAME_TO_KEY.get(noRegionSuffix);
    if (mappedNoSuffix) return mappedNoSuffix;
    if (REGION_KEYS.has(noRegionSuffix)) return noRegionSuffix;
  }

  return null;
}

function parseCoordPair(s) {
  const parts = s.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}

function parsePolygonRingsFromChunk(chunk) {
  // chunk is a POLYGON-like interior: either
  // - "x y, x y, ..." (no parentheses)
  // - "(x y,...),(x y,...)" or "x y,...),(x y,...)" etc
  const trimmed = chunk.trim();
  if (!trimmed) return [];

  // Split rings on "),(" variant; preserve first ring even if missing leading "(".
  const ringChunks = trimmed.split(/\)\s*,\s*\(/g);

  const rings = [];
  for (const ringChunk of ringChunks) {
    const rc = ringChunk.trim().replace(/^\(+/, "").replace(/\)+$/, "");
    if (!rc) continue;

    const coords = rc
      .split(",")
      .map(parseCoordPair)
      .filter(Boolean);

    if (coords.length >= 3) {
      rings.push(coords);
    }
  }

  return rings;
}

function parseWktToPolygons(wkt) {
  const s = (wkt ?? "").trim();
  if (!s) return [];

  const upper = s.toUpperCase();
  const startIdx = s.indexOf("(");
  if (startIdx < 0) return [];

  const body = s.slice(startIdx).trim();

  if (upper.startsWith("POLYGON")) {
    const inner = body.replace(/^\(\(/, "").replace(/\)\)$/, "");
    const rings = parsePolygonRingsFromChunk(inner);
    if (rings.length === 0) return [];
    return [{ rings }];
  }

  if (upper.startsWith("MULTIPOLYGON")) {
    const inner = body.replace(/^\(\(\(/, "").replace(/\)\)\)$/, "");
    if (!inner.trim()) return [];

    const polygonChunks = inner.split(/\)\)\s*,\s*\(\(/g);
    const polygons = [];

    for (const polygonChunk of polygonChunks) {
      const pc = polygonChunk.trim().replace(/^\(+/, "").replace(/\)+$/, "");
      if (!pc) continue;

      const rings = parsePolygonRingsFromChunk(pc);
      if (rings.length === 0) continue;
      polygons.push({ rings });
    }

    return polygons;
  }

  return [];
}

function ringArea(ring) {
  // signed area
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function ringCentroid(ring) {
  const area = ringArea(ring);
  if (!Number.isFinite(area) || area === 0) {
    // fallback to average of points
    let sx = 0;
    let sy = 0;
    for (const [x, y] of ring) {
      sx += x;
      sy += y;
    }
    return [sx / ring.length, sy / ring.length];
  }

  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    const cross = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }

  cx /= 6 * area;
  cy /= 6 * area;
  return [cx, cy];
}

function polygonCentroidNzTmFromLonLat(polygonsLonLat) {
  // Compute centroid in NZTM2000 by projecting the outer ring into NZTM2000 first.
  let totalArea = 0;
  let sumX = 0;
  let sumY = 0;

  for (const poly of polygonsLonLat) {
    const outerLonLat = poly.rings?.[0];
    if (!outerLonLat || outerLonLat.length < 3) continue;

    const outerNzTm = outerLonLat.map(lonLatToNzTm);
    const area = ringArea(outerNzTm);
    const [cx, cy] = ringCentroid(outerNzTm);
    const weight = Math.abs(area) || 1;

    totalArea += weight;
    sumX += cx * weight;
    sumY += cy * weight;
  }

  if (totalArea === 0) return null;
  return [sumX / totalArea, sumY / totalArea];
}

function fnv1a32(str) {
  // Deterministic 32-bit hash.
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function makeRng(seedStr) {
  // xorshift32
  let x = fnv1a32(seedStr) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
}

function projectPolygonsLonLatToNzTmWithBbox(polygonsLonLat) {
  const polygonsWithBbox = [];
  for (const poly of polygonsLonLat) {
    const outerLonLat = poly.rings?.[0];
    if (!outerLonLat || outerLonLat.length < 3) continue;
    const ring = outerLonLat.map(lonLatToNzTm);
    polygonsWithBbox.push({ ring, bbox: ringBbox(ring) });
  }
  return polygonsWithBbox;
}

function findInteriorPointNzTm(polygonsLonLat, seedStr) {
  // Centroids can fall outside concave polygons. If that happens, sample points
  // inside the polygon's bbox until we find a point that is inside the polygon.
  const polygonsWithBbox = projectPolygonsLonLatToNzTmWithBbox(polygonsLonLat);
  if (polygonsWithBbox.length === 0) return null;

  const rand = makeRng(seedStr);
  // A small, bounded number of attempts; only used as a fallback for rare cases.
  const MAX_ATTEMPTS = 64;

  // Try each polygon's bbox in a round-robin manner.
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const poly = polygonsWithBbox[attempt % polygonsWithBbox.length];
    const { minX, minY, maxX, maxY } = poly.bbox;
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) continue;
    const x = minX + rand() * (maxX - minX);
    const y = minY + rand() * (maxY - minY);
    const p = [x, y];
    if (pointInPolygons(p, polygonsWithBbox)) return p;
  }

  return null;
}

function ringBbox(ring) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  return { minX, minY, maxX, maxY };
}

function pointInRing([x, y], ring) {
  // Ray casting; ignores holes.
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygons(point, polygonsWithBbox) {
  for (const poly of polygonsWithBbox) {
    const { ring, bbox } = poly;
    if (point[0] < bbox.minX || point[0] > bbox.maxX || point[1] < bbox.minY || point[1] > bbox.maxY) continue;
    if (pointInRing(point, ring)) return true;
  }
  return false;
}

async function readCsvRows(filePath) {
  const normalizeHeader = (h) => (h ?? "").replace(/^\uFEFF/, "").trim();

  const records = parseCsvRecords(filePath);
  const { value: rawHeaders, done } = await records.next();
  if (done || !rawHeaders) throw new Error(`Failed reading headers: ${filePath}`);

  const headers = rawHeaders.map(normalizeHeader);
  const headerIndex = new Map();
  headers.forEach((h, i) => headerIndex.set(h, i));

  return { headers, headerIndex, rows: records };
}

async function main() {
  if (!fs.existsSync(LINZ_CSV)) throw new Error(`Missing LINZ CSV at ${LINZ_CSV}`);
  if (!fs.existsSync(STATNZ_CSV)) throw new Error(`Missing StatsNZ CSV at ${STATNZ_CSV}`);

  console.log("Loading region polygons...");
  const regions = [];
  {
    const { headerIndex, rows } = await readCsvRows(STATNZ_CSV);

    const wktIdx = headerIndex.get("WKT");
    const nameIdx = headerIndex.get("REGC2025_V1_00_NAME");
    if (wktIdx == null || nameIdx == null) {
      throw new Error("StatsNZ CSV missing required columns (WKT, REGC2025_V1_00_NAME)");
    }

    for await (const cols of rows) {
      const wkt = cols[wktIdx];
      const regionName = cols[nameIdx];
      const key = normalizeRegionName(regionName);
      if (!key) continue;

      const polygons = parseWktToPolygons(wkt);
      if (polygons.length === 0) continue;

      const polygonsWithBbox = [];
      for (const poly of polygons) {
        const outer = poly.rings?.[0];
        if (!outer || outer.length < 3) continue;
        polygonsWithBbox.push({ ring: outer, bbox: ringBbox(outer) });
      }

      if (polygonsWithBbox.length === 0) continue;
      regions.push({ key, regionName: regionName.trim(), polygons: polygonsWithBbox });
    }
  }

  // de-dupe regions (some exports may include multiple rows)
  const byKey = new Map();
  for (const r of regions) {
    if (!byKey.has(r.key)) byKey.set(r.key, r);
  }
  const regionList = Array.from(byKey.values());
  console.log(`Loaded ${regionList.length} regions.`);
  console.log(`Region keys: ${regionList.map((r) => r.key).sort().join(", ")}`);

  console.log("Assigning suburbs/localities to regions...");
  const regionToSuburbs = new Map(REGION_ORDER.map((r) => [r, new Set()]));

  const missing = [];
  let processed = 0;
  let included = 0;
  let skippedByType = 0;

  {
    const { headerIndex, rows } = await readCsvRows(LINZ_CSV);

    const wktIdx = headerIndex.get("WKT");
    const nameIdx = headerIndex.get("name");
    const typeIdx = headerIndex.get("type");

    if (wktIdx == null || nameIdx == null) {
      throw new Error("LINZ CSV missing required columns (WKT, name)");
    }

    for await (const cols of rows) {
      processed++;
      const name = (cols[nameIdx] ?? "").trim();
      if (!name) continue;

      if (typeIdx != null) {
        const t = (cols[typeIdx] ?? "").trim();
        if (t && !INCLUDED_TYPES.has(t)) {
          skippedByType++;
          continue;
        }
      }

      included++;

      const type = typeIdx != null ? (cols[typeIdx] ?? "").trim() : "";

      const wkt = cols[wktIdx];
      const polygons = parseWktToPolygons(wkt);
      if (polygons.length === 0) continue;

      const centroidNzTm = polygonCentroidNzTmFromLonLat(polygons);
      if (!centroidNzTm) continue;

      let matchedKey = null;
      for (const region of regionList) {
        if (pointInPolygons(centroidNzTm, region.polygons)) {
          matchedKey = region.key;
          break;
        }
      }

      // Fallback for concave/complex shapes where centroid lands outside.
      if (!matchedKey) {
        const interior = findInteriorPointNzTm(polygons, `${name}|${type}`);
        if (interior) {
          for (const region of regionList) {
            if (pointInPolygons(interior, region.polygons)) {
              matchedKey = region.key;
              break;
            }
          }
        }
      }

      if (!matchedKey) {
        const forced = FORCED_ASSIGNMENTS.get(name);
        if (forced && regionToSuburbs.has(forced)) {
          matchedKey = forced;
        }
      }

      if (!matchedKey) {
        missing.push({ name, type });
        continue;
      }

      const set = regionToSuburbs.get(matchedKey);
      if (set) set.add(name);
    }
  }

  const output = {};
  for (const regionKey of REGION_ORDER) {
    const suburbs = Array.from(regionToSuburbs.get(regionKey) ?? []);
    suburbs.sort((a, b) => a.localeCompare(b, "en-NZ", { sensitivity: "base" }));
    output[regionKey] = suburbs;
  }

  const outJson = {
    generatedAt: new Date().toISOString(),
    sources: {
      linzCsv: path.relative(WORKSPACE_ROOT, LINZ_CSV).replace(/\\/g, "/"),
      statsNzCsv: path.relative(WORKSPACE_ROOT, STATNZ_CSV).replace(/\\/g, "/"),
      licenseNote: "LINZ data is typically CC BY 4.0; ensure attribution if distributing.",
    },
    NZ_REGIONS_TO_SUBURBS: output,
    stats: {
      linzRowsProcessed: processed,
      linzRowsIncluded: included,
      linzRowsSkippedByType: skippedByType,
      unassignedNamesCount: missing.length,
    },
  };

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(outJson, null, 2), "utf8");

  console.log(`Wrote ${path.relative(WORKSPACE_ROOT, OUTPUT_JSON)}.`);
  if (missing.length > 0) {
    console.log(`WARNING: ${missing.length} names could not be assigned to a region (kept out).`);
    console.log("First 20:");
    for (const m of missing.slice(0, 20)) {
      console.log(`- ${m.name}${m.type ? ` (${m.type})` : ""}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
