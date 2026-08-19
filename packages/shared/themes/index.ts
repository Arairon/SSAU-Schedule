import { SCHEDULE_STYLEMAP_LIGHT } from "./light";
import { SCHEDULE_STYLEMAP_DARK } from "./dark";
import { SCHEDULE_STYLEMAP_NEON } from "./neon";
import { lessonTypes, type LessonStyleMap, type StyleMap, type StyleMapConfig } from "./types";

function parseConfig(config: StyleMapConfig): StyleMap {
  const types: Record<string, LessonStyleMap> = {};
  for (const type of lessonTypes) {
    const cfg = config.lessonTypes[type];
    types[type] = {
      ...config.lessonStyle,
      name: cfg?.name ?? type,
    };
    for (const [k, v] of Object.entries(cfg ?? {})) {
      if (v[0] === "+") {
        types[type][k as keyof LessonStyleMap] += " " + v.slice(1);
      } else {
        types[type][k as keyof LessonStyleMap] = v;
      }
    }
  }
  return {
    ...config,
    lessonTypes: types,
  };
}

export const stylemaps: Record<string, StyleMap> = {
  light: parseConfig(SCHEDULE_STYLEMAP_LIGHT),
  dark: parseConfig(SCHEDULE_STYLEMAP_DARK),
  neon: parseConfig(SCHEDULE_STYLEMAP_NEON),
};

export const defaultStylemap = stylemaps.neon;

export function getStylemap(name: string): StyleMap {
  if (name === "default") return defaultStylemap;
  const stylemap = stylemaps[name];
  return stylemap ?? defaultStylemap;
}
