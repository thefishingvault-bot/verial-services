"use client";

/**
 * Deprecated provider-level favorite button. Service-level favorites are now used everywhere.
 * This stub is kept to avoid import explosions; it renders nothing.
 */
export function FavoriteButton() {
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    console.warn("FavoriteButton (provider) is deprecated. Use ServiceFavoriteButton instead.");
  }
  return null;
}
