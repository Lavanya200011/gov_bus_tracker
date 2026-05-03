export type BusRoute = {
  routeId: string;
  label: string;
  isLive?: boolean;
};

export type BusLocation = {
  routeId: string;
  label?: string;
  lat: number;
  lng: number;
  heading?: number | null;
  timestamp?: number;
};

export function isBusRoute(value: unknown): value is BusRoute {
  if (!value || typeof value !== "object") {
    return false;
  }

  const route = value as Partial<BusRoute>;

  return typeof route.routeId === "string" && typeof route.label === "string";
}

export function isBusLocation(value: unknown): value is BusLocation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const location = value as Partial<BusLocation>;

  return (
    typeof location.routeId === "string" &&
    typeof location.lat === "number" &&
    Number.isFinite(location.lat) &&
    typeof location.lng === "number" &&
    Number.isFinite(location.lng)
  );
}
