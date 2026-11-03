import { useApplication, useModel, useModelMetadata } from "@webda/core";
import { RELATIONAL_MODELS } from "./relational-models.js";

/**
 * @returns the metadata of the fixture models a relational store lists, subclasses included
 */
export function fixtureMetadata(): any[] {
  return [...RELATIONAL_MODELS, "Rel/Dog", "Rel/Breeder", "Rel/Kitten"].map(id => useModelMetadata(useModel(id)));
}

/**
 * @returns the metadata of every application model
 */
export function knownMetadata(): any[] {
  return Object.values(useApplication().getModels())
    .map((m: any) => m?.Metadata)
    .filter(m => m?.Identifier);
}
