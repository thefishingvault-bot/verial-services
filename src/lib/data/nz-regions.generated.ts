import data from "./nz-regions.generated.json";

type RegionsToSuburbs = Record<string, string[]>;

export const NZ_REGIONS_TO_SUBURBS = (data as { NZ_REGIONS_TO_SUBURBS: RegionsToSuburbs }).NZ_REGIONS_TO_SUBURBS;
export const NZ_REGIONS = Object.keys(NZ_REGIONS_TO_SUBURBS);
