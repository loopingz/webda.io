import { Faker, en, base } from "@faker-js/faker";

/**
 * Build a seeded Faker instance. Uses the English locale plus the base locale
 * (numbers, dates) as fallbacks — matches Faker v9's recommended defaults.
 *
 * @param seed - optional numeric seed. Defaults to Date.now() for non-deterministic runs.
 */
export function makeFaker(seed?: number): Faker {
  const faker = new Faker({ locale: [en, base] });
  faker.seed(seed ?? Date.now());
  return faker;
}
