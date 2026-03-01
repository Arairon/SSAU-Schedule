import { SCHEDULE_STYLEMAP_LIGHT } from "./light";
import { SCHEDULE_STYLEMAP_DARK } from "./dark";
import { SCHEDULE_STYLEMAP_NEON } from "./neon";
import { StyleMap } from "./types";

export const stylemaps: Record<string, StyleMap> = {
  light: SCHEDULE_STYLEMAP_LIGHT,
  dark: SCHEDULE_STYLEMAP_DARK,
  neon: SCHEDULE_STYLEMAP_NEON,
};

export const defaultStylemap = stylemaps.neon;

export function getStylemap(name: string): StyleMap {
  if (name === "default") return defaultStylemap;
  const stylemap = stylemaps[name];
  return stylemap ?? defaultStylemap;
}
